import { tracked } from '@glimmer/tracking';
import { fromHsl, fromLab, hsl, lab } from 'delphicanon/lib/colour';
import { detectColour } from 'delphitools-v2/lib/colour-parse';
import {
	loadLayout,
	saveLayout,
} from 'delphitools-v2/lib/substrata/layout-storage';
import type { Layer, SubstrataDoc } from '../doc-model';
import { SwatchRows, parseHex, toHex } from './geometry';

/** sRGB channels 0...1 and alpha */
export interface RingColour {
	r: number;
	g: number;
	b: number;
	alpha: number;
}

export function colourFromHex(hex: string, alpha?: number): RingColour | null {
	const parsed = parseHex(hex);
	if (!parsed) return null;
	const [r, g, b, a] = parsed;
	return { r, g, b, alpha: alpha ?? a };
}

export const hexOf = (c: RingColour, withAlpha = true): string =>
	toHex(c.r, c.g, c.b, withAlpha ? c.alpha : 1);

export const sameColour = (a: RingColour, b: RingColour): boolean =>
	hexOf(a) === hexOf(b);

const RECENT_KEY = 'colourRecent';
const STARS_KEY = 'colourStars';

const strings = (value: unknown): string[] =>
	Array.isArray(value)
		? value.filter((v): v is string => typeof v === 'string')
		: [];

/** iOS ColourShelf: recent picks and stars, kept on this device across documents */
export class ColourShelf {
	static readonly recentLimit = SwatchRows.perRow;

	@tracked recent: string[] = strings(loadLayout(RECENT_KEY, []));
	@tracked stars: string[] = strings(loadLayout(STARS_KEY, []));

	remember(hex: string): void {
		const key = hex.toLowerCase();
		this.recent = [
			key,
			...this.recent.filter((h) => h !== key),
		].slice(0, ColourShelf.recentLimit);
		saveLayout(RECENT_KEY, this.recent);
	}

	isStarred(hex: string): boolean {
		return this.stars.includes(hex.toLowerCase());
	}

	toggleStar(hex: string): void {
		const key = hex.toLowerCase();
		this.stars = this.isStarred(key)
			? this.stars.filter((h) => h !== key)
			: [...this.stars, key];
		saveLayout(STARS_KEY, this.stars);
	}
}

export const shelf = new ColourShelf();

/** the ring's types round the hub, in order */
export type RingType =
	'markers' | 'freetone' | 'sliders' | 'palettes' | 'starred' | 'recent';

export const RING_TYPES: readonly { id: RingType; title: string }[] = [
	{ id: 'markers', title: 'Markers' },
	{ id: 'freetone', title: 'FREETONE' },
	{ id: 'sliders', title: 'Sliders' },
	{ id: 'palettes', title: 'Palettes' },
	{ id: 'starred', title: 'Starred' },
	{ id: 'recent', title: 'Recent' },
];

export type SliderMode = 'rgb' | 'hsl' | 'lab';

export const SLIDER_MODES: readonly SliderMode[] = ['rgb', 'hsl', 'lab'];

export const SLIDER_TITLES: Record<SliderMode, string> = {
	rgb: 'RGB',
	hsl: 'HSL',
	lab: 'Lab',
};

export const CHANNEL_NAMES: Record<SliderMode, string[]> = {
	rgb: ['R', 'G', 'B'],
	hsl: ['H', 'S', 'L'],
	lab: ['L', 'a', 'b'],
};

/** Lab's a and b run over ±100 on the track, which holds sRGB */
const LAB_REACH = 100;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** each channel as a 0...1 position along its track */
export function channels(mode: SliderMode, c: RingColour): number[] {
	if (mode === 'rgb') return [c.r, c.g, c.b];
	if (mode === 'hsl') {
		const [h, s, l] = hsl([c.r, c.g, c.b]);
		return [h / 360, s / 100, l / 100];
	}
	const [l, a, b] = lab([c.r, c.g, c.b]);
	return [
		l / 100,
		(a + LAB_REACH) / (2 * LAB_REACH),
		(b + LAB_REACH) / (2 * LAB_REACH),
	];
}

export function fromChannels(
	mode: SliderMode,
	values: number[],
	alpha: number,
): RingColour {
	const [x = 0, y = 0, z = 0] = values;
	const rgb =
		mode === 'rgb'
			? [x, y, z]
			: mode === 'hsl'
				? // hue 360 is outside fromHsl's ranges
					fromHsl(
						Math.min(x, 0.9999) * 360,
						y * 100,
						z * 100,
					)
				: fromLab(
						x * 100,
						y * 2 * LAB_REACH - LAB_REACH,
						z * 2 * LAB_REACH - LAB_REACH,
					);
	return {
		r: clamp01(rgb[0]!),
		g: clamp01(rgb[1]!),
		b: clamp01(rgb[2]!),
		alpha,
	};
}

/** each channel in its model's own units: 0–255, degrees and percent, or Lab's L, a and b */
export function figures(mode: SliderMode, values: number[]): string[] {
	const whole = (v: number) => String(Math.round(v) || 0);
	const [x = 0, y = 0, z = 0] = values;
	if (mode === 'rgb') return values.map((v) => whole(v * 255));
	if (mode === 'hsl')
		return [
			`${whole(x * 360)}°`,
			`${whole(y * 100)} %`,
			`${whole(z * 100)} %`,
		];
	return [
		whole(x * 100),
		whole(y * 2 * LAB_REACH - LAB_REACH),
		whole(z * 2 * LAB_REACH - LAB_REACH),
	];
}

/** iOS HexKeypad's digits: hex only, eight at most; a colour once three, six or eight are in */
export class HexDigits {
	@tracked digits = '';
	/** the shown digits are replaced by the first one typed, as a selected field's */
	#fresh = false;

	show(c: RingColour): void {
		this.digits = hexOf(c).slice(1);
		this.#fresh = true;
	}

	get colour(): RingColour | null {
		return [3, 6, 8].includes(this.digits.length)
			? colourFromHex(this.digits)
			: null;
	}

	/** false when nothing changed */
	insert(text: string): boolean {
		const typed = text.toLowerCase().replace(/[^\da-f]/g, '');
		if (!typed) return false;
		if (this.#fresh) this.digits = '';
		this.#fresh = false;
		if (this.digits.length >= 8) return false;
		this.digits = (this.digits + typed).slice(0, 8);
		return true;
	}

	deleteBackward(): boolean {
		this.#fresh = false;
		if (!this.digits) return false;
		this.digits = this.digits.slice(0, -1);
		return true;
	}

	clear(): void {
		this.digits = '';
		this.#fresh = false;
	}

	/** hex or any colour notation; text that is no colour leaves the digits as they are */
	paste(text: string): boolean {
		const trimmed = text.trim();
		if (!trimmed) return false;
		const hex = colourFromHex(trimmed);
		if (hex) {
			this.digits = hexOf(hex).slice(1);
			this.#fresh = false;
			return true;
		}
		const parsed = detectColour(trimmed);
		if (!parsed) return false;
		this.digits = toHex(
			parsed[0] / 255,
			parsed[1] / 255,
			parsed[2] / 255,
		).slice(1);
		this.#fresh = false;
		return true;
	}
}

/** a colour string as `#rrggbb[aa]`, or null for none or a clear one */
function normalise(colour: string | null | undefined): string | null {
	if (!colour) return null;
	const hex = colourFromHex(colour);
	if (hex) return hex.alpha > 0 ? hexOf(hex) : null;
	const parsed = detectColour(colour);
	return parsed
		? toHex(parsed[0] / 255, parsed[1] / 255, parsed[2] / 255)
		: null;
}

/** every colour the document uses, each once, in document order; the artboard's first */
export function usedColours(doc: SubstrataDoc): string[] {
	const seen: string[] = [];
	const add = (colour: string | null | undefined) => {
		const hex = normalise(colour);
		if (hex && !seen.includes(hex)) seen.push(hex);
	};
	const walk = (layers: Layer[]) => {
		for (const layer of layers) {
			if (layer.kind === 'text') {
				add(layer.fill);
				add(layer.stroke?.colour);
				add(layer.plate?.colour);
			} else if (layer.kind === 'shape') {
				if (typeof layer.fill === 'string')
					add(layer.fill);
				else
					for (const stop of layer.fill.stops)
						add(stop.colour);
				add(layer.stroke?.colour);
			} else if (layer.kind === 'freehand') add(layer.fill);
			else if (layer.kind === 'group') walk(layer.children);
		}
	};
	add(doc.artboard.background);
	walk(doc.layers);
	return seen;
}

/** the hue wheel's hue at an offset from its centre: red at the top, turning clockwise */
export function wheelHue(dx: number, dy: number): number {
	return (Math.atan2(dx, -dy) / (2 * Math.PI) + 1) % 1;
}
