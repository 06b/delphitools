import exifr from 'exifr';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import {
	layout,
	type Options,
} from 'delphitools-v2/components/tools/image-to-pdf/layout';
import { decodeImage } from 'delphitools-v2/lib/decode-image';

export interface Source {
	file: File;
	width: number;
	height: number;
}

function encode(
	canvas: HTMLCanvasElement,
	type: string,
	quality = 0.92,
): Promise<Blob> {
	return new Promise((resolve, reject) =>
		canvas.toBlob(
			(blob) =>
				blob
					? resolve(blob)
					: reject(new Error('encode failed')),
			type,
			quality,
		),
	);
}

// pdf-lib: jpeg, png only
async function redrawn(file: File, type: string): Promise<ArrayBuffer> {
	const bitmap = await decodeImage(file);
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
						// viewers ignore exif orientation
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
			trim,
			area,
			placement,
		} = layout(source.width, source.height, options);
		const page = doc.addPage([size.width, size.height]);
		if (options.bleed) {
			page.setTrimBox(
				trim.x,
				trim.y,
				trim.width,
				trim.height,
			);
			page.setBleedBox(0, 0, size.width, size.height);
		}
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

export type PageFormat = 'png' | 'jpeg' | 'webp';

/** A page drawn at `dpi`; `quality` 0 to 1 for jpeg and webp. Safari encodes webp as png: read the blob's type. */
export async function pageImage(
	pdf: PDFDocumentProxy,
	index: number,
	dpi: number,
	format: PageFormat,
	quality: number,
): Promise<Blob> {
	const page = await pdf.getPage(index + 1);
	const viewport = page.getViewport({ scale: dpi / 72 });
	const canvas = document.createElement('canvas');
	canvas.width = Math.ceil(viewport.width);
	canvas.height = Math.ceil(viewport.height);
	await page.render({ canvas, viewport }).promise;
	return encode(canvas, `image/${format}`, quality);
}

/** The file extension of an encoded page. */
export const extensionOf = (blob: Blob) =>
	blob.type === 'image/jpeg' ? 'jpg' : blob.type.replace('image/', '');
