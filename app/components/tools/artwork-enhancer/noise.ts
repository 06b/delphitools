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

/** A centred square of at most `side` pixels, top-left origin, whole pixels. */
export function detailRect(width: number, height: number, side: number) {
	const edge = Math.min(side, Math.floor(width), Math.floor(height));
	return {
		x: Math.floor((width - edge) / 2),
		y: Math.floor((height - edge) / 2),
		side: edge,
	};
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

/** The web tool's enhancement: the noise over the image in overlay at `opacity` percent. */
export function enhance(
	image: Picture,
	noise: HTMLCanvasElement,
	opacity: number,
) {
	const canvas = document.createElement('canvas');
	canvas.width = image.width;
	canvas.height = image.height;
	const context = canvas.getContext('2d');
	if (!context) return null;
	context.drawImage(image, 0, 0);
	context.imageSmoothingEnabled = false;
	context.globalCompositeOperation = 'overlay';
	context.globalAlpha = opacity / 100;
	context.drawImage(noise, 0, 0, image.width, image.height);
	return canvas;
}

/** The centre detail, magnified without smoothing. */
export function magnified(image: Picture) {
	const { x, y, side } = detailRect(
		image.width,
		image.height,
		detail.side,
	);
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
