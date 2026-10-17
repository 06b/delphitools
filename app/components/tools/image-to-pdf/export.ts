import exifr from 'exifr';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
	layout,
	type Options,
} from 'delphitools-v2/components/tools/image-to-pdf/layout';

export interface Source {
	file: File;
	width: number;
	height: number;
}

function encode(canvas: HTMLCanvasElement, type: string): Promise<Blob> {
	return new Promise((resolve, reject) =>
		canvas.toBlob(
			(blob) =>
				blob
					? resolve(blob)
					: reject(new Error('encode failed')),
			type,
			0.92,
		),
	);
}

// pdf-lib embeds only jpeg and png
async function redrawn(file: File, type: string): Promise<ArrayBuffer> {
	const bitmap = await createImageBitmap(file);
	const canvas = document.createElement('canvas');
	canvas.width = bitmap.width;
	canvas.height = bitmap.height;
	canvas.getContext('2d')!.drawImage(bitmap, 0, 0);
	bitmap.close();
	return (await encode(canvas, type)).arrayBuffer();
}

/** One page per image, the picture clipped to the margin as iOS draws it. */
export async function buildPdf(
	sources: Source[],
	options: Options,
	progress: (share: number) => void,
): Promise<Uint8Array> {
	const {
		PDFDocument,
		clip,
		endPath,
		popGraphicsState,
		pushGraphicsState,
		rectangle,
	} = await import('pdf-lib');
	const doc = await PDFDocument.create();
	for (const [index, source] of sources.entries()) {
		const { file } = source;
		const embedded =
			file.type === 'image/jpeg'
				? await doc.embedJpg(
						// pdf viewers ignore exif orientation
						((await exifr.orientation(
							file,
						)) ?? 1) > 1
							? await redrawn(
									file,
									'image/jpeg',
								)
							: await file.arrayBuffer(),
					)
				: await doc.embedPng(
						file.type === 'image/png'
							? await file.arrayBuffer()
							: await redrawn(
									file,
									'image/png',
								),
					);
		const {
			page: size,
			area,
			placement,
		} = layout(source.width, source.height, options);
		const page = doc.addPage([size.width, size.height]);
		page.pushOperators(
			pushGraphicsState(),
			rectangle(area.x, area.y, area.width, area.height),
			clip(),
			endPath(),
		);
		page.drawImage(embedded, placement);
		page.pushOperators(popGraphicsState());
		progress((index + 1) / sources.length);
	}
	return doc.save();
}

/** `scale` 1 is 72 DPI. */
export async function pagePng(
	pdf: PDFDocumentProxy,
	index: number,
	scale: number,
): Promise<Blob> {
	const page = await pdf.getPage(index + 1);
	const viewport = page.getViewport({ scale });
	const canvas = document.createElement('canvas');
	canvas.width = Math.ceil(viewport.width);
	canvas.height = Math.ceil(viewport.height);
	await page.render({ canvas, viewport }).promise;
	return encode(canvas, 'image/png');
}
