import Component from '@glimmer/component';
import { htmlSafe } from '@ember/template';
import CanonFigure from 'delphicanon/components/canon-figure';
import CanonLoader from 'delphicanon/components/canon-loader';
import Slot from 'delphitools-v2/components/tools/media/slot';
import type { Geometry } from 'delphitools-v2/components/tools/scroll-genny/scroll';

export interface PictureSignature {
	Args: {
		geometry?: Geometry;
		/** Object URLs of the drawn slides; none shows the slot that takes a file. */
		slides: string[];
		busy: boolean;
		/** A file is dragged over the tool. */
		over: boolean;
		onFile: (file: File) => void;
	};
}

const pct = (value: number) => `${Math.round(value * 10000) / 100}%`;

/**
 * The slides side by side as the carousel shows them, fitted to the band:
 * dashed seams, dotted edges where the image meets the fill, a number on
 * each slide. The port of iOS ScrollCarouselPicture.
 */
export default class Picture extends Component<PictureSignature> {
	get strip() {
		const g = this.args.geometry;
		if (!g || !this.args.slides.length) return [];
		const width = g.tileWidth * g.slideCount;
		return [
			{
				// a new count draws a new strip, which fades in
				count: g.slideCount,
				style: htmlSafe(
					`--scroll-ratio: ${width / g.tileHeight}`,
				),
				label: `${g.slideCount} ${this.unit}`,
				seams: Array.from(
					{ length: g.slideCount - 1 },
					(_, i) =>
						htmlSafe(
							`inset-inline-start: ${pct((i + 1) / g.slideCount)}`,
						),
				),
				edges: g.needsFill
					? [
							g.imageStart,
							g.imageStart +
								g.imageWidth,
						].map((x) =>
							htmlSafe(
								`inset-inline-start: ${pct(x / width)}`,
							),
						)
					: [],
			},
		];
	}

	get slides() {
		return this.args.slides.map((url, index) => ({
			url,
			number: index + 1,
		}));
	}

	get unit() {
		return this.args.geometry?.slideCount === 1
			? 'slide'
			: 'slides';
	}

	<template>
		<div class="scroll-picture">
			<div class="scroll-area">
				{{#each this.strip key="count" as |strip|}}
					<figure
						class="scroll-strip"
						aria-label={{strip.label}}
						style={{strip.style}}
					>
						{{#each this.slides as |slide|}}
							<span
								class="scroll-slide"
							>
								<img
									src={{slide.url}}
									alt=""
									decoding="async"
								/>
								<span
									class="scroll-chip"
								>{{slide.number}}</span>
							</span>
						{{/each}}
						{{#each strip.seams as |seam|}}
							<span
								class="scroll-seam"
								style={{seam}}
							></span>
						{{/each}}
						{{#each strip.edges as |edge|}}
							<span
								class="scroll-edge"
								style={{edge}}
							></span>
						{{/each}}
					</figure>
				{{else}}
					<Slot
						class="scroll-slot"
						@prompt="Drop an image here"
						@icon="image"
						@accept="image/*"
						@dashed={{true}}
						@fills={{true}}
						@over={{@over}}
						@onFile={{@onFile}}
					/>
				{{/each}}
			</div>
			{{#if @geometry}}
				<CanonFigure
					class="scroll-figure"
					@text="{{@geometry.slideCount}}"
					@unit={{this.unit}}
					@halo="var(--canon-muted)"
				/>
			{{/if}}
			{{#if @busy}}
				<CanonLoader class="scroll-loader" />
			{{/if}}
		</div>
	</template>
}
