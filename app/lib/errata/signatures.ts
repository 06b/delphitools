import { channel } from 'delphitools-v2/lib/channel';

const KEY = 'errata:signatures';
const LIMIT = 6;

function read(): string[] {
	try {
		const raw = localStorage.getItem(KEY);
		const parsed: unknown = raw ? JSON.parse(raw) : [];
		return Array.isArray(parsed)
			? parsed.filter(
					(s): s is string =>
						typeof s === 'string',
				)
			: [];
	} catch {
		return [];
	}
}

export const signatures = channel(read());

function write(next: string[]): void {
	signatures.set(next);
	try {
		localStorage.setItem(KEY, JSON.stringify(next));
	} catch {
		// quota or private mode: keep the in-memory list
	}
}

export function addSignature(dataUrl: string): void {
	write(
		[
			dataUrl,
			...signatures.get().filter((s) => s !== dataUrl),
		].slice(0, LIMIT),
	);
}

export function removeSignature(dataUrl: string): void {
	write(signatures.get().filter((s) => s !== dataUrl));
}

/** crops a drawn canvas to its ink, returns null when empty */
export function trimCanvas(
	source: HTMLCanvasElement,
): HTMLCanvasElement | null {
	const ctx = source.getContext('2d')!;
	const { width, height } = source;
	const data = ctx.getImageData(0, 0, width, height).data;
	let minX = width;
	let minY = height;
	let maxX = -1;
	let maxY = -1;
	for (let y = 0; y < height; y++) {
		for (let x = 0; x < width; x++) {
			if (data[(y * width + x) * 4 + 3]! === 0) continue;
			if (x < minX) minX = x;
			if (x > maxX) maxX = x;
			if (y < minY) minY = y;
			if (y > maxY) maxY = y;
		}
	}
	if (maxX < 0) return null;
	const pad = 4;
	minX = Math.max(0, minX - pad);
	minY = Math.max(0, minY - pad);
	maxX = Math.min(width - 1, maxX + pad);
	maxY = Math.min(height - 1, maxY + pad);
	const out = document.createElement('canvas');
	out.width = maxX - minX + 1;
	out.height = maxY - minY + 1;
	out.getContext('2d')!.drawImage(
		source,
		minX,
		minY,
		out.width,
		out.height,
		0,
		0,
		out.width,
		out.height,
	);
	return out;
}
