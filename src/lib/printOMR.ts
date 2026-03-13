import type { PaperSize, SizeUnit } from './printExam';

export const OMR_IMAGE_SRC = '/omr/omr-template.jpg';

const NAMED_PAGE_SIZE: Record<Exclude<PaperSize, 'Custom'>, string> = {
    A4:     'A4',
    Letter: 'letter',
    Legal:  '8.5in 14in',
    Long:   '8.5in 13in',
};

function resolvePageSize(opts: {
    paperSize: PaperSize;
    customWidth?: number;
    customHeight?: number;
    customUnit?: SizeUnit;
}): string {
    if (opts.paperSize === 'Custom') {
        const u = opts.customUnit ?? 'in';
        return `${opts.customWidth ?? 8.5}${u} ${opts.customHeight ?? 11}${u}`;
    }
    return NAMED_PAGE_SIZE[opts.paperSize];
}

export function printOMR(opts: {
    paperSize: PaperSize;
    customWidth?: number;
    customHeight?: number;
    customUnit?: SizeUnit;
}): void {
    const pageSize = resolvePageSize(opts);

    const html = `<!DOCTYPE html><html><head>
<meta charset="UTF-8">
<style>
@page { size: ${pageSize}; margin: 0; }
* { margin: 0; padding: 0; box-sizing: border-box; }
html, body { width: 100%; height: 100%; overflow: hidden; }
img { display: block; width: 100%; height: 100%; object-fit: fill; }
</style>
</head><body><img id="omr" src="${OMR_IMAGE_SRC}"></body></html>`;

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;border:0;';

    iframe.onload = () => {
        const iframeWin = iframe.contentWindow;
        const iframeDoc = iframe.contentDocument;
        if (!iframeWin || !iframeDoc) { document.body.removeChild(iframe); return; }

        const cleanup = () => { if (document.body.contains(iframe)) document.body.removeChild(iframe); };
        iframeWin.addEventListener('afterprint', cleanup);
        setTimeout(cleanup, 60_000); // safety fallback

        const img = iframeDoc.getElementById('omr') as HTMLImageElement;
        const doPrint = () => { iframeWin.focus(); iframeWin.print(); };
        if (!img || img.complete) {
            doPrint();
        } else {
            img.addEventListener('load', doPrint);
            img.addEventListener('error', doPrint);
        }
    };

    iframe.srcdoc = html;
    document.body.appendChild(iframe);
}
