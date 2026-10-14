import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import {
	getColour,
	subscribeColour,
} from 'delphitools-v2/lib/substrata/colour-store';
import { editorUi } from 'delphitools-v2/lib/substrata/editor-ui';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

// iOS colour key: the working colour as a dot; opens the ring
export default class ColourKey extends Component {
	colour = new TrackedExternal(subscribeColour, getColour);

	willDestroy() {
		super.willDestroy();
		this.colour.unsubscribe();
	}

	get dotStyle() {
		const c = this.colour.current;
		return htmlSafe(
			`--sub-key-colour: rgb(${c.rgb.r} ${c.rgb.g} ${c.rgb.b} / ${c.alpha})`,
		);
	}

	toggle = () => {
		editorUi.ringOpen = !editorUi.ringOpen;
	};

	<template>
		<div class="sub-cells sub-ed-colour-key">
			<button
				type="button"
				class="canon-button canon-button--segment sub-cell
					{{if editorUi.ringOpen 'is-open'}}"
				aria-label="Colour"
				aria-expanded={{if
					editorUi.ringOpen
					"true"
					"false"
				}}
				title="Colour"
				{{on "click" this.toggle}}
			><span
					class="sub-ed-colour-dot"
					style={{this.dotStyle}}
				></span></button>
		</div>
	</template>
}
