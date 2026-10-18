import type { Rect, Size } from 'delphicanon/lib/dimension-line';

/** Red, green and blue, 0 to 255. */
export type Bytes = readonly [r: number, g: number, b: number];

export type MatteStyle = 0 | 1 | 2;
export const [blurred, solid, gradient] = [0, 1, 2] as const;

export type { Rect, Size };

/** Portrait presets as short and long side; Swap turns the chosen one landscape. */
export const ratios: [number, number][] = [
	[1, 1],
	[4, 5],
	[3, 4],
	[9, 16],
];
export const widths = [1080, 1200, 1440, 2048];

/** Output pixels, as the web's `blur(50px)` on the canvas. */
export const blur = 50;
/** The blurred photo is drawn this much larger than the box, so its soft edges stay outside. */
export const overscan = 1.2;
/** The gradient's second stop, per channel. */
export const falloff = -30;
// ponytail: long side capped at 8192, as iOS; the web tool capped only the width
export const longestSide = 8192;
export const minWidth = 100;
export const maxRatio = 32;

export interface MatteSpec {
	style: MatteStyle;
	colour: Bytes;
	/** The gradient's colours, evenly spaced. */
	stops: Bytes[];
	/** The gradient's CSS angle in degrees. */
	angle: number;
	ratioW: number;
	ratioH: number;
	width: number;
	padding: number;
}

export const defaultDominant: Bytes = [136, 136, 136];
export const defaultAngle = 135;

/** iOS's gradient: the photo's mean colour into a darker one. */
export function autoStops(dominant: Bytes): Bytes[] {
	return [dominant, shifted(dominant, falloff)];
}

export function heightOf(width: number, ratioW: number, ratioH: number) {
	return Math.round((width * ratioH) / ratioW);
}

/** Widest output whose long side stays within `longestSide`. */
export function widthLimit(ratioW: number, ratioH: number) {
	return ratioW >= ratioH
		? longestSide
		: Math.floor((longestSide * ratioW) / ratioH);
}

function centred({ width, height }: Size, box: Size): Rect {
	return {
		x: (box.width - width) / 2,
		y: (box.height - height) / 2,
		width,
		height,
	};
}

/** The image scaled to fit inside `box` less `padding` on every side, centred. */
export function fit(image: Size, box: Size, padding: number): Rect {
	if (image.width <= 0 || image.height <= 0)
		return { x: 0, y: 0, width: 0, height: 0 };
	const scale = Math.max(
		0,
		Math.min(
			(box.width - padding * 2) / image.width,
			(box.height - padding * 2) / image.height,
		),
	);
	return centred(
		{ width: image.width * scale, height: image.height * scale },
		box,
	);
}

/** The image scaled to cover `box`, times `by`, centred. */
export function cover(image: Size, box: Size, by: number): Rect {
	if (image.width <= 0 || image.height <= 0)
		return { x: 0, y: 0, width: 0, height: 0 };
	const scale =
		Math.max(box.width / image.width, box.height / image.height) *
		by;
	return centred(
		{ width: image.width * scale, height: image.height * scale },
		box,
	);
}

/** Every channel moved by `amount`, within 0 to 255. */
export function shifted(colour: Bytes, amount: number): Bytes {
	const clamp = (value: number) =>
		Math.min(255, Math.max(0, value + amount));
	return [clamp(colour[0]), clamp(colour[1]), clamp(colour[2])];
}

/** A colour of `lib/colour.ts`, 0 to 1 per channel, as bytes. */
export function bytes(colour: readonly [number, number, number]): Bytes {
	const byte = (value: number) =>
		Math.round(Math.min(Math.max(value, 0), 1) * 255);
	return [byte(colour[0]), byte(colour[1]), byte(colour[2])];
}

export function rgbCss([r, g, b]: Bytes) {
	return `rgb(${r}, ${g}, ${b})`;
}

/** The CSS linear-gradient of `angle` with `stops` evenly spaced. */
export function gradientCss(angle: number, stops: Bytes[]) {
	return `linear-gradient(${angle}deg, ${stops.map(rgbCss).join(', ')})`;
}

/**
 * The start and end of a canvas gradient that draws as CSS
 * `linear-gradient(<angle>deg, ...)` on a box: through the centre, as long
 * as the corners need, so the first and last stops meet the corners.
 */
export function gradientLine({ width, height }: Size, angle: number) {
	const radians = (angle * Math.PI) / 180;
	const dx = Math.sin(radians);
	const dy = -Math.cos(radians);
	const half = (Math.abs(width * dx) + Math.abs(height * dy)) / 2;
	const [cx, cy] = [width / 2, height / 2];
	return {
		x0: cx - dx * half,
		y0: cy - dy * half,
		x1: cx + dx * half,
		y1: cy + dy * half,
	};
}

type Context = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
type Picture = CanvasImageSource & Size;

/** Draws the matte as the export writes it: the backdrop, then the photo fitted at the padding. */
export function drawMatte(context: Context, image: Picture, spec: MatteSpec) {
	const box = {
		width: spec.width,
		height: heightOf(spec.width, spec.ratioW, spec.ratioH),
	};
	const pixels = { width: image.width, height: image.height };
	if (spec.style === solid) {
		context.fillStyle = rgbCss(spec.colour);
		context.fillRect(0, 0, box.width, box.height);
	} else if (spec.style === gradient) {
		const { x0, y0, x1, y1 } = gradientLine(box, spec.angle);
		const fill = context.createLinearGradient(x0, y0, x1, y1);
		const last = Math.max(spec.stops.length - 1, 1);
		spec.stops.forEach((stop, index) =>
			fill.addColorStop(index / last, rgbCss(stop)),
		);
		context.fillStyle = fill;
		context.fillRect(0, 0, box.width, box.height);
	} else {
		const back = cover(pixels, box, overscan);
		context.filter = `blur(${blur}px)`;
		context.drawImage(
			image,
			back.x,
			back.y,
			back.width,
			back.height,
		);
		context.filter = 'none';
	}
	context.imageSmoothingQuality = 'high';
	const photo = fit(pixels, box, spec.padding);
	context.drawImage(image, photo.x, photo.y, photo.width, photo.height);
}

/** The mean colour of the image, from a copy at most 64 px on the long side. */
export function average(image: Picture): Bytes {
	const scale = Math.min(1, 64 / Math.max(image.width, image.height));
	const width = Math.max(1, Math.round(image.width * scale));
	const height = Math.max(1, Math.round(image.height * scale));
	const context = new OffscreenCanvas(width, height).getContext('2d');
	if (!context) return defaultDominant;
	context.imageSmoothingQuality = 'high';
	context.drawImage(image, 0, 0, width, height);
	const data = context.getImageData(0, 0, width, height).data;
	const sum = [0, 0, 0];
	for (let i = 0; i < data.length; i += 4) {
		sum[0]! += data[i]!;
		sum[1]! += data[i + 1]!;
		sum[2]! += data[i + 2]!;
	}
	const count = data.length / 4;
	return [
		Math.round(sum[0]! / count),
		Math.round(sum[1]! / count),
		Math.round(sum[2]! / count),
	];
}

export function fileName(stem: string, width: number, height: number) {
	return `${stem}-matte-${width}x${height}.png`;
}
