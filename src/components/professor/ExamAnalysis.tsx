import { useState, useMemo, useLayoutEffect, useCallback } from 'react';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { BarChart } from '@mui/x-charts/BarChart';
import { LineChart } from '@mui/x-charts/LineChart';
import type { ExamWithSets } from '../../lib/exams';
import type { AttemptGradeRow } from '../../lib/grading';
import type { QuestionSummary } from '../../lib/questions';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function getGradeColors(pct: number, passingRate: number) {
    if (pct < passingRate) return { text: '#b91c1c', bg: '#fee2e2', border: '#fca5a5', solid: '#dc2626' };
    if (pct < 75) return { text: '#ea580c', bg: '#ffedd5', border: '#fdba74', solid: '#f97316' };
    if (pct < 85) return { text: '#ca8a04', bg: '#fef9c3', border: '#fde047', solid: '#eab308' };
    if (pct < 95) return { text: '#15803d', bg: '#dcfce7', border: '#86efac', solid: '#16a34a' };
    return { text: '#14532d', bg: '#bbf7d0', border: '#4ade80', solid: '#15803d' };
}

const PIE_COLORS = ['#3b82f6', '#8b5cf6', '#f59e0b', '#ec4899', '#14b8a6', '#f43f5e', '#84cc16'];

const APP_FONT = "'Inter', system-ui, -apple-system, sans-serif";

const chartTheme = createTheme({ typography: { fontFamily: APP_FONT } });

function useContainerWidth() {
    const [node, setNode] = useState<HTMLDivElement | null>(null);
    const [width, setWidth] = useState(0);
    const ref = useCallback((el: HTMLDivElement | null) => { setNode(el); }, []);
    useLayoutEffect(() => {
        if (!node) return;
        const update = () => { if (node.offsetWidth > 0) setWidth(node.offsetWidth); };
        const ro = new ResizeObserver(update);
        ro.observe(node);
        update();
        return () => ro.disconnect();
    }, [node]);
    return { ref, width };
}

const CHART_SX = {
    '& .MuiChartsAxis-tickLabel': { fontSize: '0.7rem !important' },
    '& .MuiChartsAxis-label': { fontSize: '0.7rem !important' },
};

// ─── Data types ───────────────────────────────────────────────────────────────

interface AttemptStat {
    attemptNum: number;
    setNum: number;
    score: number;
    total: number;
    pct: number;
    passed: boolean;
}

interface StudentRow {
    studentId: string;
    name: string;
    studentNum: string | null;
    program: string | null;
    attempts: AttemptStat[];
    bestPct: number;
    avgPct: number;
}

interface MoStat {
    key: string;
    subjectId: string;
    subjectCode: string;
    coTitle: string;
    coOrd: number;
    moDesc: string;
    moOrd: number;
    correct: number;
    total: number;
    pct: number;
}

interface CoStat {
    subjectId: string;
    subjectCode: string;
    coTitle: string;
    coOrd: number;
    correct: number;
    total: number;
    pct: number;
}

interface SubjectStat {
    subjectId: string;
    code: string;
    title: string;
    correct: number;
    total: number;
    pct: number;
}

interface GradeBand {
    label: string;
    min: number;
    max: number;
    count: number;
    solid: string;
}

// ─── Shared toggle button ─────────────────────────────────────────────────────

function ChartToggleBtn({ active, onClick, title, children }: {
    active: boolean;
    onClick: () => void;
    title: string;
    children: React.ReactNode;
}) {
    return (
        <button
            onClick={onClick}
            title={title}
            style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '6px', borderRadius: '6px', border: 'none',
                background: active ? 'var(--prof-primary)' : 'transparent',
                color: active ? '#fff' : 'var(--prof-text-muted)',
                cursor: 'pointer', transition: 'all 0.15s',
            }}
        >
            {children}
        </button>
    );
}

// ─── Chart: Grade Distribution ────────────────────────────────────────────────

function GradeDistributionChart({ gradeDist, totalSubmissions, isAllAttempts }: {
    gradeDist: GradeBand[];
    totalSubmissions: number;
    isAllAttempts: boolean;
}) {
    const [chartType, setChartType] = useState<'bar' | 'line'>('bar');
    const { ref: containerRef, width } = useContainerWidth();
    const unit = isAllAttempts ? 'submission' : 'student';
    const unitPlural = isAllAttempts ? 'submissions' : 'students';
    const yLabel = isAllAttempts ? 'Submissions' : 'Students';
    // Show just the lower bound "0%", "10%", … to keep labels compact
    const shortLabel = (v: string) => { const m = v.match(/^(\d+)/); return m ? `${m[1]}%` : v; };

    return (
        <ThemeProvider theme={chartTheme}>
            <div style={{ display: 'flex', flexDirection: 'column', marginTop: '8px', width: '100%' }}>
                <div style={{
                    display: 'flex', gap: '4px', background: 'rgba(0,0,0,0.03)',
                    padding: '4px', borderRadius: '8px', width: 'fit-content', alignSelf: 'flex-end', marginBottom: '4px',
                }}>
                    <ChartToggleBtn active={chartType === 'bar'} onClick={() => setChartType('bar')} title="Bar Chart">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="20" x2="18" y2="4" /><line x1="12" y1="20" x2="12" y2="10" /><line x1="6" y1="20" x2="6" y2="16" />
                        </svg>
                    </ChartToggleBtn>
                    <ChartToggleBtn active={chartType === 'line'} onClick={() => setChartType('line')} title="Line Chart">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                        </svg>
                    </ChartToggleBtn>
                </div>

                <div ref={containerRef} style={{ width: '100%' }}>
                    {width > 0 && (chartType === 'bar' ? (
                        <BarChart
                            series={[{
                                data: gradeDist.map(b => b.count),
                                valueFormatter: (v) => v !== null
                                    ? `${v} ${v !== 1 ? unitPlural : unit} (${totalSubmissions > 0 ? ((v / totalSubmissions) * 100).toFixed(0) : 0}%)`
                                    : '',
                            }]}
                            xAxis={[{
                                data: gradeDist.map(b => b.label),
                                scaleType: 'band',
                                colorMap: { type: 'ordinal', colors: gradeDist.map(b => b.solid) },
                                valueFormatter: shortLabel,
                            }]}
                            yAxis={[{ min: 0, label: yLabel }]}
                            width={width}
                            height={220}
                            margin={{ top: 16, bottom: 36, left: 38, right: 10 }}
                            slots={{ legend: () => null }}
                            sx={CHART_SX}
                        />
                    ) : (
                        <LineChart
                            series={[{
                                data: gradeDist.map(b => b.count),
                                area: true,
                                showMark: true,
                                color: '#2563eb',
                                valueFormatter: (v) => v !== null ? `${v} ${v !== 1 ? unitPlural : unit}` : '',
                            }]}
                            xAxis={[{
                                data: gradeDist.map(b => b.label),
                                scaleType: 'band',
                                valueFormatter: shortLabel,
                            }]}
                            yAxis={[{ min: 0, label: yLabel }]}
                            width={width}
                            height={220}
                            margin={{ top: 16, bottom: 36, left: 38, right: 10 }}
                            slots={{ legend: () => null }}
                            sx={CHART_SX}
                        />
                    ))}
                </div>
            </div>
        </ThemeProvider>
    );
}

// ─── Chart: Subject Accuracy (Donut + Score Distribution) ────────────────────

function SubjectAccuracyChart({ subjectStats, avgPct, passingRate, subjectDistribution }: {
    subjectStats: SubjectStat[];
    avgPct: number;
    passingRate: number;
    subjectDistribution: Record<string, number[]>;
}) {
    const [chartType, setChartType] = useState<'donut' | 'line'>('donut');
    const [hovered, setHovered] = useState<string | null>(null);
    const { ref: lineContainerRef, width: lineWidth } = useContainerWidth();

    const toggle = (
        <div style={{
            display: 'flex', gap: '4px', background: 'rgba(0,0,0,0.03)',
            padding: '4px', borderRadius: '8px', width: 'fit-content', alignSelf: 'flex-end',
        }}>
            <ChartToggleBtn active={chartType === 'donut'} onClick={() => setChartType('donut')} title="Donut Chart">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" /><circle cx="12" cy="12" r="4" />
                </svg>
            </ChartToggleBtn>
            <ChartToggleBtn active={chartType === 'line'} onClick={() => setChartType('line')} title="Score Distribution">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
                </svg>
            </ChartToggleBtn>
        </div>
    );

    // ── Donut mode ────────────────────────────────────────────────────────────
    const renderDonut = () => {
        const cx = 100, cy = 100, outerR = 86, innerR = 58;
        const totalCorrect = subjectStats.reduce((s, d) => s + d.correct, 0);
        const totalItems = subjectStats.reduce((s, d) => s + d.total, 0);
        const totalWrong = totalItems - totalCorrect;

        if (totalItems === 0) {
            return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '80px', color: 'var(--prof-text-muted)', fontSize: '0.85rem' }}>No data</div>;
        }

        type Slice = { id: string; color: string; start: number; end: number; midAngle: number };
        const allSlices: Slice[] = [];
        let angle = -90;
        subjectStats.forEach((d, i) => {
            const sweep = totalItems > 0 ? (d.correct / totalItems) * 360 : 0;
            if (sweep > 0.1) allSlices.push({ id: d.subjectId, color: PIE_COLORS[i % PIE_COLORS.length], start: angle, end: angle + sweep, midAngle: angle + sweep / 2 });
            angle += sweep;
        });
        if (totalWrong > 0) {
            const sweep = totalItems > 0 ? (totalWrong / totalItems) * 360 : 0;
            if (sweep > 0.1) allSlices.push({ id: '__wrong__', color: '#fca5a5', start: angle, end: angle + sweep, midAngle: angle + sweep / 2 });
        }

        const toXY = (r: number, deg: number): [number, number] => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
        const donutPath = (oR: number, iR: number, sDeg: number, eDeg: number) => {
            const g = allSlices.length > 1 ? 1.5 : 0;
            const s = sDeg + g / 2, e = eDeg - g / 2;
            if (e - s <= 0) return '';
            const [ox1, oy1] = toXY(oR, s); const [ox2, oy2] = toXY(oR, e);
            const [ix1, iy1] = toXY(iR, s); const [ix2, iy2] = toXY(iR, e);
            const large = e - s > 180 ? 1 : 0;
            return `M ${ox1} ${oy1} A ${oR} ${oR} 0 ${large} 1 ${ox2} ${oy2} L ${ix2} ${iy2} A ${iR} ${iR} 0 ${large} 0 ${ix1} ${iy1} Z`;
        };

        const gc = getGradeColors(avgPct, passingRate);
        return (
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '8px' }}>
                <svg viewBox={`0 0 ${cx * 2} ${cy * 2}`} style={{ flexShrink: 0, width: '55%', maxWidth: `${cx * 2}px`, filter: 'drop-shadow(0 4px 6px rgba(0,0,0,0.08))' }}>
                    {allSlices.map(sl => {
                        const isHov = hovered === sl.id;
                        const dx = isHov ? 3 * Math.cos((sl.midAngle * Math.PI) / 180) : 0;
                        const dy = isHov ? 3 * Math.sin((sl.midAngle * Math.PI) / 180) : 0;
                        const d = donutPath(outerR, innerR, sl.start, sl.end);
                        if (!d) return null;
                        return (
                            <path key={sl.id} d={d} fill={sl.color}
                                transform={isHov ? `translate(${dx}, ${dy})` : undefined}
                                style={{ transition: 'transform 0.25s cubic-bezier(0.175, 0.885, 0.32, 1.275)', cursor: 'default' }}
                                onMouseEnter={() => setHovered(sl.id)}
                                onMouseLeave={() => setHovered(null)}
                            />
                        );
                    })}
                    <circle cx={cx} cy={cy} r={innerR} fill="white" />
                    <text x={cx} y={cy - 2} textAnchor="middle" fontSize="15" fontWeight="800" fill={gc.text}>{avgPct.toFixed(1)}%</text>
                    <text x={cx} y={cy + 13} textAnchor="middle" fontSize="7.5" fill="#94a3b8" fontWeight="700" letterSpacing="0.05em">AVG ACC.</text>
                </svg>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                    {subjectStats.map((d, i) => {
                        const gc2 = getGradeColors(d.pct, passingRate);
                        return (
                            <div key={d.subjectId}
                                style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', padding: '3px 6px', borderRadius: '5px', background: hovered === d.subjectId ? `${PIE_COLORS[i % PIE_COLORS.length]}12` : 'transparent', transition: 'background 0.15s', cursor: 'default' }}
                                onMouseEnter={() => setHovered(d.subjectId)}
                                onMouseLeave={() => setHovered(null)}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '6px', minWidth: 0 }}>
                                    <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: PIE_COLORS[i % PIE_COLORS.length], flexShrink: 0 }} />
                                    <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--prof-text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{d.code}</span>
                                </div>
                                <span style={{ fontSize: '0.74rem', fontWeight: 700, color: gc2.text, textAlign: 'right', paddingLeft: '8px' }}>{d.pct.toFixed(0)}%</span>
                            </div>
                        );
                    })}
                    {totalWrong > 0 && (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', alignItems: 'center', padding: '3px 6px', borderRadius: '5px', background: hovered === '__wrong__' ? '#fff1f2' : 'transparent', transition: 'background 0.15s', cursor: 'default' }}
                            onMouseEnter={() => setHovered('__wrong__')}
                            onMouseLeave={() => setHovered(null)}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#fca5a5', flexShrink: 0 }} />
                                <span style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--prof-text-muted)' }}>Incorrect</span>
                            </div>
                            <span style={{ fontSize: '0.74rem', fontWeight: 700, color: '#dc2626', textAlign: 'right', paddingLeft: '8px' }}>{((totalWrong / totalItems) * 100).toFixed(0)}%</span>
                        </div>
                    )}
                </div>
            </div>
        );
    };

    // ── Score distribution line mode ──────────────────────────────────────────
    const renderLine = () => {
        const xLabels = ['0–10%', '10–20%', '20–30%', '30–40%', '40–50%', '50–60%', '60–70%', '70–80%', '80–90%', '90–100%'];
        const hasData = subjectStats.some(s => subjectDistribution[s.subjectId]?.some(v => v > 0));
        if (!hasData) {
            return (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100px', gap: '6px', color: 'var(--prof-text-muted)' }}>
                    <svg fill="none" strokeWidth="1.5" stroke="currentColor" viewBox="0 0 24 24" width="28" height="28">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                    </svg>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600 }}>No submission data yet.</span>
                </div>
            );
        }

        return (
            <ThemeProvider theme={chartTheme}>
                <div ref={lineContainerRef} style={{ width: '100%' }}>
                    {lineWidth > 0 && (
                        <LineChart
                            series={subjectStats.map((subj, i) => ({
                                data: subjectDistribution[subj.subjectId] ?? Array(10).fill(0),
                                label: subj.code,
                                color: PIE_COLORS[i % PIE_COLORS.length],
                                showMark: true,
                                curve: 'linear' as const,
                                valueFormatter: (v: number | null) => v !== null ? `${v} student${v !== 1 ? 's' : ''}` : '',
                            }))}
                            xAxis={[{
                                data: xLabels,
                                scaleType: 'band',
                                label: 'Score Range',
                                valueFormatter: (v: string) => { const m = v.match(/^(\d+)/); return m ? `${m[1]}%` : v; },
                            }]}
                            yAxis={[{ min: 0, label: 'Students' }]}
                            width={lineWidth}
                            height={270}
                            margin={{ top: 16, bottom: 56, left: 38, right: 16 }}
                            sx={CHART_SX}
                        />
                    )}
                </div>
            </ThemeProvider>
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', marginTop: '4px' }}>
            {toggle}
            {chartType === 'donut' && renderDonut()}
            {chartType === 'line' && renderLine()}
        </div>
    );
}

// ─── Chart: Attempt Trend Line ────────────────────────────────────────────────

function AttemptTrendLine({ attemptTrend }: {
    attemptTrend: { attemptNum: number; avgPct: number; count: number }[];
    passingRate: number;
}) {
    const { ref: containerRef, width } = useContainerWidth();
    if (attemptTrend.length < 2) return null;

    return (
        <ThemeProvider theme={chartTheme}>
            <div ref={containerRef} style={{ width: '100%' }}>
                {width > 0 && (
                    <LineChart
                        series={[{
                            data: attemptTrend.map(d => parseFloat(d.avgPct.toFixed(1))),
                            area: true,
                            showMark: true,
                            color: '#3b82f6',
                            valueFormatter: (v) => v !== null ? `${v.toFixed(1)}%` : '',
                        }]}
                        xAxis={[{
                            data: attemptTrend.map(d => d.attemptNum),
                            scaleType: 'band',
                            valueFormatter: (v, context) => {
                                const d = attemptTrend.find(a => a.attemptNum === v);
                                if (!d) return `Att.${v}`;
                                return context.location === 'tick'
                                    ? `Att.${d.attemptNum}`
                                    : `Attempt ${d.attemptNum} (n=${d.count})`;
                            },
                        }]}
                        yAxis={[{
                            min: 0,
                            max: 100,
                            valueFormatter: (v: number) => `${v}%`,
                            label: 'Avg Score',
                        }]}
                        width={width}
                        height={200}
                        margin={{ top: 16, bottom: 36, left: 44, right: 16 }}
                        slots={{ legend: () => null }}
                        sx={CHART_SX}
                    />
                )}
            </div>
        </ThemeProvider>
    );
}

// ─── Horizontal Accuracy Bar ──────────────────────────────────────────────────

function HorizontalAccuracyBar({ label, sublabel, pct, correct, total, passingRate, onClick, clickable }: {
    label: string;
    sublabel?: string;
    pct: number;
    correct: number;
    total: number;
    passingRate: number;
    onClick?: () => void;
    clickable?: boolean;
}) {
    const [hov, setHov] = useState(false);
    const gc = getGradeColors(pct, passingRate);
    return (
        <div
            onClick={onClick}
            onMouseEnter={() => setHov(true)}
            onMouseLeave={() => setHov(false)}
            style={{
                padding: '8px 10px',
                borderRadius: '7px',
                background: hov && clickable ? '#f8faff' : 'transparent',
                border: `1px solid ${hov && clickable ? 'var(--prof-border)' : 'transparent'}`,
                cursor: clickable ? 'pointer' : 'default',
                transition: 'all 0.15s',
            }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '5px' }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--prof-text-main)' }}>{label}</span>
                    {sublabel && (
                        <span style={{ fontSize: '0.72rem', color: 'var(--prof-text-muted)', marginLeft: '6px' }}>
                            {sublabel}
                        </span>
                    )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '7px', flexShrink: 0, marginLeft: '8px' }}>
                    <span style={{ fontSize: '0.72rem', color: 'var(--prof-text-muted)' }}>{correct}/{total}</span>
                    <span style={{ fontSize: '0.78rem', fontWeight: 700, color: gc.text, background: gc.bg, border: `1px solid ${gc.border}`, borderRadius: '5px', padding: '1px 7px' }}>
                        {pct.toFixed(0)}%
                    </span>
                    {clickable && (
                        <svg fill="none" strokeWidth="2.5" stroke="#94a3b8" viewBox="0 0 24 24" width="11" height="11">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                        </svg>
                    )}
                </div>
            </div>
            <div style={{ height: '4px', background: '#f1f5f9', borderRadius: '99px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${Math.min(pct, 100)}%`, background: gc.solid, borderRadius: '99px', transition: 'width 0.4s ease' }} />
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export interface ExamAnalysisProps {
    exam: ExamWithSets;
    gradesData: Record<number, AttemptGradeRow[]>;
    questionMap: Record<string, QuestionSummary>;
    passingRate: number;
    isLoadingGrades: boolean;
}

type DrilldownState = null | { subjectId: string } | { subjectId: string; coOrd: number };

export function ExamAnalysis({ exam, gradesData, questionMap, passingRate, isLoadingGrades }: ExamAnalysisProps) {
    const [attemptFilter, setAttemptFilter] = useState<number | null>(null);
    const [drilldown, setDrilldown] = useState<DrilldownState>(null);
    const [hardestExpanded, setHardestExpanded] = useState(false);

    const availableAttempts = Object.keys(gradesData).map(Number).sort((a, b) => a - b);

    // ── Core analysis computation ─────────────────────────────────────────────
    const analysis = useMemo(() => {
        const activeAttemptNums = attemptFilter !== null
            ? (gradesData[attemptFilter] ? [attemptFilter] : [])
            : availableAttempts;

        const subjectInfoMap: Record<string, { code: string; title: string }> = {};
        for (const es of exam.exam_subjects) {
            if (es.subjects) {
                subjectInfoMap[es.subject_id] = {
                    code: es.subjects.course_code,
                    title: es.subjects.course_title,
                };
            }
        }

        const studentMap: Record<string, StudentRow> = {};
        const moMap: Record<string, MoStat> = {};
        const subjectAccMap: Record<string, { correct: number; total: number }> = {};
        const studentSubjectScores: Record<string, number[]> = {};

        const gradeDist: GradeBand[] = Array.from({ length: 10 }, (_, i) => {
            const min = i * 10;
            const max = i === 9 ? 101 : (i + 1) * 10;
            const label = i === 9 ? '90–100%' : `${min}–${min + 10}%`;
            const mid = min + 5;
            let solid: string;
            if (mid < passingRate) solid = '#dc2626';
            else if (mid >= 90) solid = '#15803d';
            else if (mid >= 80) solid = '#16a34a';
            else if (mid >= 70) solid = '#eab308';
            else solid = '#f97316';
            return { label, min, max, count: 0, solid };
        });

        let totalCorrectAll = 0, totalItemsAll = 0;
        const attemptTrend: { attemptNum: number; avgPct: number; count: number }[] = [];

        for (const attemptNum of activeAttemptNums) {
            const rows = gradesData[attemptNum] ?? [];
            let aCorrect = 0, aTotal = 0, aCount = 0;

            for (const row of rows) {
                const sub = row.submission;
                if (!sub) continue;

                const set = exam.exam_sets.find(
                    s => s.attempt_number === sub.attempt_number && s.set_number === sub.set_number,
                );
                if (!set || set.question_ids.length === 0) continue;

                const total = set.question_ids.length;
                let correct = 0;
                const rowSubjectAcc: Record<string, { correct: number; total: number }> = {};

                for (const qId of set.question_ids) {
                    const q = questionMap[qId];
                    if (!q) continue;
                    const isCorrect = (sub.answers[qId] ?? -1) === q.correct_choice;
                    if (isCorrect) correct++;

                    if (!subjectAccMap[q.subject_id]) subjectAccMap[q.subject_id] = { correct: 0, total: 0 };
                    subjectAccMap[q.subject_id].total++;
                    if (isCorrect) subjectAccMap[q.subject_id].correct++;

                    if (!rowSubjectAcc[q.subject_id]) rowSubjectAcc[q.subject_id] = { correct: 0, total: 0 };
                    rowSubjectAcc[q.subject_id].total++;
                    if (isCorrect) rowSubjectAcc[q.subject_id].correct++;

                    if (q.course_outcomes && q.module_outcomes) {
                        const key = `${q.subject_id}-${q.course_outcomes.order_index}-${q.module_outcomes.order_index}`;
                        if (!moMap[key]) {
                            moMap[key] = {
                                key,
                                subjectId: q.subject_id,
                                subjectCode: subjectInfoMap[q.subject_id]?.code ?? '?',
                                coTitle: q.course_outcomes.description || q.course_outcomes.title,
                                coOrd: q.course_outcomes.order_index,
                                moDesc: q.module_outcomes.description,
                                moOrd: q.module_outcomes.order_index,
                                correct: 0, total: 0, pct: 0,
                            };
                        }
                        moMap[key].total++;
                        if (isCorrect) moMap[key].correct++;
                    }
                }

                // Accumulate per-submission subject scores for distribution chart
                for (const [subjId, acc] of Object.entries(rowSubjectAcc)) {
                    if (!studentSubjectScores[subjId]) studentSubjectScores[subjId] = [];
                    studentSubjectScores[subjId].push(acc.total > 0 ? (acc.correct / acc.total) * 100 : 0);
                }

                const pct = (correct / total) * 100;
                const passed = pct >= passingRate;

                const band = gradeDist.find(b => pct >= b.min && pct < b.max);
                if (band) band.count++;

                const sid = row.enrollment.student_id;
                if (!studentMap[sid]) {
                    const s = row.enrollment.student;
                    studentMap[sid] = {
                        studentId: sid,
                        name: s?.full_name ?? s?.email ?? 'Unknown',
                        studentNum: s?.student_id ?? null,
                        program: s?.program?.name ?? s?.program?.code ?? null,
                        attempts: [],
                        bestPct: 0,
                        avgPct: 0,
                    };
                }
                studentMap[sid].attempts.push({ attemptNum, setNum: sub.set_number, score: correct, total, pct, passed });

                aCorrect += correct; aTotal += total; aCount++;
            }

            if (aCount > 0) {
                attemptTrend.push({
                    attemptNum,
                    avgPct: aTotal > 0 ? (aCorrect / aTotal) * 100 : 0,
                    count: aCount,
                });
                totalCorrectAll += aCorrect;
                totalItemsAll += aTotal;
            }
        }

        const moStats = Object.values(moMap).map(mo => ({
            ...mo,
            pct: mo.total > 0 ? (mo.correct / mo.total) * 100 : 0,
        }));

        const subjectStats: SubjectStat[] = exam.exam_subjects
            .filter(es => es.subjects && subjectAccMap[es.subject_id])
            .map(es => {
                const acc = subjectAccMap[es.subject_id];
                return {
                    subjectId: es.subject_id,
                    code: es.subjects!.course_code,
                    title: es.subjects!.course_title,
                    correct: acc.correct,
                    total: acc.total,
                    pct: acc.total > 0 ? (acc.correct / acc.total) * 100 : 0,
                };
            });

        const studentRows = Object.values(studentMap).map(s => {
            const pcts = s.attempts.map(a => a.pct);
            return {
                ...s,
                bestPct: pcts.length > 0 ? Math.max(...pcts) : 0,
                avgPct: pcts.length > 0 ? pcts.reduce((a, b) => a + b, 0) / pcts.length : 0,
            };
        });

        const totalStudents = studentRows.length;
        const totalSubmissions = studentRows.reduce((s, r) => s + r.attempts.length, 0);
        const avgPct = totalItemsAll > 0 ? (totalCorrectAll / totalItemsAll) * 100 : 0;
        const passCount = studentRows.filter(s => s.attempts.some(a => a.passed)).length;
        const passRate = totalStudents > 0 ? (passCount / totalStudents) * 100 : 0;

        // Build per-subject score distribution (10 buckets, 0–10%, 10–20%, ..., 90–100%)
        const subjectDistribution: Record<string, number[]> = {};
        for (const [subjId, scores] of Object.entries(studentSubjectScores)) {
            subjectDistribution[subjId] = Array(10).fill(0);
            for (const pct of scores) {
                const bucket = pct >= 100 ? 9 : Math.floor(pct / 10);
                subjectDistribution[subjId][bucket]++;
            }
        }

        return { studentRows, moStats, subjectStats, gradeDist, attemptTrend, totalStudents, totalSubmissions, avgPct, passRate, subjectDistribution };
    }, [gradesData, exam, questionMap, passingRate, attemptFilter]); // eslint-disable-line react-hooks/exhaustive-deps

    // ── "Did not take" count for specific attempt ─────────────────────────────
    const didNotTake = attemptFilter !== null
        ? (gradesData[attemptFilter] ?? []).filter(r => !r.submission).length
        : 0;

    // ── CO stats (aggregated from MO stats) ───────────────────────────────────
    const coStats = useMemo((): CoStat[] => {
        const map: Record<string, CoStat> = {};
        for (const mo of analysis.moStats) {
            const key = `${mo.subjectId}-${mo.coOrd}`;
            if (!map[key]) {
                map[key] = { subjectId: mo.subjectId, subjectCode: mo.subjectCode, coTitle: mo.coTitle, coOrd: mo.coOrd, correct: 0, total: 0, pct: 0 };
            }
            map[key].correct += mo.correct;
            map[key].total += mo.total;
        }
        return Object.values(map).map(c => ({ ...c, pct: c.total > 0 ? (c.correct / c.total) * 100 : 0 }));
    }, [analysis.moStats]);

    // ── Early returns ─────────────────────────────────────────────────────────
    if (isLoadingGrades) {
        return (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '80px 0' }}>
                <span style={{ display: 'inline-block', width: '32px', height: '32px', border: '3px solid var(--prof-border)', borderTopColor: 'var(--prof-primary)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
            </div>
        );
    }

    if (analysis.totalSubmissions === 0) {
        return (
            <>
                {availableAttempts.length > 0 && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--prof-text-muted)', marginRight: '2px' }}>Attempt</span>
                        {[null, ...availableAttempts].map(a => {
                            const isActive = attemptFilter === a;
                            return (
                                <button key={a ?? 'all'}
                                    onClick={() => { setAttemptFilter(a); setDrilldown(null); }}
                                    style={{ padding: '4px 13px', fontSize: '0.8rem', fontWeight: 600, borderRadius: '6px', cursor: 'pointer', border: `1px solid ${isActive ? 'var(--prof-primary)' : 'var(--prof-border)'}`, background: isActive ? 'var(--prof-primary)' : 'transparent', color: isActive ? '#fff' : 'var(--prof-text-muted)', transition: 'all 0.15s' }}>
                                    {a === null ? 'All Attempts' : `Attempt ${a}`}
                                </button>
                            );
                        })}
                    </div>
                )}
                <div className="cs-card" style={{ textAlign: 'center', padding: '64px 24px' }}>
                    <svg fill="none" strokeWidth="1.5" stroke="#94a3b8" viewBox="0 0 24 24" width="44" height="44" style={{ margin: '0 auto 12px', display: 'block' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
                    </svg>
                    <p style={{ margin: 0, fontWeight: 600, color: 'var(--prof-text-main)', fontSize: '0.95rem' }}>No analysis data yet.</p>
                    <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: 'var(--prof-text-muted)' }}>
                        Deploy an attempt and scan OMR sheets to see analytics here.
                    </p>
                </div>
            </>
        );
    }

    // ── Drilldown breadcrumb labels ───────────────────────────────────────────
    const selectedSubject = drilldown ? analysis.subjectStats.find(s => s.subjectId === drilldown.subjectId) : null;
    const selectedCo = drilldown && 'coOrd' in drilldown
        ? coStats.find(c => c.subjectId === drilldown.subjectId && c.coOrd === drilldown.coOrd)
        : null;

    // ── Render ────────────────────────────────────────────────────────────────
    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>

            {/* ── Attempt filter bar ── */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', background: 'var(--prof-surface)', border: '1px solid var(--prof-border)', borderRadius: '10px', padding: '8px 14px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '0.69rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--prof-text-muted)', marginRight: '4px', whiteSpace: 'nowrap' }}>Filter by Attempt</span>
                <div className="ea-attempt-buttons" style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                    {[null, ...availableAttempts].map(a => {
                        const isActive = attemptFilter === a;
                        return (
                            <button key={a ?? 'all'}
                                onClick={() => { setAttemptFilter(a); setDrilldown(null); }}
                                style={{ padding: '4px 14px', fontSize: '0.8rem', fontWeight: 600, borderRadius: '6px', cursor: 'pointer', border: `1px solid ${isActive ? 'var(--prof-primary)' : 'var(--prof-border)'}`, background: isActive ? 'var(--prof-primary)' : 'transparent', color: isActive ? '#fff' : 'var(--prof-text-muted)', transition: 'all 0.15s' }}>
                                {a === null ? 'All Attempts' : `Attempt ${a}`}
                            </button>
                        );
                    })}
                </div>
                <select
                    className="ea-attempt-select"
                    value={attemptFilter === null ? 'all' : String(attemptFilter)}
                    onChange={e => {
                        const val = e.target.value;
                        setAttemptFilter(val === 'all' ? null : Number(val));
                        setDrilldown(null);
                    }}
                >
                    <option value="all">All Attempts</option>
                    {availableAttempts.map(a => <option key={a} value={String(a)}>Attempt {a}</option>)}
                </select>
            </div>

            {/* ── KPI cards ── */}
            <div className="ea-stat-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
                {[
                    { label: 'Total Students', value: analysis.totalStudents.toString(), color: '#2563eb' },
                    { label: 'Avg Accuracy', value: `${analysis.avgPct.toFixed(1)}%`, color: getGradeColors(analysis.avgPct, passingRate).solid },
                    { label: 'Pass Rate', value: `${analysis.passRate.toFixed(0)}%`, color: analysis.passRate >= passingRate ? '#16a34a' : '#dc2626' },
                    { label: 'Submissions', value: analysis.totalSubmissions.toString(), color: '#7c3aed' },
                ].map(card => (
                    <div key={card.label} className="cs-card" style={{ padding: '14px 18px', marginBottom: 0 }}>
                        <div style={{ fontSize: '0.69rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--prof-text-muted)', marginBottom: '8px' }}>
                            {card.label}
                        </div>
                        <div style={{ fontSize: '1.55rem', fontWeight: 800, color: card.color, lineHeight: 1 }}>
                            {card.value}
                        </div>
                    </div>
                ))}
            </div>

            {/* ── Charts row ── */}
            <div className="ea-charts-row" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

                {/* Grade Distribution */}
                <div className="cs-card" style={{ padding: '20px 22px', marginBottom: 0 }}>
                    <h3 className="cs-card-title" style={{ marginBottom: '2px' }}>Grade Distribution</h3>
                    <p style={{ margin: '0 0 4px', fontSize: '0.8rem', color: 'var(--prof-text-muted)' }}>
                        {analysis.totalSubmissions} submission{analysis.totalSubmissions !== 1 ? 's' : ''} · {analysis.totalStudents} student{analysis.totalStudents !== 1 ? 's' : ''}
                        {attemptFilter !== null && didNotTake > 0 && (
                            <span style={{ color: '#b91c1c', fontWeight: 600 }}> · {didNotTake} did not take</span>
                        )}
                    </p>
                    <GradeDistributionChart gradeDist={analysis.gradeDist} totalSubmissions={analysis.totalSubmissions} isAllAttempts={attemptFilter === null} />
                </div>

                {/* Subject Accuracy */}
                <div className="cs-card" style={{ padding: '20px 22px', marginBottom: 0 }}>
                    <h3 className="cs-card-title" style={{ marginBottom: '16px' }}>Subject Accuracy</h3>
                    <SubjectAccuracyChart
                        subjectStats={analysis.subjectStats}
                        avgPct={analysis.avgPct}
                        passingRate={passingRate}
                        subjectDistribution={analysis.subjectDistribution}
                    />
                </div>
            </div>

            {/* ── Topic Accuracy Drilldown — full width ── */}
            <div className="cs-card" style={{ padding: '20px 22px', marginBottom: 0 }}>
                <h3 className="cs-card-title" style={{ marginBottom: '12px' }}>Topic Accuracy</h3>
                <div style={{ display: 'flex', alignItems: 'center', gap: '2px', marginBottom: '10px', padding: '4px 6px', background: '#f8fafc', border: '1px solid var(--prof-border)', borderRadius: '8px', flexWrap: 'wrap' }}>
                    <button
                        onClick={() => setDrilldown(null)}
                        style={{ display: 'flex', alignItems: 'center', gap: '4px', background: drilldown ? 'none' : 'white', border: drilldown ? 'none' : '1px solid var(--prof-border)', boxShadow: drilldown ? 'none' : '0 1px 2px rgba(0,0,0,0.06)', padding: '3px 8px', borderRadius: '5px', cursor: drilldown ? 'pointer' : 'default', color: drilldown ? 'var(--prof-text-muted)' : 'var(--prof-text-main)', fontWeight: 600, fontSize: '0.75rem', transition: 'color 0.15s' }}>
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
                        </svg>
                        All Subjects
                    </button>
                    {drilldown && (
                        <>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#cbd5e1', flexShrink: 0, margin: '0 1px' }}>
                                <path d="M9 18l6-6-6-6" />
                            </svg>
                            <button
                                onClick={() => 'coOrd' in drilldown ? setDrilldown({ subjectId: drilldown.subjectId }) : undefined}
                                style={{ display: 'flex', alignItems: 'center', background: !('coOrd' in drilldown) ? 'white' : 'none', border: !('coOrd' in drilldown) ? '1px solid var(--prof-border)' : 'none', boxShadow: !('coOrd' in drilldown) ? '0 1px 2px rgba(0,0,0,0.06)' : 'none', padding: '3px 8px', borderRadius: '5px', cursor: 'coOrd' in drilldown ? 'pointer' : 'default', color: 'coOrd' in drilldown ? 'var(--prof-text-muted)' : 'var(--prof-text-main)', fontWeight: 600, fontSize: '0.75rem', transition: 'color 0.15s' }}>
                                {selectedSubject?.code ?? '...'}
                            </button>
                        </>
                    )}
                    {drilldown && 'coOrd' in drilldown && (
                        <>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#cbd5e1', flexShrink: 0, margin: '0 1px' }}>
                                <path d="M9 18l6-6-6-6" />
                            </svg>
                            <span style={{ display: 'flex', alignItems: 'center', background: 'white', border: '1px solid var(--prof-border)', boxShadow: '0 1px 2px rgba(0,0,0,0.06)', padding: '3px 8px', borderRadius: '5px', fontSize: '0.75rem', fontWeight: 600, color: 'var(--prof-text-main)' }}>
                                CO{(drilldown as { subjectId: string; coOrd: number }).coOrd + 1}
                            </span>
                        </>
                    )}
                </div>
                <p style={{ margin: '0 0 10px', fontSize: '0.79rem', color: 'var(--prof-text-muted)' }}>
                    {!drilldown
                        ? 'Sorted by accuracy · lowest first. Click a subject to see its Course Outcomes.'
                        : !('coOrd' in drilldown)
                            ? `Course Outcomes for ${selectedSubject?.title ?? '...'}. Click a CO to see Module Outcomes.`
                            : `Module Outcomes for ${selectedCo?.coTitle ?? `CO${(drilldown as { coOrd: number }).coOrd + 1}`}`}
                </p>
                <div style={{ maxHeight: '260px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '2px', paddingRight: '2px' }}>
                    {!drilldown ? (
                        analysis.subjectStats.length === 0 ? (
                            <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--prof-text-muted)', textAlign: 'center', padding: '20px 0' }}>No subject data.</p>
                        ) : (
                            [...analysis.subjectStats].sort((a, b) => a.pct - b.pct).map(s => (
                                <HorizontalAccuracyBar
                                    key={s.subjectId}
                                    label={s.code}
                                    sublabel={s.title}
                                    pct={s.pct}
                                    correct={s.correct}
                                    total={s.total}
                                    passingRate={passingRate}
                                    clickable={true}
                                    onClick={() => setDrilldown({ subjectId: s.subjectId })}
                                />
                            ))
                        )
                    ) : !('coOrd' in drilldown) ? (
                        (() => {
                            const filtered = coStats.filter(c => c.subjectId === drilldown.subjectId).sort((a, b) => a.pct - b.pct);
                            return filtered.length === 0
                                ? <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--prof-text-muted)', textAlign: 'center', padding: '20px 0' }}>No CO data.</p>
                                : filtered.map(c => (
                                    <HorizontalAccuracyBar
                                        key={`${c.subjectId}-${c.coOrd}`}
                                        label={`CO${c.coOrd + 1}`}
                                        sublabel={c.coTitle}
                                        pct={c.pct}
                                        correct={c.correct}
                                        total={c.total}
                                        passingRate={passingRate}
                                        clickable={true}
                                        onClick={() => setDrilldown({ subjectId: drilldown.subjectId, coOrd: c.coOrd })}
                                    />
                                ));
                        })()
                    ) : (
                        (() => {
                            const dd = drilldown as { subjectId: string; coOrd: number };
                            const filtered = analysis.moStats.filter(m => m.subjectId === dd.subjectId && m.coOrd === dd.coOrd).sort((a, b) => a.pct - b.pct);
                            return filtered.length === 0
                                ? <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--prof-text-muted)', textAlign: 'center', padding: '20px 0' }}>No MO data.</p>
                                : filtered.map(m => (
                                    <HorizontalAccuracyBar
                                        key={m.key}
                                        label={`MO${m.coOrd + 1}${m.moOrd + 1}`}
                                        sublabel={m.moDesc}
                                        pct={m.pct}
                                        correct={m.correct}
                                        total={m.total}
                                        passingRate={passingRate}
                                        clickable={false}
                                    />
                                ));
                        })()
                    )}
                </div>
            </div>

            {/* ── Attempt Trend + Class Insights row ── */}
            <div className="ea-trend-row" style={{ display: 'grid', gridTemplateColumns: analysis.attemptTrend.length >= 2 ? '1fr 1fr' : '1fr', gap: '16px' }}>

                {/* Attempt Trend */}
                {analysis.attemptTrend.length >= 2 && (
                    <div className="cs-card" style={{ padding: '20px 22px', marginBottom: 0 }}>
                        <h3 className="cs-card-title" style={{ marginBottom: '2px' }}>Attempt Trend</h3>
                        <p style={{ margin: '0 0 10px', fontSize: '0.79rem', color: 'var(--prof-text-muted)' }}>
                            Average accuracy per attempt.
                        </p>
                        <AttemptTrendLine attemptTrend={analysis.attemptTrend} passingRate={passingRate} />
                    </div>
                )}

                {/* Class Insights */}
                {analysis.studentRows.length > 0 && (
                    <div className="cs-card" style={{ padding: '20px 22px', marginBottom: 0 }}>
                        <h3 className="cs-card-title" style={{ marginBottom: '12px' }}>Class Insights</h3>
                        {(() => {
                            const sorted = [...analysis.studentRows].sort((a, b) => b.bestPct - a.bestPct);
                            const top = sorted[0] ?? null;
                            const struggling = sorted.filter(s => s.bestPct < passingRate && s.attempts.length > 0);
                            const minMoPct = analysis.moStats.length > 0
                                ? Math.min(...analysis.moStats.map(m => m.pct))
                                : null;
                            const hardestMos = minMoPct !== null
                                ? analysis.moStats.filter(m => m.pct === minMoPct)
                                : [];

                            type InsightRow = { label: string; detail: string; subDetail?: string; stat: string; color: string; bg: string; iconPath: string };
                            const rows: InsightRow[] = [];

                            if (top) {
                                const bestAttempt = top.attempts.reduce((best, a) => a.pct > best.pct ? a : best, top.attempts[0]);
                                const setLetter = bestAttempt ? String.fromCharCode(64 + bestAttempt.setNum) : null;
                                rows.push({
                                    label: 'Top Scorer',
                                    detail: top.name,
                                    subDetail: bestAttempt ? `Attempt ${bestAttempt.attemptNum} · Set ${setLetter}` : undefined,
                                    stat: `${top.bestPct.toFixed(0)}%`,
                                    color: '#15803d', bg: '#dcfce7',
                                    iconPath: 'M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z',
                                });
                            }
                            if (struggling.length > 0) rows.push({
                                label: 'Below Passing',
                                detail: `${struggling.length} student${struggling.length !== 1 ? 's' : ''}`,
                                stat: `< ${passingRate}%`,
                                color: '#b91c1c', bg: '#fee2e2',
                                iconPath: 'M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636',
                            });
                            if (rows.length === 0 && hardestMos.length === 0) return <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--prof-text-muted)' }}>No data available.</p>;

                            const MoBadge = ({ hmo }: { hmo: typeof hardestMos[0] }) => (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '2px' }}>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#2563eb', background: '#dbeafe', borderRadius: '4px', padding: '1px 6px', flexShrink: 0 }}>
                                        CO{hmo.coOrd + 1}
                                    </span>
                                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#7c3aed', background: '#ede9fe', borderRadius: '4px', padding: '1px 6px', flexShrink: 0 }}>
                                        MO{hmo.coOrd + 1}{hmo.moOrd + 1}
                                    </span>
                                    <span style={{ fontSize: '0.72rem', color: 'var(--prof-text-muted)', fontWeight: 600 }}>{hmo.subjectCode}</span>
                                </div>
                            );

                            return (
                                <div style={{ display: 'flex', flexDirection: 'column' }}>
                                    {rows.map((row, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '9px 0', borderTop: i > 0 ? '1px solid var(--prof-border)' : 'none' }}>
                                            <div style={{ flexShrink: 0, width: '28px', height: '28px', borderRadius: '7px', background: row.bg, color: row.color, display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '1px' }}>
                                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d={row.iconPath} />
                                                </svg>
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: row.color, marginBottom: '1px' }}>{row.label}</div>
                                                <div style={{ fontSize: '0.83rem', fontWeight: 600, color: 'var(--prof-text-main)', whiteSpace: row.subDetail ? 'normal' : 'nowrap', overflow: row.subDetail ? 'visible' : 'hidden', textOverflow: row.subDetail ? 'clip' : 'ellipsis' }}>{row.detail}</div>
                                                {row.subDetail && (
                                                    <div style={{ fontSize: '0.72rem', color: 'var(--prof-text-muted)', marginTop: '1px' }}>{row.subDetail}</div>
                                                )}
                                            </div>
                                            <span style={{ fontSize: '0.88rem', fontWeight: 800, color: row.color, flexShrink: 0, marginTop: '1px' }}>{row.stat}</span>
                                        </div>
                                    ))}

                                    {hardestMos.length > 0 && (
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', padding: '9px 0', borderTop: rows.length > 0 ? '1px solid var(--prof-border)' : 'none' }}>
                                            <div style={{ flexShrink: 0, width: '28px', height: '28px', borderRadius: '7px', background: '#f5f3ff', color: '#7c3aed', display: 'flex', alignItems: 'center', justifyContent: 'center', marginTop: '1px' }}>
                                                <svg fill="none" strokeWidth="2" stroke="currentColor" viewBox="0 0 24 24" width="14" height="14">
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.042A8.967 8.967 0 006 3.75c-1.052 0-2.062.18-3 .512v14.25A8.987 8.987 0 016 18c2.305 0 4.408.867 6 2.292m0-14.25a8.966 8.966 0 016-2.292c1.052 0 2.062.18 3 .512v14.25A8.987 8.987 0 0118 18a8.967 8.967 0 00-6 2.292m0-14.25v14.25" />
                                                </svg>
                                            </div>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: '0.66rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#7c3aed', marginBottom: '3px' }}>
                                                    Hardest Topic{hardestMos.length > 1 ? 's' : ''}
                                                </div>
                                                {hardestMos.length === 1 ? (
                                                    <>
                                                        <MoBadge hmo={hardestMos[0]} />
                                                        <div style={{ fontSize: '0.83rem', fontWeight: 600, color: 'var(--prof-text-main)' }}>
                                                            {hardestMos[0].moDesc || '—'}
                                                        </div>
                                                    </>
                                                ) : (
                                                    <>
                                                        <button
                                                            onClick={() => setHardestExpanded(v => !v)}
                                                            style={{ display: 'flex', alignItems: 'center', gap: '5px', background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--prof-text-muted)', fontSize: '0.79rem', fontWeight: 600 }}>
                                                            {hardestMos.length} topics tied
                                                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ transition: 'transform 0.2s', transform: hardestExpanded ? 'rotate(180deg)' : 'rotate(0deg)', flexShrink: 0 }}>
                                                                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                                                            </svg>
                                                        </button>
                                                        {hardestExpanded && (
                                                            <div style={{ marginTop: '7px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                                                                {hardestMos.map(hmo => (
                                                                    <div key={hmo.key} style={{ padding: '6px 9px', borderRadius: '6px', background: '#f5f3ff', borderLeft: '3px solid #a78bfa' }}>
                                                                        <MoBadge hmo={hmo} />
                                                                        <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--prof-text-main)' }}>
                                                                            {hmo.moDesc || '—'}
                                                                        </div>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        )}
                                                    </>
                                                )}
                                            </div>
                                            <span style={{ fontSize: '0.88rem', fontWeight: 800, color: '#7c3aed', flexShrink: 0, marginTop: '1px' }}>
                                                {minMoPct!.toFixed(0)}%
                                            </span>
                                        </div>
                                    )}
                                </div>
                            );
                        })()}
                    </div>
                )}
            </div>

        </div>
    );
}
