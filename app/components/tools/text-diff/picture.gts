import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { htmlSafe } from '@ember/template';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import { IconSvg } from 'delphitools-v2/components/icon';
import {
	pieces,
	type SideMark,
} from 'delphitools-v2/components/tools/text-diff/diff';

export type SideId = 'old' | 'new';

interface PictureSignature {
	Args: {
		oldText: string;
		newText: string;
		oldMarks: SideMark[];
		newMarks: SideMark[];
		onInput: (side: SideId, text: string) => void;
		onFile: (side: SideId, file: File) => void;
		onCopy: (side: SideId) => void;
		onSwap: () => void;
		/** The picture's own height in px at its current width. */
		onHeight: (height: number) => void;
	};
}

export const ACCEPT =
	'text/*,.txt,.md,.json,.csv,.log,.xml,.yaml,.yml,.html,.css,.js,.ts,.tsx,.jsx';

const OpenIcon = <template><IconSvg @name="upload" /></template>;
const PasteIcon = <template><IconSvg @name="clipboard" /></template>;
const CopyIcon = <template><IconSvg @name="copy" /></template>;
const ClearIcon = <template><IconSvg @name="trash-2" /></template>;
const SwapIcon = <template><IconSvg @name="arrow-up-down" /></template>;

// .td-side-head: 6 px over a 44 px head, one per side
const headHeight = 50;

const reportHeight = modifier(
	(element: HTMLElement, [report]: [(height: number) => void]) => {
		const texts = [
			...element.querySelectorAll<HTMLElement>(
				'.td-side-text',
			),
		];
		const observer = new ResizeObserver(() =>
			report(
				texts.reduce(
					(sum, text) =>
						sum +
						headHeight +
						text.offsetHeight,
					0,
				),
			),
		);
		for (const text of texts) observer.observe(text);
		return () => observer.disconnect();
	},
);

const plain: SideMark = { lit: false, spans: [] };

function lines(text: string, marks: SideMark[]) {
	return text.split('\n').map((line, index) => {
		const mark = marks[index] ?? plain;
		return {
			number: index + 1,
			lit: mark.lit,
			// an empty line keeps its height
			pieces: line
				? pieces(line, mark.spans)
				: [{ text: ' ', on: false }],
		};
	});
}

/**
 * Both texts as typed, numbered, each with its own side of the diff lit in
 * place: removed lines and words on the original, added on the modified. A
 * transparent textarea over each takes the typing.
 */
export default class Picture extends Component<PictureSignature> {
	get sides() {
		const { oldText, newText, oldMarks, newMarks } = this.args;
		return [
			{
				id: 'old' as SideId,
				label: 'Original',
				text: oldText,
				lines: oldText ? lines(oldText, oldMarks) : [],
				style: gutter(oldText),
			},
			{
				id: 'new' as SideId,
				label: 'Modified',
				text: newText,
				lines: newText ? lines(newText, newMarks) : [],
				style: gutter(newText),
			},
		];
	}

	input = (side: SideId, event: Event) =>
		this.args.onInput(
			side,
			(event.target as HTMLTextAreaElement).value,
		);

	paste = async (side: SideId) => {
		const text = await navigator.clipboard
			.readText()
			.catch(() => '');
		if (text && !this.isDestroying) this.args.onInput(side, text);
	};

	clear = (side: SideId) => this.args.onInput(side, '');

	chooseFile = (side: SideId, event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		// the same file can be chosen again
		input.value = '';
		if (file) this.args.onFile(side, file);
	};

	#pickers: Partial<Record<SideId, HTMLInputElement>> = {};

	keepPicker = modifier((input: HTMLInputElement, [side]: [SideId]) => {
		this.#pickers[side] = input;
	});

	openFile = (side: SideId) => this.#pickers[side]?.click();

	// a file dropped on a side loads into that side
	drop = (side: SideId, event: DragEvent) => {
		const file = event.dataTransfer?.files[0];
		if (!file) return;
		event.preventDefault();
		this.args.onFile(side, file);
	};

	<template>
		<div class="td-picture" {{reportHeight @onHeight}}>
			{{#each this.sides key="id" as |side|}}
				<section
					class="td-side td-side--{{side.id}}"
					aria-label={{side.label}}
					{{on "drop" (fn this.drop side.id)}}
				>
					<div class="td-side-head">
						<span
							class="td-side-label"
						>{{side.label}}</span>
						<span class="td-side-tools">
							<input
								type="file"
								class="dt-sr-only"
								accept={{ACCEPT}}
								tabindex="-1"
								aria-hidden="true"
								aria-label="Open file"
								{{this.keepPicker
									side.id
								}}
								{{on
									"change"
									(fn
										this.chooseFile
										side.id
									)
								}}
							/>
							{{#if (isNew side.id)}}
								<CanonButton
									class="td-swap"
									@kind="cell"
									@label="Swap"
									@icon={{SwapIcon}}
									@onClick={{@onSwap}}
								/>
							{{/if}}
							<CanonButton
								@kind="cell"
								@label="Open file"
								@icon={{OpenIcon}}
								@onClick={{fn
									this.openFile
									side.id
								}}
							/>
							<CanonButton
								@kind="cell"
								@label="Paste"
								@icon={{PasteIcon}}
								@onClick={{fn
									this.paste
									side.id
								}}
							/>
							<CanonButton
								@kind="cell"
								@label="Copy"
								@icon={{CopyIcon}}
								@disabled={{if
									side.text
									false
									true
								}}
								@onClick={{fn
									@onCopy
									side.id
								}}
							/>
							<CanonButton
								@kind="cell"
								@label="Clear"
								@icon={{ClearIcon}}
								@disabled={{if
									side.text
									false
									true
								}}
								@onClick={{fn
									this.clear
									side.id
								}}
							/>
						</span>
					</div>
					<div class="td-side-scroll">
						{{! the marks lie under a transparent textarea set in the same type }}
						<div
							class="td-side-text"
							style={{side.style}}
						>
							{{#if
								side.lines.length
							}}
								<div
									class="td-marks"
									aria-hidden="true"
								>
									{{#each
										side.lines
										key="@index"
										as |line|
									}}
										<div
											class="td-mark-line
												{{if
													line.lit
													'td-mark-line--lit'
												}}"
										><span
												class="td-gutter"
											>{{line.number}}</span><span
												class="td-mark-text"
											>{{~#each
													line.pieces
													key="@index"
													as |piece|
												~}}<span
														class={{if
															piece.on
															"td-word"
														}}
													>{{piece.text}}</span>{{~/each~}}</span></div>
									{{/each}}
								</div>
							{{/if}}
							<textarea
								class="td-source"
								rows="1"
								placeholder="Type or paste"
								aria-label={{side.label}}
								autocomplete="off"
								autocapitalize="off"
								spellcheck="false"
								value={{side.text}}
								{{on
									"input"
									(fn
										this.input
										side.id
									)
								}}
							></textarea>
						</div>
					</div>
				</section>
			{{/each}}
		</div>
	</template>
}

function gutter(text: string) {
	const digits = String(text.split('\n').length).length;
	return htmlSafe(`--td-gutter: calc(${Math.max(2, digits)}ch + 14px)`);
}

function isNew(side: SideId) {
	return side === 'new';
}
