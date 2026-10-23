import { arpabetToIpa } from './shavian/phoneme-map';
import { heuristicTransliterate } from './shavian/heuristic';

/** lowercase word → arpabet phones */
export type Lookup = (word: string) => string[] | undefined;

export interface IpaWord {
	type: 'word';
	value: string;
	/** The symbols, each phone or stress mark one entry; `ipa` joins them. */
	symbols: string[];
	ipa: string;
	guess: boolean;
	/** Changed by hand; never a guess then. */
	edited?: boolean;
}

export type IpaToken = IpaWord | { type: 'other'; value: string };

const STRESS: Record<string, string> = { 1: 'ˈ', 2: 'ˌ' };
const TOKEN = /[a-zA-Z']+|[^a-zA-Z']+/g;

const isVowel = (phone: string) => /\d$/.test(phone);

// ponytail: maximal onset, every consonant since the previous vowel goes with
// the stressed syllable, so "abstain" gives əˈbsteɪn for əbˈsteɪn; proper
// syllabification (sonority sequencing) is the upgrade.
function wordToIpa(phones: string[]): string[] {
	const polysyllabic = phones.filter(isVowel).length > 1;
	// cmu compound stress quirk
	const lastPrimary = phones.findLastIndex((p) => p.endsWith('1'));
	const out: string[] = [];
	let onset: string[] = [];
	phones.forEach((phone, i) => {
		const ipa = arpabetToIpa(phone) ?? '?';
		if (!isVowel(phone)) {
			onset.push(ipa);
			return;
		}
		const stress =
			phone.endsWith('1') && i !== lastPrimary
				? '2'
				: phone.slice(-1);
		const mark = polysyllabic ? STRESS[stress] : undefined;
		if (mark) out.push(mark);
		out.push(...onset, ipa);
		onset = [];
	});
	return [...out, ...onset];
}

export const wordOf = (
	value: string,
	symbols: string[],
	guess: boolean,
): IpaWord => ({ type: 'word', value, symbols, ipa: symbols.join(''), guess });

export function transcribe(text: string, lookup: Lookup): IpaToken[] {
	return (text.match(TOKEN) ?? []).map((value) => {
		if (!/^[a-zA-Z']/.test(value)) return { type: 'other', value };
		const phones = lookup(value.toLowerCase());
		return phones
			? wordOf(value, wordToIpa(phones), false)
			: wordOf(
					value,
					heuristicTransliterate(value).map(
						(p) => p.ipa,
					),
					true,
				);
	});
}

export const toText = (tokens: IpaToken[]) =>
	tokens.map((t) => (t.type === 'word' ? t.ipa : t.value)).join('');
