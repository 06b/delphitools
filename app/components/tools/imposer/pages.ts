import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { Picture } from 'delphitools-v2/components/tools/imposer/sheet';

/** Long edge of a page picture for the strip, px. */
export const thumbEdge = 160;
/** Long edge of a page picture on the big sheet, px (iOS maxEdge 1000). */
export const sharpEdge = 1000;

/** Draws a 0-based page with its long edge `edge` px. */
export async function render(
	pdf: PDFDocumentProxy,
	index: number,
	edge: number,
): Promise<Picture | null> {
	try {
		const page = await pdf.getPage(index + 1);
		const base = page.getViewport({ scale: 1 });
		const viewport = page.getViewport({
			scale: edge / Math.max(base.width, base.height),
		});
		const canvas = document.createElement('canvas');
		canvas.width = Math.ceil(viewport.width);
		canvas.height = Math.ceil(viewport.height);
		await page.render({ canvas, viewport }).promise;
		return {
			image: canvas,
			width: canvas.width,
			height: canvas.height,
		};
	} catch {
		return null;
	}
}

/** An `count`-page A5 PDF with a large number on each page, for ?impSample. */
export async function samplePdf(count: number): Promise<File> {
	const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
	const doc = await PDFDocument.create();
	const font = await doc.embedFont(StandardFonts.HelveticaBold);
	for (let n = 1; n <= count; n++) {
		const page = doc.addPage([420, 595]);
		const hue = (n * 47) % 360;
		page.drawRectangle({
			x: 24,
			y: 24,
			width: 372,
			height: 547,
			color: rgb(
				0.6 + 0.3 * Math.cos((hue * Math.PI) / 180),
				0.75,
				0.6 + 0.3 * Math.sin((hue * Math.PI) / 180),
			),
		});
		const text = String(n);
		const size = 160;
		page.drawText(text, {
			x: 210 - font.widthOfTextAtSize(text, size) / 2,
			y: 240,
			size,
			font,
			color: rgb(0.1, 0.15, 0.1),
		});
	}
	const bytes = await doc.save();
	return new File([new Uint8Array(bytes)], 'sample.pdf', {
		type: 'application/pdf',
	});
}
