import type { PDFDocument } from 'pdf-lib';
import type { PageRect } from 'delphicanon/components/canon-page-strip';
import { MM_TO_POINTS } from 'delphitools-v2/lib/imposition';
import { loadPdfDocument, renderPage } from 'delphitools-v2/lib/pdfjs';
import type { ZineFoldLayout } from 'delphitools-v2/lib/zine-folds';

export type FitMode = 'fit' | 'fill';

export interface ZineImage {
	id: string;
	name: string;
	blob: Blob;
	/** Object URL of `blob`, for display. */
	url: string;
	/** Decoded once at load. */
	element: HTMLImageElement;
	fitMode: FitMode;
}

export const ACCEPT = 'image/*,.pdf,application/pdf';

// 3mm uk/eu; us 1/8in
export const BLEED_MM = 3;

const PDF_DPI = 300;
// ponytail: raster cap, embed vector pages (crop box, /Rotate) if print quality needs it
const PDF_EDGE = 2400;

export const isPdf = (file: File) =>
	file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

const accepted = (file: File) => isPdf(file) || file.type.startsWith('image/');

let serial = 0;

function decode(blob: Blob, name: string): Promise<ZineImage> {
	const url = URL.createObjectURL(blob);
	const element = new Image();
	return new Promise((resolve, reject) => {
		element.onload = () =>
			resolve({
				id: `zine-${++serial}`,
				name,
				blob,
				url,
				element,
				fitMode: 'fill',
			});
		element.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error(`cannot decode ${name}`));
		};
		element.src = url;
	});
}

function canvasBlob(
	canvas: HTMLCanvasElement,
	type = 'image/png',
): Promise<Blob> {
	return new Promise((resolve, reject) =>
		canvas.toBlob(
			(blob) =>
				blob
					? resolve(blob)
					: reject(new Error('no blob')),
			type,
			0.92,
		),
	);
}

async function pdfPages(file: File, max: number): Promise<ZineImage[]> {
	const pdf = await loadPdfDocument(await file.arrayBuffer());
	const base = file.name.replace(/\.pdf$/i, '');
	const out: ZineImage[] = [];
	try {
		for (let n = 1; n <= Math.min(pdf.numPages, max); n++) {
			const canvas = await renderPage(pdf, n - 1, PDF_EDGE, {
				maxScale: PDF_DPI / 72,
			});
			// png pages: tens MB
			const blob = await canvasBlob(canvas, 'image/jpeg');
			canvas.width = 0;
			out.push(await decode(blob, `${base} p${n}`));
		}
	} finally {
		void pdf.destroy();
	}
	return out;
}

/** Images and the pages of each PDF, in order, up to `max`; files that do not decode are skipped. */
export async function loadFiles(
	files: File[],
	max: number,
): Promise<ZineImage[]> {
	const out: ZineImage[] = [];
	for (const file of files.filter(accepted)) {
		if (out.length >= max) break;
		try {
			if (isPdf(file))
				out.push(
					...(await pdfPages(
						file,
						max - out.length,
					)),
				);
			else out.push(await decode(file, file.name));
		} catch {
			// undecodable: skip
		}
	}
	return out;
}

export function release(images: (ZineImage | null)[]) {
	for (const image of images) if (image) URL.revokeObjectURL(image.url);
}

/** Empty slots from `start` to the end, then from the start: iOS fillOrder. */
export function fillOrder(filled: boolean[], start: number): number[] {
	if (filled.length === 0) return [];
	const begin = Math.min(Math.max(0, start), filled.length - 1);
	return [
		...Array.from(
			{ length: filled.length - begin },
			(_, i) => begin + i,
		),
		...Array.from({ length: begin }, (_, i) => i),
	].filter((i) => !filled[i]);
}

export function move<T>(list: T[], from: number, to: number): T[] {
	const next = [...list];
	const [item] = next.splice(from, 1);
	next.splice(to, 0, item as T);
	return next;
}

/** Keeps images by index; a shorter layout drops the tail, which the caller releases. */
export function resize(
	images: (ZineImage | null)[],
	count: number,
): (ZineImage | null)[] {
	return Array.from({ length: count }, (_, i) => images[i] ?? null);
}

/** Where a picture sits in a cell, centred: inside it (fit) or covering it (fill). */
export function placement(
	image: { width: number; height: number },
	cell: { width: number; height: number },
	fills: boolean,
): PageRect {
	const aspect = image.width / Math.max(image.height, 1);
	const byWidth =
		aspect > cell.width / Math.max(cell.height, 1) !== fills;
	const width = byWidth ? cell.width : cell.height * aspect;
	const height = byWidth ? cell.width / aspect : cell.height;
	return {
		x: (cell.width - width) / 2,
		y: (cell.height - height) / 2,
		width,
		height,
	};
}

// centre-crop; pdf-lib cannot clip
function cropToAspect(
	img: HTMLImageElement,
	targetAspect: number,
	type?: string,
) {
	const imgAspect = img.width / img.height;
	let sourceX = 0;
	let sourceY = 0;
	let sourceWidth = img.width;
	let sourceHeight = img.height;

	if (imgAspect > targetAspect) {
		sourceWidth = img.height * targetAspect;
		sourceX = (img.width - sourceWidth) / 2;
	} else {
		sourceHeight = img.width / targetAspect;
		sourceY = (img.height - sourceHeight) / 2;
	}

	const canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.round(sourceWidth));
	canvas.height = Math.max(1, Math.round(sourceHeight));
	canvas.getContext('2d')?.drawImage(
		img,
		sourceX,
		sourceY,
		sourceWidth,
		sourceHeight,
		0,
		0,
		canvas.width,
		canvas.height,
	);
	return canvasBlob(canvas, type);
}

// pdf-lib: png, jpeg only
async function embeddable(image: ZineImage, aspect: number | null) {
	if (aspect !== null)
		return cropToAspect(
			image.element,
			aspect,
			image.blob.type === 'image/jpeg'
				? 'image/jpeg'
				: undefined,
		);
	if (/^image\/(png|jpeg)$/.test(image.blob.type)) return image.blob;
	return cropToAspect(
		image.element,
		image.element.width / image.element.height,
	);
}

function embed(pdfDoc: PDFDocument, bytes: ArrayBuffer, isPng: boolean) {
	// mime unreliable; retry other decoder
	return isPng
		? pdfDoc.embedPng(bytes).catch(() => pdfDoc.embedJpg(bytes))
		: pdfDoc.embedJpg(bytes).catch(() => pdfDoc.embedPng(bytes));
}

export interface ZinePdfOptions {
	layout: ZineFoldLayout;
	images: (ZineImage | null)[];
	sheetWidthMm: number;
	sheetHeightMm: number;
	bleed: boolean;
}

/** One PDF page per printed side, front then back; bleed grows the page and the edge cells. */
export async function zinePdf({
	layout,
	images,
	sheetWidthMm,
	sheetHeightMm,
	bleed,
}: ZinePdfOptions): Promise<Uint8Array> {
	const { PDFDocument, degrees } = await import('pdf-lib');
	const pdfDoc = await PDFDocument.create();

	const sheetWidthPt = sheetWidthMm * MM_TO_POINTS;
	const sheetHeightPt = sheetHeightMm * MM_TO_POINTS;
	const cellWidthPt = sheetWidthPt / layout.cols;
	const cellHeightPt = sheetHeightPt / layout.rows;
	const targetAspect = cellWidthPt / cellHeightPt;

	const bleedPt = bleed ? BLEED_MM * MM_TO_POINTS : 0;
	const pageWidthPt = sheetWidthPt + bleedPt * 2;
	const pageHeightPt = sheetHeightPt + bleedPt * 2;

	for (const side of layout.sides) {
		const page = pdfDoc.addPage([pageWidthPt, pageHeightPt]);
		if (bleedPt) {
			// trim box = cut line
			page.setTrimBox(
				bleedPt,
				bleedPt,
				sheetWidthPt,
				sheetHeightPt,
			);
			page.setBleedBox(0, 0, pageWidthPt, pageHeightPt);
		}

		for (const spot of side.placements) {
			const image = images[spot.page - 1];
			if (!image) continue;

			// bleed: outer edges only
			const out = {
				left: spot.col === 0 ? bleedPt : 0,
				right:
					spot.col === layout.cols - 1
						? bleedPt
						: 0,
				top: spot.row === 0 ? bleedPt : 0,
				bottom:
					spot.row === layout.rows - 1
						? bleedPt
						: 0,
			};
			const boxWidthPt = cellWidthPt + out.left + out.right;
			const boxHeightPt = cellHeightPt + out.top + out.bottom;

			// fit skips bleed
			const fills = image.fitMode === 'fill';
			const blob = await embeddable(
				image,
				fills ? boxWidthPt / boxHeightPt : null,
			);
			const embedded = await embed(
				pdfDoc,
				await blob.arrayBuffer(),
				blob.type === 'image/png',
			);

			// pdf origin bottom-left, +bleed shift
			const cellX = bleedPt + spot.col * cellWidthPt;
			const cellY =
				bleedPt +
				(layout.rows - 1 - spot.row) * cellHeightPt;

			let drawWidth = boxWidthPt;
			let drawHeight = boxHeightPt;
			let drawX = cellX - out.left;
			let drawY = cellY - out.bottom;

			if (!fills) {
				const imgAspect =
					embedded.width / embedded.height;
				drawWidth = cellWidthPt;
				drawHeight = cellHeightPt;
				if (imgAspect > targetAspect)
					drawHeight = cellWidthPt / imgAspect;
				else drawWidth = cellHeightPt * imgAspect;
				drawX = cellX + (cellWidthPt - drawWidth) / 2;
				drawY = cellY + (cellHeightPt - drawHeight) / 2;
			}

			page.drawImage(
				embedded,
				spot.rotation === 180
					? {
							// 180°: from far corner
							x: drawX + drawWidth,
							y: drawY + drawHeight,
							width: drawWidth,
							height: drawHeight,
							rotate: degrees(180),
						}
					: {
							x: drawX,
							y: drawY,
							width: drawWidth,
							height: drawHeight,
						},
			);
		}
	}

	return pdfDoc.save();
}

/** A numbered, coloured picture: the iOS -zineImages launch argument without a folder. */
export async function samples(count: number): Promise<File[]> {
	const files: File[] = [];
	for (let n = 1; n <= count; n++) {
		const canvas = document.createElement('canvas');
		canvas.width = 420;
		canvas.height = 594;
		const ctx = canvas.getContext('2d');
		if (!ctx) break;
		ctx.fillStyle = `hsl(${(n * 47) % 360} 55% 62%)`;
		ctx.fillRect(0, 0, 420, 594);
		ctx.fillStyle = '#ffffff';
		ctx.font = 'bold 220px sans-serif';
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText(String(n), 210, 297);
		files.push(
			new File(
				[await canvasBlob(canvas)],
				`sample-${n}.png`,
				{
					type: 'image/png',
				},
			),
		);
	}
	return files;
}
