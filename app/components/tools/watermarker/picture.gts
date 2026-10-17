import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { htmlSafe } from '@ember/template';
import type Owner from '@ember/owner';
import { modifier } from 'ember-modifier';
import { AnchorZones } from 'delphitools-v2/components/tools/media/anchors';
import Slot from 'delphitools-v2/components/tools/media/slot';
import {
	family,
	paint,
	type Size,
	type WatermarkSpec,
} from 'delphitools-v2/components/tools/watermarker/watermark';

export interface PictureSignature {
	Args: {
		/** The decoded source; none shows the slot that takes a file. */
		base?: ImageBitmap;
		spec: WatermarkSpec;
		/** The anchor in use, -1 for random. */
		zone: number;
		/** A file is dragged over the tool. */
		over: boolean;
		onChoose: () => void;
		onZone: (index: number) => void;
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
							<AnchorZones
								class="wm-zones"
								@current={{@zone}}
								@onPick={{@onZone}}
							/>
						{{/unless}}
					</div>
				{{else}}
					<div
						class="wm-box wm-box--empty"
						style={{(aspectStyle)}}
					>
						<Slot
							class="wm-slot"
							@prompt="Drop an image to watermark"
							@icon="image"
							@dashed={{true}}
							@fills={{true}}
							@over={{@over}}
							@onChoose={{@onChoose}}
						/>
					</div>
				{{/if}}
			</div>
		</div>
	</template>
}
