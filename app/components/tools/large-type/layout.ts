export type CharClass = 'digit' | 'space' | 'letter' | 'special';

export const sizes = { min: 28, max: 360, start: 112, step: 4 } as const;
export const cellPadding = 12;
export const positionHeight = 18;
/** Line height of the glyphs as a share of their size. */
export const lineHeight = 1.2;
export const padding = 16;
export const spaceGlyph = '␣';
/** Blank characters between the end of the marquee text and its next start. */
export const marqueeGap = 4;
/** Marquee characters a second at a speed of 1. */
export const marqueePace = 3;

export function charClass(ch: string): CharClass {
	if (/\p{N}/u.test(ch)) return 'digit';
	if (/\s/u.test(ch)) return 'space';
	if (/\p{L}/u.test(ch)) return 'letter';
	return 'special';
}

const isSpace = (ch: string | undefined) => ch !== undefined && /\s/u.test(ch);

export interface Size {
	width: number;
	height: number;
}

export interface Frame {
	x: number;
	y: number;
	width: number;
	height: number;
}

export function cell(size: number, widest: number, positions: boolean): Size {
	return {
		width: Math.ceil(size * widest) + cellPadding,
		height:
			Math.ceil(size * lineHeight) +
			cellPadding +
			(positions ? positionHeight : 0),
	};
}

/**
 * Cells in each row, in reading order. A word starting mid-row moves to the
 * next row when that row holds it whole.
 */
export function wrap(glyphs: string[], perRow: number): number[] {
	const rows: number[] = [];
	let index = 0;
	while (index < glyphs.length) {
		let end = Math.min(index + perRow, glyphs.length);
		if (
			end < glyphs.length &&
			!isSpace(glyphs[end]) &&
			!isSpace(glyphs[end - 1])
		) {
			let start = end - 1;
			while (start > index && !isSpace(glyphs[start - 1]))
				start -= 1;
			let stop = start;
			while (stop < glyphs.length && !isSpace(glyphs[stop]))
				stop += 1;
			if (start > index && stop - start <= perRow)
				end = start;
		}
		rows.push(end - index);
		index = end;
	}
	return rows;
}

/** Largest size in steps at which every glyph fits without scrolling; the smallest size otherwise. */
export function fit(
	glyphs: string[],
	widest: number,
	width: number,
	height: number,
	positions: boolean,
): number {
	if (!glyphs.length || width <= 0 || height <= 0) return sizes.start;
	for (let size = sizes.max; size > sizes.min; size -= sizes.step) {
		const box = cell(size, widest, positions);
		const rows = Math.floor(height / box.height);
		const perRow = Math.floor(width / box.width);
		if (
			rows > 0 &&
			perRow > 0 &&
			wrap(glyphs, perRow).length <= rows
		)
			return size;
	}
	return sizes.min;
}

/** Frames from a top and left of zero, rows centred in `width`. */
export function frames(
	glyphs: string[],
	size: number,
	widest: number,
	width: number,
	positions: boolean,
): Frame[] {
	if (!glyphs.length || width <= 0) return [];
	const box = cell(size, widest, positions);
	const perRow = Math.max(1, Math.floor(width / box.width));
	const out: Frame[] = [];
	wrap(glyphs, perRow).forEach((inRow, row) => {
		const left = (width - inRow * box.width) / 2;
		for (let slot = 0; slot < inRow; slot += 1)
			out.push({
				x: left + slot * box.width,
				y: row * box.height,
				...box,
			});
	});
	return out;
}

/** The marquee size: the height of the band, but at least three characters across. */
export function marqueeSize(
	band: Size,
	advance: number,
	size: number | undefined,
): number {
	const fitted = Math.floor(
		Math.min(band.height / lineHeight, band.width / (3 * advance)),
	);
	return Math.max(1, Math.min(size ?? fitted, fitted));
}
