/** One run of the gloss editor's text: a word with its gloss set over it, or what lies between. */
export interface GlossPiece {
	kind: 'word' | 'punctuation' | 'whitespace';
	text: string;
	/** Token index of a word. */
	index: number;
	/** Set before the gloss in the primary colour. */
	marker: string;
	/** Set over the text; a punctuation mark may repeat itself here. */
	gloss: string;
	guess: boolean;
}

/** The pieces when they spell `text` exactly; else the text as one plain run. */
export function covering(text: string, pieces: GlossPiece[]): GlossPiece[] {
	if (pieces.map((p) => p.text).join('') === text) return pieces;
	return text
		? [
				{
					kind: 'whitespace',
					text,
					index: -1,
					marker: '',
					gloss: '',
					guess: false,
				},
			]
		: [];
}

/** One letter or symbol of a glossed word: as written, its name, its sound. */
export interface Sound {
	glyph: string;
	name: string;
	ipa: string;
}
