import {
	fromHsl,
	fromLch,
	fromOklch,
	hsl,
	lch,
	oklch,
	type Rgb,
} from 'delphicanon/lib/colour';
import { maxOklchChroma } from 'delphitools-v2/lib/colour-maths';
import { readColour } from 'delphitools-v2/components/tools/colour-atlas/atlas';

/** HarmonyMode, with the web tool's descriptions and the iOS picker titles. */
export const modes: { title: string; description: string; angles: number[] }[] =
	[
		{
			title: 'Complementary',
			description: 'Two colours opposite on the colour wheel',
			angles: [0, 180],
		},
		{
			title: 'Analogous',
			description: 'Three colours adjacent on the wheel',
			angles: [-30, 0, 30],
		},
		{
			title: 'Triadic',
			description: 'Three colours evenly spaced (120° apart)',
			angles: [0, 120, 240],
		},
		{
			title: 'Split-Comp.',
			description:
				'Base colour plus two adjacent to its complement',
			angles: [0, 150, 210],
		},
		{
			title: 'Tetradic',
			description: 'Four colours evenly spaced (90° apart)',
			angles: [0, 90, 180, 270],
		},
		{
			title: 'Monochromatic',
			description: 'Single hue with varying lightness',
			angles: [0],
		},
		{
			title: 'Double-Comp.',
			description:
				'Two complementary pairs forming a rectangle',
			angles: [0, 60, 180, 240],
		},
		{
			title: 'Compound',
			description: 'Analogous colours plus their complements',
			angles: [0, 30, 180, 210],
		},
		{
			title: 'Pentadic',
			description: 'Five colours evenly spaced (72° apart)',
			angles: [0, 72, 144, 216, 288],
		},
		{
			title: 'Analogous Accent',
			description:
				'Analogous colours with a complementary accent',
			angles: [-30, 0, 30, 180],
		},
		{
			title: 'Golden Ratio',
			description:
				'Colours spaced by the golden angle (137.5°)',
			angles: [0, 137.5, 275],
		},
		{
			title: 'Near-Comp.',
			description:
				'Slightly off-complement for softer contrast',
			angles: [0, 165],
		},
	];

export const monochromatic = 5;

const monoLightness = [0.85, 0.7, undefined, 0.4, 0.25];

export type WheelSpace = 'oklch' | 'lch' | 'hsl';

export const wheelSpaces: WheelSpace[] = ['oklch', 'lch', 'hsl'];
export const wheelSpaceNames = ['OKLCH', 'LCH', 'HSL'];

/** A hue in 0..<360. */
export const wrapped = (hue: number) => hue - 360 * Math.floor(hue / 360);

/** The radial channel at the plane's edge: OKLCH chroma, CIE chroma (sRGB blue reaches 134), HSL saturation. */
export const reach: Record<WheelSpace, number> = {
	oklch: 0.33,
	lch: 134,
	hsl: 100,
};

/** Lightness at full scale, in its own units. */
export const lightnessScale = (space: WheelSpace) =>
	space === 'oklch' ? 1 : 100;

/** `l` and `r` are 0...1 of the space's lightness and reach; `h` in degrees. */
export function colourIn(
	space: WheelSpace,
	l: number,
	r: number,
	h: number,
): Rgb {
	switch (space) {
		case 'oklch':
			return fromOklch(l, r * reach.oklch, h);
		case 'lch':
			return fromLch(l * 100, r * reach.lch, h);
		case 'hsl': {
			const clamp = (v: number) =>
				Math.min(Math.max(v, 0), 1);
			return fromHsl(
				wrapped(h),
				clamp(r) * 100,
				clamp(l) * 100,
			);
		}
	}
}

export interface Parts {
	l: number;
	r: number;
	h: number;
}

export function partsOf(space: WheelSpace, colour: Rgb): Parts {
	switch (space) {
		case 'oklch': {
			const [l, c, h] = oklch(colour);
			return { l, r: c / reach.oklch, h };
		}
		case 'lch': {
			const [l, c, h] = lch(colour);
			return { l: l / 100, r: c / reach.lch, h };
		}
		case 'hsl': {
			const [h, s, l] = hsl(colour);
			return { l: l / 100, r: s / 100, h };
		}
	}
}

/** The largest `r` inside sRGB at lightness `l` and hue `h`. */
export function maxRadius(space: WheelSpace, l: number, h: number): number {
	if (space === 'hsl') return 1;
	if (space === 'oklch') return maxOklchChroma(l, h) / reach.oklch;
	// lost chroma means out-of-gamut
	let lo = 0;
	let hi = 1;
	for (let i = 0; i < 22; i++) {
		const mid = (lo + hi) / 2;
		const colour = colourIn(space, l, mid, h);
		const inside =
			colour.every((v) => v <= 1 + 1e-5) &&
			Math.abs(lch(colour)[1] - mid * reach.lch) < 0.5;
		if (inside) lo = mid;
		else hi = mid;
	}
	return lo;
}

/** The hue ring's colour at `h`: one lightness and chroma for every hue, inside the gamut. */
export function ringColour(space: WheelSpace, h: number): Rgb {
	const [l, r] =
		space === 'oklch'
			? [0.74, 0.12 / 0.33]
			: space === 'lch'
				? [0.74, 48 / 134]
				: [0.72, 0.7];
	return colourIn(space, l, Math.min(r, maxRadius(space, l, h)), h);
}

/**
 * The harmony of `(l, r, h)` in the model's order: offsets turn the hue;
 * monochromatic steps the lightness and softens chroma above 0.6.
 */
export function harmony(
	space: WheelSpace,
	{ l, r, h }: Parts,
	mode: number,
): Rgb[] {
	if (mode === monochromatic)
		return monoLightness.map((step = l) =>
			colourIn(space, step, step > 0.6 ? r * 0.7 : r, h),
		);
	return modes[mode]!.angles.map((offset) =>
		colourIn(space, l, r, wrapped(h + offset)),
	);
}

/** The index of the base in the model's order. */
export const baseIndex = (mode: number) =>
	mode === monochromatic ? 2 : modes[mode]!.angles.indexOf(0);

/** Line labels: Base, the hue offsets, or the monochromatic lightness. */
export function labels(space: WheelSpace, mode: number, colours: Rgb[]) {
	const base = baseIndex(mode);
	return colours.map((colour, i) => {
		if (i === base) return 'Base';
		if (mode !== monochromatic) {
			const offset = modes[mode]!.angles[i]!;
			const degrees = Math.abs(offset).toFixed(
				offset % 1 ? 1 : 0,
			);
			return `${offset > 0 ? '+' : '−'}${degrees}°`;
		}
		const l = partsOf(space, colour).l * lightnessScale(space);
		return `L ${l.toFixed(space === 'oklch' ? 2 : 0)}`;
	});
}

/**
 * The iOS launch arguments as query flags: ?harmonyColour=<any notation>
 * ?harmonyMode=<index> ?harmonySpace=<index>, plus the carried ?color=<hex>.
 */
export function launchFlags(search: string) {
	const query = new URLSearchParams(search);
	const index = (key: string, count: number) => {
		const n = Number(query.get(key) ?? NaN);
		return Number.isInteger(n) && n >= 0 && n < count
			? n
			: undefined;
	};
	const typed = query.get('harmonyColour');
	const carried = query.get('color');
	return {
		colour:
			(typed ? readColour(typed) : undefined) ??
			(carried ? readColour(carried) : undefined),
		mode: index('harmonyMode', modes.length),
		space: wheelSpaces[
			index('harmonySpace', wheelSpaces.length) ?? 0
		]!,
	};
}
