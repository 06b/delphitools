import Component from '@glimmer/component';

/** Height of the canvas holding the block, as iOS SignatureBlockView. */
export const blockHeight = 128;

const padding = 16;
const top = 14;
const spine = blockHeight - 14 - 18 - 8;

export interface SignatureBlockSignature {
	Args: {
		sheets: number;
		/** First and last page of the signature. */
		from: number;
		to: number;
		/** 0-based lit sheet. */
		lit: number;
	};
	Element: SVGSVGElement;
}

/** The iOS SignatureBlockView for one nested signature: a U per sheet, the lit one bold. */
export default class SignatureBlock extends Component<SignatureBlockSignature> {
	get width() {
		return Math.min(120, Math.max(44, 20 + this.args.sheets * 7));
	}

	get viewBox() {
		return `0 0 ${this.width + padding * 2} ${blockHeight}`;
	}

	get label() {
		return `${this.args.from}–${this.args.to}`;
	}

	get centre() {
		return padding + this.width / 2;
	}

	get labelY() {
		return spine + 8;
	}

	get folds() {
		const count = Math.max(this.args.sheets, 1);
		const width = this.width;
		const step = Math.min(
			4,
			(width / 2 - 6) / count,
			(spine - top - 8) / count,
		);
		return Array.from({ length: this.args.sheets }, (_, inner) => {
			const inset = inner * step;
			const left = padding + inset;
			const right = padding + width - inset;
			const bottom = spine - inset;
			const r = Math.min(8, (right - left) / 2);
			return {
				d:
					`M${left} ${top}L${left} ${bottom - r}` +
					`Q${left} ${bottom} ${left + r} ${bottom}` +
					`L${right - r} ${bottom}` +
					`Q${right} ${bottom} ${right} ${bottom - r}` +
					`L${right} ${top}`,
				lit: inner === this.args.lit,
			};
		});
	}

	<template>
		<svg
			class="imp-block"
			viewBox={{this.viewBox}}
			role="img"
			aria-label={{this.label}}
			...attributes
		>
			{{#each this.folds as |fold|}}
				<path
					class="imp-block-sheet
						{{if
							fold.lit
							'imp-block-sheet--lit'
						}}"
					d={{fold.d}}
				/>
			{{/each}}
			<text
				class="imp-block-label"
				x={{this.centre}}
				y={{this.labelY}}
			>{{this.label}}</text>
		</svg>
	</template>
}
