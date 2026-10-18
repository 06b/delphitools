import {
	hexToRgb,
	rgbToHex,
	rgbToOklch,
	oklabToRgb,
	lchToLab,
	maxOklchChroma,
	type Triple,
} from 'delphitools-v2/lib/colour-maths';

/** built from a bundled lookup → list of level/lightness pairs */
const SHADE_TARGETS: [level: number, lightness: number][] = [
	[50, 0.97],
	[100, 0.93],
	[200, 0.87],
	[300, 0.78],
	[400, 0.66],
	[500, 0.55],
	[600, 0.47],
	[700, 0.4],
	[800, 0.33],
	[900, 0.27],
	[950, 0.2],
];

export type GenerationMode =
	'classic' | 'hue-shift' | 'luminance-anchored' | 'vivid' | 'muted';

export const GENERATION_MODES: {
	value: GenerationMode;
	label: string;
	/** The iOS picker title. */
	title: string;
	description: string;
}[] = [
	{
		value: 'classic',
		title: 'Classic',
		label: 'Classic',
		description:
			'Standard Tailwind-style generation with uniform hue',
	},
	{
		value: 'hue-shift',
		title: 'Hue Shift',
		label: 'Hue Shift',
		description: 'Warm tones for lighter shades, cool for darker',
	},
	{
		value: 'luminance-anchored',
		title: 'Luminance',
		label: 'Luminance Anchored',
		description: 'Anchors to true white/black for better contrast',
	},
	{
		value: 'vivid',
		title: 'Vivid',
		label: 'Vivid',
		description: 'Maximises saturation across all shades',
	},
	{
		value: 'muted',
		title: 'Muted',
		label: 'Muted',
		description: 'Subtle, desaturated tones throughout',
	},
];

export interface Shade {
	level: number;
	hex: string;
	oklch: Triple;
}

const MODE_RAMPS: Record<
	GenerationMode,
	[light: number, mid: number, dark: number]
> = {
	classic: [0.75, 1, 0.85],
	'hue-shift': [0.75, 1, 0.85],
	'luminance-anchored': [0.5, 1, 0.6],
	vivid: [1, 1.35, 1.15],
	muted: [0.3, 0.5, 0.4],
};

function rampScale(index: number, mode: GenerationMode): number {
	const [light, mid, dark] = MODE_RAMPS[mode];
	const fromEnd = SHADE_TARGETS.length - 1 - index;
	if (index < 2) return light + (mid - light) * (index / 2);
	if (fromEnd < 2) return dark + (mid - dark) * (fromEnd / 2);
	return mid;
}

function shadeParams(
	index: number,
	targetL: number,
	baseSat: number,
	baseH: number,
	mode: GenerationMode,
): Triple {
	const fromEnd = SHADE_TARGETS.length - 1 - index;
	const l =
		mode !== 'luminance-anchored'
			? targetL
			: index < 2
				? targetL + (1 - targetL) * 0.3
				: fromEnd < 2
					? targetL * 0.8
					: targetL;
	const h =
		mode === 'hue-shift'
			? (baseH + (targetL - 0.5) * 2 * 15 + 360) % 360
			: baseH;
	const sat = Math.min(1, baseSat * rampScale(index, mode));
	return [l, sat * maxOklchChroma(l, h), h];
}

export function generateShades(
	baseHex: string,
	mode: GenerationMode,
): Shade[] | null {
	const rgb = hexToRgb(baseHex);
	if (!rgb) return null;

	// saturation = chroma / max at that lightness; fixed chroma reads grey at L~0.95
	// tailwind sits within 0.1 of sRGB edge across levels
	const [baseL, baseC, baseH] = rgbToOklch(...rgb);
	const baseMax = maxOklchChroma(baseL, baseH);
	const baseSat = baseMax > 0 ? Math.min(1, baseC / baseMax) : 0;

	return SHADE_TARGETS.map(([level, targetL], index) => {
		const oklch = shadeParams(index, targetL, baseSat, baseH, mode);
		return {
			level,
			hex: rgbToHex(...oklabToRgb(...lchToLab(...oklch))),
			oklch,
		};
	});
}

type Format = (hex: string) => string;

export function cssBlock(shades: Shade[], name: string, format: Format) {
	const lines = shades.map(
		(s) => `  --${name}-${s.level}: ${format(s.hex)};`,
	);
	return `:root {\n${lines.join('\n')}\n}`;
}

export function oklchBlock(shades: Shade[], name: string) {
	const lines = shades.map(
		(s) =>
			`  --${name}-${s.level}: oklch(${s.oklch[0].toFixed(3)} ${s.oklch[1].toFixed(3)} ${s.oklch[2].toFixed(1)});`,
	);
	return `:root {\n${lines.join('\n')}\n}`;
}

/** trailing comma so it pastes into a map */
export function tailwindBlock(shades: Shade[], name: string, format: Format) {
	const entries = shades.map(
		(s) => `      ${s.level}: '${format(s.hex)}',`,
	);
	return `${name}: {\n${entries.join('\n')}\n    },`;
}

export const cleanName = (text: string) =>
	text.toLowerCase().replace(/[^a-z0-9-]/g, '');

/**
 * Where lightness `l` falls on a scale of falling lightnesses: a fractional
 * index, the level it reads as (to 10), and the nearest step.
 */
export function place(l: number, scale: number[]) {
	const levels = SHADE_TARGETS.map(([level]) => level);
	const first = scale[0];
	const last = scale.at(-1);
	if (
		scale.length !== levels.length ||
		first === undefined ||
		last === undefined
	)
		return { index: 5, level: 500, nearest: 5 };
	let index = 0;
	if (l >= first) index = 0;
	else if (l <= last) index = scale.length - 1;
	else {
		const upper = scale.findIndex(
			(v, i) =>
				i < scale.length - 1 &&
				v >= l &&
				scale[i + 1]! <= l,
		);
		const span = scale[upper]! - scale[upper + 1]!;
		index = upper + (span > 0 ? (scale[upper]! - l) / span : 0);
	}
	const lower = Math.floor(index);
	const upper = Math.min(lower + 1, levels.length - 1);
	const level =
		levels[lower]! +
		(levels[upper]! - levels[lower]!) * (index - lower);
	return {
		index,
		level: Math.round(level / 10) * 10,
		nearest: Math.round(index),
	};
}

export const targetLightness = SHADE_TARGETS.map(([, l]) => l);
