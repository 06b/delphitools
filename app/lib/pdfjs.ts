// match worker version

import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type * as PdfJs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';

let pdfjs: Promise<typeof PdfJs> | null = null;

export function getPdfJs(): Promise<typeof PdfJs> {
	pdfjs ??= import('pdfjs-dist').then((mod) => {
		mod.GlobalWorkerOptions.workerSrc = workerSrc;
		return mod;
	});
	return pdfjs;
}

// vite serves codec wasm and the standard 14 font files (vite.config.mjs, pdfjsWasm)
const PDF_WASM_URL = '/pdfjs-wasm/';
const PDF_FONTS_URL = '/pdfjs-fonts/';

export async function loadPdfDocument(
	data: ArrayBuffer | Uint8Array,
): Promise<PDFDocumentProxy> {
	const pdfjs = await getPdfJs();
	return pdfjs.getDocument({
		data,
		wasmUrl: PDF_WASM_URL,
		standardFontDataUrl: PDF_FONTS_URL,
	}).promise;
}
