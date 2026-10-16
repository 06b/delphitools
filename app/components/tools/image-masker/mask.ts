import { fitPlacement } from 'delphitools-v2/lib/pdf-pages';
import {
	MASK_FAMILIES,
	MASK_SHAPES,
	type MaskShape,
} from 'delphitools-v2/lib/mask-shapes';

export interface Size {
	width: number;
	height: number;
}

export interface Rect extends Size {
	x: number;
	y: number;
}

/** Zoom over the cover fit, and the offset in sides of the square. */
export interface View {
	zoom: number;
	x: number;
	y: number;
}

export const zoomRange = { min: 0.1, max: 8 };
export const scales = [0.5, 1, 2, 3];
export const maxSide = 8192;
export const emptySide = 1024;
export const placeholder = '#9a9a9a';

export const clampZoom = (zoom: number) =>
	Math.min(zoomRange.max, Math.max(zoomRange.min, zoom));

/** The export side: one image pixel a pixel at 1x. */
export function side(pixels: Size | undefined, zoom: number, scale: number) {
	const base = pixels
		? Math.min(pixels.width, pixels.height) / zoom
		: emptySide;
	return Math.max(16, Math.min(maxSide, Math.round(base * scale)));
}

/** The image's box in a square of `length`, top-left origin. */
export function imageFrame(pixels: Size, length: number, view: View): Rect {
	if (!(pixels.width > 0 && pixels.height > 0))
		return { x: 0, y: 0, width: length, height: length };
	const cover = fitPlacement(
		pixels.width,
		pixels.height,
		length,
		length,
		'cover',
	);
	const width = cover.width * view.zoom;
	const height = cover.height * view.zoom;
	return {
		x: (length - width) / 2 + view.x * length,
		y: (length - height) / 2 + view.y * length,
		width,
		height,
	};
}

export const covers = (frame: Rect, length: number) =>
	frame.x <= 0 &&
	frame.y <= 0 &&
	frame.x + frame.width >= length &&
	frame.y + frame.height >= length;

export type Cut = MaskShape | HTMLImageElement | 'square';

/** The image inside the cut, grey where the image does not reach. */
export function paint(
	context: CanvasRenderingContext2D,
	length: number,
	cut: Cut,
	image: (CanvasImageSource & Size) | undefined,
	view: View,
) {
	context.clearRect(0, 0, length, length);
	context.globalCompositeOperation = 'source-over';
	context.fillStyle = '#000';
	if (cut === 'square') {
		context.fillRect(0, 0, length, length);
	} else if (cut instanceof HTMLImageElement) {
		const { x, y, width, height } = fitPlacement(
			cut.width,
			cut.height,
			length,
			length,
			'contain',
		);
		context.drawImage(cut, x, y, width, height);
	} else {
		context.save();
		context.scale(length / 100, length / 100);
		context.fill(new Path2D(cut.d));
		context.restore();
	}

	context.globalCompositeOperation = 'source-in';
	const frame = image && imageFrame(image, length, view);
	if (!frame || !covers(frame, length)) {
		context.fillStyle = placeholder;
		context.fillRect(0, 0, length, length);
		// source-in would erase the grey
		context.globalCompositeOperation = 'source-atop';
	}
	if (image && frame) {
		context.imageSmoothingQuality = 'high';
		context.drawImage(
			image,
			frame.x,
			frame.y,
			frame.width,
			frame.height,
		);
	}
	context.globalCompositeOperation = 'source-over';
}

export interface Family {
	name: string;
	title: string;
	shapes: MaskShape[];
}

const familyName = (shape: MaskShape) =>
	shape.id.slice(0, shape.id.lastIndexOf('-'));

export const variantOf = (shape: MaskShape) =>
	Number(shape.id.slice(shape.id.lastIndexOf('-') + 1)) || 0;

/** The shapes by family, in the web tool's family order, variants in order. */
export const families: Family[] = MASK_FAMILIES.map((name) => ({
	name,
	title: `${name[0]!.toUpperCase()}${name.slice(1)}`,
	shapes: MASK_SHAPES.filter((shape) => familyName(shape) === name).sort(
		(a, b) => variantOf(a) - variantOf(b),
	),
}));

export const familyIndex = (shape: MaskShape) =>
	families.findIndex((family) => family.name === familyName(shape));

/** The same variant in another family, as iOS picks it. */
export function inFamily(shape: MaskShape, index: number): MaskShape {
	const { shapes } = families[index]!;
	const variant = Math.min(
		Math.max(variantOf(shape) - 1, 0),
		shapes.length - 1,
	);
	return shapes[variant]!;
}

export const fileName = (stem: string | undefined, cut: string) =>
	`${stem || 'mask'}-${cut}.png`;
