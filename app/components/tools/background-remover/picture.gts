import type { TOC } from '@ember/component/template-only';
import type { SafeString } from '@ember/template';
import type { ModifierLike } from '@glint/template';
import { htmlSafe } from '@ember/template';
import CanonLoader from 'delphicanon/components/canon-loader';
import Slot from 'delphitools-v2/components/tools/media/slot';

interface CutoutPictureSignature {
	Args: {
		/** Object URL of the source; none shows the slot that takes a file. */
		source?: string | null;
		width?: number;
		height?: number;
		/** The cut-out is ready: `cut` draws it on a canvas and takes the brush. */
		done?: boolean;
		cut?: ModifierLike<{ Element: HTMLCanvasElement }>;
		/** Where the brush ring is, over the picture. */
		ring?: SafeString;
		/** CSS colour behind the cut-out; none shows the checks. */
		fill?: string;
		busy: boolean;
		/** A file is dragged over the tool. */
		over: boolean;
		onChoose: () => void;
	};
}

const boxStyle = (width = 4, height = 3, fill?: string) =>
	htmlSafe(
		[
			`--cutout-aspect: ${width} / ${height}`,
			fill && `--cutout-fill: ${fill}`,
		]
			.filter(Boolean)
			.join('; '),
	);

/**
 * The source fitted to the pane over checks, the cut-out laid on it while
 * the source fades to a trace. The port of iOS CutoutPicture.
 */
const CutoutPicture: TOC<CutoutPictureSignature> = <template>
	<div class="cutout-picture">
		<div class="cutout-area">
			{{#if @source}}
				<div
					class="cutout-box
						{{if
							@fill
							'cutout-box--filled'
						}}
						{{if @done 'cutout-box--done'}}"
					style={{boxStyle @width @height @fill}}
				>
					<span
						class="cutout-name"
						role="img"
						aria-label="Preview"
					></span>
					<img
						class="cutout-ghost"
						src={{@source}}
						alt=""
					/>
					{{#if @done}}
						<canvas
							class="cutout-cut"
							{{@cut}}
						></canvas>
						{{#if @ring}}
							<span
								class="cutout-ring"
								style={{@ring}}
							></span>
						{{/if}}
					{{/if}}
				</div>
			{{else}}
				<div
					class="cutout-box cutout-box--empty"
					style={{(boxStyle)}}
				>
					<Slot
						class="cutout-slot"
						@prompt="Drop an image here"
						@icon="image"
						@dashed={{true}}
						@fills={{true}}
						@over={{@over}}
						@onChoose={{@onChoose}}
					/>
				</div>
			{{/if}}
		</div>
		{{#if @busy}}
			<CanonLoader class="cutout-loader" />
		{{/if}}
	</div>
</template>;

export default CutoutPicture;
