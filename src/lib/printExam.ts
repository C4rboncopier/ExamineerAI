import katex from 'katex';

export interface PrintExamOptions {
    title: string;
    code: string;
    schoolName?: string;
    schoolLogoUrl?: string | null;
    academicYear?: string;
    semester?: string;
    subjects: Array<{ course_code: string; course_title: string }>;
    setLabel: string;
    questions: Array<{
        question_text: string;
        choices: string[];
        image_url: string | null;
        mo_label?: string | null;
    }>;
}

function escapeHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Renders a string that may contain LaTeX math delimiters to HTML.
 * Non-math segments are HTML-escaped normally.
 */
function renderMath(text: string): string {
    const mathPattern = /\$\$([^$]+?)\$\$/g;
    const parts: string[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = mathPattern.exec(text)) !== null) {
        if (match.index > lastIndex) {
            parts.push(escapeHtml(text.slice(lastIndex, match.index)));
        }

        try {
            parts.push(katex.renderToString(match[1].trim(), {
                displayMode: false,
                throwOnError: false,
                output: 'html',
            }));
        } catch {
            parts.push(escapeHtml(match[0]));
        }

        lastIndex = match.index + match[0].length;
    }

    if (lastIndex < text.length) {
        parts.push(escapeHtml(text.slice(lastIndex)));
    }

    return parts.join('');
}

function buildExamHtml(opts: PrintExamOptions): string {
    const { title, code, schoolName, schoolLogoUrl, academicYear, semester, setLabel, questions } = opts;
    const aySem = [academicYear, semester].filter(Boolean).join(' / ');
    const LABELS = ['A', 'B', 'C', 'D'];

    const questionBlocks = questions.map((q, i) => {
        const choices = LABELS.map((lbl, ci) => {
            const text = q.choices[ci] ?? '';
            return `<div class="choice-item"><span class="choice-label">${lbl}.</span>${renderMath(text)}</div>`;
        }).join('');

        const imageHtml = q.image_url
            ? `<img class="question-image" src="${escapeHtml(q.image_url)}" alt="Question image" />`
            : '';

        const moTag = q.mo_label ? ` <b>[MO${q.mo_label}]</b>` : '';

        return `
<div class="question-block">
    <div class="question-text"><b>${i + 1}.</b>${moTag} ${renderMath(q.question_text)}</div>
    ${imageHtml}
    <div class="choices-grid">${choices}</div>
</div>`;
    }).join('');

    const schoolHeaderHtml = (schoolName || schoolLogoUrl) ? `
<div class="school-header">
    ${schoolLogoUrl ? `<img class="school-logo" src="${escapeHtml(schoolLogoUrl)}" alt="School logo" />` : ''}
    ${schoolName ? `<div class="school-name">${escapeHtml(schoolName)}</div>` : ''}
</div>` : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<title>${escapeHtml(title)} — Set ${escapeHtml(setLabel)}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/katex@0.16.33/dist/katex.min.css" />
<style>
@page {
    size: 8.5in 11in portrait;
    margin: 12mm 15mm 20mm 15mm;
    @bottom-center {
        content: "Page " counter(page) " of " counter(pages);
        font-size: 9pt;
        font-family: Arial, Helvetica, sans-serif;
        color: #555;
    }
}
* { box-sizing: border-box; margin: 0; padding: 0; }
body {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 11pt;
    color: #000;
    background: #fff;
}
/* School header */
.school-header {
    text-align: center;
    margin-bottom: 10pt;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 5pt;
}
.school-logo {
    height: 56pt;
    width: auto;
    max-width: 80pt;
    object-fit: contain;
}
.school-name {
    font-size: 13pt;
    font-weight: bold;
    text-transform: uppercase;
    letter-spacing: 0.5pt;
}
/* Exam identification table */
.exam-id-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 10pt;
    border: 1.5pt solid #000;
}
.exam-id-table td {
    border: 1pt solid #000;
    text-align: center;
    vertical-align: middle;
}
.exam-id-data td {
    font-weight: bold;
    font-size: 10.5pt;
    text-transform: uppercase;
    padding: 6pt 6pt;
}
.exam-id-data .set-cell {
    font-size: 14pt;
    font-weight: 900;
}
.exam-id-labels td {
    font-size: 8pt;
    color: #444;
    padding: 3pt 6pt;
    letter-spacing: 0.04em;
}
/* General Instructions */
.gen-instructions {
    border: 1.5pt solid #000;
    margin-bottom: 14pt;
}
.gen-instructions-title {
    font-weight: bold;
    font-size: 10.5pt;
    text-align: center;
    padding: 5pt 8pt;
    border-bottom: 1.5pt solid #000;
    text-transform: uppercase;
    letter-spacing: 0.8pt;
}
.gen-instructions ol {
    margin: 0;
    padding: 8pt 8pt 8pt 28pt;
}
.gen-instructions li {
    font-size: 9.5pt;
    line-height: 1.45;
    margin-bottom: 3pt;
}
.gen-instructions li:last-child {
    margin-bottom: 0;
}
/* Question blocks */
.question-block {
    break-inside: avoid;
    page-break-inside: avoid;
    margin-bottom: 7pt;
}
.question-text {
    line-height: 1.4;
    margin-bottom: 3pt;
}
.question-image {
    max-width: 80%;
    max-height: 160pt;
    margin: 6pt 0 8pt 0;
    display: block;
    border: 0.5pt solid #ccc;
}
.choices-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: repeat(2, auto);
    grid-auto-flow: column;
    gap: 2pt 28pt;
    margin-left: 18pt;
}
.choice-item {
    font-size: 10.5pt;
    line-height: 1.45;
}
.choice-label {
    font-weight: bold;
    margin-right: 4pt;
}
/* Make KaTeX inline math match surrounding text size */
.katex { font-size: 1em; }
</style>
</head>
<body>
${schoolHeaderHtml}
<table class="exam-id-table">
    <tr class="exam-id-data">
        <td>${escapeHtml(aySem || '—')}</td>
        <td>${escapeHtml(code)}</td>
        <td>${escapeHtml(title)}</td>
        <td class="set-cell">${escapeHtml(setLabel)}</td>
    </tr>
    <tr class="exam-id-labels">
        <td>SY / SEM</td>
        <td>COURSE CODE</td>
        <td>COURSE TITLE</td>
        <td>SET</td>
    </tr>
</table>

<div class="gen-instructions">
    <div class="gen-instructions-title">General Instructions</div>
    <ol>
        <li>Select the correct answer for each of the following questions. Mark only one answer for each item by shading the box corresponding to the letter of your choice on the answer sheet provided.</li>
        <li>Any forms of erasures and/or alterations of final answers are strictly prohibited.</li>
        <li>Ripping or tearing of test questionnaire and answer sheet pages are NOT ALLOWED.</li>
        <li>Use pens with black or blue ink only.</li>
        <li>Violations of the abovementioned instructions will automatically make your answers incorrect.</li>
        <li>Borrowing other materials, taking things out of your bags, or going out of the examination room once the exam has started is prohibited.</li>
        <li>The use of mobile phones and gadgets is STRICTLY NOT ALLOWED.</li>
    </ol>
</div>

${questionBlocks}
</body>
</html>`;
}

export function printExam(opts: PrintExamOptions): void {
    const html = buildExamHtml(opts);
    const blob = new Blob([html], { type: 'text/html' });
    const blobUrl = URL.createObjectURL(blob);

    const iframe = document.createElement('iframe');
    // In-viewport but invisible — off-screen iframes don't honour @page { size } in Chrome
    iframe.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none;border:0;';

    iframe.onload = () => {
        const iframeWin = iframe.contentWindow;
        if (!iframeWin) { document.body.removeChild(iframe); URL.revokeObjectURL(blobUrl); return; }

        const cleanup = () => { if (document.body.contains(iframe)) document.body.removeChild(iframe); URL.revokeObjectURL(blobUrl); };
        iframeWin.addEventListener('afterprint', cleanup);
        setTimeout(cleanup, 60_000);

        iframeWin.focus();
        iframeWin.print();
    };

    iframe.src = blobUrl;
    document.body.appendChild(iframe);
}
