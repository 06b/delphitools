import { hexToRgb } from 'delphitools-v2/lib/substrata/colour-convert';

export type Rgb = [number, number, number];

const clamp = (v: number, min: number, max: number) =>
	Math.min(Math.max(v, min), max);

// the web's fmtValue
export function formatValue(
	v: number,
	spec: { step: number; unit?: string },
): string {
	const decimals = spec.step < 0.1 ? 2 : spec.step < 1 ? 1 : 0;
	const s = v.toFixed(decimals);
	if (!spec.unit) return s;
	return spec.unit === 'px' ? `${s} px` : `${s}${spec.unit}`;
}

export function signed(text: string, v: number): string {
	return v > 0 ? `+${text}` : text;
}

export function rgbOf(hex: string, fallback: Rgb = [0, 0, 0]): Rgb {
	const rgb = hexToRgb(hex);
	return rgb ? [rgb.r / 255, rgb.g / 255, rgb.b / 255] : fallback;
}

export function cssRgb([r, g, b]: Rgb): string {
	const byte = (v: number) => Math.round(clamp(v, 0, 1) * 255);
	return `rgb(${byte(r)} ${byte(g)} ${byte(b)})`;
}

export function lightness([r, g, b]: Rgb): number {
	return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export interface Levels {
	inBlack: number;
	inWhite: number;
	gamma: number;
	outBlack: number;
	outWhite: number;
}

export type LevelKey = keyof Levels;

// the ends keep two levels apart so gamma has room
export function clampLevels(v: Levels, key: LevelKey): Levels {
	const next = { ...v };
	switch (key) {
		case 'inBlack':
			next.inBlack = clamp(v.inBlack, 0, v.inWhite - 2);
			break;
		case 'inWhite':
			next.inWhite = clamp(v.inWhite, v.inBlack + 2, 255);
			break;
		case 'gamma':
			next.gamma = clamp(v.gamma, 0.1, 10);
			break;
		case 'outBlack':
			next.outBlack = clamp(v.outBlack, 0, v.outWhite - 1);
			break;
		default:
			next.outWhite = clamp(v.outWhite, v.outBlack + 1, 255);
	}
	return next;
}

// the gamma handle sits where the curve outputs 0.5
export function gammaPosition(
	gamma: number,
	black: number,
	white: number,
): number {
	return black + Math.pow(0.5, gamma) * (white - black);
}

export function gammaAt(position: number, black: number, white: number) {
	const t = (position - black) / Math.max(white - black, 1e-9);
	const raw = Math.log(clamp(t, 1e-9, 1)) / Math.log(0.5);
	return clamp(Math.round(raw * 100) / 100, 0.1, 10);
}

// alpha-weighted Rec. 709 luma of straight-alpha RGBA
export function countLuminance(data: ArrayLike<number>): number[] {
	const bins = new Array<number>(256).fill(0);
	for (let i = 0; i + 3 < data.length; i += 4) {
		const a = data[i + 3]!;
		if (a === 0) continue;
		const l =
			0.2126 * data[i]! +
			0.7152 * data[i + 1]! +
			0.0722 * data[i + 2]!;
		bins[clamp(Math.round(l), 0, 255)]! += a / 255;
	}
	return bins;
}

// the end bins hold clipping and stay out of the peak
export function normalised(bins: number[]): number[] {
	const peak = Math.max(...bins.slice(1, -1), 1e-9);
	return bins.map((b) => Math.min(1, b / peak));
}

export function histogramPath(
	bins: number[],
	w: number,
	h: number,
): string | null {
	if (bins.length < 2 || !bins.some((b) => b > 0)) return null;
	const step = w / bins.length;
	const parts = [`M0 ${h}`];
	bins.forEach((bin, i) => {
		const y = h * (1 - clamp(bin, 0, 1));
		parts.push(`L${i * step} ${y}L${(i + 1) * step} ${y}`);
	});
	parts.push(`L${w} ${h}Z`);
	return parts.join('');
}

// posterise: the end bands are half width
export function band(i: number, count: number) {
	const steps = Math.max(1, count - 1);
	return {
		from: Math.max(0, (i - 0.5) / steps),
		to: Math.min(1, (i + 0.5) / steps),
		grey: i / steps,
	};
}

// what each colour filter does to a sample, amount -100…100 (filter-factory)
export function sampleColour(
	type: string,
	key: string,
	amount: number,
): Rgb | null {
	const u = amount / 100;
	let rgb: Rgb;
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
			const c: Rgb = [0.85, 0.55, 0.35];
			const m = Math.max(...c);
			const mean = (c[0] + c[1] + c[2]) / 3;
			const k =
				type === 'saturation'
					? -u
					: Math.abs(m - mean) * 2 * -u;
			rgb = c.map((v) => v + (m - v) * k) as Rgb;
			break;
		}
		case 'colour-balance': {
			const shift = 0.3 * u;
			rgb = [
				0.5 + (key === 'cyanRed' ? shift : 0),
				0.5 + (key === 'magentaGreen' ? shift : 0),
				0.5 + (key === 'yellowBlue' ? shift : 0),
			];
			break;
		}
		default:
			return null;
	}
	return rgb.map((v) => clamp(v, 0, 1)) as Rgb;
}

export function trackStops(type: string, key: string): string[] | null {
	const stops: string[] = [];
	for (let v = -100; v <= 100; v += 25) {
		const rgb = sampleColour(type, key, v);
		if (!rgb) return null;
		stops.push(cssRgb(rgb));
	}
	return stops;
}

// the span between the origin and the value, as fractions 0…1
export function fillSpan(origin: number, fraction: number): [number, number] {
	return [Math.min(origin, fraction), Math.max(origin, fraction)];
}

// fabric HueRotation, sRGB
export function rotateHue([r, g, b]: Rgb, degrees: number): Rgb {
	const rad = (degrees / 180) * Math.PI;
	const cos = Math.cos(rad);
	const third = 1 / 3;
	const s = Math.sqrt(third) * Math.sin(rad);
	const oc = 1 - cos;
	return [
		(cos + oc / 3) * r +
			(third * oc - s) * g +
			(third * oc + s) * b,
		(third * oc + s) * r +
			(cos + third * oc) * g +
			(third * oc - s) * b,
		(third * oc - s) * r +
			(third * oc + s) * g +
			(cos + third * oc) * b,
	];
}

export function hueAt(t: number): Rgb {
	const h = (t % 1) * 6;
	const f = (n: number) => {
		const k = (n + h) % 6;
		return 1 - Math.max(0, Math.min(k, 4 - k, 1));
	};
	return [f(5), f(3), f(1)];
}

export function hueBand(
	degrees: number,
	n = 256,
): Uint8ClampedArray<ArrayBuffer> {
	const out = new Uint8ClampedArray(n * 4);
	for (let i = 0; i < n; i++) {
		const rgb = rotateHue(hueAt(i / n), degrees);
		out[i * 4] = Math.round(clamp(rgb[0], 0, 1) * 255);
		out[i * 4 + 1] = Math.round(clamp(rgb[1], 0, 1) * 255);
		out[i * 4 + 2] = Math.round(clamp(rgb[2], 0, 1) * 255);
		out[i * 4 + 3] = 255;
	}
	return out;
}

// a drag to the right turns the band back
export function rotation(start: number, dx: number, width: number): number {
	return start - (dx / Math.max(width, 1)) * 360;
}

// fabric Gamma
export function gammaOutput(input: number, gamma: number): number {
	return Math.pow(input, 1 / gamma);
}

export function gammaPath(gamma: number, w: number, h: number): string {
	const points = 48;
	const parts: string[] = [];
	for (let i = 0; i <= points; i++) {
		const x = i / points;
		const y = h - gammaOutput(x, gamma) * h;
		parts.push(
			`${i ? 'L' : 'M'}${(x * w).toFixed(2)} ${y.toFixed(2)}`,
		);
	}
	return parts.join('');
}

// half the pad's height, in artboard pixels
export const PAD_RANGES = [
	16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512, 768,
];

export function padRange(x: number, y: number, blur: number, spread = 0) {
	const need = Math.max(
		1.5 * Math.max(Math.abs(x), Math.abs(y)),
		1.2 * blur + spread,
	);
	return PAD_RANGES.find((r) => r >= need) ?? PAD_RANGES.at(-1)!;
}

// degrees anticlockwise with y down, 0…359
export function angleOf(x: number, y: number): number {
	if (x === 0 && y === 0) return 0;
	return (Math.round((Math.atan2(-y, x) * 180) / Math.PI) + 360) % 360;
}

// the renderer blits a glow twice
export function glowOpacity(intensity: number): number {
	return 1 - Math.pow(1 - clamp(intensity / 100, 0, 1), 2);
}

// SubstrataDuotone
export function duotoneExponent(midpoint: number): number {
	return Math.log(0.5) / Math.log(clamp(midpoint / 100, 0.01, 0.99));
}

export function duotoneStops(
	shadow: Rgb,
	highlight: Rgb,
	midpoint: number,
	stops = 17,
): string[] {
	const g = duotoneExponent(midpoint);
	return Array.from({ length: stops }, (_, i) => {
		const t = Math.pow(i / (stops - 1), g);
		return cssRgb(
			shadow.map(
				(s, k) => s + (highlight[k]! - s) * t,
			) as Rgb,
		);
	});
}

export interface VignetteShape {
	amount: number;
	midpoint: number;
	roundness: number;
	feather: number;
	colour: Rgb;
}

export function vignetteStretch(roundness: number, aspect: number) {
	return 1 + (aspect - 1) * roundness;
}

// SubstrataVignette over a grey stand-in, straight RGBA
export function vignettePixels(
	width: number,
	height: number,
	shape: VignetteShape,
	paper = 0.6,
): Uint8ClampedArray<ArrayBuffer> {
	const out = new Uint8ClampedArray(width * height * 4);
	const k = vignetteStretch(shape.roundness, width / Math.max(height, 1));
	const edge = shape.midpoint * 1.42 - shape.feather * 0.5;
	const span = Math.max(shape.feather, 0.001);
	for (let y = 0; y < height; y++) {
		const dy = (y + 0.5) / height - 0.5;
		for (let x = 0; x < width; x++) {
			const dx = ((x + 0.5) / width - 0.5) * k;
			const t = clamp(
				(Math.sqrt(dx * dx + dy * dy) * 2 - edge) /
					span,
				0,
				1,
			);
			const weight = t * t * (3 - 2 * t) * shape.amount;
			const i = (y * width + x) * 4;
			for (let c = 0; c < 3; c++)
				out[i + c] = Math.round(
					(paper +
						(shape.colour[c]! - paper) *
							weight) *
						255,
				);
			out[i + 3] = 255;
		}
	}
	return out;
}

export function vignetteMidpoint(
	px: number,
	py: number,
	stretch: number,
): number {
	return Math.min(
		100,
		Math.round((Math.hypot(px * stretch, py) / 0.71) * 100),
	);
}

export function noiseHash(x: number, y: number, seed: number): number {
	let h =
		(Math.imul(x, 1973) +
			Math.imul(y, 9277) +
			Math.imul(seed, 26699)) >>>
		0;
	h = Math.imul(h ^ (h >>> 16), 0x7feb352d) >>> 0;
	h = Math.imul(h ^ (h >>> 15), 0x846ca68b) >>> 0;
	return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

export function grain(
	side: number,
	amount: number,
	colour: boolean,
): Uint8ClampedArray<ArrayBuffer> {
	const out = new Uint8ClampedArray(side * side * 4);
	for (let y = 0; y < side; y++)
		for (let x = 0; x < side; x++) {
			const n = noiseHash(x, y, 0);
			const i = (y * side + x) * 4;
			for (let c = 0; c < 3; c++) {
				const r =
					colour && c > 0
						? noiseHash(x, y, c)
						: n;
				out[i + c] = Math.round(
					clamp(0.5 + (0.5 - r) * amount, 0, 1) *
						255,
				);
			}
			out[i + 3] = 255;
		}
	return out;
}

// the pixelate preview's field: hue across, darker down
export function fieldColour(x: number, y: number): Rgb {
	const value = 1 - 0.6 * clamp(y, 0, 1);
	const h = clamp(x, 0, 1) * 6;
	return [5, 3, 1].map((n) => {
		const k = (n + h) % 6;
		return value - value * 0.7 * Math.max(0, Math.min(k, 4 - k, 1));
	}) as Rgb;
}
