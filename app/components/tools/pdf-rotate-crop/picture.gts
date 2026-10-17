import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonLoader from 'delphicanon/components/canon-loader';
import grabPan from 'delphicanon/modifiers/canon-grab-pan';
import { MM_TO_POINTS } from 'delphitools-v2/lib/imposition';
import {
	dragEdges,
	edgesAt,
	fit,
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

const px = (value: number) => `${Math.round(value * 100) / 100}px`;

const box = ({ x, y, width, height }: Rect) =>
	htmlSafe(
		`left: ${px(x)}; top: ${px(y)}; width: ${px(width)}; height: ${px(height)}`,
	);

const mm = (points: number) => Math.round(points / MM_TO_POINTS);

/**
 * The page fitted to the pane with the crop over it: dimmed outside, edges
 * and corners drag, inside moves, arrow keys nudge. The port of iOS
 * PDFCropCanvas, on the paste-image crop maths.
 */
export default class Picture extends Component<PictureSignature> {
	@tracked area: Size = { width: 0, height: 0 };
	#grabbed?: Edges;
	#offset?: Point;

	get size() {
		return this.args.size ?? A4;
	}

	get frame(): Rect {
		const { width, height } = this.area;
		return fit(this.size, {
			x: reach,
			y: reach,
			width: width - reach * 2,
			height: height - reach * 2,
		});
	}

	get scale() {
		return this.frame.width / Math.max(this.size.width, 1);
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

	get whole() {
		const { crop } = this.args;
		const { size } = this;
		return (
			crop.width >= size.width - 1 &&
			crop.height >= size.height - 1
		);
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

	get valueText() {
		const { x, y, width, height } = this.args.crop;
		return `${mm(width)} × ${mm(height)} mm, ${mm(x)}, ${mm(y)}`;
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

	#point(event: PointerEvent): Point {
		const bounds = (
			event.currentTarget as HTMLElement
		).getBoundingClientRect();
		const { frame, size } = this;
		const scale = this.scale || 1;
		const clamp = (value: number, most: number) =>
			Math.min(Math.max(value, 0), most);
		return {
			x: clamp(
				(event.clientX - bounds.left - frame.x) / scale,
				size.width,
			),
			y: clamp(
				(event.clientY - bounds.top - frame.y) / scale,
				size.height,
			),
		};
	}

	// uncropped: pane keeps scrolling
	grabs = (point: Point) => {
		if (!this.args.url) return false;
		const shown = this.shownCrop;
		const inside =
			point.x >= shown.x &&
			point.x <= shown.x + shown.width &&
			point.y >= shown.y &&
			point.y <= shown.y + shown.height;
		return !!edgesAt(point, shown) || (inside && !this.whole);
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
		const point = this.#point(event);
		const { crop } = this.args;
		this.#offset = { x: point.x - crop.x, y: point.y - crop.y };
	};

	drag = (event: PointerEvent) => {
		const point = this.#point(event);
		const { crop } = this.args;
		const offset = this.#offset;
		if (offset)
			this.args.onCrop(
				moved(
					crop,
					{
						x: point.x - offset.x,
						y: point.y - offset.y,
					},
					this.size,
				),
			);
		else if (this.#grabbed)
			this.args.onCrop(dragEdges(crop, this.#grabbed, point));
	};

	end = () => {
		this.#grabbed = undefined;
		this.#offset = undefined;
		this.args.onSettle();
	};

	key = (event: KeyboardEvent) => {
		const next = nudged(this.args.crop, this.size, event);
		if (!next) return;
		event.preventDefault();
		this.args.onCrop(next);
		this.args.onSettle();
	};

	<template>
		<div
			class="prc-picture"
			{{this.measure}}
			{{grabPan
				grabs=this.grabs
				onBegin=this.begin
				onMove=this.drag
				onEnd=this.end
			}}
		>
			{{#if this.area.width}}
				{{#if @url}}
					<img
						class="prc-image"
						src={{@url}}
						alt="Page preview"
						draggable="false"
						style={{this.frameStyle}}
					/>
					<div
						class="prc-sheet"
						style={{this.frameStyle}}
					>
						<span
							class="prc-shade"
							style={{this.shadeStyle}}
						></span>
					</div>
					<span
						class="prc-crop"
						style={{this.cropStyle}}
						role="slider"
						tabindex="0"
						aria-label="Crop"
						aria-valuenow={{@crop.x}}
						aria-valuemin="0"
						aria-valuemax={{this.size.width}}
						aria-valuetext={{this.valueText}}
						aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Alt+ArrowLeft Alt+ArrowRight Alt+ArrowUp Alt+ArrowDown"
						{{on "keydown" this.key}}
					>
						<span
							class="prc-corner prc-corner--nw"
						></span>
						<span
							class="prc-corner prc-corner--ne"
						></span>
						<span
							class="prc-corner prc-corner--sw"
						></span>
						<span
							class="prc-corner prc-corner--se"
						></span>
					</span>
				{{else}}
					<span
						class="prc-blank"
						style={{this.frameStyle}}
					></span>
					{{#if @size}}
						<span
							class="prc-loader"
						><CanonLoader /></span>
					{{/if}}
				{{/if}}
			{{/if}}
		</div>
	</template>
}
