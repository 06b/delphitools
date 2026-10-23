import { FROM_MORSE, words } from 'delphitools-v2/lib/morse';

/** One letter on the tape; an empty code is a word space. */
export interface TapeGlyph {
	code: string;
	label: string;
}

/** px per unit, fitted to the width */
export const unitRange = { min: 3, max: 12, fallback: 8 };

/** Units a code takes: a dot 1, a dash 3, a unit between. */
export function units(code: string): number {
	if (!code) return 1;
	let total = code.length - 1;
	for (const symbol of code) total += symbol === '-' ? 3 : 1;
	return total;
}

/** MorseTape.show: the glyphs, the unit each starts at, and the units in all. */
export function tapeOf(morse: string) {
	const glyphs: TapeGlyph[] = [];
	words(morse).forEach((word, index) => {
		if (index > 0) glyphs.push({ code: '', label: ' ' });
		for (const code of word)
			glyphs.push({ code, label: FROM_MORSE[code] ?? '?' });
	});
	let offset = 0;
	const starts = glyphs.map((glyph, index) => {
		// word gap: 3 + 1 + 3
		if (index > 0) offset += 3;
		const start = offset;
		offset += units(glyph.code);
		return start;
	});
	return { glyphs, starts, total: offset };
}

/** The glyph sounding at a unit of time. */
export function glyphAt(starts: number[], unit: number): number | undefined {
	let found: number | undefined;
	starts.forEach((start, index) => {
		if (start <= unit) found = index;
	});
	return found;
}

/** px per unit so the whole tape fits one row, within `unitRange`. */
export function fitUnit(total: number, width: number): number {
	if (total <= 0 || width <= 0) return unitRange.fallback;
	// an exact fit wraps after rounding
	return Math.min(
		Math.max((width - 1) / total, unitRange.min),
		unitRange.max,
	);
}

/** Each mark of a code: where it starts and how long it is, in units. */
export function marksOf(code: string) {
	let at = 0;
	return [...code].map((symbol) => {
		const length = symbol === '-' ? 3 : 1;
		const mark = { at, length };
		at += length + 1;
		return mark;
	});
}
