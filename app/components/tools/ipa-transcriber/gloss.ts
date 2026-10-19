import {
	covering,
	type GlossPiece,
	type Sound,
} from 'delphitools-v2/components/tools/text-tool/gloss-pieces';
import { carryEdits as carry } from 'delphitools-v2/lib/carry-edits';
import { wordOf, type IpaToken, type IpaWord } from 'delphitools-v2/lib/ipa';
import { getAlternatives } from 'delphitools-v2/lib/shavian/alternatives';
import { SHAVIAN_LETTERS } from 'delphitools-v2/lib/shavian/phoneme-map';

const stressMarks = new Set(['ˈ', 'ˌ']);

/** The IPA in runs, each stress mark a run of its own. */
export function stressRuns(ipa: string) {
	const runs: { text: string; stress: boolean }[] = [];
	for (const char of ipa) {
		const stress = stressMarks.has(char);
		const last = runs.at(-1);
		if (last && !stress && !last.stress) last.text += char;
		else runs.push({ text: char, stress });
	}
	return runs;
}

export const isGuess = (word: IpaWord) => word.guess && !word.edited;

/** The editor's runs: every character of `text`, each word with its IPA. */
export function piecesOf(text: string, tokens: IpaToken[]): GlossPiece[] {
	const pieces = tokens.flatMap((token, index): GlossPiece[] => {
		if (token.type === 'word')
			return [
				{
					kind: 'word',
					text: token.value,
					index,
					marker: '',
					gloss: token.ipa,
					guess: isGuess(token),
				},
			];
		return token.value
			.split(/(\s+)/)
			.filter(Boolean)
			.map((part) => {
				const space = /^\s/.test(part);
				return {
					kind: space
						? 'whitespace'
						: 'punctuation',
					text: part,
					index,
					marker: '',
					gloss: space ? '' : part,
					guess: false,
				};
			});
	});
	return covering(text, pieces);
}

/** The words still in place keep their edits. */
export const carryEdits = (old: IpaToken[], next: IpaToken[]) =>
	carry(
		old,
		next,
		(t) => (t.type === 'word' ? t.value : undefined),
		(t) => t.type === 'word' && !!t.edited,
	);

// named by its Shavian keyword, a term of art
const letterSound = (letter: { ipa: string; name: string }): Sound => ({
	glyph: letter.ipa,
	name: letter.name,
	ipa: letter.ipa,
});

const of = (category: 'consonant' | 'vowel') =>
	SHAVIAN_LETTERS.filter((l) => l.category === category);
const stresses: Sound[] = [
	{ glyph: 'ˈ', name: 'Primary stress', ipa: 'ˈ' },
	{ glyph: 'ˌ', name: 'Secondary stress', ipa: 'ˌ' },
];
const vowels = of('vowel').map(letterSound);

/** What Insert offers: the consonants, the vowels, the stress marks. */
export const alphabet: (Sound | null)[] = [
	...of('consonant').map(letterSound),
	null,
	...vowels,
	null,
	...stresses,
];

/** A symbol of a word, named by its Shavian keyword where it has one. */
export function soundOf(symbol: string): Sound {
	const known = [...stresses, ...vowels].find((s) => s.glyph === symbol);
	if (known) return known;
	const letter = SHAVIAN_LETTERS.find((l) => l.ipa === symbol);
	return letter
		? letterSound(letter)
		: { glyph: symbol, name: '', ipa: symbol };
}

/** The other stress mark; the Shavian pairs for a consonant; every other vowel. */
export function alternativesOf(symbol: string): Sound[] {
	const stress = stresses.find((s) => s.glyph === symbol);
	if (stress) return stresses.filter((s) => s !== stress);
	const letter = SHAVIAN_LETTERS.find((l) => l.ipa === symbol);
	if (letter?.category === 'consonant')
		return getAlternatives(letter.shavian).map(letterSound);
	if (letter || /[aeiouæɑɒɔəɚɛɜɪʊʌ]/.test(symbol))
		return vowels.filter((v) => v.glyph !== symbol);
	return [];
}

const respelled = (word: IpaWord, symbols: string[]): IpaWord => ({
	...wordOf(word.value, symbols, word.guess),
	edited: true,
});

export const swapping = (word: IpaWord, at: number, symbol: string) =>
	respelled(
		word,
		word.symbols.map((s, i) => (i === at ? symbol : s)),
	);

export const inserting = (word: IpaWord, at: number, symbol: string) =>
	respelled(word, word.symbols.toSpliced(at, 0, symbol));

/** Nothing for the sole symbol of a word. */
export const removing = (word: IpaWord, at: number) =>
	word.symbols.length < 2
		? undefined
		: respelled(word, word.symbols.toSpliced(at, 1));
