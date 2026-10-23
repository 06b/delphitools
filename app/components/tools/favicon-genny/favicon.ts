export const sizes = [16, 32, 48, 64, 128, 180, 192, 512];

export const icoSizes = [16, 32, 48, 64];

export const snippet = `<link rel="icon" href="/favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="apple-touch-icon" sizes="180x180" href="/favicon-180x180.png">
<link rel="icon" type="image/png" sizes="192x192" href="/favicon-192x192.png">
<link rel="icon" type="image/png" sizes="512x512" href="/favicon-512x512.png">`;

export interface Square {
	x: number;
	y: number;
	side: number;
}

export interface Icon {
	size: number;
	dataUrl: string;
}

export const fileName = (size: number) => `favicon-${size}x${size}.png`;

/** What a size is for, where it has a name. */
export function role(size: number): string | undefined {
	if (size === 180) return 'Apple Touch';
	if (size === 192) return 'Android';
	if (size === 512) return 'PWA';
	if (icoSizes.includes(size)) return 'ICO';
	return undefined;
}

/** Smallest crop: a tenth of the short side, never under one pixel per pixel of the 16 px icon. */
export const minimumSide = (width: number, height: number) =>
	Math.max(16, Math.floor(Math.min(width, height) / 10));

/** `square` in whole pixels, at least `minimumSide` (or the whole short side of a smaller image), inside the image. */
export function clamp(square: Square, width: number, height: number): Square {
	const full = Math.min(width, height);
	const side = Math.min(
		Math.max(
			Math.round(square.side),
			Math.min(minimumSide(width, height), full),
		),
		full,
	);
	return {
		x: Math.min(Math.max(Math.round(square.x), 0), width - side),
		y: Math.min(Math.max(Math.round(square.y), 0), height - side),
		side,
	};
}

/** A square of `side` pixels in the middle of the image; none takes the largest. */
export function centred(width: number, height: number, side?: number): Square {
	const edge = side ?? Math.min(width, height);
	return clamp(
		{
			x: Math.floor((width - edge) / 2),
			y: Math.floor((height - edge) / 2),
			side: edge,
		},
		width,
		height,
	);
}

/** Every size from the square of `image`, as PNG data URLs. */
export function render(image: CanvasImageSource, square: Square): Icon[] {
	const canvas = document.createElement('canvas');
	const context = canvas.getContext('2d');
	if (!context) return [];
	return sizes.map((size) => {
		canvas.width = size;
		canvas.height = size;
		context.clearRect(0, 0, size, size);
		context.imageSmoothingQuality = 'high';
		context.drawImage(
			image,
			square.x,
			square.y,
			square.side,
			square.side,
			0,
			0,
			size,
			size,
		);
		return { size, dataUrl: canvas.toDataURL('image/png') };
	});
}
