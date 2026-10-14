import type { RingColour } from 'delphitools-v2/lib/substrata/colour-ring/model';

/** the editor's canvas as it shows, on the editor's ground, at device pixels */
export interface Still {
	data: ImageData;
	scale: number;
}

export function takeStill(editor: HTMLElement, ground: string): Still | null {
	const box = editor.getBoundingClientRect();
	const scale = window.devicePixelRatio || 1;
	const still = document.createElement('canvas');
	still.width = Math.max(1, Math.round(box.width * scale));
	still.height = Math.max(1, Math.round(box.height * scale));
	const ctx = still.getContext('2d', { willReadFrequently: true });
	if (!ctx) return null;
	ctx.fillStyle = ground;
	ctx.fillRect(0, 0, still.width, still.height);
	try {
		for (const layer of editor.querySelectorAll<HTMLCanvasElement>(
			'.sub-shell-canvas-area canvas.lower-canvas',
		)) {
			const r = layer.getBoundingClientRect();
			ctx.drawImage(
				layer,
				(r.left - box.left) * scale,
				(r.top - box.top) * scale,
				r.width * scale,
				r.height * scale,
			);
		}
		return {
			data: ctx.getImageData(0, 0, still.width, still.height),
			scale,
		};
	} catch {
		return null;
	}
}

/** the pixel under a point in CSS pixels, or null outside the still */
export function pixelAt(still: Still, x: number, y: number): RingColour | null {
	const px = Math.floor(x * still.scale);
	const py = Math.floor(y * still.scale);
	const { width, height, data } = still.data;
	if (px < 0 || py < 0 || px >= width || py >= height) return null;
	const i = (py * width + px) * 4;
	return {
		r: data[i]! / 255,
		g: data[i + 1]! / 255,
		b: data[i + 2]! / 255,
		alpha: 1,
	};
}

/** `across` pixels square round a point, the point in the middle */
export function pixelsAround(
	still: Still,
	x: number,
	y: number,
	across: number,
): ImageData {
	const out = new ImageData(across, across);
	const half = Math.floor(across / 2);
	const cx = Math.floor(x * still.scale) - half;
	const cy = Math.floor(y * still.scale) - half;
	const { width, height, data } = still.data;
	for (let row = 0; row < across; row++)
		for (let col = 0; col < across; col++) {
			const sx = cx + col;
			const sy = cy + row;
			if (sx < 0 || sy < 0 || sx >= width || sy >= height)
				continue;
			const from = (sy * width + sx) * 4;
			const to = (row * across + col) * 4;
			out.data[to] = data[from]!;
			out.data[to + 1] = data[from + 1]!;
			out.data[to + 2] = data[from + 2]!;
			out.data[to + 3] = data[from + 3]!;
		}
	return out;
}
