import Component from '@glimmer/component';
import CanonLoader from 'delphicanon/components/canon-loader';
import CropRect, { box } from 'delphitools-v2/components/tools/media/crop-rect';
import { MM_TO_POINTS } from 'delphitools-v2/lib/imposition';
import type { Rect, Size } from 'delphitools-v2/lib/crop-rect';

export interface PictureSignature {
	Args: {
		/** The page drawn at its shown rotation; none while it draws. */
		url?: string;
		/** Display points; none before a file, which shows a blank A4. */
		size?: Size;
		/** Display points. */
		crop: Rect;
		/** Every drag step and key, display points. */
		onCrop: (crop: Rect) => void;
		/** A drag or key ended. */
		onSettle: () => void;
	};
}

const A4 = { width: 595.28, height: 841.89 };

const mm = (points: number) => Math.round(points / MM_TO_POINTS);

/** The page fitted to the pane with the crop over it; a blank A4 before a file. */
export default class Picture extends Component<PictureSignature> {
	get size() {
		return this.args.size ?? A4;
	}

	get valueText() {
		const { x, y, width, height } = this.args.crop;
		return `${mm(width)} × ${mm(height)} mm, ${mm(x)}, ${mm(y)}`;
	}

	<template>
		<CropRect
			class="prc-picture"
			@url={{@url}}
			@alt="Page preview"
			@size={{this.size}}
			@crop={{@crop}}
			@valueText={{this.valueText}}
			@onCrop={{@onCrop}}
			@onSettle={{@onSettle}}
			as |frame|
		>
			{{#unless @url}}
				<span
					class="prc-blank"
					style={{box frame}}
				></span>
				{{#if @size}}
					<span class="prc-loader"><CanonLoader
						/></span>
				{{/if}}
			{{/unless}}
		</CropRect>
	</template>
}
