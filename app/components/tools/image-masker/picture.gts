import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonDimensionLine from 'delphicanon/components/canon-dimension-line';
import CanonLoader from 'delphicanon/components/canon-loader';
import { dimensionLine, dimensionLines } from 'delphicanon/lib/dimension-line';
import grabPan from 'delphicanon/modifiers/canon-grab-pan';
import { IconSvg } from 'delphitools-v2/components/icon';
import Slot from 'delphitools-v2/components/tools/media/slot';
import {
	imageFrame,
	paint,
	type Cut,
	type Rect,
	type Size,
	type View,
} from 'delphitools-v2/components/tools/image-masker/mask';

export interface PictureSignature {
	Args: {
		/** The decoded source; none shows the grey shape under the slot. */
		image?: HTMLImageElement;
		/** Object URL of the source, for the faint image outside the cut. */
		url?: string;
		cut: Cut;
		/** The shape's path for the outline; a custom SVG has none. */
		outline?: string;
		view: View;
		/** The export side, for the dimension line. */
		side: number;
		label: string;
		busy: boolean;
		/** A file is dragged over the tool. */
		over: boolean;
		onChoose: () => void;
		/** Moves the image by a share of the square's side. */
		onMove: (x: number, y: number) => void;
		/** Multiplies the zoom. */
		onZoom: (factor: number) => void;
	};
}

// a drag grabs this far outside the square, as iOS has it
const reach = 8;
const gap = 8;
// ponytail: the iOS 1.8 x hint width, with the hint measured once at about 135 px
const hintRoom = 240;
// ponytail: the preview canvas is capped at 2048 px; the export draws full size
const previewCap = 2048;

const px = (value: number) => `${Math.round(value * 100) / 100}px`;

const box = ({ x, y, width, height }: Rect) =>
	htmlSafe(
		`left: ${px(x)}; top: ${px(y)}; width: ${px(width)}; height: ${px(height)}`,
	);

const draw = modifier(
	(
		canvas: HTMLCanvasElement,
		[cut, image, view, length]: [
			Cut,
			HTMLImageElement | undefined,
			View,
			number,
		],
	) => {
		const pixels = Math.min(
			previewCap,
			Math.max(1, Math.round(length * devicePixelRatio)),
		);
		if (canvas.width !== pixels) canvas.width = pixels;
		if (canvas.height !== pixels) canvas.height = pixels;
		const context = canvas.getContext('2d');
		if (context) paint(context, pixels, cut, image, view);
	},
);

/**
 * The cut as the export writes it, in a square fitted to the pane under a
 * dimension line for its side, the image faint outside the cut, the shape
 * outlined. A drag moves the image, the wheel zooms it. The port of iOS
 * MaskBoard.
 */
export default class Picture extends Component<PictureSignature> {
	@tracked area: Size = { width: 0, height: 0 };
	@tracked dragging = false;
	#last?: { x: number; y: number };

	get square(): Rect {
		const room = dimensionLine.height + gap;
		const { width, height } = this.area;
		const length = Math.max(0, Math.min(width, height - room));
		return {
			x: Math.round((width - length) / 2),
			y: Math.round(room + (height - room - length) / 2),
			width: length,
			height: length,
		};
	}

	get squareStyle() {
		return box(this.square);
	}

	get acrossStyle() {
		return box(
			dimensionLines(this.square, this.square, gap).across,
		);
	}

	get ghostStyle() {
		const { image, view } = this.args;
		if (!image) return undefined;
		const { square } = this;
		const frame = imageFrame(image, square.width, view);
		return box({
			...frame,
			x: frame.x + square.x,
			y: frame.y + square.y,
		});
	}

	get hintShown() {
		return (
			!!this.args.image &&
			!this.dragging &&
			this.square.width > hintRoom
		);
	}

	get name() {
		const { side } = this.args;
		return `${this.args.label}, ${side} × ${side} px`;
	}

	get valueNow() {
		return Math.round(this.args.view.x * 100);
	}

	get valueText() {
		const { x, y } = this.args.view;
		return `${Math.round(x * 100)} %, ${Math.round(y * 100)} %`;
	}

	measure = modifier((element: HTMLElement) => {
		const observer = new ResizeObserver(() => {
			this.area = {
				width: element.clientWidth,
				height: element.clientHeight,
			};
		});
		observer.observe(element);
		return () => observer.disconnect();
	});

	grabs = ({ x, y }: { x: number; y: number }) => {
		if (!this.args.image) return false;
		const { square } = this;
		return (
			x >= square.x - reach &&
			y >= square.y - reach &&
			x <= square.x + square.width + reach &&
			y <= square.y + square.height + reach
		);
	};

	begin = (event: PointerEvent) => {
		this.#last = { x: event.clientX, y: event.clientY };
		this.dragging = true;
	};

	drag = (event: PointerEvent) => {
		const last = this.#last;
		if (!last) return;
		this.#last = { x: event.clientX, y: event.clientY };
		const length = Math.max(this.square.width, 1);
		this.args.onMove(
			(event.clientX - last.x) / length,
			(event.clientY - last.y) / length,
		);
	};

	end = () => {
		this.#last = undefined;
		this.dragging = false;
	};

	wheel = (event: WheelEvent) => {
		if (!this.args.image) return;
		event.preventDefault();
		this.args.onZoom(Math.exp(-event.deltaY * 0.002));
	};

	key = (event: KeyboardEvent) => {
		// a hundredth of the side a press, a tenth with Shift
		const step = event.shiftKey ? 0.1 : 0.01;
		const arrows: Record<string, [number, number]> = {
			ArrowLeft: [-step, 0],
			ArrowRight: [step, 0],
			ArrowUp: [0, -step],
			ArrowDown: [0, step],
		};
		const arrow = arrows[event.key];
		if (!arrow) return;
		event.preventDefault();
		this.args.onMove(...arrow);
	};

	<template>
		<div
			class="masker-picture
				{{if @image 'masker-picture--image'}}
				{{if this.dragging 'masker-picture--dragging'}}"
		>
			<div
				class="masker-area"
				{{this.measure}}
				{{grabPan
					grabs=this.grabs
					onBegin=this.begin
					onMove=this.drag
					onEnd=this.end
				}}
				{{on "wheel" this.wheel passive=false}}
			>
				{{#if this.area.width}}
					<span
						class="masker-checks"
						style={{this.squareStyle}}
					></span>
					{{#if @url}}
						<img
							class="masker-ghost"
							src={{@url}}
							alt=""
							draggable="false"
							style={{this.ghostStyle}}
						/>
					{{/if}}
					<canvas
						class="masker-canvas"
						role="img"
						aria-label={{this.name}}
						style={{this.squareStyle}}
						{{draw
							@cut
							@image
							@view
							this.square.width
						}}
					></canvas>
					{{#if @outline}}
						<svg
							class="masker-edge"
							viewBox="0 0 100 100"
							aria-hidden="true"
							style={{this.squareStyle}}
						><path d={{@outline}} /></svg>
					{{/if}}
					<CanonDimensionLine
						class="masker-dimension"
						@pixels={{@side}}
						style={{this.acrossStyle}}
					/>
					{{#if @image}}
						<span
							class="masker-handle"
							style={{this.squareStyle}}
							role="slider"
							tabindex="0"
							aria-label="Position"
							aria-valuenow={{this.valueNow}}
							aria-valuetext={{this.valueText}}
							aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown"
							{{on
								"keydown"
								this.key
							}}
						></span>
						<span
							class="masker-hint-box"
							style={{this.squareStyle}}
							aria-hidden="true"
						>
							<span
								class="masker-hint
									{{if
										this.hintShown
										'masker-hint--shown'
									}}"
							><IconSvg
									@name="move"
								/>Drag to
								reposition</span>
						</span>
					{{else}}
						<span
							class="masker-empty"
							style={{this.squareStyle}}
						>
							<Slot
								class="masker-slot"
								@prompt="Drop an image"
								@icon="image"
								@dashed={{true}}
								@fills={{true}}
								@over={{@over}}
								@onChoose={{@onChoose}}
							/>
						</span>
					{{/if}}
				{{/if}}
			</div>
			{{#if @busy}}
				<CanonLoader class="masker-loader" />
			{{/if}}
		</div>
	</template>
}
