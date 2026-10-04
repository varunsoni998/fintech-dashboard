/**
 * pdfText.ts — pulls the text out of the first pages of a PDF, in the browser.
 * pdf.js is loaded only when the first PDF is dropped, so the rest of the
 * dashboard doesn't get any slower.
 */
let loader: Promise<any> | null = null;

function loadPdfjs(): Promise<any> {
  if (!loader) {
    loader = Promise.all([
      import("pdfjs-dist"),
      import("pdfjs-dist/build/pdf.worker.min.mjs?url"),
    ])
      .then(([pdfjs, worker]) => {
        pdfjs.GlobalWorkerOptions.workerSrc = worker.default;
        return pdfjs;
      })
      .catch(err => { loader = null; throw err; });
  }
  return loader;
}

export const isPdf = (f: File) => f.type === "application/pdf" || /\.pdf$/i.test(f.name);

/** Text of the first `maxPages` pages ("" for scans / photos that have no text layer). */
export async function readPdfText(file: File, maxPages = 2): Promise<string> {
  const pdfjs = await loadPdfjs();
  const doc = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()), isEvalSupported: false, verbosity: 0 }).promise;
  try {
    let text = "";
    for (let p = 1; p <= Math.min(maxPages, doc.numPages); p++) {
      const content = await (await doc.getPage(p)).getTextContent();
      text += content.items.map((i: any) => (i.str ?? "") + (i.hasEOL ? "\n" : " ")).join("") + "\n";
    }
    return text;
  } finally {
    doc.destroy();
  }
}
