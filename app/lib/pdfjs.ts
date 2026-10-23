// match worker version

import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type * as PdfJs from 'pdfjs-dist';
import type { PDFDocumentProxy } from 'pdfjs-dist';

let pdfjs: Promise<typeof PdfJs> | null = null;

export function getPdfJs(): Promise<typeof PdfJs> {
	pdfjs ??= import('pdfjs-dist').then((mod) => {
		mod.GlobalWorkerOptions.workerPort = new Worker(workerSrc, {
			type: 'module',
		});
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
		// passed worker survives destroy
		worker: pdfjs.PDFWorker.create({
			port: pdfjs.GlobalWorkerOptions.workerPort ?? undefined,
		}),
	}).promise;
}

export interface PageSize {
	/** PDF points, as displayed (rotation applied). */
	width: number;
	height: number;
}

/** Long edge of a strip thumbnail in px. */
export const thumbEdge = 160;
/** Long edge of the comparison picture in px (iOS maxEdge 700). */
export const compareEdge = 700;

/** Opens a PDF for rendering; pdf.js takes the copy it is given. */
export function open(bytes: ArrayBuffer | Uint8Array) {
	return loadPdfDocument(bytes.slice(0));
}

export async function sizes(pdf: PDFDocumentProxy): Promise<PageSize[]> {
	const out: PageSize[] = [];
	for (let n = 1; n <= pdf.numPages; n++) {
		const { width, height } = (await pdf.getPage(n)).getViewport({
			scale: 1,
		});
		out.push({ width, height });
	}
	return out;
}

export interface RenderOptions {
	/** Total rotation in degrees; unset keeps the page's own. */
	rotation?: number;
	/** Pixels per point at most, a resolution cap under `edge`. */
	maxScale?: number;
}

/** Draws a 0-based page with its long edge `edge` px; throws when it cannot. */
export async function renderPage(
	pdf: PDFDocumentProxy,
	index: number,
	edge: number,
	{ rotation, maxScale = Infinity }: RenderOptions = {},
): Promise<HTMLCanvasElement> {
	const page = await pdf.getPage(index + 1);
	const base = page.getViewport({ scale: 1, rotation });
	const viewport = page.getViewport({
		scale: Math.min(
			maxScale,
			edge / Math.max(base.width, base.height),
		),
		rotation,
	});
	const canvas = document.createElement('canvas');
	canvas.width = Math.ceil(viewport.width);
	canvas.height = Math.ceil(viewport.height);
	await page.render({ canvas, viewport }).promise;
	return canvas;
}

/** A page as a PNG object URL; empty when it cannot be drawn. */
export async function pageUrl(
	pdf: PDFDocumentProxy,
	index: number,
	edge: number,
	rotation?: number,
): Promise<string> {
	try {
		const canvas = await renderPage(pdf, index, edge, {
			rotation,
		});
		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, 'image/png'),
		);
		return blob ? URL.createObjectURL(blob) : '';
	} catch {
		return '';
	}
}

/** Page pictures in order, each as soon as it is drawn; stops once `live` turns false. */
export async function thumbnails(
	pdf: PDFDocumentProxy,
	live: () => boolean,
	each: (index: number, url: string) => void,
) {
	for (let index = 0; index < pdf.numPages && live(); index++) {
		const url = await pageUrl(pdf, index, thumbEdge);
		if (live()) each(index, url);
		else if (url) URL.revokeObjectURL(url);
	}
}

/** One page at the comparison size; empty when it cannot be drawn. */
export function comparison(pdf: PDFDocumentProxy, index: number) {
	return pageUrl(pdf, index, compareEdge);
}
