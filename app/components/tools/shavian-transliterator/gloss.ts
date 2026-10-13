import {
	getAlternatives,
	type Alternative,
} from 'delphitools-v2/lib/shavian/alternatives';
import type { ShavianLetter } from 'delphitools-v2/lib/shavian/phoneme-map';
import {
	markerPrefix,
	type GlossToken,
	type GlossWord,
} from 'delphitools-v2/lib/shavian/transliterate';

export type Marker = GlossWord['marker'];

/** The marker segments, in order; the names are untranslated terms of art. */
export const markers: { marker: Marker; label: string }[] = [
	{ marker: 'none', label: 'None' },
	{ marker: 'namer', label: '· Namer' },
	{ marker: 'acroring', label: '⸰ Acroring' },
	{ marker: 'acroarc', label: '꤮ Acroarc' },
];

export const isGuess = (word: GlossWord) =>
	word.source === 'heuristic' && !word.userEdited;

function respelled(word: GlossWord, edited = true): GlossWord {
	return {
		...word,
		shavian:
			markerPrefix(word.marker) +
			word.phonemes.map((p) => p.shavian).join(''),
		ipa: word.phonemes.map((p) => p.ipa).join(''),
		userEdited: word.userEdited || edited,
	};
}

/** The tokens with the word at `index` replaced by `edit` of it. */
export function editWord(
	tokens: GlossToken[],
	index: number,
	edit: (word: GlossWord) => GlossWord | undefined,
): GlossToken[] {
	const gloss = tokens[index]?.gloss;
	const next = gloss && edit(gloss);
	if (!next) return tokens;
	return tokens.map((token, i) =>
		i === index ? { ...token, gloss: next } : token,
	);
}

export const withMarker = (word: GlossWord, marker: Marker) =>
	word.marker === marker
		? undefined
		: respelled({ ...word, marker }, false);

export function swapping(
	word: GlossWord,
	at: number,
	alternative: Alternative,
): GlossWord | undefined {
	if (!word.phonemes[at]) return undefined;
	const phonemes = [...word.phonemes];
	phonemes[at] = {
		shavian: alternative.shavian,
		ipa: alternative.ipa,
		alternatives: getAlternatives(alternative.shavian),
	};
	return respelled({ ...word, phonemes });
}

export function inserting(
	word: GlossWord,
	at: number,
	letter: ShavianLetter,
): GlossWord {
	const phonemes = [...word.phonemes];
	phonemes.splice(Math.min(Math.max(0, at), phonemes.length), 0, {
		shavian: letter.shavian,
		ipa: letter.ipa,
		alternatives: getAlternatives(letter.shavian),
	});
	return respelled({ ...word, phonemes });
}

/** Nothing for the sole letter of a word. */
export function removing(word: GlossWord, at: number): GlossWord | undefined {
	if (word.phonemes.length < 2 || !word.phonemes[at]) return undefined;
	return respelled({
		...word,
		phonemes: word.phonemes.filter((_, i) => i !== at),
	});
}

/**
 * iOS ShavianEngine.carryEdits: after the text changes, the words that still
 * match at the start and at the end keep their letter edits and markers.
 */
export function carryEdits(
	old: GlossToken[],
	next: GlossToken[],
): GlossToken[] {
	const before = old.flatMap((t) => (t.gloss ? [t.gloss] : []));
	const slots = next.flatMap((t, i) => (t.gloss ? [i] : []));
	const out = [...next];
	const latin = (slot: number) => next[slot]!.gloss!.latin;
	const carry = (gloss: GlossWord, slot: number) => {
		if (gloss.userEdited || gloss.marker !== 'none')
			out[slot] = { ...next[slot]!, gloss };
	};
	const shared = Math.min(before.length, slots.length);
	let prefix = 0;
	while (
		prefix < shared &&
		before[prefix]!.latin === latin(slots[prefix]!)
	) {
		carry(before[prefix]!, slots[prefix]!);
		prefix += 1;
	}
	let suffix = 0;
	while (
		suffix < shared - prefix &&
		before[before.length - 1 - suffix]!.latin ===
			latin(slots[slots.length - 1 - suffix]!)
	) {
		carry(
			before[before.length - 1 - suffix]!,
			slots[slots.length - 1 - suffix]!,
		);
		suffix += 1;
	}
	return out;
}

const dash = '—';

/** The count tiles under the output. */
export function tilesOf(tokens: GlossToken[]) {
	const words = tokens.flatMap((t) => (t.gloss ? [t.gloss] : []));
	const shown = (n: number) => (words.length ? n.toLocaleString() : dash);
	const guessed = words.filter(isGuess).length;
	const latin = words.reduce(
		(sum, w) => sum + (w.latin.match(/\p{L}/gu)?.length ?? 0),
		0,
	);
	const shavian = words.reduce((sum, w) => sum + w.phonemes.length, 0);
	return [
		{ label: 'Words', value: shown(words.length) },
		{ label: 'Dictionary', value: shown(words.length - guessed) },
		{ label: 'Guessed', value: shown(guessed) },
		{
			label: 'Letters',
			value: words.length
				? `${latin.toLocaleString()} → ${shavian.toLocaleString()}`
				: dash,
		},
	];
}

export interface Piece {
	kind: 'word' | 'punctuation' | 'whitespace';
	text: string;
	/** Token index of a word. */
	index: number;
	marker: string;
	shavian: string;
	guess: boolean;
}

/** The editor's runs: every character of `text`, each word with its Shavian. */
export function piecesOf(text: string, tokens: GlossToken[]): Piece[] {
	const plain = (): Piece[] =>
		text
			? [
					{
						kind: 'whitespace',
						text,
						index: -1,
						marker: '',
						shavian: '',
						guess: false,
					},
				]
			: [];
	// tokens of an older text would gloss the wrong words
	if (tokens.map((t) => t.value).join('') !== text) return plain();
	return tokens.map((token, index) => {
		const { gloss } = token;
		return {
			kind: token.type,
			text: token.value,
			index,
			marker: gloss ? markerPrefix(gloss.marker) : '',
			shavian: gloss
				? gloss.phonemes.map((p) => p.shavian).join('')
				: token.type === 'punctuation'
					? token.value
					: '',
			guess: gloss ? isGuess(gloss) : false,
		};
	});
}
