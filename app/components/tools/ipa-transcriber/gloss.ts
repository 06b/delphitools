import type { IpaToken } from 'delphitools-v2/lib/ipa';

export type Tone = 'word' | 'guess' | 'mark' | 'space' | 'newline';

export interface GlossGlyph {
	ipa: string;
	word: string;
	tone: Tone;
}

const stressMarks = new Set(['ˈ', 'ˌ']);

/** IPAGloss.show: a glyph per word, per other character, slashes round it all. */
export function glossOf(tokens: IpaToken[]): GlossGlyph[] {
	const glyphs: GlossGlyph[] = [];
	for (const token of tokens) {
		if (token.type === 'word') {
			glyphs.push({
				ipa: token.ipa,
				word: token.value,
				tone: token.guess ? 'guess' : 'word',
			});
			continue;
		}
		for (const char of token.value) {
			const tone: Tone =
				char === '\n'
					? 'newline'
					: /\s/.test(char)
						? 'space'
						: 'mark';
			glyphs.push({ ipa: char, word: '', tone });
		}
	}
	if (!glyphs.some((g) => g.tone === 'word' || g.tone === 'guess'))
		return [];
	const slash: GlossGlyph = { ipa: '/', word: '', tone: 'mark' };
	return [slash, ...glyphs, slash];
}

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
