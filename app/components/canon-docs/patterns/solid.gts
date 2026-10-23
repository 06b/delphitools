import Component from '@glimmer/component';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import { CanonColourSolidState } from 'delphicanon/components/canon-colour-controls';
import CanonColourSolid from 'delphicanon/components/canon-colour-solid';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonValueLine from 'delphicanon/components/canon-value-line';
import { hex } from 'delphicanon/lib/colour';
import { spaceNames, type SolidSpace } from 'delphicanon/lib/colour-space';

const spaces: SolidSpace[] = ['rgb', 'hsl', 'oklch', 'lab'];
const titles = spaces.map((space) => spaceNames[space]);

export default class SolidPattern extends Component {
	state = new CanonColourSolidState({ space: 'rgb' });

	get selected() {
		return spaces.indexOf(this.state.space);
	}

	get hex() {
		return hex(this.state.colour).toUpperCase();
	}

	pickSpace = (index: number) => this.state.selectSpace(spaces[index]!);

	<template>
		<CanonCanvas @aspect={{1}} @background="var(--canon-muted)">
			<CanonColourSolid
				@space={{this.state.space}}
				@point={{this.state.point}}
				@animated={{this.state.animated}}
				@sliceAxis={{this.state.sliceAxis}}
				@isOrtho={{this.state.isOrtho}}
				@showsWhole={{this.state.showsWhole}}
				@onChange={{this.state.pick}}
			/>
		</CanonCanvas>
		<CanonSegmented
			aria-label="Space"
			@items={{titles}}
			@selected={{this.selected}}
			@onChange={{this.pickSpace}}
		/>
		<CanonValueLine @label="HEX" @value={{this.hex}} />
	</template>
}
