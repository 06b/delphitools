import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { htmlSafe } from '@ember/template';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSlider from 'delphicanon/components/canon-slider';
import CanonSplit from 'delphicanon/components/canon-split';

const shapes = ['Square', 'Circle'];
const whole = (value: number) => String(Math.round(value));

export default class HalvesPattern extends Component {
	@tracked hue = 145;
	@tracked shape = 0;

	get colour() {
		return `oklch(0.6 0.15 ${this.hue})`;
	}

	get style() {
		return htmlSafe(
			`background: ${this.colour}; border-radius: ${this.shape ? '50%' : '0'}`,
		);
	}

	setHue = (value: number) => (this.hue = value);
	setShape = (index: number) => (this.shape = index);

	<template>
		<CanonSplit @halves={{true}}>
			<:sidebar>
				<CanonCanvas
					@aspect={{1}}
					@background="var(--canon-muted)"
				>
					<div class="cd-halves-picture">
						<div
							class="cd-halves-shape"
							role="img"
							aria-label={{this.colour}}
							style={{this.style}}
						></div>
					</div>
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Shape" />
					<CanonRow
						@title="Hue"
						@form="stacked"
						as |titleId|
					>
						<CanonSlider
							@value={{this.hue}}
							@min={{0}}
							@max={{360}}
							@step={{1}}
							@readout={{whole}}
							@labelledBy={{titleId}}
							@onChange={{this.setHue}}
						/>
					</CanonRow>
					<CanonRow
						@title="Form"
						@form="stacked"
						as |titleId|
					>
						<CanonSegmented
							@items={{shapes}}
							@selected={{this.shape}}
							@onChange={{this.setShape}}
							aria-labelledby={{titleId}}
						/>
					</CanonRow>
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
