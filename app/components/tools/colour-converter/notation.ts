import { clamped, rgb255, type Rgb } from 'delphicanon/lib/colour';
import {
	channels,
	colourAt,
	pointFor,
	solidSpaces,
	type SolidChannel,
	type SolidPoint,
	type SolidSpace,
} from 'delphicanon/lib/colour-space';
import { readColour } from 'delphitools-v2/components/tools/colour-atlas/atlas';

/** Channel symbols, in `channels` order. */
export const letters: Record<SolidSpace, string[]> = {
	rgb: ['R', 'G', 'B'],
	hsl: ['H', 'S', 'L'],
	hsb: ['H', 'S', 'B'],
	oklch: ['L', 'C', 'H'],
	oklab: ['L', 'a', 'b'],
	lch: ['L', 'C', 'H'],
	lab: ['L', 'a', 'b'],
	cmyk: ['C', 'M', 'Y', 'K'],
};

/** Bare numbers as the space's channels, for the field's placeholder. */
export const examples: Record<SolidSpace, string> = {
	rgb: '59 130 246',
	hsl: '217 91 60',
	hsb: '217 76 96',
	oklch: '0.62 0.19 260',
	oklab: '0.62 -0.03 -0.19',
	lch: '54.6 66 277.5',
	lab: '54.6 8.6 -65.4',
	cmyk: '76 47 0 4',
};

const isHue = (channel: SolidChannel) =>
	channel.min === 0 && channel.max === 360;

/** A hue in 0..<360. */
export const wrapped = (hue: number) => hue - 360 * Math.floor(hue / 360);

/** Channel values for a point on the solid, in `channels` order and units. */
export function valuesAt(point: SolidPoint, space: SolidSpace): number[] {
	return channels(space).map((channel) => {
		let share = point[channel.axis]!;
		if (isHue(channel)) share -= Math.floor(share);
		return share * channel.scale + channel.offset;
	});
}

/** The solid's point for channel values. */
export function pointOf(values: number[], space: SolidSpace): SolidPoint {
	const point: SolidPoint = [0, 0, 0, 0];
	channels(space).forEach((channel, i) => {
		point[channel.axis] =
			(values[i]! - channel.offset) / channel.scale;
	});
	return point;
}

export const valuesOf = (colour: Rgb, space: SolidSpace) =>
	valuesAt(pointFor(space, colour), space);

export const colourOf = (values: number[], space: SolidSpace) =>
	colourAt(space, pointOf(values, space));

/** `decimals` places, without a minus on zero. */
export function fixed(value: number, decimals: number): string {
	const text = value.toFixed(decimals);
	return /^-[0.]+$/.test(text) ? text.slice(1) : text;
}

export function format(values: number[], space: SolidSpace): string {
	const [a = 0, b = 0, c = 0] = values;
	switch (space) {
		case 'rgb': {
			const rgb = values.map((v) =>
				Math.round(Math.min(Math.max(v, 0), 255)),
			);
			return `rgb(${rgb.join(', ')})`;
		}
		case 'hsl':
			return `hsl(${fixed(a, 1)}, ${fixed(b, 1)}%, ${fixed(c, 1)}%)`;
		case 'hsb':
			return `hsb(${fixed(a, 1)}, ${fixed(b, 1)}%, ${fixed(c, 1)}%)`;
		case 'oklch':
			return `oklch(${fixed(a, 4)} ${fixed(b, 4)} ${fixed(c, 1)})`;
		case 'oklab':
			return `oklab(${fixed(a, 4)} ${fixed(b, 4)} ${fixed(c, 4)})`;
		case 'lch':
			return `lch(${fixed(a, 2)} ${fixed(b, 2)} ${fixed(c, 1)})`;
		case 'lab':
			return `lab(${fixed(a, 2)} ${fixed(b, 2)} ${fixed(c, 2)})`;
		case 'cmyk':
			return `cmyk(${values.map((v) => `${fixed(v, 0)}%`).join(', ')})`;
	}
}

export function decimalRgb(colour: Rgb): string {
	const rgb = rgb255(clamped(colour));
	return `rgb(${rgb.map((v) => fixed(v / 255, 4)).join(', ')})`;
}

const functions: Record<string, SolidSpace> = {
	rgb: 'rgb',
	rgba: 'rgb',
	hsl: 'hsl',
	hsla: 'hsl',
	hsb: 'hsb',
	hsv: 'hsb',
	lab: 'lab',
	lch: 'lch',
	oklab: 'oklab',
	oklch: 'oklch',
	cmyk: 'cmyk',
	'device-cmyk': 'cmyk',
};

function channelValues(
	text: string,
	space: SolidSpace,
	commasSeparate: boolean,
): number[] | undefined {
	const cleaned = text
		.replaceAll('/', ' ')
		.replaceAll(',', commasSeparate ? ' ' : '.');
	const tokens = cleaned.split(/\s+/).filter(Boolean);
	const list = channels(space);
	// alpha ignored
	if (tokens.length !== list.length && tokens.length !== list.length + 1)
		return undefined;
	const values: number[] = [];
	const percents: boolean[] = [];
	for (const token of tokens.slice(0, list.length)) {
		const percent = token.endsWith('%');
		const digits = percent ? token.slice(0, -1) : token;
		const value = Number(digits);
		if (digits === '' || !Number.isFinite(value)) return undefined;
		values.push(value);
		percents.push(percent);
	}
	// decimal rgb, fractional ink
	const fractions =
		values.every((v) => v >= 0 && v <= 1) &&
		!percents.includes(true);
	if (space === 'rgb' && fractions && values.some((v) => v % 1 !== 0))
		values.forEach((v, i) => (values[i] = v * 255));
	if (space === 'cmyk' && fractions)
		values.forEach((v, i) => (values[i] = v * 100));
	list.forEach((channel, i) => {
		// css: 64% is 0.64
		if (percents[i] && channel.min === 0)
			values[i] = (values[i]! / 100) * channel.max;
		if (isHue(channel)) values[i] = wrapped(values[i]!);
	});
	return values;
}

/**
 * Channel values in `space` for a hex, a CSS colour name, a functional
 * notation of any solid space (hsv and device-cmyk too; an alpha is
 * ignored), or bare numbers read as `space`'s channels. Bare numbers take a
 * decimal comma when spaces separate them.
 */
export function read(text: string, space: SolidSpace): number[] | undefined {
	const trimmed = text.trim().toLowerCase();
	if (!trimmed) return undefined;
	const call = /^([a-z-]+)\s*\((.*)\)$/.exec(trimmed);
	if (call) {
		const named = functions[call[1]!];
		const values = named && channelValues(call[2]!, named, true);
		if (!named || !values) return undefined;
		return named === space
			? values
			: valuesOf(colourOf(values, named), space);
	}
	if (/[ ,/%]/.test(trimmed))
		return channelValues(
			trimmed,
			space,
			!trimmed.includes(' ') || trimmed.includes(', '),
		);
	const colour = readColour(trimmed);
	return colour && valuesOf(colour, space);
}

const inGamut = (colour: Rgb) =>
	colour.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

export const stops = 40;

/**
 * One channel swept across its range with the others held at `values`: the
 * colour at each stop, and whether it lies in sRGB.
 */
export function sweep(
	values: number[],
	space: SolidSpace,
	index: number,
): { colour: Rgb; inGamut: boolean }[] {
	const channel = channels(space)[index]!;
	return Array.from({ length: stops + 1 }, (_, step) => {
		const next = [...values];
		next[index] =
			channel.min +
			((channel.max - channel.min) * step) / stops;
		const colour = colourOf(next, space);
		return { colour, inGamut: inGamut(colour) };
	});
}

export interface LaunchFlags {
	/** Read in the launch space, so its numbers stay exact. */
	typed?: string;
	colour?: Rgb;
	space?: SolidSpace;
	row?: number;
	ortho: boolean;
	/** Every space at once. */
	grid: boolean;
}

/**
 * The iOS launch arguments as query flags: ?converterColour=<any notation>
 * ?converterSpace=<picker index> ?converterRow=<index> ?converterOrtho=1
 * ?converterGrid=1,
 * plus the carried ?color=<hex>.
 */
export function launchFlags(search: string): LaunchFlags {
	const query = new URLSearchParams(search);
	const index = (key: string) => {
		const text = query.get(key);
		const n = text === null ? NaN : Number(text);
		return Number.isInteger(n) && n >= 0 ? n : undefined;
	};
	const carried = query.get('color');
	const space = index('converterSpace');
	return {
		typed: query.get('converterColour') ?? undefined,
		colour: carried ? readColour(carried) : undefined,
		space: space === undefined ? undefined : solidSpaces[space],
		row: index('converterRow'),
		ortho: query.has('converterOrtho'),
		grid: query.has('converterGrid'),
	};
}
