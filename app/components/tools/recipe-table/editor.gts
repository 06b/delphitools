import Component from '@glimmer/component';
import { cached } from '@glimmer/tracking';
import { htmlSafe } from '@ember/template';
import { on } from '@ember/modifier';
import type { Problem } from 'delphitools-v2/lib/recipe-parse';

interface EditorSignature {
	Args: {
		text: string;
		problems: Problem[];
		placeholder: string;
		onInput: (text: string) => void;
	};
}

interface Line {
	number: number;
	text: string;
	problem: boolean;
}

/**
 * The ClaraScript source, numbered, with the lines a problem names tinted;
 * a transparent textarea over the lines takes the typing.
 */
export default class Editor extends Component<EditorSignature> {
	@cached
	get lines(): Line[] {
		const flagged = new Set(this.args.problems.map((p) => p.line));
		return this.args.text.split('\n').map((text, index) => ({
			number: index + 1,
			// an empty line keeps its height
			text: text || ' ',
			problem: flagged.has(index + 1),
		}));
	}

	get gutterStyle() {
		const digits = String(this.lines.length).length;
		return htmlSafe(
			`--rt-gutter: calc(${Math.max(2, digits)}ch + 14px)`,
		);
	}

	input = (event: Event) =>
		this.args.onInput((event.target as HTMLTextAreaElement).value);

	<template>
		{{! the lines lie under a transparent textarea set in the same type }}
		<div class="rt-editor" style={{this.gutterStyle}}>
			{{#if @text}}
				<div class="rt-lines" aria-hidden="true">
					{{#each this.lines as |line|}}
						<div
							class="rt-line
								{{if
									line.problem
									'rt-line--problem'
								}}"
						><span
								class="rt-gutter"
							>{{line.number}}</span><span
								class="rt-line-text"
							>{{line.text}}</span></div>
					{{/each}}
				</div>
			{{/if}}
			<textarea
				class="rt-source"
				rows="1"
				placeholder={{@placeholder}}
				aria-label="Recipe"
				autocomplete="off"
				autocapitalize="off"
				spellcheck="false"
				value={{@text}}
				{{on "input" this.input}}
			></textarea>
		</div>
	</template>
}
