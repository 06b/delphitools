import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonDimensionLine from 'delphicanon/components/canon-dimension-line';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonTiles from 'delphicanon/components/canon-tiles';
import {
	dimensionLines,
	sheet,
	type Rect,
} from 'delphicanon/lib/dimension-line';

const papers = [
	{ name: 'A5', width: 148, height: 210 },
	{ name: 'A4', width: 210, height: 297 },
	{ name: 'A3', width: 297, height: 420 },
	{ name: 'Letter', width: 215.9, height: 279.4 },
];
const names = papers.map((paper) => paper.name);
const turns = ['Portrait', 'Landscape'];
const pxPerMm = 96 / 25.4;
const place = ({ x, y, width, height }: Rect) =>
	htmlSafe(
		`inset-inline-start: ${x}px; inset-block-start: ${y}px; inline-size: ${width}px; block-size: ${height}px`,
	);

export default class PaperPattern extends Component {
	@tracked paper = 1;
	@tracked turn = 0;
	@tracked area = { width: 0, height: 0 };

	get size() {
		const { width, height } = papers[this.paper]!;
		return this.turn
			? { width: height, height: width }
			: { width, height };
	}

	get pixels() {
		return {
			width: Math.round(this.size.width * pxPerMm),
			height: Math.round(this.size.height * pxPerMm),
		};
	}

	get frame() {
		const page = sheet(this.size, {
			x: 0,
			y: 0,
			...this.area,
		});
		const lines = dimensionLines(page);
		return {
			page: place(page),
			across: place(lines.across),
			down: place(lines.down),
		};
	}

	get readings() {
		return [
			{ label: 'Width', value: `${this.size.width} mm` },
			{ label: 'Height', value: `${this.size.height} mm` },
		];
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

	pickPaper = (index: number) => (this.paper = index);
	pickTurn = (index: number) => (this.turn = index);

	<template>
		<CanonCanvas @height={{240}} @background="var(--canon-muted)">
			<div class="cd-paper" {{this.measure}}>
				<div
					class="cd-paper-page"
					style={{this.frame.page}}
				></div>
				<CanonDimensionLine
					@pixels={{this.pixels.width}}
					style={{this.frame.across}}
				/>
				<CanonDimensionLine
					@pixels={{this.pixels.height}}
					@down={{true}}
					style={{this.frame.down}}
				/>
			</div>
		</CanonCanvas>
		<CanonSegmented
			aria-label="Size"
			@items={{names}}
			@selected={{this.paper}}
			@onChange={{this.pickPaper}}
		/>
		<CanonSegmented
			aria-label="Orientation"
			@items={{turns}}
			@selected={{this.turn}}
			@onChange={{this.pickTurn}}
		/>
		<CanonTiles @items={{this.readings}} />
	</template>
}
