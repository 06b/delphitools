import { luminance } from 'delphicanon/lib/colour';

// iOS SubstrataCore ColourRing.swift: the colour ring's libraries laid out
// as columns round the hub, and its polar frame round the colour key

export interface Swatch {
	code: string;
	name: string;
	hex: string;
	/** family letter and column when the code is not laid out that way (FREETONE) */
	group?: string;
}

export interface Palette {
	name: string;
	category: string;
	colours: string[];
}

export interface SwatchColumn {
	label: string | null;
	swatches: Swatch[];
	/** degrees along the set from its first column, and across this one */
	start: number;
	width: number;
}

export interface SwatchIndex {
	column: number;
	row: number;
}

export interface Point {
	x: number;
	y: number;
}

interface ColumnSpec {
	label: string | null;
	swatches: Swatch[];
	width: number;
}

/** WCAG relative luminance of a hex colour, 0 for black to 1 for white */
export function relativeLuminance(hex: string): number {
	const rgb = parseHex(hex);
	return rgb ? luminance([rgb[0], rgb[1], rgb[2]]) : 0;
}

/** `#rgb`, `#rrggbb` or `#rrggbbaa` as 0...1 channels and alpha */
export function parseHex(
	text: string,
): [number, number, number, number] | null {
	let digits = text.trim().replace(/^#/, '').toLowerCase();
	if (/^[\da-f]{3}$/.test(digits))
		digits = [...digits].map((d) => d + d).join('');
	if (!/^[\da-f]{6}([\da-f]{2})?$/.test(digits)) return null;
	const byte = (i: number) => parseInt(digits.slice(i, i + 2), 16) / 255;
	return [byte(0), byte(2), byte(4), digits.length === 8 ? byte(6) : 1];
}

/** `#rrggbb`, or `#rrggbbaa` below full opacity */
export function toHex(r: number, g: number, b: number, alpha = 1): string {
	const channels = alpha < 1 ? [r, g, b, alpha] : [r, g, b];
	return (
		'#' +
		channels
			.map((c) =>
				Math.round(Math.min(1, Math.max(0, c)) * 255)
					.toString(16)
					.padStart(2, '0'),
			)
			.join('')
	);
}

export class SwatchSet {
	readonly columns: SwatchColumn[];
	/** points along the radius per swatch */
	readonly depth: number;
	/** drawn as fan-deck chips, a tab carrying each code */
	readonly chips: boolean;

	/** headings of families take this share of a swatch column */
	static readonly familyHeading = 0.6;

	constructor(columns: ColumnSpec[], depth: number, chips = false) {
		let start = 0;
		this.columns = columns.map((column) => {
			const laid = { ...column, start };
			start += column.width;
			return laid;
		});
		this.depth = depth;
		this.chips = chips;
	}

	/**
	 * Groups, or else codes, are a family letter and more characters. Each
	 * family is headed by its letter, then one column per character at
	 * `key`, lightest nearest the hub.
	 */
	static families(
		swatches: Swatch[],
		key: number,
		columnWidth: number,
		depth: number,
		chips = false,
	): SwatchSet {
		const families: [string, [string, Swatch[]][]][] = [];
		for (const swatch of swatches) {
			const code = [...(swatch.group ?? swatch.code)];
			if (code.length <= key) continue;
			const family = code[0]!;
			const group = code[key]!;
			if (families.at(-1)?.[0] !== family)
				families.push([family, []]);
			const groups = families.at(-1)![1];
			const found = groups.find((g) => g[0] === group);
			if (found) found[1].push(swatch);
			else groups.push([group, [swatch]]);
		}
		const lightestFirst = (list: Swatch[]) =>
			list
				.map(
					(s) =>
						[
							relativeLuminance(
								s.hex,
							),
							s,
						] as const,
				)
				.sort((a, b) => b[0] - a[0])
				.map((pair) => pair[1]);
		const columns = families.flatMap(([family, groups]) => [
			{
				label: family,
				swatches: [],
				width: columnWidth * SwatchSet.familyHeading,
			},
			...groups.map(([, list]) => ({
				label: null,
				swatches: lightestFirst(list),
				width: columnWidth,
			})),
		]);
		return new SwatchSet(columns, depth, chips);
	}

	/** each category headed by its name, then one column per palette in its own order; codes are the hex digits */
	static palettes(
		palettes: Palette[],
		columnWidth: number,
		depth: number,
	): SwatchSet {
		const columns: ColumnSpec[] = [];
		let category: string | null = null;
		for (const palette of palettes) {
			if (category !== palette.category) {
				category = palette.category;
				columns.push({
					label: palette.category,
					swatches: [],
					width: columnWidth,
				});
			}
			columns.push({
				label: null,
				swatches: palette.colours.map((colour) => {
					const hex = colour.toLowerCase();
					return {
						code: hex.slice(1),
						name: palette.name,
						hex,
					};
				}),
				width: columnWidth,
			});
		}
		return new SwatchSet(columns, depth);
	}

	get total(): number {
		const last = this.columns.at(-1);
		return last ? last.start + last.width : 0;
	}

	/** most swatches in any column */
	get deepest(): number {
		return Math.max(
			0,
			...this.columns.map((c) => c.swatches.length),
		);
	}

	/** `angle` brought round into the set's first turn: the last column runs on into the first */
	wrapped(angle: number): number {
		const total = this.total;
		if (total <= 0) return angle;
		const turn = angle % total;
		return turn < 0 ? turn + total : turn;
	}

	at(index: SwatchIndex): Swatch {
		return this.columns[index.column]!.swatches[index.row]!;
	}

	/** the swatch `angle` degrees along the looping set and `along` points out from its inner edge */
	index(angle: number, along: number): SwatchIndex | null {
		const a = this.wrapped(angle);
		if (along < 0) return null;
		const column = this.columns.findIndex(
			(c) => a >= c.start && a < c.start + c.width,
		);
		if (column < 0) return null;
		const row = Math.floor(along / this.depth);
		return row < this.columns[column]!.swatches.length
			? { column, row }
			: null;
	}
}

/** a swatch's place on the disc: radii from the hub, angles round it */
export interface Cell {
	inner: number;
	outer: number;
	start: number;
	end: number;
}

export type Range = readonly [number, number];

export const RING = {
	/** the well: the current colour round the key's centre */
	well: 26,
	/** the round buttons' orbit between the well and the types */
	buttonOrbit: 72,
	buttonRadius: 15,
	buttonReach: 16,
	eyedropperAngle: 8,
	starAngle: 34,
	hexAngle: 60,
	hueWheelAngle: 86,
	typesInner: 88,
	typesOuter: 204,
	swatchesInner: 216,
	/** the quarter facing the canvas, where the types and sliders sit */
	quarter: [3, 87] as Range,
	/** where the disc's swatches start and end, pointing off the screen's corner */
	seam: -135,
	sliderArc: [0, 90] as Range,
} as const;

/** recent, document and starred colours: rows of swatches across the visible quarter */
export const SwatchRows = {
	width: 8,
	height: 54,
	step: 72,
	/** room before the first swatch for the row's heading, in degrees, and before the first row, in points */
	leading: 6,
	firstRow: 18,

	get perRow(): number {
		return Math.floor(
			(RING.quarter[1] - RING.quarter[0] - this.leading) /
				this.width,
		);
	},

	cell(row: number, column: number): Cell {
		const inner =
			RING.swatchesInner + this.firstRow + row * this.step;
		const start =
			RING.quarter[0] + this.leading + column * this.width;
		return {
			inner,
			outer: inner + this.height,
			start,
			end: start + this.width,
		};
	},

	index(
		radius: number,
		angle: number,
	): { row: number; column: number } | null {
		const along = radius - RING.swatchesInner - this.firstRow;
		const row = Math.floor(along / this.step);
		const column = Math.floor(
			(angle - RING.quarter[0] - this.leading) / this.width,
		);
		if (
			along < 0 ||
			along - row * this.step > this.height ||
			column < 0 ||
			column >= this.perRow
		)
			return null;
		return { row, column };
	},
};

export type RingTarget =
	| { kind: 'close' }
	| { kind: 'eyedropper' }
	| { kind: 'star' }
	| { kind: 'hex' }
	| { kind: 'hueWheel' }
	| { kind: 'type'; index: number }
	| { kind: 'band'; radius: number; angle: number }
	| { kind: 'nothing' };

export const HUB_BUTTONS = [
	['eyedropper', RING.eyedropperAngle],
	['star', RING.starAngle],
	['hex', RING.hexAngle],
	['hueWheel', RING.hueWheelAngle],
] as const;

export type HubButton = (typeof HUB_BUTTONS)[number][0];

/**
 * The polar frame round the colour key. Angles are degrees from the
 * horizontal into the screen (0) to straight up (90), carrying on round the
 * disc to the seam behind the hub's corner.
 */
export class RingGeometry {
	constructor(
		readonly hub: Point,
		/** the column, and so the hub, is on the left: the ring opens to the right */
		readonly mirrored: boolean,
		/** degrees the whole ring is turned by, anticlockwise on screen */
		readonly turn = 0,
	) {}

	polar(p: Point): { radius: number; angle: number } {
		const dx = (p.x - this.hub.x) * (this.mirrored ? 1 : -1);
		const dy = this.hub.y - p.y;
		let angle =
			(Math.atan2(dy, dx) * 180) / Math.PI +
			(this.mirrored ? -this.turn : this.turn);
		if (angle < RING.seam) angle += 360;
		else if (angle >= RING.seam + 360) angle -= 360;
		return { radius: Math.hypot(dx, dy), angle };
	}

	/** the angle as a canvas arc angle: radians, y down */
	radians(angle: number): number {
		return this.mirrored
			? (-(angle + this.turn) * Math.PI) / 180
			: Math.PI + ((angle - this.turn) * Math.PI) / 180;
	}

	point(radius: number, angle: number): Point {
		const t = this.radians(angle);
		return {
			x: this.hub.x + Math.cos(t) * radius,
			y: this.hub.y + Math.sin(t) * radius,
		};
	}

	target(p: Point, types: number, outer: number): RingTarget {
		const { radius: r, angle: a } = this.polar(p);
		if (r <= RING.well + 2 || r > outer + 12)
			return { kind: 'close' };
		for (const [kind, angle] of HUB_BUTTONS) {
			const centre = this.point(RING.buttonOrbit, angle);
			if (
				Math.hypot(p.x - centre.x, p.y - centre.y) <=
				RING.buttonReach
			)
				return { kind };
		}
		if (r < RING.typesInner) return { kind: 'nothing' };
		if (r <= RING.typesOuter + 8) {
			const [low, high] = RING.quarter;
			if (a < low || a > high) return { kind: 'nothing' };
			const span = (high - low) / types;
			return {
				kind: 'type',
				index: Math.min(
					types - 1,
					Math.floor((a - low) / span),
				),
			};
		}
		return { kind: 'band', radius: r, angle: a };
	}

	static sliderValue(angle: number): number {
		const [low, high] = RING.sliderArc;
		return Math.min(1, Math.max(0, (angle - low) / (high - low)));
	}

	static sliderAngle(value: number): number {
		const [low, high] = RING.sliderArc;
		return low + (high - low) * value;
	}
}
