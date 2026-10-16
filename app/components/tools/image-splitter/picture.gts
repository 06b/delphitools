import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonMenu, {
	type CanonMenuEntry,
	type CanonMenuItem,
} from 'delphicanon/components/canon-menu';
import Slot from 'delphitools-v2/components/tools/media/slot';
import {
	cellRect,
	cells,
	frames,
	seamFor,
	tileSize,
	tuning,
	type Cell,
	type Size,
} from 'delphitools-v2/components/tools/image-splitter/split';

export interface PictureSignature {
	Args: {
		/** Object URL of the source; none shows the slot that takes a file. */
		url?: string;
		pixels: Size;
		rows: number;
		cols: number;
		/** Seams closed, before a new cut springs open. */
		joined: boolean;
		springs: boolean;
		over: boolean;
		menu: CanonMenuEntry[];
		onChoose: () => void;
		onPick: (cell: Cell, item: CanonMenuItem) => void;
	};
}

const px = (value: number) => `${Math.round(value * 100) / 100}px`;
const percent = (value: number) => `${Math.round(value * 10000) / 100}%`;

/**
 * The image cut into its tiles and pulled apart at the seams, each tile a
 * button whose menu downloads or copies it. The port of iOS
 * ImageSplitterPicture.
 */
export default class Picture extends Component<PictureSignature> {
	@tracked area: Size = { width: 0, height: 0 };

	get tiles() {
		const { pixels, rows, cols, joined } = this.args;
		const tile = tileSize(pixels, rows, cols);
		const seam = joined ? 0 : seamFor(this.area, rows, cols);
		const boxes = frames(
			rows,
			cols,
			{
				width: Math.max(1, tile.width),
				height: Math.max(1, tile.height),
			},
			seam,
			this.area,
		);
		return cells(rows, cols).map((cell, i) => {
			const box = boxes[i]!;
			const crop = cellRect(cell, pixels, rows, cols);
			const width = Math.max(1, crop.width);
			const height = Math.max(1, crop.height);
			return {
				cell,
				key: cell.label,
				labelled:
					box.width >= tuning.labelWidth &&
					box.height >= tuning.labelHeight,
				style: htmlSafe(
					`left: ${px(box.x)}; top: ${px(box.y)}; width: ${px(box.width)}; height: ${px(box.height)}`,
				),
				image: htmlSafe(
					`left: ${percent(-crop.x / width)}; top: ${percent(-crop.y / height)}; width: ${percent(pixels.width / width)}; height: ${percent(pixels.height / height)}`,
				),
			};
		});
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

	<template>
		<div
			class="split-picture
				{{if @springs 'split-picture--springs'}}"
		>
			<div class="split-area" {{this.measure}}>
				{{#if @url}}
					{{#each this.tiles key="key" as |tile|}}
						<CanonMenu
							@items={{@menu}}
							@onSelect={{fn
								@onPick
								tile.cell
							}}
							as |m|
						>
							<button
								type="button"
								class="split-tile"
								style={{tile.style}}
								aria-label={{tile.cell.label}}
								{{m.trigger}}
							>
								<img
									src={{@url}}
									alt=""
									draggable="false"
									style={{tile.image}}
								/>
								{{#if
									tile.labelled
								}}
									<span
										class="split-tile-label"
										aria-hidden="true"
									>{{tile.cell.label}}</span>
								{{/if}}
							</button>
						</CanonMenu>
					{{/each}}
				{{else}}
					<Slot
						class="split-slot"
						@prompt="Drop an image here"
						@icon="image"
						@dashed={{true}}
						@fills={{true}}
						@over={{@over}}
						@onChoose={{@onChoose}}
					/>
				{{/if}}
			</div>
		</div>
	</template>
}
