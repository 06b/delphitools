import {
	cover,
	overscan,
} from 'delphitools-v2/components/tools/matte-genny/matte';

/** Width over height, in the order of the shape segments. */
export const ratios = [4 / 5, 1];

/** Blur radius at the written size, px. */
export const blur = 30;

/** Longest side of the copy the live slides are drawn from. */
export const previewPixels = 2400;

export type Fill = 'blur' | readonly [r: number, g: number, b: number];

export interface Geometry {
	tileWidth: number;
	tileHeight: number;
	slideCount: number;
	needsFill: boolean;
	imageWidth: number;
	/** Strip px left of the image. */
	imageStart: number;
}

/** Image px. */
export interface Slice {
	sourceX: number;
	sourceWidth: number;
	drawX: number;
	isFillEdge: boolean;
}

// iOS ScrollEngine: the count rounds up, so the image is never cropped
export function geometry(
	width: number,
	height: number,
	ratio: number,
): Geometry | undefined {
	if (!(width > 0 && height > 0)) return undefined;
	const tileWidth = Math.max(1, Math.round(height * ratio));
	const slideCount = Math.max(1, Math.ceil(width / tileWidth));
	const fill = tileWidth * slideCount - width;
	return {
		tileWidth,
		tileHeight: height,
		slideCount,
		needsFill: fill > 0,
		imageWidth: width,
		// whole px: no half-pixel seam
		imageStart: Math.floor(fill / 2),
	};
}

export function slices(g: Geometry): Slice[] {
	const imageEnd = g.imageStart + g.imageWidth;
	return Array.from({ length: g.slideCount }, (_, index) => {
		const tileStart = index * g.tileWidth;
		const start = Math.max(tileStart, g.imageStart);
		const end = Math.min(tileStart + g.tileWidth, imageEnd);
		const hasContent = end > start;
		return {
			sourceX: hasContent ? start - g.imageStart : 0,
			sourceWidth: hasContent ? end - start : 0,
			drawX: hasContent ? start - tileStart : 0,
			isFillEdge:
				g.needsFill &&
				(index === 0 || index === g.slideCount - 1),
		};
	});
}

/** The file upright at full size, and a copy at most `previewPixels` long. */
export async function decode(file: File) {
	const full = await createImageBitmap(file);
	const scale = Math.min(
		1,
		previewPixels / Math.max(full.width, full.height),
	);
	const preview =
		scale < 1
			? await createImageBitmap(full, {
					resizeWidth: Math.round(
						full.width * scale,
					),
					resizeHeight: Math.round(
						full.height * scale,
					),
					resizeQuality: 'high',
				})
			: full;
	return { full, preview };
}

export const fileName = (stem: string, index: number) =>
	`${stem}-scroll-${index + 1}.png`;

type Picture = CanvasImageSource & { width: number; height: number };

/**
 * Slide `index` of the strip drawn from `image`, which may be a smaller copy
 * of the source: everything scales by its height over the tile height.
 */
export function drawSlide(
	image: Picture,
	g: Geometry,
	index: number,
	fill: Fill,
): HTMLCanvasElement {
	const scale = image.height / g.tileHeight;
	const width = Math.max(1, Math.round(g.tileWidth * scale));
	const height = image.height;
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext('2d')!;
	const slice = slices(g)[index];
	if (!slice) return canvas;
	const sourceX = slice.sourceX * scale;
	const sourceWidth = slice.sourceWidth * scale;
	if (slice.isFillEdge) {
		if (fill === 'blur') {
			if (sourceWidth > 0) {
				const back = cover(
					{ width: sourceWidth, height },
					{ width, height },
					overscan,
				);
				context.filter = `blur(${blur * scale}px)`;
				context.drawImage(
					image,
					sourceX,
					0,
					sourceWidth,
					height,
					back.x,
					back.y,
					back.width,
					back.height,
				);
				context.filter = 'none';
			}
		} else {
			context.fillStyle = `rgb(${fill.join(' ')})`;
			context.fillRect(0, 0, width, height);
		}
	}
	if (sourceWidth > 0)
		context.drawImage(
			image,
			sourceX,
			0,
			sourceWidth,
			height,
			slice.drawX * scale,
			0,
			sourceWidth,
			height,
		);
	return canvas;
}

export const pngOf = (canvas: HTMLCanvasElement) =>
	new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, 'image/png'),
	);

// ?scrollSample: the iOS -scrollSample launch argument, a drawn 3000 x 1350 panorama
export async function drawnPanorama(): Promise<File> {
	const canvas = document.createElement('canvas');
	canvas.width = 3000;
	canvas.height = 1350;
	const context = canvas.getContext('2d')!;
	const sky = context.createLinearGradient(0, 0, 3000, 0);
	sky.addColorStop(0, '#1d3b8f');
	sky.addColorStop(0.5, '#e07a3f');
	sky.addColorStop(1, '#f6d58e');
	context.fillStyle = sky;
	context.fillRect(0, 0, 3000, 1350);
	context.fillStyle = '#20302a';
	context.beginPath();
	context.moveTo(0, 1350);
	for (let x = 0; x <= 3000; x += 150)
		context.lineTo(x, 900 + Math.sin(x / 260) * 180);
	context.lineTo(3000, 1350);
	context.fill();
	const blob = await pngOf(canvas);
	return new File([blob!], 'panorama.png', { type: 'image/png' });
}
