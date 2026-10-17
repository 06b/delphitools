export function toUpper(text: string): string {
	return text.toUpperCase();
}

export function toLower(text: string): string {
	return text.toLowerCase();
}

export function toTitleCase(text: string): string {
	return text.replace(
		/\w\S*/g,
		(word) =>
			word.charAt(0).toUpperCase() +
			word.slice(1).toLowerCase(),
	);
}

export function toSentenceCase(text: string): string {
	return text
		.toLowerCase()
		.replace(/(^\s*\w|[.!?]\s*\w)/g, (c) => c.toUpperCase());
}

export function toCamelCase(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-zA-Z0-9]+(.)/g, (_, c: string) =>
			c.toUpperCase(),
		);
}

export function toSnakeCase(text: string): string {
	return text
		.replace(/\s+/g, '_')
		.replace(/([a-z])([A-Z])/g, '$1_$2')
		.toLowerCase()
		.replace(/[^a-z0-9_]/g, '_')
		.replace(/_+/g, '_');
}

export function toKebabCase(text: string): string {
	return text
		.replace(/\s+/g, '-')
		.replace(/([a-z])([A-Z])/g, '$1-$2')
		.toLowerCase()
		.replace(/[^a-z0-9-]/g, '-')
		.replace(/-+/g, '-');
}

export function sortLines(text: string): string {
	return text
		.split('\n')
		.sort((a, b) => a.localeCompare(b))
		.join('\n');
}

export function sortLinesReverse(text: string): string {
	return text
		.split('\n')
		.sort((a, b) => b.localeCompare(a))
		.join('\n');
}

export function sortByLength(text: string): string {
	return text
		.split('\n')
		.sort((a, b) => a.length - b.length)
		.join('\n');
}

export function reverseLines(text: string): string {
	return text.split('\n').reverse().join('\n');
}

// fisher–yates on a copy
export function shuffleLines(text: string): string {
	const lines = text.split('\n');
	for (let i = lines.length - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		const a = lines[i]!;
		const b = lines[j]!;
		lines[i] = b;
		lines[j] = a;
	}
	return lines.join('\n');
}

export function removeDuplicates(text: string): string {
	return [...new Set(text.split('\n'))].join('\n');
}

export function addLineNumbers(text: string): string {
	return text
		.split('\n')
		.map((line, i) => `${i + 1}. ${line}`)
		.join('\n');
}

export function removeLineNumbers(text: string): string {
	return text
		.split('\n')
		.map((line) => line.replace(/^\d+[.):-]\s*/, ''))
		.join('\n');
}

export function trimWhitespace(text: string): string {
	return text
		.split('\n')
		.map((line) => line.trim())
		.join('\n');
}

export function removeEmptyLines(text: string): string {
	return text
		.split('\n')
		.filter((line) => line.trim())
		.join('\n');
}

export function removeLineBreaks(text: string): string {
	return text.replace(/\n+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function removeExtraSpaces(text: string): string {
	return text.replace(/[^\S\n]+/g, ' ');
}

// long word gets own line
export function wrapAt(text: string, width: number): string {
	const lines: string[] = [];
	let current = '';
	for (const word of text.split(/\s+/)) {
		if (current.length + word.length + 1 <= width) {
			current += (current ? ' ' : '') + word;
		} else {
			if (current) lines.push(current);
			current = word;
		}
	}
	if (current) lines.push(current);
	return lines.join('\n');
}

export function encodeUrl(text: string): string {
	return encodeURIComponent(text);
}

// throws on malformed percent
export function decodeUrl(text: string): string {
	return decodeURIComponent(text);
}

// throws on bad regex
export function replaceIn(
	text: string,
	find: string,
	replacement: string,
	useRegex: boolean,
	all: boolean,
): string {
	if (useRegex) {
		return text.replace(
			new RegExp(find, all ? 'g' : ''),
			replacement,
		);
	}
	return all
		? text.split(find).join(replacement)
		: text.replace(find, replacement);
}

export const EXTRACT_PATTERNS = {
	emails: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g,
	urls: /https?:\/\/[^\s<>"{}|\\^`[\]]+/g,
	numbers: /-?\d+\.?\d*/g,
} as const;

export type ExtractKind = keyof typeof EXTRACT_PATTERNS;

// first-seen order
export function extract(text: string, kind: ExtractKind): string[] {
	return [...new Set(text.match(EXTRACT_PATTERNS[kind]) ?? [])];
}

export type Range = [start: number, end: number];

// non-empty matches; null on bad pattern; plain is case-sensitive like replace
export function findRanges(
	text: string,
	find: string,
	useRegex: boolean,
): Range[] | null {
	if (!find) return [];
	if (!useRegex) {
		const ranges: Range[] = [];
		for (
			let at = text.indexOf(find);
			at !== -1;
			at = text.indexOf(find, at + find.length)
		)
			ranges.push([at, at + find.length]);
		return ranges;
	}
	let pattern: RegExp;
	try {
		pattern = new RegExp(find, 'g');
	} catch {
		return null;
	}
	const ranges: Range[] = [];
	for (const match of text.matchAll(pattern)) {
		if (match[0])
			ranges.push([
				match.index,
				match.index + match[0].length,
			]);
	}
	return ranges;
}

export interface Piece {
	text: string;
	hit: boolean;
}

// trailing space keeps a last empty line as tall as the textarea draws it
export function pieces(text: string, ranges: Range[]): Piece[] {
	const out: Piece[] = [];
	let at = 0;
	for (const [start, end] of ranges) {
		if (start > at)
			out.push({ text: text.slice(at, start), hit: false });
		out.push({ text: text.slice(start, end), hit: true });
		at = end;
	}
	out.push({ text: `${text.slice(at)} `, hit: false });
	return out;
}
