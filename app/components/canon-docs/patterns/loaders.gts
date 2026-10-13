import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonLoader, {
	type CanonLoaderMode,
} from 'delphicanon/components/canon-loader';
import CanonRow from 'delphicanon/components/canon-row';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSlider from 'delphicanon/components/canon-slider';
import CanonSwitch from 'delphicanon/components/canon-switch';

const modes: CanonLoaderMode[] = ['snake', 'comet', 'dot', 'twin', 'thinking'];
const names = ['Snake', 'Comet', 'Dot', 'Twin', 'Think'];
const px = (value: number) => `${Math.round(value)} px`;

export default class LoadersPattern extends Component {
	@tracked mode = 0;
	@tracked reverse = false;
	@tracked cell = 10;

	get current() {
		return modes[this.mode];
	}

	pick = (index: number) => (this.mode = index);
	flip = (on: boolean) => (this.reverse = on);
	size = (cell: number) => (this.cell = cell);

	<template>
		<CanonCanvas @height={{128}}>
			<div class="cd-loader">
				<CanonLoader
					@mode={{this.current}}
					@reverse={{this.reverse}}
					@cell={{this.cell}}
				/>
			</div>
		</CanonCanvas>
		<CanonSegmented
			aria-label="Mode"
			@items={{names}}
			@selected={{this.mode}}
			@onChange={{this.pick}}
		/>
		<CanonRow @title="Cell" @form="stacked" as |titleId|>
			<CanonSlider
				@value={{this.cell}}
				@min={{4}}
				@max={{16}}
				@step={{1}}
				@readout={{px}}
				@labelledBy={{titleId}}
				@onChange={{this.size}}
			/>
		</CanonRow>
		<CanonRow @title="Reverse" as |titleId|>
			<CanonSwitch
				@on={{this.reverse}}
				@onChange={{this.flip}}
				aria-labelledby={{titleId}}
			/>
		</CanonRow>
	</template>
}
