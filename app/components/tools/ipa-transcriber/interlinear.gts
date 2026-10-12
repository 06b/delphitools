import Component from '@glimmer/component';
import CanonGlyphFlow from 'delphicanon/components/canon-glyph-flow';
import type { GlyphKind } from 'delphicanon/lib/glyph-rows';
import {
	glossOf,
	stressRuns,
	type GlossGlyph,
} from 'delphitools-v2/components/tools/ipa-transcriber/gloss';
import type { IpaToken } from 'delphitools-v2/lib/ipa';

interface InterlinearSignature {
	Args: {
		tokens: IpaToken[];
		/** The transcription, for assistive technology. */
		label: string;
	};
}

/** The banner's height and the band it collapses to, in px. */
export const bandHeight = 150;
export const collapsedHeight = 88;

// the --ipa-serif stack in ipa-transcriber.css
const serif = 'ui-serif, "Iowan Old Style", "Charter", georgia, serif';
const ipaFont = `24px ${serif}`;
const ipaLine = 29;
const metrics = { height: ipaLine + 18, rowGap: 12, gap: 0 };

let context: CanvasRenderingContext2D | null | undefined;
let wordFont: string | undefined;

function width(text: string, font: string) {
	if (!text) return 0;
	context ??= document.createElement('canvas').getContext('2d');
	if (!context) return text.length * 12;
	context.font = font;
	return Math.ceil(context.measureText(text).width);
}

function measure(glyph: GlossGlyph) {
	if (glyph.tone === 'newline') return 0;
	if (glyph.tone === 'space') return 12;
	wordFont ??= `500 13px ${getComputedStyle(document.documentElement).getPropertyValue('--canon-font').trim() || 'sans-serif'}`;
	return Math.max(width(glyph.ipa, ipaFont), width(glyph.word, wordFont));
}

const kind = (glyph: GlossGlyph): GlyphKind =>
	glyph.tone === 'space'
		? 'space'
		: glyph.tone === 'newline'
			? 'newline'
			: 'glyph';

const equals = (a: GlossGlyph, b: GlossGlyph) =>
	a.ipa === b.ipa && a.word === b.word && a.tone === b.tone;

const isShown = (glyph: GlossGlyph) =>
	glyph.tone !== 'space' && glyph.tone !== 'newline';

/**
 * The transcription set interlinear, as in a phonetics text: each word's IPA
 * over its spelling, between phonemic slashes; stress marks in the primary
 * colour, a guessed word lighter with a dashed rule under it.
 */
export default class Interlinear extends Component<InterlinearSignature> {
	get glyphs() {
		return glossOf(this.args.tokens);
	}

	<template>
		<CanonGlyphFlow
			class="ipa-gloss"
			@glyphs={{this.glyphs}}
			@metrics={{metrics}}
			@measure={{measure}}
			@kind={{kind}}
			@equals={{equals}}
			@label={{@label}}
		>
			<:default as |glyph|>
				{{#if (isShown glyph)}}
					<span
						class="ipa-gloss-ipa ipa-tone--{{glyph.tone}}"
					>
						{{~#each
							(stressRuns glyph.ipa)
							as |run|
						~}}
							<span
								class={{if
									run.stress
									"ipa-stress"
								}}
							>{{run.text}}</span>
						{{~/each~}}
					</span>
					{{#if glyph.word}}
						<span
							class="ipa-gloss-word"
						>{{glyph.word}}</span>
					{{/if}}
				{{/if}}
			</:default>
			<:empty>
				<span class="ipa-gloss-empty">/ /</span>
			</:empty>
		</CanonGlyphFlow>
	</template>
}
