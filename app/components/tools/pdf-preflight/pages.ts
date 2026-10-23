import { htmlSafe, type SafeString } from '@ember/template';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import type { PageInfo } from 'delphitools-v2/lib/pdf-preflight';
import { insetOf } from 'delphitools-v2/components/tools/pdf-preflight/report';

export type BoxKind = 'trim' | 'bleed' | 'crop';

export interface PageBoxMark {
	kind: BoxKind;
	style: SafeString;
}

/** Trim, bleed and crop boxes as insets on the drawn page; pdf.js applies rotation and the crop origin. */
export async function boxMarks(
	pdf: PDFDocumentProxy,
	info: PageInfo,
): Promise<PageBoxMark[]> {
	const page = await pdf.getPage(info.number);
	const viewport = page.getViewport({ scale: 1 });
	const marks: PageBoxMark[] = [];
	for (const [kind, box] of [
		['trim', info.trimBox],
		['bleed', info.bleedBox],
		['crop', info.cropBox],
	] as const) {
		if (!box) continue;
		const rect = viewport.convertToViewportRectangle([
			box.x,
			box.y,
			box.x + box.width,
			box.y + box.height,
		]) as number[];
		marks.push({
			kind,
			style: htmlSafe(
				insetOf(rect, viewport.width, viewport.height),
			),
		});
	}
	return marks;
}

/** The iOS -pfSample launch argument: three pages that trip the geometry checks. */
export async function samplePdf(): Promise<File> {
	const { PDFDocument, StandardFonts } = await import('pdf-lib');
	const doc = await PDFDocument.create();
	const font = await doc.embedFont(StandardFonts.Helvetica);
	const sizes: [number, number][] = [
		[595, 842],
		[595, 842],
		[842, 595],
	];
	for (const [n, [width, height]] of sizes.entries()) {
		const page = doc.addPage([width, height]);
		page.drawText(`Page ${n + 1}`, {
			x: 48,
			y: height - 96,
			size: 48,
			font,
		});
		if (n === 0) {
			page.setBleedBox(0, 0, width, height);
			page.setTrimBox(4, 4, width - 8, height - 8);
		}
	}
	const bytes = await doc.save();
	return new File([bytes.slice().buffer], 'sample.pdf', {
		type: 'application/pdf',
	});
}
