import Component from '@glimmer/component';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonFigure from 'delphicanon/components/canon-figure';
import {
	failed,
	pieces,
	railLevels,
	type Piece,
	type RegexOutcome,
} from 'delphitools-v2/components/tools/regex-tester/regex';

interface PictureSignature {
	Args: {
		text: string;
		outcome: RegexOutcome;
		/** The picture's own height in px at its current width. */
		onHeight: (height: number) => void;
	};
}

// px under the descender: rail gap, then one pitch per level
const railGap = 3;
const railPitch = 5;
const railRoom = railGap + railLevels * railPitch;

const colour = (level: number) =>
	level === 0 ? 'var(--canon-primary)' : `var(--rx-group-${level})`;

function pieceStyle(piece: Piece) {
	const layers: string[] = [];
	for (const { level, starts, ends } of piece.rails) {
		const c = colour(level);
		const top = railGap + (level - 1) * railPitch;
		const fill = `linear-gradient(${c}, ${c})`;
		// positions count up from the bottom of the padding box
		layers.push(
			`${fill} 0 calc(100% - ${railRoom - top - 2}px) / 100% 2px no-repeat padding-box`,
		);
		if (starts)
			layers.push(
				`${fill} 0 calc(100% - ${railRoom - top}px) / 1.5px 4px no-repeat padding-box`,
			);
		if (ends)
			layers.push(
				`${fill} 100% calc(100% - ${railRoom - top}px) / 1.5px 4px no-repeat padding-box`,
			);
	}
	if (piece.shade)
		layers.push(
			`linear-gradient(var(--rx-hit-${piece.shade}), var(--rx-hit-${piece.shade})) content-box`,
		);
	if (!layers.length) return undefined;
	const room = piece.rails.length
		? `padding-block-end: ${railRoom}px; `
		: '';
	return htmlSafe(`${room}background: ${layers.join(', ')}`);
}

// .rx-picture-head: 6 px over a 44 px head
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

// iOS MarkedTextView.reveal: first match into view
const revealFirst = modifier((scroller: HTMLElement, [key]: [unknown]) => {
	void key;
	const hit = scroller.querySelector<HTMLElement>('.rx-hit, .rx-caret');
	if (!hit) return;
	const top = hit.offsetTop - scroller.offsetTop;
	const visible =
		top >= scroller.scrollTop &&
		top <
			scroller.scrollTop +
				scroller.clientHeight -
				hit.offsetHeight;
	if (!visible) scroller.scrollTop = Math.max(0, top - 12);
});

/**
 * The test string with every match lit in place, neighbouring matches in two
 * shades, each capture group bracketed under its text in its own colour and
 * level, a zero-width match as a caret; the match count as a figure above.
 */
export default class Picture extends Component<PictureSignature> {
	get matched() {
		const { outcome } = this.args;
		return outcome.kind === 'matched' ? outcome : undefined;
	}

	get failed() {
		return failed(this.args.outcome);
	}

	get count() {
		return this.matched?.matches.length ?? 0;
	}

	get groups() {
		return this.matched?.groups ?? 0;
	}

	get countText() {
		return String(this.count);
	}

	get groupsText() {
		return String(this.groups);
	}

	get word() {
		if (this.failed) return 'Invalid';
		return this.matched?.truncated ? 'Matches+' : 'Matches';
	}

	get figureColour() {
		if (this.failed) return 'var(--canon-destructive)';
		return this.count > 0
			? 'var(--canon-primary)'
			: 'var(--canon-muted-foreground)';
	}

	get pieces() {
		return pieces(this.args.text, this.matched?.matches ?? []);
	}

	get textStyle() {
		const levels = Math.min(this.groups, railLevels);
		const gap = 6 + (levels > 0 ? levels * railPitch + 2 : 0);
		return htmlSafe(`--rx-line-gap: ${gap}px`);
	}

	<template>
		<div class="rx-picture">
			<div class="rx-picture-head">
				<span class="rx-picture-figure">
					<CanonFigure
						@text={{this.countText}}
						@size={{26}}
						@colour={{this.figureColour}}
					/>
					<span
						class="rx-picture-word
							{{if
								this.failed
								'rx-picture-word--failed'
							}}"
					>{{this.word}}</span>
				</span>
				{{#if this.groups}}
					<span class="rx-picture-figure">
						<CanonFigure
							@text={{this.groupsText}}
							@size={{26}}
							@colour="var(--canon-foreground)"
						/>
						<span
							class="rx-picture-word"
						>Groups</span>
					</span>
				{{/if}}
			</div>
			{{#if @text}}
				<div
					class="rx-picture-scroll"
					{{revealFirst this.pieces}}
				>
					<div
						class="rx-picture-text"
						style={{this.textStyle}}
						{{reportHeight @onHeight}}
					>
						{{~#each
							this.pieces
							as |piece|
						~}}
							{{~#if
								(isCaret piece)
							~}}
								<span
									class="rx-caret"
									style={{caretStyle
										piece
									}}
								></span>
							{{~else~}}
								<span
									class={{if
										piece.shade
										"rx-hit"
									}}
									style={{pieceStyle
										piece
									}}
								>{{piece.text}}</span>
							{{~/if~}}
						{{~/each~}}
					</div>
				</div>
			{{else}}
				<div
					class="rx-picture-blank"
					{{reportHeight @onHeight}}
				>
					<div class="rx-picture-blank-box">Test
						String</div>
				</div>
			{{/if}}
		</div>
	</template>
}

function isCaret(piece: Piece) {
	return piece.caret !== undefined;
}

function caretStyle(piece: Piece) {
	return htmlSafe(`--rx-caret: ${colour(piece.caret ?? 0)}`);
}
