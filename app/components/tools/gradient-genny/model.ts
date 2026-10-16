import { tracked } from '@glimmer/tracking';
import {
	canBlend,
	clamp,
	colourAt,
	cornerKeys,
	meshColour,
	minStops,
	newId,
	pigmentBlend,
	seedGrid,
	sortStops,
	stopForWidestGap,
	type CornerKey,
	type Corners,
	type Gradient,
	type GridSize,
	type MeshPoint,
	type Mode,
	type Point,
	type Space,
	type Stop,
} from './paint';

/** The gradient being edited and the one handle the colour controls edit. */
export class GradientModel implements Gradient {
	@tracked mode: Mode;
	@tracked angle: number;
	@tracked centre: Point;
	@tracked space: Space;
	@tracked noise: number;
	@tracked stops: readonly Stop[];
	@tracked corners: Corners;
	@tracked points: readonly MeshPoint[];
	@tracked gridSize: GridSize = 2;
	/** A stop or point id, or a corner key. */
	@tracked selected = '';

	/**
	 * Built from plain values only: the component constructs this during
	 * render, where a tracked field read and then written throws.
	 */
	constructor(
		start: Partial<Gradient> & {
			carried?: string;
			blends?: number;
			select?: number;
		} = {},
	) {
		const { carried } = start;
		let stops: readonly Stop[] = start.stops ?? [
			{
				id: newId(),
				colour: carried ?? '#3B82F6',
				position: 0,
			},
			{ id: newId(), colour: '#8B5CF6', position: 100 },
		];
		for (let i = 0; i < (start.blends ?? 0) && canBlend(stops); i++)
			stops = pigmentBlend(stops);
		const points = seedGrid(2);
		if (carried) points[0]!.colour = carried;
		const mode = start.mode ?? 'linear';
		const order =
			mode === 'corners'
				? cornerKeys
				: mode === 'mesh'
					? points.map((point) => point.id)
					: sortStops(stops).map(
							(stop) => stop.id,
						);
		this.mode = mode;
		this.angle = start.angle ?? 90;
		this.centre = start.centre ?? { x: 0.5, y: 0.5 };
		this.space = start.space ?? 'srgb';
		this.noise = start.noise ?? 0;
		this.stops = stops;
		this.points = points;
		this.corners = {
			topLeft: carried ?? '#3B82F6',
			topRight: '#8B5CF6',
			bottomLeft: '#10B981',
			bottomRight: '#F59E0B',
		};
		this.selected =
			order[Math.min(start.select ?? 0, order.length - 1)]!;
	}

	get isStops() {
		return this.mode !== 'corners' && this.mode !== 'mesh';
	}

	get selectedColour(): string | undefined {
		if (this.mode === 'corners')
			return this.corners[this.selected as CornerKey];
		const list = this.mode === 'mesh' ? this.points : this.stops;
		return list.find((entry) => entry.id === this.selected)?.colour;
	}

	get selectedStop() {
		return this.stops.find((stop) => stop.id === this.selected);
	}

	get canRemove() {
		const count =
			this.mode === 'mesh'
				? this.points.length
				: this.stops.length;
		return this.mode !== 'corners' && count > minStops;
	}

	get canBlend() {
		return canBlend(this.stops);
	}

	selectFirst() {
		if (this.mode === 'corners') this.selected = cornerKeys[0]!;
		else if (this.mode === 'mesh')
			this.selected = this.points[0]?.id ?? '';
		else this.selected = sortStops(this.stops)[0]?.id ?? '';
	}

	setMode(mode: Mode) {
		this.mode = mode;
		this.selectFirst();
	}

	setColour(colour: string) {
		const id = this.selected;
		if (this.mode === 'corners') {
			const key = id as CornerKey;
			if (this.corners[key] !== colour)
				this.corners = {
					...this.corners,
					[key]: colour,
				};
		} else if (this.mode === 'mesh') {
			this.points = this.points.map((point) =>
				point.id === id && point.colour !== colour
					? { ...point, colour }
					: point,
			);
		} else {
			this.stops = this.stops.map((stop) =>
				stop.id === id && stop.colour !== colour
					? { ...stop, colour }
					: stop,
			);
		}
	}

	setPosition(id: string, position: number) {
		const value = Math.round(clamp(position, 0, 100));
		this.stops = this.stops.map((stop) =>
			stop.id === id ? { ...stop, position: value } : stop,
		);
	}

	/** Adds a stop at `position` in the colour already there, so the picture does not change. */
	addStopAt(position: number) {
		const at = Math.round(clamp(position, 0, 100));
		const stop = {
			id: newId(),
			colour: colourAt(this.stops, at, this.space),
			position: at,
		};
		this.stops = [...this.stops, stop];
		this.selected = stop.id;
	}

	addStop() {
		const stop = stopForWidestGap(this.stops, this.space);
		this.stops = [...this.stops, stop];
		this.selected = stop.id;
	}

	blend() {
		if (!this.canBlend) return;
		this.stops = pigmentBlend(this.stops);
	}

	movePoint(id: string, to: Point) {
		this.points = this.points.map((point) =>
			point.id === id
				? {
						...point,
						x: clamp(to.x, 0, 1),
						y: clamp(to.y, 0, 1),
					}
				: point,
		);
	}

	addPointAt(at: Point) {
		const point = {
			id: newId(),
			x: clamp(at.x, 0, 1),
			y: clamp(at.y, 0, 1),
			colour: meshColour(this.points, at),
		};
		this.points = [...this.points, point];
		this.selected = point.id;
	}

	setGrid(size: GridSize) {
		this.gridSize = size;
		this.points = seedGrid(size);
		this.selectFirst();
	}

	/** Removes a stop or point; the nearest stop, or the first point, takes the selection. */
	remove(id: string) {
		if (!this.canRemove) return;
		if (this.mode === 'mesh') {
			this.points = this.points.filter(
				(point) => point.id !== id,
			);
			if (this.selected === id) this.selectFirst();
			return;
		}
		const at =
			this.stops.find((stop) => stop.id === id)?.position ??
			0;
		this.stops = this.stops.filter((stop) => stop.id !== id);
		if (this.selected !== id) return;
		const nearest = [...this.stops].sort(
			(a, b) =>
				Math.abs(a.position - at) -
				Math.abs(b.position - at),
		)[0];
		this.selected = nearest?.id ?? '';
	}

	removeSelected = () => this.remove(this.selected);
}
