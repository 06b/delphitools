import { formatDecimal } from 'delphicanon/lib/number';

export type Unit =
	'px' | 'pt' | 'pc' | 'ag' | 'cc' | 'in' | 'mm' | 'cm' | 'em' | 'rem';

export interface UnitInfo {
	name: string;
	description: string;
	toPx: (value: number, basePx: number, ppi?: number) => number;
	fromPx: (px: number, basePx: number, ppi?: number) => number;
}

/** CSS fixes 96 px per inch; the Resolution row changes it. */
export const CSS_PPI = 96;
const PT_PER_INCH = 72;
const PT_PER_PICA = 12;
const AGATES_PER_INCH = 14;
const MM_PER_INCH = 25.4;
const MM_PER_CICERO = 4.512;

export const UNITS: Record<Unit, UnitInfo> = {
	px: {
		name: 'Pixels',
		description: 'Screen pixels (96 per inch)',
		toPx: (v) => v,
		fromPx: (px) => px,
	},
	pt: {
		name: 'Points',
		description: 'Print points (72 per inch)',
		toPx: (v, _, ppi = CSS_PPI) => v * (ppi / PT_PER_INCH),
		fromPx: (px, _, ppi = CSS_PPI) => px * (PT_PER_INCH / ppi),
	},
	pc: {
		name: 'Picas',
		description: '12 points per pica',
		toPx: (v, _, ppi = CSS_PPI) =>
			v * PT_PER_PICA * (ppi / PT_PER_INCH),
		fromPx: (px, _, ppi = CSS_PPI) =>
			(px / PT_PER_PICA) * (PT_PER_INCH / ppi),
	},
	ag: {
		name: 'Agates',
		description: '14 agates per inch (US newspapers)',
		toPx: (v, _, ppi = CSS_PPI) => v * (ppi / AGATES_PER_INCH),
		fromPx: (px, _, ppi = CSS_PPI) => px * (AGATES_PER_INCH / ppi),
	},
	cc: {
		name: 'Ciceros',
		description: 'European unit (≈4.512mm)',
		toPx: (v, _, ppi = CSS_PPI) =>
			v * MM_PER_CICERO * (ppi / MM_PER_INCH),
		fromPx: (px, _, ppi = CSS_PPI) =>
			px / (MM_PER_CICERO * (ppi / MM_PER_INCH)),
	},
	in: {
		name: 'Inches',
		description: 'Imperial inch',
		toPx: (v, _, ppi = CSS_PPI) => v * ppi,
		fromPx: (px, _, ppi = CSS_PPI) => px / ppi,
	},
	mm: {
		name: 'Millimetres',
		description: 'Metric millimetre',
		toPx: (v, _, ppi = CSS_PPI) => v * (ppi / MM_PER_INCH),
		fromPx: (px, _, ppi = CSS_PPI) => px * (MM_PER_INCH / ppi),
	},
	cm: {
		name: 'Centimetres',
		description: 'Metric centimetre',
		toPx: (v, _, ppi = CSS_PPI) => v * (ppi / (MM_PER_INCH / 10)),
		fromPx: (px, _, ppi = CSS_PPI) => px * (MM_PER_INCH / 10 / ppi),
	},
	em: {
		name: 'Em',
		description: 'Relative to parent font-size',
		toPx: (v, basePx) => v * basePx,
		fromPx: (px, basePx) => px / basePx,
	},
	rem: {
		name: 'Rem',
		description: 'Relative to root font-size',
		toPx: (v, basePx) => v * basePx,
		fromPx: (px, basePx) => px / basePx,
	},
};

export const UNIT_ORDER = Object.keys(UNITS) as Unit[];

export function isUnit(text: string | null): text is Unit {
	return text !== null && text in UNITS;
}

/** More places for small values so they round-trip, trailing zeros dropped: 16, 0.166667, 1234.57. */
export function formatValue(value: number): string {
	const magnitude = Math.abs(value);
	if (magnitude < 0.001) return '0';
	const places =
		magnitude >= 1000
			? 2
			: magnitude >= 100
				? 3
				: magnitude >= 10
					? 4
					: magnitude >= 1
						? 5
						: 6;
	return formatDecimal(value, places);
}

/** A step a typesetter would take in each unit. */
export function step(unit: Unit): number {
	switch (unit) {
		case 'px':
		case 'pt':
		case 'ag':
		case 'mm':
			return 1;
		case 'pc':
		case 'cc':
			return 0.5;
		case 'cm':
			return 0.1;
		default:
			return 0.125;
	}
}

/** One step up or down from `value`, landing on the step grid, never below 0. */
export function nudged(
	value: number | undefined,
	unit: Unit,
	direction: -1 | 1,
): number {
	const size = step(unit);
	const next = (Math.round((value ?? 0) / size) + direction) * size;
	// the grain of the step, so 0.1 steps do not drift
	return Math.max(0, Number(next.toFixed(3)));
}

/** Smallest of 1, 2, 5 times a power of ten that is at least `minimum`. */
export function niceStep(minimum: number): number {
	if (!(minimum > 0) || !Number.isFinite(minimum)) return 1;
	const power = 10 ** Math.floor(Math.log10(minimum));
	for (const mantissa of [1, 2, 5, 10])
		if (mantissa * power >= minimum * (1 - 1e-9))
			return mantissa * power;
	return 10 * power;
}

/** Minor ticks per major: fifths of 1 and 5, quarters of 2. */
export function subdivisions(major: number): number {
	const mantissa = Math.round(
		major / 10 ** Math.floor(Math.log10(major)),
	);
	return mantissa === 2 ? 4 : 5;
}

/** Gauge length in px: the value sits between 36 % and 90 % of it. */
export function span(px: number): number {
	return niceStep(Math.max(px, 1) / 0.9);
}
