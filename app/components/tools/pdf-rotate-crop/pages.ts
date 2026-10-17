import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { CropBox } from 'delphitools-v2/lib/pdf-crop';

export interface Geometry {
	/** The crop box as pdf.js reads it (`view`), page space. */
	box: CropBox;
	/** The page's own /Rotate. */
	rotation: number;
}

export interface Edit {
	/** Quarter turns on top of the page's own, degrees. */
	rotation: number;
	/** Page space; null keeps the whole page. */
	crop: CropBox | null;
}

/** Long edge of the crop picture in px (iOS maxEdge 1400). */
export const pictureEdge = 1400;

export async function geometry(pdf: PDFDocumentProxy): Promise<Geometry[]> {
	const out: Geometry[] = [];
	for (let n = 1; n <= pdf.numPages; n++) {
		const page = await pdf.getPage(n);
		const [x1, y1, x2, y2] = page.view as [
			number,
			number,
			number,
			number,
		];
		out.push({
			box: {
				x: Math.min(x1, x2),
				y: Math.min(y1, y2),
				width: Math.abs(x2 - x1),
				height: Math.abs(y2 - y1),
			},
			rotation: page.rotate,
		});
	}
	return out;
}

/** One page drawn at `rotation` (the total, degrees); empty when it cannot be drawn. */
export async function picture(
	pdf: PDFDocumentProxy,
	index: number,
	rotation: number,
): Promise<string> {
	try {
		const page = await pdf.getPage(index + 1);
		const base = page.getViewport({ scale: 1, rotation });
		const viewport = page.getViewport({
			scale: pictureEdge / Math.max(base.width, base.height),
			rotation,
		});
		const canvas = document.createElement('canvas');
		canvas.width = Math.ceil(viewport.width);
		canvas.height = Math.ceil(viewport.height);
		await page.render({ canvas, viewport }).promise;
		const blob = await new Promise<Blob | null>((resolve) =>
			canvas.toBlob(resolve, 'image/png'),
		);
		return blob ? URL.createObjectURL(blob) : '';
	} catch {
		return '';
	}
}

/** The iOS -rcSample document: three A4 pages, the second landscape. */
export async function samplePdf(): Promise<File> {
	const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
	const doc = await PDFDocument.create();
	const font = await doc.embedFont(StandardFonts.HelveticaBold);
	const sizes: [number, number][] = [
		[595.28, 841.89],
		[841.89, 595.28],
		[595.28, 841.89],
	];
	sizes.forEach(([width, height], index) => {
		const page = doc.addPage([width, height]);
		page.drawRectangle({
			x: 36,
			y: 36,
			width: width - 72,
			height: height - 72,
			borderColor: rgb(0.11, 0.23, 0.56),
			borderWidth: 2,
		});
		page.drawRectangle({
			x: 72,
			y: height - 200,
			width: width / 3,
			height: 110,
			color: rgb(0.88, 0.48, 0.25),
		});
		page.drawText(String(index + 1), {
			x: 72,
			y: 96,
			size: 96,
			font,
			color: rgb(0.11, 0.23, 0.56),
		});
	});
	const bytes = await doc.save();
	return new File([new Uint8Array(bytes)], 'sample.pdf', {
		type: 'application/pdf',
	});
}
