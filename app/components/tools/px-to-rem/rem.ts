import { formatDecimal, parseDecimal } from 'delphicanon/lib/number';

/** The quick reference, as PxToRemViewModel.commonPxValues. */
export const commonPx = [
	8, 10, 11, 12, 13, 14, 15, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64,
	72, 80, 96,
];

export const baseRange = { min: 1, max: 48, start: 16 } as const;

/** The specimen's settle on a new value, in ms. */
export const settleMs = 600;

/** A typed number; a decimal comma counts, and a trailing unit of the input side is dropped. */
export function parse(text: string, unit: 'px' | 'rem'): number | undefined {
	return parseDecimal(
		text.replace(new RegExp(`\\s*${unit}\\s*$`, 'i'), ''),
	);
}

/** At most four decimals, trailing zeros dropped: 0.5, 0.6875, 26.25. */
export function format(value: number): string {
	return formatDecimal(value, 4);
}

/** The converted value, or undefined for a missing or negative input. */
export function convert(
	value: number | undefined,
	base: number,
	remToPixel: boolean,
): number | undefined {
	if (value === undefined || value < 0) return undefined;
	return remToPixel ? value * base : value / base;
}

/** One grid line per rem, but never closer than 4 px. */
export function lineSpacing(base: number): number {
	return base * Math.ceil(4 / base);
}

/** The specimen's damped spring with one overshoot, 0 to 1. */
export function settleEased(progress: number): number {
	return progress >= 1
		? 1
		: 1 - Math.exp(-7 * progress) * Math.cos(9 * progress);
}

/** A step of the main value: 1 px, or a quarter rem. */
export function nudged(
	value: number | undefined,
	direction: -1 | 1,
	remToPixel: boolean,
): string {
	const step = remToPixel ? 0.25 : 1;
	return format(Math.max(0, (value ?? 0) + direction * step));
}
