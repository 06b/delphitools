import type { Rect, Size } from 'delphicanon/lib/dimension-line';

export interface Margins {
	top: number;
	right: number;
	bottom: number;
	left: number;
	/** Share of the area trimmed, in whole percent. */
	savedPercent: number;
}

/** The smallest rect holding every pixel with alpha above 0; null when there is none. */
export function keptRect(
	data: Uint8ClampedArray,
	width: number,
	height: number,
): Rect | null {
	let top = height;
	let bottom = -1;
	let left = width;
	let right = -1;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (data[(y * width + x) * 4 + 3] === 0) continue;
			if (y < top) top = y;
			bottom = y;
			if (x < left) left = x;
			if (x > right) right = x;
		}
	}
	if (bottom < 0) return null;
	return {
		x: left,
		y: top,
		width: right - left + 1,
		height: bottom - top + 1,
	};
}

export function margins(kept: Rect, size: Size): Margins {
	const area = size.width * size.height;
	return {
		top: kept.y,
		left: kept.x,
		bottom: size.height - kept.y - kept.height,
		right: size.width - kept.x - kept.width,
		savedPercent:
			area > 0
				? Math.round(
						(1 -
							(kept.width *
								kept.height) /
								area) *
							100,
					)
				: 0,
	};
}

export const untrimmed = ({ top, right, bottom, left }: Margins) =>
	top === 0 && right === 0 && bottom === 0 && left === 0;

// ?clipSample: the iOS -clipSample launch argument, a drawn 1400 x 1000 PNG kept at 500, 250, 600 x 400
export async function transparentSample(): Promise<File> {
	const canvas = document.createElement('canvas');
	canvas.width = 1400;
	canvas.height = 1000;
	const context = canvas.getContext('2d')!;
	const fill = context.createLinearGradient(500, 250, 1100, 650);
	fill.addColorStop(0, '#1d3b8f');
	fill.addColorStop(1, '#e07a3f');
	context.fillStyle = fill;
	context.beginPath();
	context.roundRect(500, 250, 600, 400, 80);
	context.fill();
	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, 'image/png'),
	);
	return new File([blob!], 'sample.png', { type: 'image/png' });
}
