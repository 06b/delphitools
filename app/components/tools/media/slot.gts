import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import { IconSvg } from 'delphitools-v2/components/icon';

export interface SlotSignature {
	Args: {
		prompt: string;
		icon: string;
		/** As the file input's accept attribute. */
		accept: string;
		/** A file is dragged over the tool. */
		over?: boolean;
		onFile: (file: File) => void;
	};
	Element: HTMLButtonElement;
}

/** The empty picture: a button that opens the file picker and shows the drop. */
export default class Slot extends Component<SlotSignature> {
	#input?: HTMLInputElement;

	keep = modifier((input: HTMLInputElement) => {
		this.#input = input;
	});

	choose = () => this.#input?.click();

	picked = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		// the same file twice fires change again
		input.value = '';
		if (file) this.args.onFile(file);
	};

	<template>
		<button
			type="button"
			class="media-slot {{if @over 'media-slot--over'}}"
			{{on "click" this.choose}}
			...attributes
		>
			<span class="media-slot-icon"><IconSvg
					@name={{@icon}}
				/></span>
			<span class="media-slot-prompt">{{@prompt}}</span>
		</button>
		{{! the slot is its label }}
		{{! template-lint-disable require-input-label }}
		<input
			type="file"
			accept={{@accept}}
			hidden
			{{this.keep}}
			{{on "change" this.picked}}
		/>
	</template>
}
