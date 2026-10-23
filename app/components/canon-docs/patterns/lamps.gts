import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonLamps, { type CanonLamp } from 'delphicanon/components/canon-lamps';
import CanonRow from 'delphicanon/components/canon-row';
import CanonSwitch from 'delphicanon/components/canon-switch';
import { IconSvg } from 'delphitools-v2/components/icon';

const lamps: CanonLamp[] = ['play', 'pause', 'loop', 'record'];
const titles = ['Play', 'Pause', 'Loop', 'Record'];
const Zap = <template><IconSvg @name="sparkles" /></template>;

export default class LampsPattern extends Component {
	@tracked lit: CanonLamp[] = ['play', 'loop'];
	@tracked flashes: Partial<Record<CanonLamp, number>> = {};

	get rows() {
		return lamps.map((lamp, index) => ({
			lamp,
			title: titles[index]!,
			on: this.lit.includes(lamp),
		}));
	}

	turn = (lamp: CanonLamp, on: boolean) => {
		this.lit = on
			? [...this.lit, lamp]
			: this.lit.filter((other) => other !== lamp);
	};

	blink = () => {
		const flashes = { ...this.flashes };
		for (const lamp of this.lit)
			flashes[lamp] = (flashes[lamp] ?? 0) + 1;
		this.flashes = flashes;
	};

	<template>
		<CanonCanvas @height={{96}}>
			<div class="cd-lamps">
				<CanonLamps
					@lamps={{lamps}}
					@lit={{this.lit}}
					@flashes={{this.flashes}}
				/>
			</div>
		</CanonCanvas>
		<CanonGrid @columns={{2}}>
			{{#each this.rows as |row|}}
				<CanonRow
					@title={{row.title}}
					@sizingTitle="Record"
					as |titleId|
				>
					<CanonSwitch
						@on={{row.on}}
						@onChange={{fn
							this.turn
							row.lamp
						}}
						aria-labelledby={{titleId}}
					/>
				</CanonRow>
			{{/each}}
		</CanonGrid>
		<CanonButton
			@text="Blink"
			@icon={{Zap}}
			@onClick={{this.blink}}
		/>
	</template>
}
