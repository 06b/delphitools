import Component from '@glimmer/component';
import { modifier } from 'ember-modifier';
import RingView from 'delphitools-v2/components/substrata/colour/ring-view';
import ColourCaption from 'delphitools-v2/components/substrata/colour/caption';
import { editorUi } from 'delphitools-v2/lib/substrata/editor-ui';

// the colour ring on the iPad layout; the phone has no ring, so a colour
// well's openRingFor there opens the colour tray (editor rail) instead
export default class ColourRing extends Component<{
	Args: { phone: boolean };
}> {
	toTray = modifier((_el: HTMLElement, [open]: [boolean]) => {
		if (!open) return;
		queueMicrotask(() => {
			editorUi.ringOpen = false;
			if (!editorUi.isOpen('colour'))
				editorUi.toggle('colour', true);
		});
	});

	<template>
		{{#if @phone}}
			<span hidden {{this.toTray editorUi.ringOpen}}></span>
		{{else}}
			<RingView />
		{{/if}}
		<ColourCaption @phone={{@phone}} />
	</template>
}
