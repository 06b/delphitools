import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonLoupe from 'delphicanon/components/canon-loupe';
import { frame, type LoupeSides } from 'delphicanon/lib/loupe';
import grabPan from 'delphicanon/modifiers/canon-grab-pan';
import type { Rgb } from 'delphicanon/lib/colour';
import { IconSvg } from 'delphitools-v2/components/icon';
import {
	clampPixel,
	contains,
	fitRect,
	pixelAt,
	place,
	type Point,
	type Size,
} from 'delphitools-v2/components/tools/pixel-picker/geometry';

export type Move = 'hover' | 'drag' | 'tap' | 'key';

interface PixelPictureSignature {
	Args: {
		/** The full-size image; none shows the slot that takes a file. */
		canvas?: HTMLCanvasElement;
		pixel: Point;
		loupe?: ImageData;
		colour: Rgb;
		/** Read out as the reticle moves. */
		reading: string;
		onMove: (pixel: Point, how: Move) => void;
		/** The pointer left; the hover preview ends. */
		onLeave: () => void;
		onPick: () => void;
		onChoose: () => void;
	};
}

/** iOS PixelPickerPicture: 15 pixels across the loupe. */
const loupeRadius = 7;
const loupeSides = { min: 84, max: 128 };
const loupeGap = 28;
/** Points from the reticle centre that still grab it. */
const reach = 36;
const keySteps: Record<string, Point> = {
	ArrowLeft: { x: -1, y: 0 },
	ArrowRight: { x: 1, y: 0 },
	ArrowUp: { x: 0, y: -1 },
	ArrowDown: { x: 0, y: 1 },
};

type Grab =
	| { kind: 'crosshair'; offset: Point }
	| { kind: 'loupe'; from: Point; at: Point };

const Eyedropper = <template><IconSvg @name="pipette" /></template>;

/**
 * The image fitted to the pane with a reticle on the sampled pixel and a
 * loupe beside it. A tap or click moves the reticle there and picks; the
 * reticle and the loupe drag; a mouse previews by hovering; the arrow
 * keys move one pixel (Shift: ten) and Enter picks.
 */
export default class PixelPicture extends Component<PixelPictureSignature> {
	@tracked area: Size = { width: 0, height: 0 };
	@tracked sides?: LoupeSides;
	@tracked eases = false;
	#grab?: Grab;
	#dragged = false;

	get image(): Size {
		const { canvas } = this.args;
		return canvas
			? { width: canvas.width, height: canvas.height }
			: { width: 0, height: 0 };
	}

	get fit() {
		return fitRect(this.area, this.image);
	}

	get centre() {
		return place(this.args.pixel, this.fit, this.image);
	}

	get loupeFrame() {
		const side = Math.min(
			Math.max(this.area.height * 0.5, loupeSides.min),
			loupeSides.max,
		);
		return frame(
			this.centre,
			side,
			loupeGap,
			this.area,
			8,
			this.sides,
		);
	}

	get imageStyle() {
		const { x, y, width, height } = this.fit;
		return htmlSafe(
			`left: ${x}px; top: ${y}px; width: ${width}px; height: ${height}px`,
		);
	}

	get magnified() {
		return this.fit.width > this.image.width;
	}

	get reticleStyle() {
		const { x, y } = this.centre;
		return htmlSafe(`translate: ${x}px ${y}px`);
	}

	get loupeStyle() {
		const { x, y, width } = this.loupeFrame;
		return htmlSafe(
			`translate: ${x}px ${y}px; --canon-loupe-side: ${width}px`,
		);
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

	show = modifier((box: HTMLElement, [canvas]: [HTMLCanvasElement]) => {
		box.replaceChildren(canvas);
	});

	#local(event: PointerEvent | MouseEvent, element: HTMLElement): Point {
		const box = element.getBoundingClientRect();
		return {
			x: event.clientX - box.left,
			y: event.clientY - box.top,
		};
	}

	#move(pixel: Point, how: Move) {
		this.eases = how === 'tap';
		this.args.onMove(clampPixel(pixel, this.image), how);
	}

	grabs = (point: Point) => {
		if (!this.args.canvas) return false;
		const loupe = this.loupeFrame;
		if (contains(loupe, point)) return true;
		const { x, y } = this.centre;
		return Math.hypot(point.x - x, point.y - y) < reach;
	};

	begin = (event: PointerEvent) => {
		const point = this.#local(
			event,
			event.currentTarget as HTMLElement,
		);
		const loupe = this.loupeFrame;
		const { x, y } = this.centre;
		this.#grab = contains(loupe, point)
			? { kind: 'loupe', from: this.args.pixel, at: point }
			: {
					kind: 'crosshair',
					offset: {
						x: point.x - x,
						y: point.y - y,
					},
				};
		this.#dragged = false;
		this.sides = {
			left: loupe.x + loupe.width / 2 < x,
			above: loupe.y + loupe.height / 2 < y,
		};
	};

	drag = (event: PointerEvent) => {
		const grab = this.#grab;
		if (!grab) return;
		const point = this.#local(
			event,
			event.currentTarget as HTMLElement,
		);
		this.#dragged = true;
		if (grab.kind === 'crosshair') {
			this.#move(
				pixelAt(
					{
						x: point.x - grab.offset.x,
						y: point.y - grab.offset.y,
					},
					this.fit,
					this.image,
				),
				'drag',
			);
			return;
		}
		// one image pixel per loupe cell
		const cell = this.loupeFrame.width / (loupeRadius * 2 + 1);
		this.#move(
			{
				x:
					grab.from.x +
					Math.round(
						(point.x - grab.at.x) / cell,
					),
				y:
					grab.from.y +
					Math.round(
						(point.y - grab.at.y) / cell,
					),
			},
			'drag',
		);
	};

	end = () => {
		this.#grab = undefined;
		this.sides = undefined;
	};

	hover = (event: PointerEvent) => {
		if (
			event.pointerType !== 'mouse' ||
			event.buttons ||
			this.#grab
		)
			return;
		const point = this.#local(
			event,
			event.currentTarget as HTMLElement,
		);
		if (
			contains(this.fit, point) &&
			!contains(this.loupeFrame, point)
		)
			this.#move(
				pixelAt(point, this.fit, this.image),
				'hover',
			);
	};

	tap = (event: MouseEvent) => {
		if (!this.args.canvas) return;
		if (this.#dragged) {
			this.#dragged = false;
			return;
		}
		const point = this.#local(
			event,
			event.currentTarget as HTMLElement,
		);
		if (
			!contains(this.fit, point) ||
			contains(this.loupeFrame, point)
		)
			return;
		this.#move(pixelAt(point, this.fit, this.image), 'tap');
		this.args.onPick();
	};

	key = (event: KeyboardEvent) => {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			this.args.onPick();
			return;
		}
		const step = keySteps[event.key];
		if (!step) return;
		event.preventDefault();
		const by = event.shiftKey ? 10 : 1;
		const { pixel } = this.args;
		this.#move(
			{ x: pixel.x + step.x * by, y: pixel.y + step.y * by },
			'key',
		);
	};

	<template>
		<div class="pp-picture">
			{{#if @canvas}}
				{{! template-lint-disable no-invalid-interactive }}
				<div
					class="pp-area
						{{if
							this.eases
							'pp-area--eases'
						}}"
					tabindex="0"
					role="group"
					aria-label="Image"
					aria-keyshortcuts="ArrowLeft ArrowRight ArrowUp ArrowDown Enter"
					{{this.measure}}
					{{grabPan
						grabs=this.grabs
						onBegin=this.begin
						onMove=this.drag
						onEnd=this.end
					}}
					{{on "pointermove" this.hover}}
					{{on "pointerleave" @onLeave}}
					{{on "click" this.tap}}
					{{on "keydown" this.key}}
				>
					<div
						class="pp-image
							{{if
								this.magnified
								'pp-image--magnified'
							}}"
						style={{this.imageStyle}}
						{{this.show @canvas}}
					></div>
					<svg
						class="pp-reticle"
						style={{this.reticleStyle}}
						viewBox="0 0 40 40"
						aria-hidden="true"
					><path
							d="M25 20H35M15 20H5M20 25V35M20 15V5"
						/></svg>
					<div
						class="pp-loupe"
						style={{this.loupeStyle}}
					>
						<CanonLoupe
							@pixels={{@loupe}}
							@colour={{@colour}}
						/>
					</div>
					<output
						class="pp-reading"
						aria-live="polite"
					>{{@reading}}</output>
				</div>
			{{else}}
				<button
					type="button"
					class="pp-slot"
					{{on "click" @onChoose}}
				>
					<span class="pp-slot-icon"><Eyedropper
						/></span>
					<span>Drop an image</span>
				</button>
			{{/if}}
		</div>
	</template>
}
