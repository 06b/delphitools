import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonFigure from 'delphicanon/components/canon-figure';
import grabPan from 'delphicanon/modifiers/canon-grab-pan';
import Slot from 'delphitools-v2/components/tools/media/slot';
import {
	dragEdges,
	edgesAt,
	fit,
	isWhole,
	moved,
	nudged,
	reach,
	type Edges,
	type Point,
	type Rect,
	type Size,
} from 'delphitools-v2/components/tools/paste-image/crop';

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
		/** A drag ended. */
		onSettle: () => void;
	};
}

// iOS PasteImagePicture: room under the image for the size figure
const caption = 30;

const px = (value: number) => `${Math.round(value * 100) / 100}px`;

const box = ({ x, y, width, height }: Rect) =>
	htmlSafe(
		`left: ${px(x)}; top: ${px(y)}; width: ${px(width)}; height: ${px(height)}`,
	);

/**
 * The pasted image fitted to the pane with the crop over it: dimmed outside,
 * thirds inside, edges and corners drag, inside moves, the crop's size
 * under the image. The port of iOS PasteImagePicture on PDFCropCanvas.
 */
export default class Picture extends Component<PictureSignature> {
	@tracked area: Size = { width: 0, height: 0 };
	#grabbed?: Edges;
	#offset?: Point;

	get frame(): Rect {
		const { width, height } = this.area;
		return fit(this.args.pixels, {
			x: reach,
			y: reach,
			width: width - reach * 2,
			height: height - reach * 2,
		});
	}

	get scale() {
		return this.frame.width / Math.max(this.args.pixels.width, 1);
	}

	get shownCrop(): Rect {
		const { frame, scale } = this;
		const { x, y, width, height } = this.args.crop;
		return {
			x: frame.x + x * scale,
			y: frame.y + y * scale,
			width: width * scale,
			height: height * scale,
		};
	}

	get frameStyle() {
		return box(this.frame);
	}

	get cropStyle() {
		return box(this.shownCrop);
	}

	get shadeStyle() {
		const { frame } = this;
		const crop = this.shownCrop;
		return box({
			...crop,
			x: crop.x - frame.x,
			y: crop.y - frame.y,
		});
	}

	get figureStyle() {
		const { frame } = this;
		const centre = Math.min(
			frame.y + frame.height + reach / 2 + caption / 2,
			this.area.height + caption / 2,
		);
		return htmlSafe(`top: ${px(centre)}`);
	}

	get sizeText() {
		const { width, height } = this.args.crop;
		return `${Math.round(width)} × ${Math.round(height)}`;
	}

	get valueText() {
		const { x, y } = this.args.crop;
		return `${this.sizeText} px, ${Math.round(x)}, ${Math.round(y)}`;
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

	#pixel(event: PointerEvent): Point {
		const bounds = (
			event.currentTarget as HTMLElement
		).getBoundingClientRect();
		const { frame, scale } = this;
		const { pixels } = this.args;
		const clamp = (value: number, most: number) =>
			Math.min(Math.max(value, 0), most);
		return {
			x: clamp(
				(event.clientX - bounds.left - frame.x) /
					(scale || 1),
				pixels.width,
			),
			y: clamp(
				(event.clientY - bounds.top - frame.y) /
					(scale || 1),
				pixels.height,
			),
		};
	}

	// the whole image keeps the page scrolling
	grabs = (point: Point) => {
		if (!this.args.url) return false;
		const shown = this.shownCrop;
		const inside =
			point.x >= shown.x &&
			point.x <= shown.x + shown.width &&
			point.y >= shown.y &&
			point.y <= shown.y + shown.height;
		return (
			!!edgesAt(point, shown) ||
			(inside && !isWhole(this.args.crop, this.args.pixels))
		);
	};

	begin = (event: PointerEvent) => {
		const bounds = (
			event.currentTarget as HTMLElement
		).getBoundingClientRect();
		this.#grabbed = edgesAt(
			{
				x: event.clientX - bounds.left,
				y: event.clientY - bounds.top,
			},
			this.shownCrop,
		);
		if (this.#grabbed) return;
		const pixel = this.#pixel(event);
		const { crop } = this.args;
		this.#offset = { x: pixel.x - crop.x, y: pixel.y - crop.y };
	};

	drag = (event: PointerEvent) => {
		const pixel = this.#pixel(event);
		const { crop, pixels } = this.args;
		const offset = this.#offset;
		if (offset)
			this.args.onCrop(
				moved(
					crop,
					{
						x: pixel.x - offset.x,
						y: pixel.y - offset.y,
					},
					pixels,
				),
			);
		else if (this.#grabbed)
			this.args.onCrop(dragEdges(crop, this.#grabbed, pixel));
	};

	end = () => {
		this.#grabbed = undefined;
		this.#offset = undefined;
		this.args.onSettle();
	};

	key = (event: KeyboardEvent) => {
		const next = nudged(this.args.crop, this.args.pixels, event);
		if (!next) return;
		event.preventDefault();
		this.args.onCrop(next);
	};

	<template>
		<div class="pi-picture">
			{{#if @url}}
				<div
					class="pi-area"
					{{this.measure}}
					{{grabPan
						grabs=this.grabs
						onBegin=this.begin
						onMove=this.drag
						onEnd=this.end
					}}
				>
					{{#if this.area.width}}
						<img
							class="pi-image"
							src={{@url}}
							alt="Pasted content"
							draggable="false"
							style={{this.frameStyle}}
						/>
						<div
							class="pi-sheet"
							style={{this.frameStyle}}
						>
							<span
								class="pi-shade"
								style={{this.shadeStyle}}
							></span>
						</div>
						<span
							class="pi-crop"
							style={{this.cropStyle}}
							role="slider"
							tabindex="0"
							aria-label="Crop"
							aria-valuenow={{@crop.x}}
							aria-valuemin="0"
							aria-valuemax={{@pixels.width}}
							aria-valuetext={{this.valueText}}
							aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown"
							{{on
								"keydown"
								this.key
							}}
						>
							<span
								class="pi-corner pi-corner--nw"
							></span>
							<span
								class="pi-corner pi-corner--ne"
							></span>
							<span
								class="pi-corner pi-corner--sw"
							></span>
							<span
								class="pi-corner pi-corner--se"
							></span>
						</span>
					{{/if}}
				</div>
				<CanonFigure
					class="pi-figure"
					style={{this.figureStyle}}
					@text={{this.sizeText}}
					@unit="px"
					@size={{17}}
					@halo="var(--canon-muted)"
				/>
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
