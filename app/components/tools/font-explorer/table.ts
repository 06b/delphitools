import {
	categoryForCode,
	isVisible,
} from 'delphitools-v2/components/tools/glyph-browser/glyphs';

export const hex = (code: number) =>
	code.toString(16).toUpperCase().padStart(4, '0');

/** Code points in the cmap ranges that draw something, sorted, once each. */
export function coveredCodes(ranges: [number, number][]): number[] {
	const codes = new Set<number>();
	for (const [start, end] of ranges)
		for (let code = start; code <= Math.min(end, 0x10ffff); code++)
			if (isVisible(code)) codes.add(code);
	return [...codes].sort((a, b) => a - b);
}

// ponytail: the app has no Unicode block list; glyph-browser's categories, else the 256-code page
export function blockName(code: number): string {
	const page = code - (code % 256);
	return categoryForCode(code) ?? `U+${hex(page)}–${hex(page + 255)}`;
}

export interface TableItem {
	key: string;
	top: number;
	height: number;
	/** A section heading; rows have none. */
	name?: string;
	codes: number[];
}

/** Headings and rows of `columns` cells, one section per block, stacked from zero. */
export function tableLayout(
	codes: number[],
	columns: number,
	rowHeight: number,
	headHeight: number,
): { items: TableItem[]; height: number } {
	const items: TableItem[] = [];
	let top = 0;
	let index = 0;
	while (index < codes.length) {
		const name = blockName(codes[index]!);
		let end = index;
		while (end < codes.length && blockName(codes[end]!) === name)
			end += 1;
		const section = codes.slice(index, end);
		items.push({
			key: `h${index}`,
			top,
			height: headHeight,
			// a page heading names the code points it holds
			name: name.startsWith('U+')
				? `U+${hex(section[0]!)}–${hex(section.at(-1)!)}`
				: name,
			codes: section,
		});
		top += headHeight;
		for (let at = 0; at < section.length; at += columns) {
			items.push({
				key: `r${index + at}`,
				top,
				height: rowHeight,
				codes: section.slice(at, at + columns),
			});
			top += rowHeight;
		}
		index = end;
	}
	return { items, height: top };
}

/** The items that overlap `from` to `to`; `items` are in top order. */
export function inView(
	items: TableItem[],
	from: number,
	to: number,
): TableItem[] {
	let low = 0;
	let high = items.length;
	while (low < high) {
		const mid = (low + high) >> 1;
		const item = items[mid]!;
		if (item.top + item.height <= from) low = mid + 1;
		else high = mid;
	}
	const shown: TableItem[] = [];
	for (let i = low; i < items.length && items[i]!.top < to; i++)
		shown.push(items[i]!);
	return shown;
}
