import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import { IconSvg } from 'delphitools-v2/components/icon';
import MarkedEditor, {
	reportHeight,
} from 'delphitools-v2/components/tools/media/marked-editor';
import {
	piecesOf,
	type Piece,
} from 'delphitools-v2/components/tools/shavian-transliterator/gloss';
import type { GlossToken } from 'delphitools-v2/lib/shavian/transliterate';

interface EditorSignature {
	Args: {
		text: string;
		tokens: GlossToken[];
		/** Token index of the picked word. */
		selected: number | null;
		onInput: (text: string) => void;
		onWord: (index: number) => void;
		/** The picture's own height in px at its current width. */
		onHeight: (height: number) => void;
	};
}

const PasteIcon = <template><IconSvg @name="clipboard" /></template>;
const ClearIcon = <template><IconSvg @name="trash-2" /></template>;

/**
 * Sets each gloss in the Shavian band. A word and the punctuation touching it
 * are one run: each gloss starts at its spelling or after the gloss before it,
 * whichever is later, and a run that would reach the next run (or the line
 * end) is narrowed to fit.
 */
function fit(text: HTMLElement) {
	const words = [...text.querySelectorAll<HTMLElement>('.sh-word')];
	const glosses = words.map((w) =>
		w.querySelector<HTMLElement>('.sh-gloss')!,
	);
	for (const gloss of glosses) gloss.style.inlineSize = '';
	const style = getComputedStyle(text);
	const lineEnd =
		text.getBoundingClientRect().right -
		parseFloat(style.paddingRight);
	// the band's ruling runs this far past a spelling into the space
	const tail = 0.6 * parseFloat(style.fontSize);
	const boxes = words.map((word, i) => {
		const rect = word.getBoundingClientRect();
		return {
			left: rect.left,
			right: rect.right,
			top: Math.round(rect.top),
			needs: glosses[i]!.scrollWidth,
		};
	});
	const gap = 2;
	let start = 0;
	while (start < words.length) {
		let end = start + 1;
		while (
			end < words.length &&
			words[end - 1]!.nextElementSibling === words[end] &&
			boxes[end]!.top === boxes[start]!.top
		)
			end += 1;
		const next = boxes[end];
		const limit =
			next && next.top === boxes[start]!.top
				? next.left - gap
				: lineEnd;
		const origin = boxes[start]!.left;
		const at: number[] = [];
		let reach = origin;
		for (let i = start; i < end; i += 1) {
			at.push(Math.max(boxes[i]!.left, reach));
			reach = at.at(-1)! + boxes[i]!.needs;
		}
		const last = boxes[end - 1]!;
		const scale =
			reach > limit ? (limit - origin) / (reach - origin) : 1;
		const place = (x: number) => origin + (x - origin) * scale;
		for (let i = start; i < end; i += 1) {
			const x = place(at[i - start]!);
			const until =
				i + 1 < end
					? place(at[i + 1 - start]!)
					: Math.min(
							limit,
							Math.max(
								place(reach),
								last.right +
									tail,
							),
						);
			const gloss = glosses[i]!;
			gloss.style.setProperty(
				'--sh-shift',
				`${x - boxes[i]!.left}px`,
			);
			gloss.style.setProperty('--sh-fit', String(scale));
			gloss.style.inlineSize = `${(until - x) / scale}px`;
		}
		start = end;
	}
}

// ponytail: reads every word on each change; a pasted book re-fits in one pass
const fitGlosses = modifier((text: HTMLElement, [pieces]: [Piece[]]) => {
	void pieces;
	fit(text);
	void document.fonts.ready.then(() => fit(text));
	let width = text.offsetWidth;
	const observer = new ResizeObserver(() => {
		if (text.offsetWidth === width) return;
		width = text.offsetWidth;
		fit(text);
	});
	observer.observe(text);
	return () => observer.disconnect();
});

/**
 * The English text as typed, each word with its Shavian set above it on the
 * iOS gloss ruling; a transparent textarea over the spelling takes the
 * typing, and a Shavian word picks the word.
 */
export default class Editor extends Component<EditorSignature> {
	get pieces() {
		return piecesOf(this.args.text, this.args.tokens);
	}

	// a closing newline needs a line in the marks too
	get trailingLine() {
		return this.args.text.endsWith('\n');
	}

	paste = async () => {
		const text = await navigator.clipboard
			.readText()
			.catch(() => '');
		if (text && !this.isDestroying) this.args.onInput(text);
	};

	clear = () => this.args.onInput('');

	<template>
		<div class="sh-picture">
			<div class="sh-picture-head">
				<span class="sh-picture-heading">English</span>
				<span class="sh-picture-tools">
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
			<div class="sh-picture-scroll">
				<MarkedEditor
					class="sh-picture-text"
					@text={{@text}}
					@placeholder="Type or paste"
					@label="English input"
					@interactive={{true}}
					@prose={{true}}
					@onInput={{@onInput}}
					{{reportHeight @onHeight}}
					{{fitGlosses this.pieces}}
				>
					{{~#each this.pieces as |piece|~}}
						{{~#if (isWord piece)~}}
							<span
								class="sh-word
									{{if
										piece.guess
										'sh-word--guess'
									}}
									{{if
										(isLit
											piece
											@selected
										)
										'sh-word--lit'
									}}"
							><span
									aria-hidden="true"
								>{{piece.text}}</span><button
									type="button"
									class="sh-gloss"
									aria-label={{piece.text}}
									aria-pressed={{if
										(isLit
											piece
											@selected
										)
										"true"
										"false"
									}}
									{{on
										"click"
										(fn
											@onWord
											piece.index
										)
									}}
								><span
										class="sh-gloss-marker"
									>{{piece.marker}}</span>{{piece.shavian}}</button></span>
						{{~else if piece.shavian~}}
							<span
								class="sh-word sh-word--mark"
								aria-hidden="true"
							>{{piece.text}}<span
									class="sh-gloss"
								>{{piece.shavian}}</span></span>
						{{~else~}}
							<span
								aria-hidden="true"
							>{{piece.text}}</span>
						{{~/if~}}
					{{~/each~}}
					{{~#if this.trailingLine~}}
						<span aria-hidden="true">
						</span>
					{{~/if~}}
				</MarkedEditor>
			</div>
		</div>
	</template>
}

function isWord(piece: Piece) {
	return piece.kind === 'word';
}

function isLit(piece: Piece, selected: number | null) {
	return piece.index === selected;
}
