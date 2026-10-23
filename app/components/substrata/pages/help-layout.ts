// iOS HelpLayout: where each help note and its arrow go. Controls in a
// column get notes beside them, eased apart; controls in a row get notes
// stepped away from the row so no arrow crosses a note.
// ponytail: one column and steps only; iOS adds a staggered second column
// and laned rows, here a crowded side moves to its own page instead

export interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface Point {
	x: number;
	y: number;
}

export type Side = 'left' | 'right' | 'top' | 'bottom';

export interface Target {
	frame: Rect;
	side: Side;
}

export interface Placement {
	note: Rect;
	// two points bow; more are a routed line
	points: Point[];
	// the text lines up with the note's edge nearest the control
	trailing: boolean;
}

export type Measure = (
	index: number,
	width: number,
) => { w: number; h: number };

export const REACH = 44;
export const SPACING = 8;
export const NOTE_WIDTH = 240;
const NARROWEST = 140;
const OVERHANG = 12;

const right = (r: Rect) => r.x + r.w;
const bottom = (r: Rect) => r.y + r.h;
const midX = (r: Rect) => r.x + r.w / 2;
const midY = (r: Rect) => r.y + r.h / 2;

export function intersects(a: Rect, b: Rect): boolean {
	return (
		a.x < right(b) &&
		b.x < right(a) &&
		a.y < bottom(b) &&
		b.y < bottom(a)
	);
}

function inset(r: Rect, d: number): Rect {
	return { x: r.x + d, y: r.y + d, w: r.w - 2 * d, h: r.h - 2 * d };
}

function contains(outer: Rect, inner: Rect): boolean {
	return (
		inner.x >= outer.x - 0.5 &&
		inner.y >= outer.y - 0.5 &&
		right(inner) <= right(outer) + 0.5 &&
		bottom(inner) <= bottom(outer) + 0.5
	);
}

// tops for spans of these heights, each as near its wanted top as the
// others allow, in order, inside lo..hi
export function ease(
	spans: { top: number; height: number }[],
	lo: number,
	hi: number,
): number[] {
	const order = spans
		.map((_, i) => i)
		.sort((a, b) => spans[a]!.top - spans[b]!.top);
	const tops = spans.map((s) => s.top);
	let floor = lo;
	for (const i of order) {
		tops[i] = Math.max(tops[i] ?? 0, floor);
		floor = (tops[i] ?? 0) + spans[i]!.height + SPACING;
	}
	let ceiling = hi;
	for (const i of [...order].reverse()) {
		tops[i] = Math.min(tops[i] ?? 0, ceiling - spans[i]!.height);
		ceiling = (tops[i] ?? 0) - SPACING;
	}
	return tops;
}

function column(
	frames: Rect[],
	side: Side,
	area: Rect,
	measure: Measure,
): Placement[] {
	const onRight = side === 'right';
	const face = onRight
		? Math.min(...frames.map((f) => f.x)) - REACH
		: Math.max(...frames.map(right)) + REACH;
	const room = Math.max(
		0,
		Math.min(
			NOTE_WIDTH,
			onRight ? face - area.x : right(area) - face,
		),
	);
	const sizes = frames.map((_, i) => measure(i, room));
	const tops = ease(
		frames.map((f, i) => ({
			top: midY(f) - sizes[i]!.h / 2,
			height: sizes[i]!.h,
		})),
		area.y,
		bottom(area),
	);
	return frames.map((f, i) => {
		const { w, h } = sizes[i]!;
		const note = {
			x: onRight ? face - w : face,
			y: tops[i]!,
			w,
			h,
		};
		const start = {
			x: onRight ? right(note) + 6 : note.x - 6,
			y: Math.min(
				Math.max(midY(f), note.y + 8),
				bottom(note) - 8,
			),
		};
		const end = { x: onRight ? f.x - 6 : right(f) + 6, y: midY(f) };
		return { note, points: [start, end], trailing: onRight };
	});
}

// controls left of the middle hang their notes right, the rest left;
// innermost first, each note takes the level nearest the row where it
// overlaps nothing, its arrow crosses no note and no arrow crosses it
function steps(
	frames: Rect[],
	side: Side,
	area: Rect,
	avoid: Rect[],
	measure: Measure,
): Placement[] | null {
	const below = side === 'top';
	const edge = below
		? Math.max(...frames.map(bottom))
		: Math.min(...frames.map((f) => f.y));
	const byX = frames
		.map((_, i) => i)
		.sort((a, b) => midX(frames[a]!) - midX(frames[b]!));
	const centre = midX(area);
	const leftOnes = byX.filter((i) => midX(frames[i]!) < centre);
	const rightOnes = byX.filter((i) => midX(frames[i]!) >= centre);
	const result: (Placement | null)[] = frames.map(() => null);
	const notes: Rect[] = [];
	const arrows: { x: number; lo: number; hi: number }[] = [];
	const start = below ? edge + REACH : edge - REACH;
	for (const i of [...leftOnes.reverse(), ...rightOnes]) {
		const f = frames[i]!;
		const trailing = rightOnes.includes(i);
		const anchor = trailing
			? midX(f) + OVERHANG
			: midX(f) - OVERHANG;
		const room = trailing ? anchor - area.x : right(area) - anchor;
		if (room < NARROWEST) return null;
		const { w, h } = measure(i, Math.min(NOTE_WIDTH, room));
		const x = trailing ? anchor - w : anchor;
		const levels = [
			start,
			...[...notes, ...avoid].map((n) =>
				below ? bottom(n) + SPACING : n.y - SPACING,
			),
		]
			.filter((l) => (below ? l >= start : l <= start))
			.sort(
				(a, b) =>
					Math.abs(a - edge) - Math.abs(b - edge),
			);
		const note = levels
			.map((l) => ({ x, y: below ? l : l - h, w, h }))
			.find((n) => {
				if (!contains(area, n)) return false;
				const padded = inset(n, -SPACING / 2);
				if (
					[...notes, ...avoid].some((o) =>
						intersects(o, padded),
					)
				)
					return false;
				const lo = below ? edge : bottom(n);
				const hi = below ? n.y : edge;
				const x0 = midX(f);
				if (
					notes.some(
						(o) =>
							o.x < x0 &&
							x0 < right(o) &&
							o.y < hi &&
							lo < bottom(o),
					)
				)
					return false;
				return !arrows.some(
					(a) =>
						padded.x < a.x &&
						a.x < right(padded) &&
						a.lo < bottom(padded) &&
						padded.y < a.hi,
				);
			});
		if (!note) return null;
		notes.push(note);
		arrows.push({
			x: midX(f),
			lo: below ? edge : bottom(note),
			hi: below ? note.y : edge,
		});
		result[i] = {
			note,
			points: [
				{
					x: midX(f),
					y: below
						? note.y - 6
						: bottom(note) + 6,
				},
				{
					x: midX(f),
					y: below ? bottom(f) + 6 : f.y - 6,
				},
			],
			trailing,
		};
	}
	return result as Placement[];
}

// columns first, then rows around the columns' notes and the holes
export function place(
	targets: Target[],
	area: Rect,
	holes: Rect[],
	measure: Measure,
): Placement[] | null {
	const result: (Placement | null)[] = targets.map(() => null);
	const obstacles = [...holes];
	for (const side of ['left', 'right', 'top', 'bottom'] as Side[]) {
		const members = targets.flatMap((t, i) =>
			t.side === side ? [i] : [],
		);
		if (!members.length) continue;
		const frames = members.map((i) => targets[i]!.frame);
		const sized: Measure = (i, w) => measure(members[i]!, w);
		const placed =
			side === 'left' || side === 'right'
				? column(frames, side, area, sized)
				: steps(frames, side, area, obstacles, sized);
		if (!placed) return null;
		obstacles.push(...placed.map((p) => p.note));
		placed.forEach((p, k) => (result[members[k]!] = p));
	}
	return result as Placement[];
}

// no note overlaps another or a hole, and every note is on screen
export function clear(placed: Placement[], area: Rect, holes: Rect[]): boolean {
	return placed.every(
		(a, i) =>
			contains(area, a.note) &&
			!holes.some((h) => intersects(h, inset(a.note, 0.5))) &&
			placed.every(
				(b, j) =>
					j <= i ||
					!intersects(inset(a.note, 0.5), b.note),
			),
	);
}

// groups of targets shown one after another: all at once when they fit,
// else one side of the screen at a time, halved while a side alone does not
export function pages(
	targets: Target[],
	area: Rect,
	holes: Rect[],
	measure: Measure,
): number[][] {
	const fits = (members: number[]) => {
		const placed = place(
			members.map((i) => targets[i]!),
			area,
			holes,
			(k, w) => measure(members[k]!, w),
		);
		return !!placed && clear(placed, area, holes);
	};
	const split = (members: number[]): number[][] => {
		if (members.length <= 1 || fits(members)) return [members];
		const sides = (['top', 'bottom', 'left', 'right'] as Side[])
			.map((s) =>
				members.filter((i) => targets[i]!.side === s),
			)
			.filter((g) => g.length);
		if (sides.length > 1) return sides.flatMap(split);
		const half = Math.ceil(members.length / 2);
		return [
			...split(members.slice(0, half)),
			...split(members.slice(half)),
		];
	};
	return split(targets.map((_, i) => i));
}

// the free spot for a box nearest the middle of the area, in 16 px steps
export function spot(
	size: { w: number; h: number },
	area: Rect,
	taken: Rect[],
): Rect {
	const middle = {
		x: midX(area) - size.w / 2,
		y: midY(area) - size.h / 2,
		w: size.w,
		h: size.h,
	};
	let best: Rect | null = null;
	let bestD = Infinity;
	for (
		let dy = area.y - middle.y;
		dy <= bottom(area) - bottom(middle);
		dy += 16
	) {
		for (
			let dx = area.x - middle.x;
			dx <= right(area) - right(middle);
			dx += 16
		) {
			const box = {
				...middle,
				x: middle.x + dx,
				y: middle.y + dy,
			};
			const d = Math.hypot(dx, dy);
			if (
				d < bestD &&
				!taken.some((t) => intersects(t, box))
			) {
				best = box;
				bestD = d;
			}
		}
	}
	return best ?? middle;
}

// an SVG path for the arrow with an open head at the last point: two points
// bow by `bow` of their length, more join with rounded corners
export function arrowPath(points: Point[], bow: number): string {
	const first = points[0];
	const end = points[points.length - 1];
	if (!first || !end || points.length < 2) return '';
	let d = `M${first.x} ${first.y}`;
	let before = points[points.length - 2]!;
	if (points.length === 2) {
		const dx = end.x - first.x;
		const dy = end.y - first.y;
		before = {
			x: (first.x + end.x) / 2 - dy * bow,
			y: (first.y + end.y) / 2 + dx * bow,
		};
		d += ` Q${before.x} ${before.y} ${end.x} ${end.y}`;
	} else {
		for (let i = 1; i < points.length - 1; i++) {
			const c = points[i]!;
			const towards = (o: Point, max: number) => {
				const len = Math.hypot(o.x - c.x, o.y - c.y);
				const t = len
					? Math.min(max, len / 2) / len
					: 0;
				return {
					x: c.x + (o.x - c.x) * t,
					y: c.y + (o.y - c.y) * t,
				};
			};
			const a = towards(points[i - 1]!, 6);
			const b = towards(points[i + 1]!, 6);
			d += ` L${a.x} ${a.y} Q${c.x} ${c.y} ${b.x} ${b.y}`;
		}
		d += ` L${end.x} ${end.y}`;
	}
	const angle = Math.atan2(end.y - before.y, end.x - before.x);
	for (const turn of [Math.PI * 0.82, -Math.PI * 0.82])
		d += ` M${end.x} ${end.y} l${Math.cos(angle + turn) * 8} ${Math.sin(angle + turn) * 8}`;
	return d;
}
