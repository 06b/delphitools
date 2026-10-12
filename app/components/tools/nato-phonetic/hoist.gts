import type { TOC } from '@ember/component/template-only';
import { htmlSafe } from '@ember/template';
import CanonGlyphFlow from 'delphicanon/components/canon-glyph-flow';
import type { GlyphKind } from 'delphicanon/lib/glyph-rows';
import { flagSvg } from 'delphitools-v2/lib/signal-flags';
import type { SpelledChar } from 'delphitools-v2/lib/spelling-alphabets';

interface HoistSignature {
	Args: {
		spelled: SpelledChar[];
		/** What the flags say, for assistive technology. */
		label: string;
	};
}

/** The banner's height and the band it collapses to, in px. */
export const bandHeight = 164;
export const collapsedHeight = 100;

const flag = { width: 44, height: 33 };
// halyard to flag top
const drop = 7;
const metrics = { height: drop + flag.height + 22, rowGap: 14, gap: 8 };

let context: CanvasRenderingContext2D | null | undefined;
let family: string | undefined;

// the word's width in the label type: 13 px semibold canon font
function wordWidth(word: string) {
	context ??= document.createElement('canvas').getContext('2d');
	if (!context) return word.length * 7;
	family ??= getComputedStyle(document.documentElement)
		.getPropertyValue('--canon-font')
		.trim();
	context.font = `600 13px ${family || 'sans-serif'}`;
	return Math.ceil(context.measureText(word).width);
}

const measure = (glyph: SpelledChar) =>
	Math.max(flag.width, glyph.word ? wordWidth(glyph.word) : 0);

const kind = (glyph: SpelledChar): GlyphKind =>
	glyph.char === '\n'
		? 'newline'
		: /\s/.test(glyph.char)
			? 'space'
			: 'glyph';

const equals = (a: SpelledChar, b: SpelledChar) =>
	a.char === b.char && a.word === b.word;

const isSpace = (glyph: SpelledChar) => /\s/.test(glyph.char);

// ß uppercases to SS: it keeps its own box
function art(glyph: SpelledChar) {
	const upper = glyph.char.toUpperCase();
	const letter = upper.length === 1 ? upper : glyph.char;
	return /^[A-Z]$/.test(letter) ? htmlSafe(flagSvg(letter)) : undefined;
}

const reachStyle = htmlSafe(`--np-reach: ${metrics.gap / 2}px`);

/**
 * The spelling as a hoist of signal flags on a halyard, each spelling word
 * under its flag, a dashed tackline between words; a character with no flag
 * gets a plain box.
 */
const Hoist: TOC<HoistSignature> = <template>
	<div class="np-hoist" style={{reachStyle}}>
		<CanonGlyphFlow
			@glyphs={{@spelled}}
			@metrics={{metrics}}
			@measure={{measure}}
			@kind={{kind}}
			@equals={{equals}}
			@label={{@label}}
		>
			<:default as |glyph|>
				{{#if (isSpace glyph)}}
					<span
						class="np-halyard np-halyard--tackline"
					></span>
				{{else}}
					<span class="np-halyard"></span>
					<span class="np-flag-box">
						{{#let (art glyph) as |svg|}}
							{{#if svg}}
								{{svg}}
							{{else}}
								<span
									class="np-plain"
								>{{glyph.char}}</span>
							{{/if}}
						{{/let}}
					</span>
					{{#if glyph.word}}
						<span
							class="np-word"
						>{{glyph.word}}</span>
					{{/if}}
				{{/if}}
			</:default>
			<:empty>
				<span
					class="np-halyard np-halyard--empty"
				></span>
			</:empty>
		</CanonGlyphFlow>
	</div>
</template>;

export default Hoist;
