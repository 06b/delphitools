/** What CipherPicture draws: the caption, and the symbols of the input over what they become. */
import type { GlyphKind } from 'delphicanon/lib/glyph-rows';
import {
	BACON,
	BACON_REVERSE,
	CIPHER_OPTIONS,
	MORSE,
	MORSE_REVERSE,
	type CipherId,
	type ManualParams,
} from 'delphitools-v2/components/tools/decoder/engine';

export const cipherLabel = (cipher: CipherId) =>
	CIPHER_OPTIONS.find((option) => option.value === cipher)?.label ?? '';

export function caption(cipher: CipherId, params: ManualParams) {
	switch (cipher) {
		case 'caesar':
			return {
				name: `Caesar (shift ${params.caesarShift})`,
				detail: '',
			};
		case 'vigenere':
			return {
				name: cipherLabel(cipher),
				detail: params.vigenereKey
					? `key: ${params.vigenereKey.toUpperCase()}`
					: '',
			};
		case 'affine':
			return {
				name: cipherLabel(cipher),
				detail: `a=${params.affineA}, b=${params.affineB}`,
			};
		case 'rail-fence':
			return {
				name: cipherLabel(cipher),
				detail: `${params.rails} rails`,
			};
		default:
			return { name: cipherLabel(cipher), detail: '' };
	}
}

export type FaceKind = 'text' | 'morse' | 'bacon';

export interface Face {
	kind: FaceKind;
	value: string;
}

export interface Pair {
	top: Face;
	bottom: Face;
	/** The Vigenère key letter that did the change. */
	key?: string;
	changes: boolean;
	kind: GlyphKind;
}

const text = (value: string): Face => ({ kind: 'text', value });

const space: Pair = {
	top: text(' '),
	bottom: text(' '),
	changes: true,
	kind: 'space',
};
const newline: Pair = {
	top: text(''),
	bottom: text(''),
	changes: true,
	kind: 'newline',
};

function blank(character: string): Pair | undefined {
	if (character === '\n' || character === '\r') return newline;
	if (/\s/.test(character)) return space;
	return undefined;
}

const passes = (character: string): Pair => ({
	top: text(character),
	bottom: text(''),
	changes: false,
	kind: 'glyph',
});

/** MorseEngine.words: words of codes; a slash or a run of `minimumGap` spaces ends a word. */
export function morseWords(morse: string, minimumGap = 3): string[][] {
	let marked = '';
	let run = 0;
	for (const character of morse.trim()) {
		if (/\s/.test(character)) {
			run += 1;
			continue;
		}
		if (run > 0) marked += run >= minimumGap ? '/' : ' ';
		run = 0;
		if (character === '·' || character === '•') marked += '.';
		else if (
			character === '–' ||
			character === '—' ||
			character === '_'
		)
			marked += '-';
		else marked += character;
	}
	return marked
		.split('/')
		.map((word) => word.split(' ').filter(Boolean))
		.filter((word) => word.length > 0);
}

function spaced(words: Pair[][]): Pair[] {
	return words.flatMap((word, index) =>
		index > 0 ? [space, ...word] : word,
	);
}

const isLetter = (character: string) => /^[A-Za-z]$/.test(character);

export function pairs(
	cipher: CipherId,
	encode: boolean,
	params: ManualParams,
	input: string,
	output: string,
): Pair[] {
	const each = (face: (upper: string) => Face | undefined) =>
		Array.from(input, (character) => {
			const gap = blank(character);
			if (gap) return gap;
			const bottom = face(character.toUpperCase());
			return bottom
				? {
						top: text(character),
						bottom,
						changes: true,
						kind: 'glyph' as const,
					}
				: passes(character);
		});

	switch (cipher) {
		case 'morse':
			if (encode)
				return each((upper) =>
					MORSE[upper]
						? {
								kind: 'morse',
								value: MORSE[
									upper
								],
							}
						: undefined,
				);
			return spaced(
				morseWords(input, 2).map((word) =>
					word.map((code) => ({
						top: {
							kind: 'morse',
							value: code,
						},
						bottom: text(
							MORSE_REVERSE[code] ??
								'?',
						),
						changes: true,
						kind: 'glyph',
					})),
				),
			);
		case 'a1z26':
			if (encode)
				return each((upper) =>
					isLetter(upper)
						? text(
								String(
									upper.charCodeAt(
										0,
									) - 64,
								),
							)
						: undefined,
				);
			return spaced(
				morseWords(input, 2).map((word) =>
					word
						.flatMap((piece) =>
							piece.split(/[-,]/),
						)
						.filter(Boolean)
						.map((piece) => {
							const value =
								Number.parseInt(
									/^\d*/.exec(
										piece,
									)![0] ||
										'0',
									10,
								);
							return {
								top: text(
									piece,
								),
								bottom: text(
									value >=
										1 &&
										value <=
											26
										? String.fromCharCode(
												64 +
													value,
											)
										: '?',
								),
								changes: true,
								kind: 'glyph',
							};
						}),
				),
			);
		case 'bacon': {
			if (encode)
				return each((upper) =>
					BACON[upper]
						? {
								kind: 'bacon',
								value: BACON[
									upper
								],
							}
						: undefined,
				);
			const letters = input
				.toUpperCase()
				.replace(/[^AB]/g, '');
			const out: Pair[] = [];
			for (let i = 0; i + 5 <= letters.length; i += 5) {
				const code = letters.slice(i, i + 5);
				out.push({
					top: { kind: 'bacon', value: code },
					bottom: text(
						BACON_REVERSE[code] ?? '?',
					),
					changes: true,
					kind: 'glyph',
				});
			}
			return out;
		}
		default: {
			// scalars map one to one
			const from = Array.from(input);
			const to = Array.from(output);
			if (from.length !== to.length) return [];
			const key = Array.from(
				params.vigenereKey
					.toUpperCase()
					.replace(/[^A-Z]/g, ''),
			);
			let keyIndex = 0;
			return from.map((source, index) => {
				const gap = blank(source);
				if (gap) return gap;
				const result = to[index]!;
				let letter: string | undefined;
				if (
					cipher === 'vigenere' &&
					key.length &&
					isLetter(source)
				) {
					letter = key[keyIndex % key.length];
					keyIndex += 1;
				}
				return {
					top: text(source),
					bottom: text(result),
					key: letter,
					changes: source !== result,
					kind: 'glyph',
				};
			});
		}
	}
}

/** Rail of each character, as the engine lays them. */
export function railPattern(count: number, rails: number): number[] {
	const effective = Math.max(2, Math.min(rails, Math.max(count, 2)));
	const out: number[] = [];
	let rail = 0;
	let step = 1;
	for (let i = 0; i < count; i++) {
		out.push(rail);
		if (rail === 0) step = 1;
		else if (rail === effective - 1) step = -1;
		rail += step;
	}
	return out;
}

export type Picture = 'pairs' | 'bits' | 'fence';

export function pictureOf(cipher: CipherId): Picture {
	if (cipher === 'rail-fence') return 'fence';
	if (
		cipher === 'base64' ||
		cipher === 'base32' ||
		cipher === 'hex' ||
		cipher === 'binary'
	)
		return 'bits';
	return 'pairs';
}
