import { clamp, formatDecimal, parseDecimal } from 'delphicanon/lib/number';

/** The presets, as LineHeightCalcViewModel.LineHeightRatio; the last is Custom. */
export const presets = [
	{ name: 'Tight', multiplier: 1.2 },
	{ name: 'Normal', multiplier: 1.5 },
	{ name: 'Relaxed', multiplier: 1.75 },
	{ name: 'Loose', multiplier: 2 },
	{ name: 'Custom', multiplier: 1.5 },
] as const;

export const customIndex = presets.length - 1;
export const normalIndex = 1;

export const sizeRange = { min: 1, max: 200 } as const;
export const ratioRange = { min: 0.8, max: 3 } as const;

/** The table, as LineHeightCalcViewModel.commonSizes. */
export const commonSizes = [
	10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48, 56, 64, 72,
];

/** The picture's settle on a new value, in ms. */
export const settleMs = 600;

/** At most four decimals, trailing zeros dropped: 0.5, 0.6875, 26.25. */
export function format(value: number): string {
	return formatDecimal(value, 4);
}

export function clampSize(size: number): number {
	return clamp(size, sizeRange.min, sizeRange.max);
}

/** A typed size, clamped, or undefined for text that is not a positive number. */
export function parseSize(text: string): number | undefined {
	const typed = parseDecimal(text);
	return typed !== undefined && typed > 0 ? clampSize(typed) : undefined;
}

/** A step button: a whole pixel up or down, clamped. */
export function steppedSize(size: number, direction: -1 | 1): number {
	return clampSize(Math.round(size + direction));
}

export function activeMultiplier(selected: number, custom: number): number {
	return selected === customIndex
		? custom
		: (presets[selected]?.multiplier ?? custom);
}

/** The preset a typed or stepped ratio matches, and Custom otherwise. */
export function presetFor(multiplier: number): number {
	const index = presets.findIndex(
		(preset, i) =>
			i !== customIndex &&
			Math.abs(preset.multiplier - multiplier) < 0.0005,
	);
	return index === -1 ? customIndex : index;
}

/** The four result lines: label and the text a tap copies. */
export function resultLines(size: number, multiplier: number) {
	const lineHeight = format(size * multiplier);
	const leading = format(size * multiplier - size);
	return [
		{ label: 'Line Height', value: `${lineHeight}px` },
		{ label: 'Leading', value: `${leading}px` },
		{ label: 'CSS', value: `line-height: ${format(multiplier)};` },
		{ label: 'SwiftUI', value: `.lineSpacing(${leading})` },
	];
}

/** The presets other than Custom and the active multiplier, drawn beside the lit paragraph. */
export function comparisons(multiplier: number) {
	return presets
		.filter(
			(preset, i) =>
				i !== customIndex &&
				preset.multiplier !== multiplier,
		)
		.map((preset) => ({
			label: `×${format(preset.multiplier)}`,
			ratio: preset.multiplier,
		}));
}

/** Shrinks the picture so two line boxes fit in `room` px. */
export function pictureScale(lineHeight: number, room: number): number {
	return Math.min(1, room / (2 * lineHeight));
}

/** The picture's damped spring with one overshoot, 0 to 1. */
export function settleEased(progress: number): number {
	return progress >= 1
		? 1
		: 1 - Math.exp(-7 * progress) * Math.cos(9 * progress);
}

// ponytail: estimate at 0.4 em a character; under about 3 px the paragraph ends before the bottom
/** Copies of the pangram that fill a 560 by 220 px column at `size`. */
export function pangramRepeats(size: number, textLength: number): number {
	const characters = (220 / (0.8 * size)) * (560 / (0.4 * size));
	return clamp(Math.ceil(characters / textLength) + 1, 2, 400);
}
