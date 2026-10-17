/** The gutter mark for a `blockType` name (iOS DocConvert.Block.mark). */
export function blockMark(type: string): string {
	const heading = /^HEADING (\d)$/.exec(type);
	if (heading) return `H${heading[1]}`;
	switch (type) {
		case 'PARAGRAPH':
			return '¶';
		case 'BULLET LIST':
			return '•';
		case 'NUMBERED LIST':
			return '1.';
		case 'QUOTE':
			return '“';
		case 'CODE':
			return '{ }';
		case 'RULE':
			return '—';
		default:
			return type;
	}
}

export interface Stats {
	words: number;
	characters: number;
	lines: number;
	/** 200 words a minute, at least 1 with any words. */
	minutes: number;
}

/** TextEditorViewModel's counts. */
export function countStats(text: string): Stats {
	const trimmed = text.trim();
	const words = trimmed ? trimmed.split(/\s+/).length : 0;
	return {
		words,
		characters: [...text].length,
		lines: text ? text.split(/\r\n|\r|\n/).length : 0,
		minutes: words ? Math.max(1, Math.ceil(words / 200)) : 0,
	};
}
