import type { Point, Quad, Size } from 'delphitools-v2/lib/deskew';

export interface Rect extends Size {
	x: number;
	y: number;
}

/** The blank sheet and its quad before a file loads, as iOS DeskewBoard. */
export const emptyPixels: Size = { width: 1600, height: 1200 };
export const emptyQuad: Quad = [
	{ x: 470, y: 250 },
	{ x: 1170, y: 320 },
	{ x: 1330, y: 980 },
	{ x: 260, y: 920 },
];

export const divisions = 4;

/** Longest output edge; a 48 MP sensor is 8064 px wide. */
export const maxEdge = 8192;

export type Grab =
	| { kind: 'corner'; index: number }
	| { kind: 'edge'; index: number }
	| { kind: 'whole' };

/** Points from a corner or an edge that still grab it. */
const reach = { corner: 30, edge: 18 };

/** `size` scaled down so no side exceeds `edge`. */
export function capped(size: Size, edge = maxEdge): Size {
	const scale = Math.min(1, edge / Math.max(size.width, size.height, 1));
	return {
		width: Math.max(1, Math.round(size.width * scale)),
		height: Math.max(1, Math.round(size.height * scale)),
	};
}

/** `size` reshaped to exactly `width`:`height`, keeping its long edge. */
export function toRatio(size: Size, width: number, height: number): Size {
	const long = Math.max(size.width, size.height, 1);
	if (width >= height)
		return {
			width: long,
			height: Math.max(
				1,
				Math.round((long * height) / width),
			),
		};
	return {
		width: Math.max(1, Math.round((long * width) / height)),
		height: long,
	};
}

/**
 * True for a convex quad wound clockwise in top-left coordinates; a bow-tie,
 * mirrored or collapsed quad has no perspective correction.
 */
export function isConvex(quad: Point[]): boolean {
	if (quad.length !== 4) return false;
	return quad.every((a, i) => {
		const b = quad[(i + 1) % 4]!;
		const c = quad[(i + 2) % 4]!;
		return (
			(b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) >
			1e-6
		);
	});
}

/** The point at (u, v) of the unit square mapped onto `quad` (Heckbert 1989, square to quad). */
export function project(u: number, v: number, quad: Quad): Point {
	const [p0, p1, p2, p3] = quad;
	const sx = p0.x - p1.x + p2.x - p3.x;
	const sy = p0.y - p1.y + p2.y - p3.y;
	const dx1 = p1.x - p2.x;
	const dx2 = p3.x - p2.x;
	const dy1 = p1.y - p2.y;
	const dy2 = p3.y - p2.y;
	const den = dx1 * dy2 - dx2 * dy1;
	const flat = Math.abs(den) < 1e-9;
	const g = flat ? 0 : (sx * dy2 - dx2 * sy) / den;
	const h = flat ? 0 : (dx1 * sy - sx * dy1) / den;
	const a = p1.x - p0.x + g * p1.x;
	const b = p3.x - p0.x + h * p3.x;
	const d = p1.y - p0.y + g * p1.y;
	const e = p3.y - p0.y + h * p3.y;
	const w = g * u + h * v + 1;
	return { x: (a * u + b * v + p0.x) / w, y: (d * u + e * v + p0.y) / w };
}

const segment = (from: Point, to: Point) =>
	`M${from.x} ${from.y}L${to.x} ${to.y}`;

export const polygon = (quad: Point[]) =>
	quad.map(({ x, y }, i) => `${i ? 'L' : 'M'}${x} ${y}`).join('') + 'Z';

/** The output's grid lines drawn through the quad, foreshortened. */
export function gridPath(quad: Quad, steps = divisions): string {
	let path = '';
	for (let step = 1; step < steps; step++) {
		const share = step / steps;
		path += segment(
			project(share, 0, quad),
			project(share, 1, quad),
		);
		path += segment(
			project(0, share, quad),
			project(1, share, quad),
		);
	}
	return path;
}

/** An L at each corner along its two edges, `arm` long or a third of the edge. */
export function bracketPath(quad: Quad, arm: number): string {
	return quad
		.map((corner, index) => {
			const [from, to] = [
				quad[(index + 3) % 4]!,
				quad[(index + 1) % 4]!,
			].map((end) => {
				const length = Math.hypot(
					end.x - corner.x,
					end.y - corner.y,
				);
				if (!length) return corner;
				const share =
					Math.min(arm, length / 3) / length;
				return {
					x:
						corner.x +
						(end.x - corner.x) * share,
					y:
						corner.y +
						(end.y - corner.y) * share,
				};
			});
			return `M${from!.x} ${from!.y}L${corner.x} ${corner.y}L${to!.x} ${to!.y}`;
		})
		.join('');
}

function distanceToSegment(point: Point, a: Point, b: Point) {
	const dx = b.x - a.x;
	const dy = b.y - a.y;
	const length = dx * dx + dy * dy;
	const t = length
		? Math.min(
				Math.max(
					((point.x - a.x) * dx +
						(point.y - a.y) * dy) /
						length,
					0,
				),
				1,
			)
		: 0;
	return Math.hypot(point.x - (a.x + t * dx), point.y - (a.y + t * dy));
}

function inside(point: Point, quad: Point[]) {
	let crossings = false;
	for (let i = 0, j = quad.length - 1; i < quad.length; j = i++) {
		const a = quad[i]!;
		const b = quad[j]!;
		if (
			a.y > point.y !== b.y > point.y &&
			point.x <
				((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) +
					a.x
		)
			crossings = !crossings;
	}
	return crossings;
}

/** What a press at `point` takes: the nearest corner, then an edge, then the inside. */
export function grabAt(point: Point, quad: Point[]): Grab | undefined {
	if (quad.length !== 4) return undefined;
	const far = (p: Point) => Math.hypot(p.x - point.x, p.y - point.y);
	const nearest = quad.reduce(
		(best, p, i) => (far(p) < far(quad[best]!) ? i : best),
		0,
	);
	if (far(quad[nearest]!) <= reach.corner)
		return { kind: 'corner', index: nearest };
	const edges = quad.map((a, i) =>
		distanceToSegment(point, a, quad[(i + 1) % 4]!),
	);
	const edge = edges.indexOf(Math.min(...edges));
	if (edges[edge]! <= reach.edge) return { kind: 'edge', index: edge };
	return inside(point, quad) ? { kind: 'whole' } : undefined;
}

/** `quad` with the grabbed corners moved by `delta`, the move clamped so none leaves `size`. */
export function moveGrab(
	quad: Quad,
	grab: Grab,
	delta: Point,
	size: Size,
): Quad {
	const moving =
		grab.kind === 'corner'
			? [grab.index]
			: grab.kind === 'edge'
				? [grab.index, (grab.index + 1) % 4]
				: [0, 1, 2, 3];
	let { x: dx, y: dy } = delta;
	for (const index of moving) {
		const p = quad[index]!;
		dx = Math.min(Math.max(dx, -p.x), size.width - p.x);
		dy = Math.min(Math.max(dy, -p.y), size.height - p.y);
	}
	return quad.map((p, index) =>
		moving.includes(index) ? { x: p.x + dx, y: p.y + dy } : p,
	) as Quad;
}

/** `pixels` fitted and centred in `area`. */
export function fitRect(pixels: Size, area: Rect): Rect {
	if (pixels.width <= 0 || pixels.height <= 0 || area.width <= 0)
		return { x: 0, y: 0, width: 0, height: 0 };
	const scale = Math.max(
		0,
		Math.min(
			area.width / pixels.width,
			area.height / pixels.height,
		),
	);
	const width = pixels.width * scale;
	const height = pixels.height * scale;
	return {
		x: area.x + (area.width - width) / 2,
		y: area.y + (area.height - height) / 2,
		width,
		height,
	};
}

/**
 * Where a box of `size` fits in the largest strip of `frame` outside the
 * quad's bounds, its top left corner, or none when no strip holds it.
 */
export function hintSpot(
	frame: Rect,
	quad: Point[],
	size: Size,
): Point | undefined {
	const xs = quad.map((p) => p.x);
	const ys = quad.map((p) => p.y);
	const box = {
		left: Math.min(...xs),
		top: Math.min(...ys),
		right: Math.max(...xs),
		bottom: Math.max(...ys),
	};
	const right = frame.x + frame.width;
	const bottom = frame.y + frame.height;
	const strips: Rect[] = [
		{
			x: frame.x,
			y: frame.y,
			width: frame.width,
			height: box.top - frame.y,
		},
		{
			x: frame.x,
			y: box.bottom,
			width: frame.width,
			height: bottom - box.bottom,
		},
		{
			x: frame.x,
			y: frame.y,
			width: box.left - frame.x,
			height: frame.height,
		},
		{
			x: box.right,
			y: frame.y,
			width: right - box.right,
			height: frame.height,
		},
	];
	const room = strips
		.filter(
			(strip) =>
				strip.width >= size.width + 8 &&
				strip.height >= size.height + 8,
		)
		.sort((a, b) => b.width * b.height - a.width * a.height)[0];
	if (!room) return undefined;
	return {
		x: room.x + (room.width - size.width) / 2,
		y: room.y + (room.height - size.height) / 2,
	};
}
