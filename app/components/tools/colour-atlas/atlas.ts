import {
	clamped,
	contrastFigure,
	contrastLevels,
	contrastRatio,
	fromHsl,
	hex,
	hsl,
	luminance,
	oklch,
	parseHex,
	type ColourFormat,
	type Rgb,
} from 'delphicanon/lib/colour';
import { solidSpaces, type SolidSpace } from 'delphicanon/lib/colour-space';
import { maxOklchChroma } from 'delphitools-v2/lib/colour-maths';
import {
	COLOUR_NOTATIONS,
	formatColour,
	type ColourNotation,
} from 'delphitools-v2/lib/colour-notation';
import { detectColour } from 'delphitools-v2/lib/colour-parse';
import {
	simulateHex,
	type SimulationType,
} from 'delphitools-v2/lib/colour-vision';

export const harmonies: { title: string; offsets: number[] }[] = [
	{ title: 'Complement', offsets: [0, 180] },
	{ title: 'Triad', offsets: [0, 120, 240] },
	{ title: 'Analogous', offsets: [-30, 0, 30] },
	{ title: 'Split', offsets: [0, 150, 210] },
];

export const visionTypes: { name: string; type: SimulationType }[] = [
	{ name: 'Protanopia', type: 'protanopia' },
	{ name: 'Deuteranopia', type: 'deuteranopia' },
	{ name: 'Tritanopia', type: 'tritanopia' },
	{ name: 'Achromatopsia', type: 'achromatopsia' },
];

const scaleSteps = 8;

/** Any notation the web tool read, CSS colour names included, as a kit colour. */
export function readColour(text: string): Rgb | undefined {
	const rgb = detectColour(text);
	return rgb ? (rgb.map((v) => v / 255) as unknown as Rgb) : undefined;
}

/** The notations rows of ColourAtlasEngine, in the header selector's formats. */
export function notationLines(colour: Rgb) {
	const code = hex(colour);
	return [
		...COLOUR_NOTATIONS.map((n) => ({
			label: n.label,
			value: formatColour(code, n.id),
		})),
		{
			label: 'Luminance',
			value: luminance(clamped(colour)).toFixed(3),
		},
	];
}

export function gamutTiles(colour: Rgb) {
	const [l, c, h] = oklch(clamped(colour));
	const most = maxOklchChroma(l, h);
	const used = most > 0 ? Math.min(1, c / most) : 0;
	return [
		{ label: 'Chroma', value: c.toFixed(3) },
		{ label: 'Maximum', value: most.toFixed(3) },
		{
			label: 'Used',
			value: `${Math.round(used * 100)} %`,
			level: used,
		},
	];
}

const white: Rgb = [1, 1, 1];
const black: Rgb = [0, 0, 0];

export function contrastRows(colour: Rgb) {
	return [
		{ ground: white, against: 'on white' },
		{ ground: black, against: 'on black' },
	].map(({ ground, against }) => {
		const ratio = contrastRatio(clamped(colour), ground);
		const lamps = [
			{ label: 'AA', on: ratio >= contrastLevels.aa },
			{ label: 'AAA', on: ratio >= contrastLevels.aaa },
			{ label: 'Large', on: ratio >= contrastLevels.aaLarge },
		];
		return {
			against,
			white: ground === white,
			ratio: `${contrastFigure(ratio)}:1`,
			lamps,
			passed: lamps
				.filter((lamp) => lamp.on)
				.map((lamp) => lamp.label)
				.join(', '),
		};
	});
}

/** Hue rotations in HSL, as the web atlas does them. */
export function harmony(colour: Rgb, offsets: number[]): Rgb[] {
	const [h, s, l] = hsl(colour);
	return offsets.map((offset) =>
		fromHsl((((h + offset) % 360) + 360) % 360, s, l),
	);
}

/** The colour followed by eight mixes towards `target`, 0 for shades or 1 for tints. */
export function scale(colour: Rgb, target: number): Rgb[] {
	const base = clamped(colour);
	return [
		base,
		...Array.from({ length: scaleSteps }, (_, i) => {
			const t = (i + 1) / (scaleSteps + 1);
			return base.map(
				(v) => v + (target - v) * t,
			) as unknown as Rgb;
		}),
	];
}

export function visionCards(colour: Rgb) {
	const code = hex(colour);
	return visionTypes.map(({ name, type }) => ({
		name,
		colour: parseHex(simulateHex(code, type) ?? code)!,
	}));
}

const kitFormats: Partial<Record<ColourNotation, ColourFormat>> = {
	hex: 'hex',
	rgb: 'rgb',
	hsl: 'hsl',
	lab: 'lab',
	oklab: 'oklab',
	oklch: 'oklch',
};

// ponytail: the kit has no Decimal RGB, HSV or YCbCr; those fall back to hex
export function kitFormat(notation: ColourNotation): ColourFormat {
	return kitFormats[notation] ?? 'hex';
}

export interface LaunchFlags {
	colour?: Rgb;
	harmony?: number;
	space?: SolidSpace;
	row?: number;
	ortho: boolean;
	orthoLater: boolean;
}

/**
 * The iOS launch arguments as query flags: ?atlasColour=<any notation>
 * ?atlasHarmony=<index> ?atlasSpace=<picker index> ?atlasRow=<index>
 * ?atlasOrtho=1 ?atlasOrthoLater=1, plus the carried ?color=<hex>.
 */
export function launchFlags(search: string): LaunchFlags {
	const query = new URLSearchParams(search);
	const index = (key: string) => {
		const text = query.get(key);
		const n = text === null ? NaN : Number(text);
		return Number.isInteger(n) && n >= 0 ? n : undefined;
	};
	const typed = query.get('atlasColour');
	const carried = query.get('color');
	const harmonyIndex = index('atlasHarmony');
	const spaceIndex = index('atlasSpace');
	return {
		colour:
			(typed ? readColour(typed) : undefined) ??
			(carried ? parseHex(carried) : undefined),
		harmony:
			harmonyIndex !== undefined &&
			harmonyIndex < harmonies.length
				? harmonyIndex
				: undefined,
		space:
			spaceIndex === undefined
				? undefined
				: solidSpaces[spaceIndex],
		row: index('atlasRow'),
		ortho: query.has('atlasOrtho'),
		orthoLater: query.has('atlasOrthoLater'),
	};
}
