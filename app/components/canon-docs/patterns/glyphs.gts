import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonGlyphFlow from 'delphicanon/components/canon-glyph-flow';
import CanonTextInput from 'delphicanon/components/canon-text-input';
import type { GlyphKind } from 'delphicanon/lib/glyph-rows';

const start = 'Delphi';
const metrics = { height: 40, rowGap: 6, gap: 4 };
const measure = () => 30;
const kind = (glyph: string): GlyphKind =>
	glyph === '\n' ? 'newline' : /\s/.test(glyph) ? 'space' : 'glyph';
const isSpace = (glyph: string) => /\s/.test(glyph);

export default class GlyphsPattern extends Component {
	@tracked text = start;

	get glyphs() {
		return [...this.text];
	}

	change = (text: string) => (this.text = text);

	<template>
		<CanonCanvas @height={{140}}>
			<CanonGlyphFlow
				@glyphs={{this.glyphs}}
				@metrics={{metrics}}
				@measure={{measure}}
				@kind={{kind}}
				@label={{this.text}}
				as |glyph|
			>
				{{#unless (isSpace glyph)}}
					<span class="cd-glyph">{{glyph}}</span>
				{{/unless}}
			</CanonGlyphFlow>
		</CanonCanvas>
		<CanonTextInput
			@value={{start}}
			@onChange={{this.change}}
			aria-label="Glyphs"
		/>
	</template>
}
