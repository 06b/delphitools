import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import { IconSvg } from 'delphitools-v2/components/icon';
import { matchesAccept } from 'delphitools-v2/modifiers/file-paste';
import './drop-more.css';

export interface DropMoreSignature {
	Args: {
		/** As the file input's accept attribute; default image/*. */
		accept?: string;
		/** Defaults to the images wording. */
		prompt?: string;
		onFiles: (files: File[]) => void;
	};
	Element: HTMLButtonElement;
}

/**
 * The empty item after a multi-file list: a dashed row that adds the files
 * dropped on it or picked through it. Its drop calls preventDefault, so a
 * tool-wide multiple `Drop` skips it.
 */
export default class DropMore extends Component<DropMoreSignature> {
	@tracked over = false;
	#input?: HTMLInputElement;

	keep = modifier((input: HTMLInputElement) => {
		this.#input = input;
	});

	get accept() {
		return this.args.accept ?? 'image/*';
	}

	choose = () => this.#input?.click();

	picked = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const files = [...(input.files ?? [])];
		input.value = '';
		if (files.length) this.args.onFiles(files);
	};

	enter = (event: DragEvent) => {
		if (!event.dataTransfer?.types.includes('Files')) return;
		event.preventDefault();
		this.over = true;
	};

	leave = () => {
		this.over = false;
	};

	drop = (event: DragEvent) => {
		this.over = false;
		const files = [...(event.dataTransfer?.files ?? [])].filter(
			(f) => matchesAccept(f, this.accept),
		);
		if (!files.length) return;
		event.preventDefault();
		this.args.onFiles(files);
	};

	<template>
		<button
			type="button"
			class="media-drop-more
				{{if this.over 'media-drop-more--over'}}"
			{{on "click" this.choose}}
			{{on "dragover" this.enter}}
			{{on "dragleave" this.leave}}
			{{on "drop" this.drop}}
			...attributes
		>
			<span class="media-drop-more-icon"><IconSvg
					@name="image-plus"
				/></span>
			<span>{{if
					@prompt
					@prompt
					"Drop additional images here"
				}}</span>
		</button>
		{{! the row is its label }}
		{{! template-lint-disable require-input-label }}
		<input
			type="file"
			accept={{this.accept}}
			multiple
			hidden
			{{this.keep}}
			{{on "change" this.picked}}
		/>
	</template>
}
