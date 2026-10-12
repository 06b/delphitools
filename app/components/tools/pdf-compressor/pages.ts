import type { PDFDocumentProxy } from 'pdfjs-dist';
import { loadPdfDocument } from 'delphitools-v2/lib/pdfjs';

export interface PageSize {
	/** PDF points, as displayed (rotation applied). */
	width: number;
	height: number;
}

/** Long edge of a strip thumbnail in px. */
export const thumbEdge = 160;
/** Long edge of the comparison picture in px (iOS maxEdge 700). */
export const compareEdge = 700;

async function picture(
	pdf: PDFDocumentProxy,
	index: number,
	edge: number,
): Promise<string> {
	const page = await pdf.getPage(index + 1);
	const base = page.getViewport({ scale: 1 });
	const viewport = page.getViewport({
		scale: edge / Math.max(base.width, base.height),
	});
	const canvas = document.createElement('canvas');
	canvas.width = Math.ceil(viewport.width);
	canvas.height = Math.ceil(viewport.height);
	await page.render({ canvas, viewport }).promise;
	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, 'image/png'),
	);
	return blob ? URL.createObjectURL(blob) : '';
}

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

/** Page pictures in order, each as soon as it is drawn; stops once `live` turns false. */
export async function thumbnails(
	pdf: PDFDocumentProxy,
	live: () => boolean,
	each: (index: number, url: string) => void,
) {
	for (let index = 0; index < pdf.numPages && live(); index++) {
		const url = await picture(pdf, index, thumbEdge).catch(
			() => '',
		);
		if (live()) each(index, url);
		else if (url) URL.revokeObjectURL(url);
	}
}

/** One page at the comparison size; empty when it cannot be drawn. */
export function comparison(pdf: PDFDocumentProxy, index: number) {
	return picture(pdf, index, compareEdge).catch(() => '');
}
