import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import CanonButton from 'delphicanon/components/canon-button';
import { IconSvg } from 'delphitools-v2/components/icon';
import type SidebarService from 'delphitools-v2/services/sidebar';

// iOS Resources/backdrops.json, in its order
const TAPES = [
	'benedict',
	'tilcayo',
	'digital',
	'flush',
	'scribble',
	'lakewood',
	'barman',
	'good-sandwich',
	'bad-sandwich',
	'newman',
	'dansom',
	'seafoam',
	'gripp',
	'silkmoth',
	'zephyr',
	'wirman',
	'tapdole',
	'mariana',
	'yu',
	'madeline',
	'faden',
	'murtaugh',
	'lorelei',
	'yefreitor',
	'barry',
	'birch',
	'cameron',
	'esquire',
	'believe',
	'dahlia',
	'pfleumer',
	'pride-rainbow',
	'pride-transgender',
	'pride-bisexual',
	'pride-non-binary',
	'pride-lesbian',
	'pride-pansexual',
	'pride-asexual',
	'pride-intersex',
	'pride-genderfluid',
	'pride-aromantic',
	'pride-agender',
	'pride-demisexual',
	'pride-queer',
	'pride-polyamory',
	'pride-demigirl',
	'pride-demiboy',
	'pride-transfem',
	'pride-transmasc',
];

// any tape but the one at `not`
const pick = (not = -1) => {
	const count = not < 0 ? TAPES.length : TAPES.length - 1;
	const index = Math.floor(Math.random() * count);
	return not >= 0 && index >= not ? index + 1 : index;
};

// the iOS backdrop strip, shown in the closed band
export default class BandTape extends Component {
	@service declare sidebar: SidebarService;

	@tracked index = pick();

	get src() {
		return `/backdrops/${TAPES[this.index]}.webp`;
	}

	// flags tile at full width, so cover never crops the outer stripes
	get isFlag() {
		return TAPES[this.index]?.startsWith('pride-') ?? false;
	}

	get flagStyle() {
		return htmlSafe(`background-image: url("${this.src}")`);
	}

	shuffle = () => {
		this.index = pick(this.index);
	};

	<template>
		<div class="dt-tape" inert={{this.sidebar.open}}>
			{{#if this.isFlag}}
				<div
					class="dt-tape-art is-flag"
					style={{this.flagStyle}}
				></div>
			{{else}}
				<img
					class="dt-tape-art"
					src={{this.src}}
					alt=""
				/>
			{{/if}}
			<CanonButton
				class="dt-tape-shuffle"
				@kind="cell"
				@label="Shuffle"
				@icon={{component IconSvg name="shuffle"}}
				@onClick={{this.shuffle}}
			/>
		</div>
	</template>
}
