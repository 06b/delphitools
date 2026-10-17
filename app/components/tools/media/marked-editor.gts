import Component from '@glimmer/component';
import { htmlSafe } from '@ember/template';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import './marked-editor.css';

export interface MarkedLine {
	lit?: boolean;
}

interface MarkedEditorSignature<L extends MarkedLine> {
	Args: {
		text: string;
		placeholder: string;
		label: string;
		onInput: (text: string) => void;
		/** One entry per line of `text`: numbered in a gutter, `lit` tints the line. */
		lines?: L[];
		/** The marks hold controls: after the textarea in focus order and not hidden from assistive tech. */
		interactive?: boolean;
		/** The keyboard may capitalise sentences. */
		prose?: boolean;
	};
	Blocks: {
		default: [];
		line: [line: L];
	};
	Element: HTMLDivElement;
}

// the picture head over the text: 6 px over a 44 px head
const headHeight = 50;

/** Reports the picture's own height in px (the head plus this element) at its current width. */
export const reportHeight = modifier(
	(element: HTMLElement, [report]: [(height: number) => void]) => {
		const observer = new ResizeObserver(() =>
			report(headHeight + element.offsetHeight),
		);
		observer.observe(element);
		return () => observer.disconnect();
	},
);

const number = (index: number) => index + 1;

/**
 * Text marked in place under a transparent textarea set in the same type, so
 * the caret sits on the marks. The marks come from the block, or per line
 * from the `line` block beside a numbered gutter. Empty, the textarea is the
 * dashed placeholder box.
 */
export default class MarkedEditor<
	L extends MarkedLine = MarkedLine,
> extends Component<MarkedEditorSignature<L>> {
	get gutterStyle() {
		const { lines } = this.args;
		if (!lines) return undefined;
		const digits = String(lines.length).length;
		return htmlSafe(
			`--media-marked-gutter: calc(${Math.max(2, digits)}ch + 14px)`,
		);
	}

	input = (event: Event) =>
		this.args.onInput((event.target as HTMLTextAreaElement).value);

	<template>
		<div class="media-marked" ...attributes>
			{{#if @text}}
				{{#unless @interactive}}
					<div
						class="media-marked-marks"
						style={{this.gutterStyle}}
						aria-hidden="true"
					>
						{{~#if @lines~}}
							{{~#each
								@lines
								key="@index"
								as |line index|
							~}}
								<div
									class="media-marked-line
										{{if
											line.lit
											'media-marked-line--lit'
										}}"
								><span
										class="media-marked-gutter"
									>{{number
											index
										}}</span><span
										class="media-marked-text"
									>{{~yield
											line
											to="line"
										~}}</span></div>
							{{~/each~}}
						{{~else~}}
							{{~yield~}}
						{{~/if~}}
					</div>
				{{/unless}}
			{{/if}}
			<textarea
				class="media-marked-source"
				style={{this.gutterStyle}}
				rows="1"
				placeholder={{@placeholder}}
				aria-label={{@label}}
				autocomplete="off"
				autocapitalize={{unless @prose "off"}}
				spellcheck="false"
				value={{@text}}
				{{on "input" this.input}}
			></textarea>
			{{#if @text}}
				{{#if @interactive}}
					<div
						class="media-marked-marks"
					>{{~yield~}}</div>
				{{/if}}
			{{/if}}
		</div>
	</template>
}
