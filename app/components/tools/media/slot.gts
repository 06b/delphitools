import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import { IconSvg } from 'delphitools-v2/components/icon';
import './slot.css';

const Folder = <template><IconSvg @name="folder-open" /></template>;

export interface SlotSignature {
	Args: {
		prompt: string;
		icon: string;
		/** As the file input's accept attribute. */
		accept?: string;
		/** The dashed image slot; `fills` covers the positioned parent. */
		dashed?: boolean;
		fills?: boolean;
		/** One row tall, icon beside the prompt and a Files cell: the Source row before a file. */
		row?: boolean;
		multiple?: boolean;
		/** A file is dragged over the tool. */
		over?: boolean;
		onFile?: (file: File) => void;
		/** Every picked file, in place of `onFile`. */
		onFiles?: (files: File[]) => void;
		/** Opens the tool's own file input instead of the slot's. */
		onChoose?: () => void;
	};
	Element: HTMLButtonElement;
}

/** The empty picture: a button that opens the file picker and shows the drop. */
export default class Slot extends Component<SlotSignature> {
	#input?: HTMLInputElement;

	keep = modifier((input: HTMLInputElement) => {
		this.#input = input;
	});

	choose = () =>
		this.args.onChoose
			? this.args.onChoose()
			: this.#input?.click();

	picked = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const files = [...(input.files ?? [])];
		// the same file twice fires change again
		input.value = '';
		if (!files.length) return;
		if (this.args.onFiles) this.args.onFiles(files);
		else this.args.onFile?.(files[0]!);
	};

	get ownInput() {
		return (
			!this.args.onChoose &&
			(this.args.onFile || this.args.onFiles)
		);
	}

	<template>
		{{#if @row}}
			<div class="media-slot-bar">
				<button
					type="button"
					class="media-slot media-slot--row
						{{if @over 'media-slot--over'}}"
					tabindex="-1"
					{{on "click" this.choose}}
					...attributes
				>
					<span class="media-slot-icon"><IconSvg
							@name={{@icon}}
						/></span>
					<span
						class="media-slot-prompt"
					>{{@prompt}}</span>
				</button>
				<CanonButton
					class="media-slot-files"
					@kind="cell"
					@text="Files"
					@icon={{Folder}}
					@onClick={{this.choose}}
				/>
			</div>
		{{else}}
			<button
				type="button"
				class="media-slot
					{{if @dashed 'media-slot--dashed'}}
					{{if @fills 'media-slot--fills'}}
					{{if @over 'media-slot--over'}}"
				{{on "click" this.choose}}
				...attributes
			>
				<span class="media-slot-icon"><IconSvg
						@name={{@icon}}
					/></span>
				<span
					class="media-slot-prompt"
				>{{@prompt}}</span>
			</button>
		{{/if}}
		{{#if this.ownInput}}
			{{! the slot is its label }}
			{{! template-lint-disable require-input-label }}
			<input
				type="file"
				accept={{@accept}}
				multiple={{@multiple}}
				hidden
				{{this.keep}}
				{{on "change" this.picked}}
			/>
		{{/if}}
	</template>
}
