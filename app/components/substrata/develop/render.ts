import { getFilterBackend, WebGLFilterBackend } from 'fabric';
import type { RasterLayer } from 'delphitools-v2/lib/substrata/doc-model';
import { buildFabricFilters } from 'delphitools-v2/lib/substrata/filter-factory';
import {
	FILM_SIM_GRADES,
	FILM_SIM_PRESETS,
	applyGradeToImageData,
} from 'delphitools-v2/lib/substrata/filters';
import {
	LUT_LOOKS,
	applyLutToImageData,
	getLoadedLut,
} from 'delphitools-v2/lib/substrata/lut-data';
import { getRaster } from 'delphitools-v2/lib/substrata/raster-cache';

export interface Shelf {
	id: string;
	label: string;
	swatch: [string, string, string];
}

export const SHELF: Shelf[] = [...FILM_SIM_PRESETS, ...LUT_LOOKS];

export interface Histogram {
	red: Float32Array;
	green: Float32Array;
	blue: Float32Array;
	luminance: Float32Array;
}

const canvas = (w: number, h: number) => {
	const c = document.createElement('canvas');
	c.width = Math.max(1, Math.round(w));
	c.height = Math.max(1, Math.round(h));
	return c;
};

/** the layer's crop of its pixels, at most `side` px on the long edge */
export function proxyOf(
	layer: RasterLayer,
	side: number,
): HTMLCanvasElement | null {
	const src = getRaster(layer.blobHash);
	if (!src) return null;
	// the cached raster can be smaller than the natural size
	const k = src.width / Math.max(layer.naturalWidth, 1);
	const crop = layer.crop ?? {
		x: 0,
		y: 0,
		w: layer.naturalWidth,
		h: layer.naturalHeight,
	};
	const sw = crop.w * k;
	const sh = crop.h * k;
	const scale = Math.min(1, side / Math.max(sw, sh, 1));
	const out = canvas(sw * scale, sh * scale);
	out.getContext('2d')!.drawImage(
		src,
		crop.x * k,
		crop.y * k,
		sw,
		sh,
		0,
		0,
		out.width,
		out.height,
	);
	return out;
}

/** the proxy through the layer's filters, drawn into `target` */
export function develop(
	proxy: HTMLCanvasElement,
	layer: RasterLayer,
	target: HTMLCanvasElement,
	cacheKey: string,
): void {
	target.width = proxy.width;
	target.height = proxy.height;
	const chain = buildFabricFilters(layer.filters, {
		width: layer.naturalWidth,
		height: layer.naturalHeight,
	}).filter((f) => f && !f.isNeutralState());
	if (chain.length === 0) {
		const ctx = target.getContext('2d')!;
		ctx.clearRect(0, 0, target.width, target.height);
		ctx.drawImage(proxy, 0, 0);
		return;
	}
	const backend = getFilterBackend();
	if (backend instanceof WebGLFilterBackend)
		backend.applyFilters(
			chain,
			proxy,
			proxy.width,
			proxy.height,
			target,
			cacheKey,
		);
	else
		backend.applyFilters(
			chain,
			proxy,
			proxy.width,
			proxy.height,
			target,
		);
}

export function evict(cacheKey: string): void {
	const backend = getFilterBackend(false);
	if (backend instanceof WebGLFilterBackend)
		backend.evictCachesForKey(cacheKey);
}

/** red, green, blue and luminance counts, weighted by alpha (iOS FxHistogram) */
export function countOf(source: HTMLCanvasElement): Histogram {
	const scale = Math.min(1, 256 / Math.max(source.width, source.height));
	const small = canvas(source.width * scale, source.height * scale);
	const ctx = small.getContext('2d', { willReadFrequently: true })!;
	ctx.drawImage(source, 0, 0, small.width, small.height);
	const { data } = ctx.getImageData(0, 0, small.width, small.height);
	const out: Histogram = {
		red: new Float32Array(256),
		green: new Float32Array(256),
		blue: new Float32Array(256),
		luminance: new Float32Array(256),
	};
	for (let i = 0; i < data.length; i += 4) {
		const a = data[i + 3]!;
		if (a === 0) continue;
		const w = a / 255;
		const r = data[i]!;
		const g = data[i + 1]!;
		const b = data[i + 2]!;
		out.red[r]! += w;
		out.green[g]! += w;
		out.blue[b]! += w;
		out.luminance[
			Math.min(
				255,
				Math.round(
					0.2126 * r + 0.7152 * g + 0.0722 * b,
				),
			)
		]! += w;
	}
	return out;
}

/** bins over the tallest bin, ignoring pure black and white */
export function normalised(bins: Float32Array): number[] {
	let peak = 1e-9;
	for (let i = 1; i < bins.length - 1; i++)
		peak = Math.max(peak, bins[i]!);
	return Array.from(bins, (v) => Math.min(1, v / peak));
}

export const THUMB = { width: 96, height: 72 } as const;

/** the picture cover-cropped to a tile, under '' as it is and under each look's id */
export function thumbsOf(blobHash: string): Record<string, string> {
	const src = getRaster(blobHash);
	if (!src) return {};
	const w = THUMB.width * 2;
	const h = THUMB.height * 2;
	const base = canvas(w, h);
	const ctx = base.getContext('2d', { willReadFrequently: true })!;
	const scale = Math.max(w / src.width, h / src.height);
	ctx.drawImage(
		src,
		(w - src.width * scale) / 2,
		(h - src.height * scale) / 2,
		src.width * scale,
		src.height * scale,
	);
	const pixels = ctx.getImageData(0, 0, w, h);
	const out: Record<string, string> = { '': base.toDataURL() };
	const work = canvas(w, h);
	const workCtx = work.getContext('2d')!;
	const render = (
		id: string,
		apply: (data: Uint8ClampedArray) => void,
	) => {
		const copy = new ImageData(
			new Uint8ClampedArray(pixels.data),
			w,
			h,
		);
		apply(copy.data);
		workCtx.putImageData(copy, 0, 0);
		out[id] = work.toDataURL();
	};
	for (const preset of FILM_SIM_PRESETS) {
		const grade = FILM_SIM_GRADES[preset.id];
		if (grade)
			render(preset.id, (d) =>
				applyGradeToImageData(d, grade, 1),
			);
	}
	for (const look of LUT_LOOKS) {
		const lut = getLoadedLut(look.id);
		if (lut) render(look.id, (d) => applyLutToImageData(d, lut, 1));
	}
	return out;
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// the filter's maths on one colour, -100...100 (iOS FxColourEditor.sample)
function sample(type: string, amount: number): string | null {
	const u = amount / 100;
	let rgb: [number, number, number];
	switch (type) {
		case 'brightness':
			rgb = [0.5 + u / 2, 0.5 + u / 2, 0.5 + u / 2];
			break;
		case 'exposure': {
			const v = 0.5 * Math.pow(2, amount / 50);
			rgb = [v, v, v];
			break;
		}
		case 'temperature':
			rgb = [0.7 * (1 + 0.25 * u), 0.7, 0.7 * (1 - 0.25 * u)];
			break;
		case 'tint':
			rgb = [0.7, 0.7 * (1 - 0.25 * u), 0.7];
			break;
		case 'saturation':
		case 'vibrance': {
			const c = [0.85, 0.55, 0.35] as const;
			const m = Math.max(...c);
			const mean = (c[0] + c[1] + c[2]) / 3;
			const k =
				type === 'saturation'
					? -u
					: Math.abs(m - mean) * 2 * -u;
			rgb = [
				c[0] + (m - c[0]) * k,
				c[1] + (m - c[1]) * k,
				c[2] + (m - c[2]) * k,
			];
			break;
		}
		default:
			return null;
	}
	const [r, g, b] = rgb.map((v) => Math.round(clamp01(v) * 255));
	return `rgb(${r} ${g} ${b})`;
}

/** a gradient track for colour adjustments, null for a plain fill */
export function trackOf(type: string): string | null {
	const stops: string[] = [];
	for (let v = -100; v <= 100; v += 25) {
		const stop = sample(type, v);
		if (!stop) return null;
		stops.push(stop);
	}
	return `linear-gradient(to right, ${stops.join(', ')})`;
}
