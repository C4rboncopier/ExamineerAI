export function printOMR(): void {
    const html = buildOMRHtml();
    const blob = new Blob([html], { type: 'text/html' });
    const blobUrl = URL.createObjectURL(blob);

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;border:0;';

    iframe.onload = () => {
        const iframeWin = iframe.contentWindow;
        if (!iframeWin) { document.body.removeChild(iframe); URL.revokeObjectURL(blobUrl); return; }

        const cleanup = () => {
            if (document.body.contains(iframe)) document.body.removeChild(iframe);
            URL.revokeObjectURL(blobUrl);
        };
        iframeWin.addEventListener('afterprint', cleanup);
        setTimeout(cleanup, 60_000);

        iframeWin.focus();
        iframeWin.print();
    };

    iframe.src = blobUrl;
    document.body.appendChild(iframe);
}

function buildOMRHtml(): string {
    const SETS     = ['A', 'B', 'C', 'D', 'E'];
    const CHOICES  = ['A', 'B', 'C', 'D', 'E'];
    const ROLL_LEN = 5;
    const QUESTIONS     = 100;
    const ANS_COLS      = 4;
    const ROWS_PER_COL  = QUESTIONS / ANS_COLS; // 25

    // ── Exam Set bubbles ──────────────────────────────────────────────────────
    const setHtml = SETS.map(s => `
        <div class="si">
            <span class="sl">${s}</span>
            <span class="bb"></span>
        </div>`
    ).join('');

    // ── Roll Number grid  (5 columns × 10 digit rows) ────────────────────────
    const rollColHdrs = Array.from({ length: ROLL_LEN }, (_, i) =>
        `<div class="rc">${i + 1}</div>`
    ).join('');

    const rollRows = Array.from({ length: 10 }, (_, d) => {
        const cells = Array.from({ length: ROLL_LEN }, () =>
            `<div class="bc"><span class="bb"></span></div>`
        ).join('');
        return `<div class="rr"><div class="rd">${d}</div>${cells}</div>`;
    }).join('');

    // ── Answer grid  (4 columns × 25 rows, choices A–E) ──────────────────────
    const choiceHdrs = CHOICES.map(c => `<span class="ach">${c}</span>`).join('');

    const ansColsHtml = Array.from({ length: ANS_COLS }, (_, ci) => {
        const start = ci * ROWS_PER_COL + 1;
        const rows  = Array.from({ length: ROWS_PER_COL }, (_, ri) => {
            const q       = start + ri;
            const bubbles = CHOICES.map(() => `<span class="bb"></span>`).join('');
            return `<div class="ar"><span class="an">${q}.</span>${bubbles}</div>`;
        }).join('');
        return `
            <div class="ac">
                <div class="ah"><span class="an">&nbsp;</span>${choiceHdrs}</div>
                ${rows}
            </div>`;
    }).join('');

    // ── Timing marks (left edge, evenly spaced full height) ───────────────────
    const ticks = Array.from({ length: 58 }, () => '<div class="tk"></div>').join('');

    // ── CSS ───────────────────────────────────────────────────────────────────
    const css = `
@page { size: 8.5in 11in; margin: 0; }
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body {
    width: 8.5in; height: 11in; overflow: hidden;
    background: #fff; color: #000;
    font-family: Arial, Helvetica, sans-serif;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
}

/* ── Registration marks ───────────────────────────────── */
.rm  { position: fixed; width: .22in; height: .22in; background: #000; }
.tl  { top: .1in;    left: .1in;  }
.tr  { top: .1in;    right: .1in; }
.bl  { bottom: .1in; left: .1in;  }
.br  { bottom: .1in; right: .1in; }

/* ── Timing marks ─────────────────────────────────────── */
.tm  { position: fixed; left: .055in; top: .1in; bottom: .1in; display: flex; flex-direction: column; justify-content: space-between; }
.tk  { width: .1in; height: .065in; background: #000; }

/* ── Page ─────────────────────────────────────────────── */
.pg  { margin: .3in .4in .25in .5in; display: flex; flex-direction: column; gap: .12in; }

/* ── Title ────────────────────────────────────────────── */
.ttl { text-align: center; font-size: 16pt; font-weight: 800; letter-spacing: .2em; border-bottom: 2px solid #000; padding-bottom: .05in; }

/* ── Header write-in fields ───────────────────────────── */
.hb  { border: 2px solid #000; padding: .06in .15in; border-radius: 6px; }
.hdr { display: flex; gap: .1in; align-items: flex-end; }
.hdr + .hdr { margin-top: .08in; }
.lb  { font-size: 9pt; font-weight: 700; text-transform: uppercase; white-space: nowrap; }
.ul  { border-bottom: 1px solid #000; min-height: .18in; }

/* ── Mid row (set + roll side by side) ────────────────── */
.md  { display: flex; justify-content: space-between; gap: .2in; align-items: flex-start; }
.bx  { border: 2.5px solid #000; padding: .06in .15in; border-radius: 6px; box-sizing: border-box; }
.md > .bx { flex: 1; }
.bt  { font-size: 8pt; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; text-align: center; background: #000; color: #fff; padding: .05in .1in; margin: -.06in -.15in .09in; border-radius: 4px 4px 0 0; }

/* ── Bubble (shared) ──────────────────────────────────── */
.bb  { display: inline-flex; align-items: center; justify-content: center; width: .17in; height: .17in; border: 1.5px solid #000; border-radius: 50%; flex-shrink: 0; }

/* ── Exam set ─────────────────────────────────────────── */
.sr  { display: flex; gap: .15in; justify-content: center; margin-top: .15in; }
.si  { display: flex; flex-direction: column; align-items: center; gap: .05in; }
.sl  { font-size: 9pt; font-weight: 700; }

/* ── Roll number grid ─────────────────────────────────── */
.rhdr { display: flex; gap: .04in; justify-content: center; }
.rcn  { width: .15in; }
.rc   { width: .25in; font-size: 8pt; font-weight: 700; text-align: center; padding-bottom: .02in; border-bottom: 1px solid #aaa; margin-bottom: .03in; }
.rr   { display: flex; align-items: center; justify-content: center; height: .2in; gap: .04in; margin-bottom: .015in; }
.rd   { width: .15in; font-size: 8pt; font-weight: 700; text-align: right; padding-right: .04in; flex-shrink: 0; }
.bc   { width: .25in; display: flex; justify-content: center; align-items: center; }

/* ── Answer section ───────────────────────────────────── */
.ab  { border: 2.5px solid #000; padding: .06in .15in; border-radius: 6px; flex: 1; display: flex; flex-direction: column; }
.ag  { display: grid; grid-template-columns: repeat(4, 1fr); gap: 0 .15in; margin-top: .04in; flex: 1; }
.ac  { display: flex; flex-direction: column; align-items: center; }
.ah  { display: flex; gap: .03in; align-items: center; margin-bottom: .03in; padding-bottom: .03in; border-bottom: 1.5px solid #000; height: .2in; }
.an  { font-size: 7.5pt; font-weight: 700; width: .2in; text-align: right; flex-shrink: 0; padding-right: .05in; margin-right: .02in; }
.ach { font-size: 7.5pt; font-weight: 700; width: .17in; text-align: center; flex-shrink: 0; }
.ar  { display: flex; gap: .03in; align-items: center; height: .2in; margin-bottom: .018in; }
`.trim();

    // ── Full document ─────────────────────────────────────────────────────────
    return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><style>${css}</style></head>
<body>

<!-- Registration marks -->
<div class="rm tl"></div>
<div class="rm tr"></div>
<div class="rm bl"></div>
<div class="rm br"></div>

<!-- Timing marks -->
<div class="tm">${ticks}</div>

<div class="pg">

    <div class="ttl">ANSWER SHEET</div>

    <!-- Write-in header -->
    <div class="hb">
        <div class="hdr">
            <span class="lb">Name:</span>
            <div class="ul" style="flex:1"></div>
        </div>
        <div class="hdr">
            <span class="lb">Exam:</span>
            <div class="ul" style="flex:.62"></div>
            <span class="lb" style="margin-left:.12in">Date:</span>
            <div class="ul" style="flex:.38"></div>
        </div>
    </div>

    <!-- Exam set + Roll number -->
    <div class="md">
        <div class="bx">
            <div class="bt">Exam Set</div>
            <div class="sr">${setHtml}</div>
        </div>
        <div class="bx">
            <div class="bt">Roll No. — Last 5 Digits of Student ID</div>
            <div>
                <div class="rhdr"><div class="rcn"></div>${rollColHdrs}</div>
                ${rollRows}
            </div>
        </div>
    </div>

    <!-- Answer grid -->
    <div class="ab">
        <div class="bt">Answers</div>
        <div class="ag">${ansColsHtml}</div>
    </div>

</div>
</body>
</html>`;
}
