/** iOS ArtworkEnhancerViewController.detail: the centre crop's side in source pixels, and its magnification. */
export const detail = { side: 64, factor: 8 };

type Picture = CanvasImageSource & { width: number; height: number };

export function fillNoise(
	data: Uint8ClampedArray,
	random: () => number = Math.random,
): void {
	for (let i = 0; i < data.length; i += 4) {
		data[i] = Math.floor(random() * 256);
		data[i + 1] = Math.floor(random() * 256);
		data[i + 2] = Math.floor(random() * 256);
		data[i + 3] = 255;
	}
}

export function noiseDimensions(
	width: number,
	height: number,
	scale: number,
): { width: number; height: number } {
	return {
		width: Math.ceil(width / scale),
		height: Math.ceil(height / scale),
	};
}

export interface Detail {
	x: number;
	y: number;
	side: number;
}

/** A square of at most `side` pixels around `centre` (default the image centre), kept inside the image, top-left origin, whole pixels. */
export function detailRect(
	width: number,
	height: number,
	side: number,
	centre?: { x: number; y: number },
): Detail {
	const edge = Math.min(side, Math.floor(width), Math.floor(height));
	const place = (at: number | undefined, length: number) =>
		at === undefined
			? Math.floor((length - edge) / 2)
			: Math.min(
					Math.max(Math.round(at - edge / 2), 0),
					Math.floor(length) - edge,
				);
	return {
		x: place(centre?.x, width),
		y: place(centre?.y, height),
		side: edge,
	};
}

/** Long side of the map that measures how busy each part of the picture is. */
export const busySide = 256;

const clamp = (value: number, max: number) => Math.min(Math.max(value, 0), max);

function boxBlur(
	values: Float32Array,
	width: number,
	height: number,
	radius: number,
) {
	const pass = (
		from: Float32Array,
		count: number,
		lines: number,
		at: (line: number, i: number) => number,
	) => {
		const to = new Float32Array(from.length);
		for (let line = 0; line < lines; line++)
			for (let i = 0; i < count; i++) {
				let sum = 0;
				for (let k = -radius; k <= radius; k++) {
					const j = clamp(i + k, count - 1);
					sum += from[at(line, j)]!;
				}
				to[at(line, i)] = sum / (radius * 2 + 1);
			}
		return to;
	};
	const across = pass(values, width, height, (y, x) => y * width + x);
	return pass(across, height, width, (x, y) => y * width + x);
}

/**
 * How busy each pixel's neighbourhood is, 0 (flat) to 1 (the busiest): the
 * Sobel gradient magnitude of the luma, box-blurred twice by `radius`.
 */
export function busyness(
	rgba: Uint8ClampedArray,
	width: number,
	height: number,
	radius: number,
): Float32Array {
	const luma = new Float32Array(width * height);
	for (let i = 0; i < luma.length; i++)
		luma[i] =
			0.299 * rgba[i * 4]! +
			0.587 * rgba[i * 4 + 1]! +
			0.114 * rgba[i * 4 + 2]!;
	const at = (x: number, y: number) =>
		luma[clamp(y, height - 1) * width + clamp(x, width - 1)]!;
	let edges = new Float32Array(luma.length);
	for (let y = 0; y < height; y++)
		for (let x = 0; x < width; x++) {
			const gx =
				at(x + 1, y - 1) +
				2 * at(x + 1, y) +
				at(x + 1, y + 1) -
				at(x - 1, y - 1) -
				2 * at(x - 1, y) -
				at(x - 1, y + 1);
			const gy =
				at(x - 1, y + 1) +
				2 * at(x, y + 1) +
				at(x + 1, y + 1) -
				at(x - 1, y - 1) -
				2 * at(x, y - 1) -
				at(x + 1, y - 1);
			edges[y * width + x] = Math.hypot(gx, gy);
		}
	edges = boxBlur(
		boxBlur(edges, width, height, radius),
		width,
		height,
		radius,
	);
	let max = 0;
	for (const value of edges) max = Math.max(max, value);
	if (max > 0) for (let i = 0; i < edges.length; i++) edges[i]! /= max;
	return edges;
}

/**
 * The busyness of `image` as an alpha mask at most `busySide` pixels across;
 * drawn scaled up with smoothing, it is a per-pixel noise opacity.
 */
export function busyMask(image: Picture) {
	const scale = Math.min(
		1,
		busySide / Math.max(image.width, image.height),
	);
	const canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.round(image.width * scale));
	canvas.height = Math.max(1, Math.round(image.height * scale));
	const context = canvas.getContext('2d', { willReadFrequently: true });
	if (!context) return null;
	context.drawImage(image, 0, 0, canvas.width, canvas.height);
	const pixels = context.getImageData(0, 0, canvas.width, canvas.height);
	const busy = busyness(pixels.data, canvas.width, canvas.height, 3);
	for (let i = 0; i < busy.length; i++) {
		pixels.data[i * 4] = 255;
		pixels.data[i * 4 + 1] = 255;
		pixels.data[i * 4 + 2] = 255;
		pixels.data[i * 4 + 3] = Math.round(busy[i]! * 255);
	}
	context.putImageData(pixels, 0, 0);
	return canvas;
}

/** Coloured noise in blocks of `scale` pixels, for an image this size. */
export function noiseCanvas(width: number, height: number, scale: number) {
	const size = noiseDimensions(width, height, scale);
	const canvas = document.createElement('canvas');
	canvas.width = size.width;
	canvas.height = size.height;
	const context = canvas.getContext('2d');
	if (!context) return null;
	const buffer = context.createImageData(size.width, size.height);
	fillNoise(buffer.data);
	context.putImageData(buffer, 0, 0);
	return canvas;
}

/** The noise at full size, its opacity taken from `mask`'s alpha. */
function maskedNoise(
	noise: HTMLCanvasElement,
	mask: HTMLCanvasElement,
	width: number,
	height: number,
) {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d');
	if (!context) return null;
	context.imageSmoothingEnabled = false;
	context.drawImage(noise, 0, 0, width, height);
	context.imageSmoothingEnabled = true;
	context.globalCompositeOperation = 'destination-in';
	context.drawImage(mask, 0, 0, width, height);
	return canvas;
}

/**
 * The web tool's enhancement: the noise over the image in overlay at
 * `opacity` percent; with a `mask` (Intelligent), scaled by its alpha.
 */
export function enhance(
	image: Picture,
	noise: HTMLCanvasElement,
	opacity: number,
	mask?: HTMLCanvasElement | null,
) {
	const canvas = document.createElement('canvas');
	canvas.width = image.width;
	canvas.height = image.height;
	const context = canvas.getContext('2d');
	if (!context) return null;
	const layer = mask
		? maskedNoise(noise, mask, image.width, image.height)
		: noise;
	if (!layer) return null;
	context.drawImage(image, 0, 0);
	context.imageSmoothingEnabled = false;
	context.globalCompositeOperation = 'overlay';
	context.globalAlpha = opacity / 100;
	context.drawImage(layer, 0, 0, image.width, image.height);
	return canvas;
}

/** The detail (default the centre), magnified without smoothing. */
export function magnified(
	image: Picture,
	{ x, y, side }: Detail = detailRect(
		image.width,
		image.height,
		detail.side,
	),
) {
	const out = side * detail.factor;
	const canvas = document.createElement('canvas');
	canvas.width = out;
	canvas.height = out;
	const context = canvas.getContext('2d');
	if (!context || !out) return null;
	context.imageSmoothingEnabled = false;
	context.drawImage(image, x, y, side, side, 0, 0, out, out);
	return canvas;
}
