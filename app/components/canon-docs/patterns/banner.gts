import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonFigure from 'delphicanon/components/canon-figure';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonNumberField from 'delphicanon/components/canon-number-field';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonTiles from 'delphicanon/components/canon-tiles';

export default class BannerPattern extends Component {
	@tracked px = 24;

	get figure() {
		return String(this.px);
	}

	get readings() {
		return [
			{ label: 'rem', value: (this.px / 16).toFixed(3) },
			{ label: 'pt', value: (this.px * 0.75).toFixed(2) },
			{
				label: 'mm',
				value: ((this.px * 25.4) / 96).toFixed(2),
			},
		];
	}

	setPx = (value: number) => (this.px = value);

	<template>
		<CanonSplit>
			<:banner>
				<CanonCanvas @height={{120}}>
					<div class="cd-banner-figure">
						<CanonFigure
							@text={{this.figure}}
							@unit="px"
							@size={{56}}
						/>
					</div>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Size" />
					<CanonRow
						@title="Pixels"
						@form="flush"
						as |titleId|
					>
						<CanonNumberField
							@value={{this.px}}
							@max={{500}}
							@step={{1}}
							@unit="px"
							@labelledBy={{titleId}}
							@onChange={{this.setPx}}
						/>
					</CanonRow>
				</CanonRows>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Readings" />
					<CanonTiles @items={{this.readings}} />
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
