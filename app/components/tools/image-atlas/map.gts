import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { htmlSafe } from '@ember/template';
import type Owner from '@ember/owner';
import {
	landPath,
	locationLabel,
	mapPoint,
	north,
	south,
} from 'delphitools-v2/components/tools/metadata-stripper/blocks';
import type { GpsPoint } from 'delphitools-v2/components/tools/image-atlas/report';

let land: Promise<string> | undefined;
const loadLand = () =>
	(land ??= fetch('/data/world-land.json')
		.then((response) => response.json() as Promise<number[][][]>)
		.then(landPath)
		.catch(() => ''));

const height = north - south;

/** Where the photo was taken: the land faint, the point lit with its latitude and longitude lines (iOS PhotoLocationMap). */
export default class LocationMap extends Component<{
	Args: { gps: GpsPoint | null };
}> {
	@tracked land = '';

	viewBox = `0 0 360 ${height}`;
	height = height;

	constructor(owner: Owner, args: { gps: GpsPoint | null }) {
		super(owner, args);
		void loadLand().then((path) => {
			if (!this.isDestroying) this.land = path;
		});
	}

	get point() {
		const { gps } = this.args;
		return gps ? mapPoint(gps.lat, gps.lon) : null;
	}

	get label() {
		const { gps } = this.args;
		return gps ? locationLabel(gps) : 'Location';
	}

	get pinStyle() {
		const { point } = this;
		if (!point) return undefined;
		return htmlSafe(
			`inset-inline-start: ${(point.x / 360) * 100}%; inset-block-start: ${(point.y / height) * 100}%`,
		);
	}

	<template>
		<div class="ia-map">
			<span
				class="ia-map-label"
				role="img"
				aria-label={{this.label}}
			></span>
			<svg
				class="ia-world"
				viewBox={{this.viewBox}}
				preserveAspectRatio="none"
				aria-hidden="true"
			>
				<path class="ia-land" d={{this.land}} />
				{{#if this.point}}
					<line
						class="ia-cross"
						x1={{this.point.x}}
						x2={{this.point.x}}
						y1="0"
						y2={{this.height}}
					/>
					<line
						class="ia-cross"
						x1="0"
						x2="360"
						y1={{this.point.y}}
						y2={{this.point.y}}
					/>
				{{/if}}
			</svg>
			{{#if this.point}}
				<span
					class="ia-pin"
					style={{this.pinStyle}}
				></span>
			{{/if}}
		</div>
	</template>
}
