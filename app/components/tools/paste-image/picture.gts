import Component from '@glimmer/component';
import { htmlSafe } from '@ember/template';
import CanonFigure from 'delphicanon/components/canon-figure';
import CropRect from 'delphitools-v2/components/tools/media/crop-rect';
import Slot from 'delphitools-v2/components/tools/media/slot';
import { reach, type Rect, type Size } from 'delphitools-v2/lib/crop-rect';

export interface PictureSignature {
	Args: {
		/** Object URL of the pasted image; none shows the slot. */
		url?: string;
		pixels: Size;
		/** In image pixels. */
		crop: Rect;
		/** A file is dragged over the tool. */
		over: boolean;
		onFile: (file: File) => void;
		/** Every drag step and key, in image pixels. */
		onCrop: (crop: Rect) => void;
		/** A drag or key ended. */
		onSettle: () => void;
	};
}

// iOS PasteImagePicture: room under the image for the size figure
const caption = 30;

function figureStyle(frame: Rect, area: Size) {
	const centre = Math.min(
		frame.y + frame.height + reach / 2 + caption / 2,
		area.height + caption / 2,
	);
	return htmlSafe(`top: ${Math.round(centre * 100) / 100}px`);
}

/**
 * The pasted image under the crop, with thirds inside and the crop's size
 * under the image. The port of iOS PasteImagePicture on PDFCropCanvas.
 */
export default class Picture extends Component<PictureSignature> {
	get sizeText() {
		const { width, height } = this.args.crop;
		return `${Math.round(width)} × ${Math.round(height)}`;
	}

	get valueText() {
		const { x, y } = this.args.crop;
		return `${this.sizeText} px, ${Math.round(x)}, ${Math.round(y)}`;
	}

	<template>
		<div class="pi-picture">
			{{#if @url}}
				<CropRect
					class="pi-area"
					@url={{@url}}
					@alt="Pasted content"
					@size={{@pixels}}
					@crop={{@crop}}
					@valueText={{this.valueText}}
					@thirds={{true}}
					@onCrop={{@onCrop}}
					@onSettle={{@onSettle}}
					as |frame area|
				>
					<CanonFigure
						class="pi-figure"
						style={{figureStyle frame area}}
						@text={{this.sizeText}}
						@unit="px"
						@size={{17}}
						@halo="var(--canon-muted)"
					/>
				</CropRect>
			{{else}}
				<Slot
					class="pi-slot"
					@prompt="Press Ctrl/Cmd + V to paste"
					@icon="clipboard-paste"
					@accept="image/*"
					@dashed={{true}}
					@over={{@over}}
					@onFile={{@onFile}}
				/>
			{{/if}}
		</div>
	</template>
}
