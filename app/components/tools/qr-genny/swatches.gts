import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';

export interface Swatch {
	title: string;
	/** CSS colour behind the drawing; none: a checked transparent paper. */
	paper?: string;
	/** Draws the look into a square of `side` px from the origin. */
	draw: (context: CanvasRenderingContext2D, side: number) => void;
}

interface SwatchesSignature {
	Args: {
		items: Swatch[];
		/** None lights no cell. */
		selected?: number;
		label: string;
		onChange: (index: number) => void;
	};
	Element: HTMLDivElement;
}

// iOS: a 40 pt preview, the drawing inset 6
const preview = 40;
const inset = 6;

const paint = modifier((canvas: HTMLCanvasElement, [item]: [Swatch]) => {
	const scale = window.devicePixelRatio || 1;
	canvas.width = preview * scale;
	canvas.height = preview * scale;
	const context = canvas.getContext('2d');
	if (!context) return;
	context.setTransform(scale, 0, 0, scale, 0, 0);
	context.clearRect(0, 0, preview, preview);
	if (item.paper) {
		context.fillStyle = item.paper;
		context.fillRect(0, 0, preview, preview);
	}
	context.translate(inset, inset);
	item.draw(context, preview - 2 * inset);
});

/**
 * A choice of looks, each cell a small drawing on its own paper over the
 * look's name, the chosen cell lit. As many columns as fit, three to six.
 * The port of iOS QRStyleSwatches.
 */
export default class Swatches extends Component<SwatchesSignature> {
	get cells() {
		return this.args.items.map((item, index) => ({
			item,
			index,
			selected: index === this.args.selected,
		}));
	}

	<template>
		<div
			class="qr-swatches"
			role="group"
			aria-label={{@label}}
			...attributes
		>
			{{#each this.cells as |cell|}}
				<button
					type="button"
					class="qr-swatch
						{{if
							cell.selected
							'qr-swatch--selected'
						}}"
					aria-pressed={{if
						cell.selected
						"true"
						"false"
					}}
					{{on "click" (fn @onChange cell.index)}}
				>
					{{! a hidden drawing, not a control }}
					{{! template-lint-disable no-nested-interactive }}
					<canvas
						class="qr-swatch-preview
							{{unless
								cell.item.paper
								'qr-swatch-preview--clear'
							}}"
						aria-hidden="true"
						{{paint cell.item}}
					></canvas>
					<span
						class="qr-swatch-title"
					>{{cell.item.title}}</span>
				</button>
			{{/each}}
		</div>
	</template>
}
