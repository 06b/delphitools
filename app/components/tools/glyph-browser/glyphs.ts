export interface GlyphCategory {
	name: string;
	ranges: [number, number][];
}

export const CATEGORIES: GlyphCategory[] = [
	{ name: 'Latin Basic', ranges: [[0x0020, 0x007f]] },
	{
		name: 'Latin Extended',
		ranges: [
			[0x0080, 0x00ff],
			[0x0100, 0x017f],
		],
	},
	{ name: 'Greek', ranges: [[0x0370, 0x03ff]] },
	{ name: 'Cyrillic', ranges: [[0x0400, 0x04ff]] },
	{ name: 'Punctuation', ranges: [[0x2000, 0x206f]] },
	{ name: 'Currency', ranges: [[0x20a0, 0x20cf]] },
	{ name: 'Arrows', ranges: [[0x2190, 0x21ff]] },
	{ name: 'Math Operators', ranges: [[0x2200, 0x22ff]] },
	{ name: 'Box Drawing', ranges: [[0x2500, 0x257f]] },
	{ name: 'Geometric Shapes', ranges: [[0x25a0, 0x25ff]] },
	{ name: 'Symbols', ranges: [[0x2600, 0x26ff]] },
	{ name: 'Dingbats', ranges: [[0x2700, 0x27bf]] },
	{
		name: 'Emoji',
		ranges: [
			[0x1f300, 0x1f5ff],
			[0x1f600, 0x1f64f],
			[0x1f680, 0x1f6ff],
		],
	},
];

export type GlyphFormat = 'char' | 'html' | 'css' | 'js';

export function codesForCategory(name: string): number[] {
	const category = CATEGORIES.find((c) => c.name === name);
	if (!category) return [];

	const codes: number[] = [];
	for (const [start, end] of category.ranges) {
		for (let code = start; code <= end; code++) codes.push(code);
	}
	return codes;
}

export function filterCodes(codes: number[], search: string): number[] {
	if (!search) return codes;
	const lower = search.toLowerCase();
	return codes.filter((code) => {
		const hex = code.toString(16).toLowerCase();
		return (
			String.fromCodePoint(code) === search ||
			hex.includes(lower) ||
			`u+${hex}`.includes(lower)
		);
	});
}

export function codeLabel(code: number): string {
	return `U+${code.toString(16).toUpperCase().padStart(4, '0')}`;
}

export function codeText(code: number, format: GlyphFormat): string {
	const hex = code.toString(16);
	switch (format) {
		case 'char':
			return String.fromCodePoint(code);
		case 'html':
			return `&#x${hex};`;
		case 'css':
			return `\\${hex}`;
		case 'js':
			// astral escapes need braces
			return code <= 0xffff
				? `\\u${hex.padStart(4, '0')}`
				: `\\u{${hex}}`;
	}
}

export function categoryForCode(code: number): string | null {
	for (const category of CATEGORIES) {
		for (const [start, end] of category.ranges) {
			if (code >= start && code <= end) return category.name;
		}
	}
	return null;
}

export function describeGlyph(
	input: string,
): { char: string; label: string; category: string } | null {
	const trimmed = input.trim();
	let code: number | null = null;

	const hexMatch = /^U\+([0-9A-Fa-f]+)$/i.exec(trimmed);
	if (hexMatch) {
		code = parseInt(hexMatch[1]!, 16);
	} else if ([...trimmed].length === 1) {
		code = trimmed.codePointAt(0) ?? null;
	}

	if (code === null || Number.isNaN(code)) return null;
	try {
		const char = String.fromCodePoint(code);
		const category = categoryForCode(code);
		return {
			char,
			label: codeLabel(code),
			category: category ?? 'Unknown block',
		};
	} catch {
		return null;
	}
}

/** Controls and unassigned code points have nothing to draw; the chart leaves their cells blank. */
export function isVisible(code: number): boolean {
	return !/[\p{Cc}\p{Cn}\p{Cs}]/u.test(String.fromCodePoint(code));
}

export function utf8(code: number): string {
	return [...new TextEncoder().encode(String.fromCodePoint(code))]
		.map((byte) => byte.toString(16).toUpperCase().padStart(2, '0'))
		.join(' ');
}

/** The card's copyable lines, the web formats with the iOS decimal and UTF-8. */
export function valueLines(code: number): { label: string; value: string }[] {
	return [
		{ label: 'Character', value: codeText(code, 'char') },
		{ label: 'Decimal', value: String(code) },
		{ label: 'UTF-8', value: utf8(code) },
		{ label: 'HTML', value: codeText(code, 'html') },
		{ label: 'CSS', value: codeText(code, 'css') },
		{ label: 'JS', value: codeText(code, 'js') },
	];
}

export interface ChartRow {
	start: number;
	/** One per column; undefined for a blank cell. */
	cells: (number | undefined)[];
}

export interface ChartSection {
	name: string;
	count: number;
	rows: ChartRow[];
}

/**
 * The categories as code chart rows of `columns` cells, aligned to
 * multiples of `columns`, with the cells the search does not match left
 * blank and empty rows and sections dropped. A search that names a
 * category keeps it whole.
 */
export function chart(columns: number, search: string): ChartSection[] {
	const query = search.trim();
	const lower = query.toLowerCase();
	return CATEGORIES.flatMap((category) => {
		const whole =
			!!lower && category.name.toLowerCase().includes(lower);
		const shown = new Set(
			filterCodes(
				codesForCategory(category.name),
				whole ? '' : query,
			).filter(isVisible),
		);
		if (!shown.size) return [];
		const rows: ChartRow[] = [];
		for (const [from, to] of category.ranges) {
			const first = Math.floor(from / columns) * columns;
			for (let start = first; start <= to; start += columns) {
				const cells = Array.from(
					{ length: columns },
					(_, i) =>
						shown.has(start + i)
							? start + i
							: undefined,
				);
				if (cells.some((cell) => cell !== undefined))
					rows.push({ start, cells });
			}
		}
		return [{ name: category.name, count: shown.size, rows }];
	});
}
