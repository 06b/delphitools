import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { htmlSafe } from '@ember/template';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonColourWell from 'delphicanon/components/canon-colour-well';
import CanonFigure from 'delphicanon/components/canon-figure';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonRow from 'delphicanon/components/canon-row';
import CanonStatus from 'delphicanon/components/canon-status';
import {
	contrastFigure,
	contrastLevels,
	contrastRatio,
	hex,
	type Rgb,
} from 'delphicanon/lib/colour';

export default class ContrastPattern extends Component {
	@tracked text: Rgb = [0.118, 0.4, 0.149];
	@tracked paper: Rgb = [0.98, 0.961, 0.902];

	get ratio() {
		return contrastRatio(this.text, this.paper);
	}

	get figure() {
		return contrastFigure(this.ratio);
	}

	get levels() {
		return [
			{
				text: 'AA large',
				pass: this.ratio >= contrastLevels.aaLarge,
			},
			{ text: 'AA', pass: this.ratio >= contrastLevels.aa },
			{ text: 'AAA', pass: this.ratio >= contrastLevels.aaa },
		];
	}

	get sample() {
		return htmlSafe(
			`color: ${hex(this.text)}; background: ${hex(this.paper)}`,
		);
	}

	setText = (colour: Rgb) => (this.text = colour);
	setPaper = (colour: Rgb) => (this.paper = colour);

	<template>
		<CanonCanvas @height={{112}}>
			<div class="cd-contrast-sample" style={{this.sample}}>
				<span class="cd-contrast-glyphs">Aa</span>
				<CanonFigure
					@text={{this.figure}}
					@unit=": 1"
					@size={{40}}
					@colour={{hex this.text}}
				/>
			</div>
		</CanonCanvas>
		<CanonGrid>
			<CanonColourWell
				@label="Text"
				@colour={{this.text}}
				@onChange={{this.setText}}
			/>
			<CanonColourWell
				@label="Paper"
				@colour={{this.paper}}
				@onChange={{this.setPaper}}
			/>
		</CanonGrid>
		<CanonRow @title="WCAG">
			<div class="cd-inline">
				{{#each this.levels as |level|}}
					<CanonStatus
						@text={{level.text}}
						@tone={{if
							level.pass
							"ok"
							"warn"
						}}
					/>
				{{/each}}
			</div>
		</CanonRow>
	</template>
}
