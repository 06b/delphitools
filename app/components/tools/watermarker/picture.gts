import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import type Owner from '@ember/owner';
import { modifier } from 'ember-modifier';
import { IconSvg } from 'delphitools-v2/components/icon';
import {
	family,
	paint,
	zones,
	type Position,
	type Size,
	type WatermarkSpec,
} from 'delphitools-v2/components/tools/watermarker/watermark';

export interface PictureSignature {
	Args: {
		/** The decoded source; none shows the slot that takes a file. */
		base?: ImageBitmap;
		spec: WatermarkSpec;
		/** A file is dragged over the tool. */
		over: boolean;
		onChoose: () => void;
		onPosition: (position: Position) => void;
	};
}

// ponytail: preview drawn at most 2048 px across; the export draws full size
const previewSide = 2048;

const aspectStyle = (base?: Size) =>
	htmlSafe(
		`--wm-aspect: ${base ? `${base.width} / ${base.height}` : '4 / 3'}`,
	);

const draw = modifier(
	(
		canvas: HTMLCanvasElement,
		[base, spec]: [ImageBitmap, WatermarkSpec, number],
	) => {
		const source = { width: base.width, height: base.height };
		const share = Math.min(
			1,
			previewSide / Math.max(source.width, source.height),
		);
		const out = {
			width: Math.max(1, Math.round(source.width * share)),
			height: Math.max(1, Math.round(source.height * share)),
		};
		if (canvas.width !== out.width) canvas.width = out.width;
		if (canvas.height !== out.height) canvas.height = out.height;
		const context = canvas.getContext('2d');
		if (context) paint(context, base, source, out, spec);
	},
);

/**
 * The image with its watermark, drawn on every change, fitted to the pane.
 * Away from tiling, a press on a third of the image moves the watermark
 * there; marks show the other anchors. The port of iOS WatermarkPicture.
 */
export default class Picture extends Component<PictureSignature> {
	// redraws once the condensed bold has loaded
	@tracked fonts = 0;

	constructor(owner: Owner, args: PictureSignature['Args']) {
		super(owner, args);
		void document.fonts
			.load(`700 48px ${family}`)
			.then(() => this.fonts++);
	}

	get zones() {
		const { position } = this.args.spec;
		return zones.map((zone, index) => ({
			...zone,
			row: Math.floor(index / 3),
			column: index % 3,
			current: zone.id === position,
		}));
	}

	<template>
		<div class="wm-picture">
			<div class="wm-area">
				{{#if @base}}
					<div
						class="wm-box"
						style={{aspectStyle @base}}
					>
						<canvas
							class="wm-canvas"
							role="img"
							aria-label="Preview"
							{{draw
								@base
								@spec
								this.fonts
							}}
						></canvas>
						{{#unless @spec.tiling}}
							<div class="wm-zones">
								{{#each
									this.zones
									as |zone|
								}}
									<button
										type="button"
										tabindex="-1"
										class="wm-zone wm-zone--row{{zone.row}}
											wm-zone--column{{zone.column}}
											{{if
												zone.current
												'wm-zone--current'
											}}"
										aria-label={{zone.name}}
										{{on
											"click"
											(fn
												@onPosition
												zone.id
											)
										}}
									><span
											class="wm-mark"
										></span></button>
								{{/each}}
							</div>
						{{/unless}}
					</div>
				{{else}}
					<button
						type="button"
						class="wm-box wm-slot
							{{if
								@over
								'wm-slot--over'
							}}"
						style={{(aspectStyle)}}
						{{on "click" @onChoose}}
					>
						<span
							class="wm-slot-icon"
						><IconSvg
								@name="image"
							/></span>
						<span>Drop an image to watermark</span>
					</button>
				{{/if}}
			</div>
		</div>
	</template>
}
