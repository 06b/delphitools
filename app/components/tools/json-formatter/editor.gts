import Component from '@glimmer/component';
import { cached } from '@glimmer/tracking';
import { htmlSafe } from '@ember/template';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonStatus from 'delphicanon/components/canon-status';
import { IconSvg } from 'delphitools-v2/components/icon';
import {
	tokenRuns,
	type Run,
} from 'delphitools-v2/components/tools/json-formatter/shape';

interface EditorSignature {
	Args: {
		text: string;
		fileName: string | null;
		/** 1-based line of the parse error, if any. */
		errorLine?: number;
		onInput: (text: string) => void;
		onFile: (file: File) => void;
		/** The picture's own height in px at its current width. */
		onHeight: (height: number) => void;
	};
}

const OpenIcon = <template><IconSvg @name="upload" /></template>;
const PasteIcon = <template><IconSvg @name="clipboard" /></template>;
const ClearIcon = <template><IconSvg @name="trash-2" /></template>;

// ponytail: plain lines past this; colouring a multi-megabyte paste per keystroke stalls typing
const colourLimit = 20_000;

// .jf-editor-head: 6 px over a 44 px head
const headHeight = 50;

const reportHeight = modifier(
	(element: HTMLElement, [report]: [(height: number) => void]) => {
		const observer = new ResizeObserver(() =>
			report(headHeight + element.offsetHeight),
		);
		observer.observe(element);
		return () => observer.disconnect();
	},
);

interface Line {
	number: number;
	runs: Run[];
	error: boolean;
}

/**
 * The source as typed, numbered and coloured by token, the parse error's
 * line tinted; a transparent textarea over it takes the typing.
 */
export default class Editor extends Component<EditorSignature> {
	@cached
	get lines(): Line[] {
		const { text, errorLine } = this.args;
		const colours = text.length <= colourLimit;
		return text.split('\n').map((line, index) => ({
			number: index + 1,
			// an empty line keeps its height
			runs: line
				? colours
					? tokenRuns(line)
					: [{ text: line, kind: null }]
				: [{ text: ' ', kind: null }],
			error: errorLine === index + 1,
		}));
	}

	get gutterStyle() {
		const digits = String(this.lines.length).length;
		return htmlSafe(
			`--jf-gutter: calc(${Math.max(2, digits)}ch + 14px)`,
		);
	}

	input = (event: Event) =>
		this.args.onInput((event.target as HTMLTextAreaElement).value);

	paste = async () => {
		const text = await navigator.clipboard
			.readText()
			.catch(() => '');
		if (text && !this.isDestroying) this.args.onInput(text);
	};

	clear = () => this.args.onInput('');

	chooseFile = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		// the same file can be chosen again
		input.value = '';
		if (file) this.args.onFile(file);
	};

	#picker?: HTMLInputElement;

	keepPicker = modifier((input: HTMLInputElement) => {
		this.#picker = input;
	});

	openFile = () => this.#picker?.click();

	<template>
		<div class="jf-editor">
			<div class="jf-editor-head">
				{{#if @errorLine}}
					<CanonStatus
						@text="Invalid"
						@tone="warn"
					/>
				{{else if @fileName}}
					<span
						class="jf-editor-file"
					>{{@fileName}}</span>
				{{/if}}
				<span class="jf-editor-tools">
					<input
						type="file"
						class="dt-sr-only"
						accept=".json,application/json,text/plain"
						tabindex="-1"
						aria-hidden="true"
						aria-label="Open file"
						{{this.keepPicker}}
						{{on "change" this.chooseFile}}
					/>
					<CanonButton
						@kind="cell"
						@label="Open file"
						@icon={{OpenIcon}}
						@onClick={{this.openFile}}
					/>
					<CanonButton
						@kind="cell"
						@label="Paste"
						@icon={{PasteIcon}}
						@onClick={{this.paste}}
					/>
					<CanonButton
						@kind="cell"
						@label="Clear"
						@icon={{ClearIcon}}
						@disabled={{if
							@text
							false
							true
						}}
						@onClick={{this.clear}}
					/>
				</span>
			</div>
			<div class="jf-editor-scroll">
				{{! the marks lie under a transparent textarea set in the same type }}
				<div
					class="jf-editor-text"
					style={{this.gutterStyle}}
					{{reportHeight @onHeight}}
				>
					{{#if @text}}
						<div
							class="jf-marks"
							aria-hidden="true"
						>
							{{#each
								this.lines
								as |line|
							}}
								<div
									class="jf-mark-line
										{{if
											line.error
											'jf-mark-line--error'
										}}"
								><span
										class="jf-gutter"
									>{{line.number}}</span><span
										class="jf-mark-text"
									>{{~#each
											line.runs
											as |run|
										~}}<span
												class="jf-t--{{run.kind}}"
											>{{run.text}}</span>{{~/each~}}</span></div>
							{{/each}}
						</div>
					{{/if}}
					<textarea
						class="jf-source"
						rows="1"
						placeholder="Paste JSON"
						aria-label="Source"
						autocomplete="off"
						autocapitalize="off"
						spellcheck="false"
						value={{@text}}
						{{on "input" this.input}}
					></textarea>
				</div>
			</div>
		</div>
	</template>
}
