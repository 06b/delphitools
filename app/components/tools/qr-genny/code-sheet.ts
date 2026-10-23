/**
 * A machine-readable code as it will be written: its modules on a sheet, a
 * margin round them, marks drawn over them. Lengths are in modules, measured
 * from the code's top-left module. The port of iOS CodeSheet, without the
 * writers: qr-genny writes PNG and SVG from its own path data (qr.ts).
 */
export type Sweep = 'zigzag' | 'columns' | 'rings';

/** Which module of a code of another size a module matches, so a resized code slides. */
export type Anchor = 'none' | 'leading' | 'centre';

export interface Insets {
	top: number;
	left: number;
	bottom: number;
	right: number;
}

export interface Point {
	x: number;
	y: number;
}

export interface Rect extends Point {
	width: number;
	height: number;
}

export interface CodeSheet {
	modules: boolean[][];
	/** Height of one row of modules; default 1. */
	rowHeight?: number;
	/** Room round the code; the footer comes on top of the bottom margin. */
	margin: Insets;
	footer?: number;
	ink: string;
	/** None: transparent. */
	paper?: string;
	/** Least margin a scanner needs; the picture marks a smaller one. */
	quietZone?: number;
	sweep: Sweep;
	anchor: Anchor;
	/** Path of the dark module at row and column in a unit square; none fills the square. */
	shape?: (row: number, column: number) => Path2D;
	/** Draws the marks in CSS px, the code's top-left module at `origin`, `pitch` px per module. */
	marks?: (
		context: CanvasRenderingContext2D,
		origin: Point,
		pitch: number,
	) => void;
	/** Equal keys mean equal marks, so a change of modules alone does not fade them. */
	marksKey?: string;
}

/** Seconds from the first module's turn to the last's, then one module's own turn. */
export const timing = { spread: 0.34, flip: 0.2 } as const;
export const duration = timing.spread + timing.flip;
/** Past this many modules a change fades instead of sweeping. */
export const sweepLimit = 12_000;
/** UIView.transition crossDissolve, as CodeSheetPicture runs it. */
export const fadeSeconds = 0.22;
export const captionRow = 36;
export const cropMark = { gap: 5, length: 10 } as const;

export const rowsOf = (sheet: CodeSheet) => sheet.modules.length;
export const columnsOf = (sheet: CodeSheet) => sheet.modules[0]?.length ?? 0;
const rowHeightOf = (sheet: CodeSheet) => sheet.rowHeight ?? 1;

export function sizeOf(sheet: CodeSheet) {
	const { margin } = sheet;
	return {
		width: columnsOf(sheet) + margin.left + margin.right,
		height:
			rowsOf(sheet) * rowHeightOf(sheet) +
			margin.top +
			margin.bottom +
			(sheet.footer ?? 0),
	};
}

export function pixelSize(sheet: CodeSheet, pixels: number) {
	const { width, height } = sizeOf(sheet);
	return {
		width: Math.round(width * pixels),
		height: Math.round(height * pixels),
	};
}

export function isDark(sheet: CodeSheet, row: number, column: number) {
	return sheet.modules[row]?.[column] === true;
}

const clamp = (value: number, low: number, high: number) =>
	Math.min(Math.max(value, low), high);

const zigzagTables = new Map<number, Int32Array>();

/**
 * Placement index of every module of an n × n QR code, ignoring which
 * modules hold function patterns: column pairs from the right edge, the
 * vertical timing column skipped, upwards then downwards.
 */
export function zigzag(n: number): Int32Array {
	const known = zigzagTables.get(n);
	if (known) return known;
	if (n <= 1) return new Int32Array();
	const table = new Int32Array(n * n);
	const visited = new Uint8Array(n * n);
	let index = 0;
	let right = n - 1;
	let upwards = true;
	while (right >= 0) {
		if (right === 6) right = 5;
		for (let step = 0; step < n; step++) {
			const row = upwards ? n - 1 - step : step;
			for (const column of [right, right - 1]) {
				if (column < 0) continue;
				table[row * n + column] = index++;
				visited[row * n + column] = 1;
			}
		}
		upwards = !upwards;
		right -= 2;
	}
	// timing column 6 last
	for (let row = 0; row < n; row++) {
		if (n > 6 && !visited[row * n + 6])
			table[row * n + 6] = index++;
	}
	zigzagTables.set(n, table);
	return table;
}

/** Sweep position of a module, 0 first to 1 last; outside the code it clamps. */
export function order(sheet: CodeSheet, row: number, column: number) {
	const rows = rowsOf(sheet);
	const columns = columnsOf(sheet);
	const r = clamp(row, 0, Math.max(rows - 1, 0));
	const c = clamp(column, 0, Math.max(columns - 1, 0));
	switch (sheet.sweep) {
		case 'columns':
			return columns > 1 ? c / (columns - 1) : 0;
		case 'rings': {
			const middle = [
				(rows - 1) / 2,
				(columns - 1) / 2,
			] as const;
			const far = Math.max(middle[0], middle[1], 1);
			return (
				Math.max(
					Math.abs(r - middle[0]),
					Math.abs(c - middle[1]),
				) / far
			);
		}
		case 'zigzag': {
			const table = zigzag(rows);
			return table.length === 0 || columns !== rows
				? 0
				: table[r * rows + c]! / (rows * rows - 1);
		}
	}
}

export interface Placement {
	sheet: Rect;
	origin: Point;
	pitch: number;
}

/** Modules the quiet zone mark reaches past each edge of the sheet. */
export function overhang(sheet: CodeSheet): Insets {
	const zone = sheet.quietZone ?? 0;
	const { margin } = sheet;
	return {
		top: Math.max(0, zone - margin.top),
		left: Math.max(0, zone - margin.left),
		bottom: Math.max(0, zone - margin.bottom - (sheet.footer ?? 0)),
		right: Math.max(0, zone - margin.right),
	};
}

/**
 * Sheet frame, code origin and px per module for `sheet` in `area`: whole
 * device pixels per module when a module is two pixels or more, the code's
 * corner on a pixel. A quiet zone wider than the margin fits too.
 */
export function place(
	sheet: CodeSheet,
	area: Rect,
	scale: number,
): Placement | undefined {
	const size = sizeOf(sheet);
	if (!(size.width > 0 && size.height > 0)) return;
	if (!(area.width > 0 && area.height > 0)) return;
	const over = overhang(sheet);
	const box = {
		width: size.width + over.left + over.right,
		height: size.height + over.top + over.bottom,
	};
	let pitch = Math.min(area.width / box.width, area.height / box.height);
	if (pitch * scale >= 2) pitch = Math.floor(pitch * scale) / scale;
	const fitted = {
		width: size.width * pitch,
		height: size.height * pitch,
	};
	const snap = (value: number) => Math.round(value * scale) / scale;
	const frame = {
		x: snap(
			area.x +
				area.width / 2 +
				((over.left - over.right) * pitch -
					fitted.width) /
					2,
		),
		y: snap(
			area.y +
				area.height / 2 +
				((over.top - over.bottom) * pitch -
					fitted.height) /
					2,
		),
		...fitted,
	};
	return {
		sheet: frame,
		origin: {
			x: snap(frame.x + sheet.margin.left * pitch),
			y: snap(frame.y + sheet.margin.top * pitch),
		},
		pitch,
	};
}

export const easeOut = (t: number) => 1 - (1 - t) ** 3;
export const easeInOut = (t: number) =>
	t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function lerpRect(a: Rect, b: Rect, t: number): Rect {
	return {
		x: lerp(a.x, b.x, t),
		y: lerp(a.y, b.y, t),
		width: lerp(a.width, b.width, t),
		height: lerp(a.height, b.height, t),
	};
}

export function modulesEqual(a?: CodeSheet, b?: CodeSheet) {
	if (!a || !b) return a === b;
	if (rowHeightOf(a) !== rowHeightOf(b)) return false;
	if (rowsOf(a) !== rowsOf(b) || columnsOf(a) !== columnsOf(b))
		return false;
	return a.modules.every((row, r) =>
		row.every((dark, c) => b.modules[r]![c] === dark),
	);
}

/** What a sweep reads for every module on every frame, built once per sheet. */
export interface Swept {
	sheet: CodeSheet;
	/** Row-major sweep positions. */
	orders: Float32Array;
	/** Row-major unit paths of the dark modules; none when the sheet has no shape. */
	paths?: (Path2D | undefined)[];
}

export function prepare(sheet: CodeSheet): Swept {
	const rows = rowsOf(sheet);
	const columns = columnsOf(sheet);
	const orders = new Float32Array(rows * columns);
	const paths = sheet.shape ? new Array<Path2D | undefined>() : undefined;
	for (let r = 0; r < rows; r++) {
		for (let c = 0; c < columns; c++) {
			orders[r * columns + c] = order(sheet, r, c);
			if (paths)
				paths[r * columns + c] = sheet.modules[r]![c]
					? sheet.shape!(r, c)
					: undefined;
		}
	}
	return { sheet, orders, paths };
}

function sweptOrder(swept: Swept, row: number, column: number) {
	const rows = rowsOf(swept.sheet);
	const columns = columnsOf(swept.sheet);
	if (!rows || !columns) return 0;
	return swept.orders[
		clamp(row, 0, rows - 1) * columns +
			clamp(column, 0, columns - 1)
	]!;
}

function sweptPath(swept: Swept, row: number, column: number) {
	return swept.paths?.[row * columnsOf(swept.sheet) + column];
}

/** Top-left cell's rect and the step to the next column and row. */
export interface Grid {
	x: number;
	y: number;
	width: number;
	height: number;
}

export const lerpGrid = lerpRect;

export function gridOf(sheet: CodeSheet, placement: Placement): Grid {
	return {
		...placement.origin,
		width: placement.pitch,
		height: placement.pitch * rowHeightOf(sheet),
	};
}

/**
 * One generation of modules on screen. Every cell of its range turns from
 * `from` towards its target in its sweep turn: dark modules of the sheet
 * to 1, the rest (and every cell of a fading layer) to 0.
 */
export interface Layer {
	swept: Swept;
	began: number;
	/** Cell range in the sheet's own rows and columns; it may pass the edges. */
	top: number;
	left: number;
	rows: number;
	columns: number;
	from: Float32Array;
	/** Unit path a cell keeps while it shrinks away; none fills the square. */
	ghosts: (Path2D | undefined)[];
	fading: boolean;
	/** Where the top-left cell sat at `began`; none: the sheet's own placement. */
	grid?: Grid;
	/** The grid eases to the sheet's placement; otherwise it stays put. */
	moves: boolean;
}

export interface MarksLayer {
	sheet: CodeSheet;
	from: number;
	to: number;
	began: number;
}

export interface View {
	from?: Placement;
	began: number;
}

export function layout(began: number, now: number) {
	return easeInOut(clamp((now - began) / duration, 0, 1));
}

/** Share of the cell at index `i` (row-major in the layer's range) at `now`. */
export function shareAt(layer: Layer, i: number, now: number) {
	const row = layer.top + Math.floor(i / layer.columns);
	const column = layer.left + (i % layer.columns);
	const target =
		!layer.fading && isDark(layer.swept.sheet, row, column) ? 1 : 0;
	const from = layer.from[i]!;
	if (from === target) return target;
	const turn = clamp(
		(now -
			layer.began -
			sweptOrder(layer.swept, row, column) * timing.spread) /
			timing.flip,
		0,
		1,
	);
	return from + (target - from) * easeOut(turn);
}

export function gridAt(layer: Layer, placed: Grid, now: number): Grid {
	if (!layer.grid) return placed;
	if (!layer.moves) return layer.grid;
	return lerpGrid(layer.grid, placed, layout(layer.began, now));
}

/** A sheet drawn whole, as if its sweep ended long ago. */
export function settledLayer(sheet: CodeSheet): Layer {
	const swept = prepare(sheet);
	const rows = rowsOf(sheet);
	const columns = columnsOf(sheet);
	const from = new Float32Array(rows * columns);
	sheet.modules.forEach((row, r) =>
		row.forEach((dark, c) => {
			if (dark) from[r * columns + c] = 1;
		}),
	);
	return {
		swept,
		began: -Infinity,
		top: 0,
		left: 0,
		rows,
		columns,
		from,
		ghosts: [],
		fading: false,
		moves: false,
	};
}

/** The cell range's path for cell `i`: the target sheet's when it is dark there, else its ghost. */
export function pathAt(layer: Layer, i: number) {
	const row = layer.top + Math.floor(i / layer.columns);
	const column = layer.left + (i % layer.columns);
	return isDark(layer.swept.sheet, row, column) && !layer.fading
		? sweptPath(layer.swept, row, column)
		: layer.ghosts[i];
}

export type Placer = (sheet: CodeSheet) => Placement | undefined;

/**
 * The picture's motion: generations of modules, the marks and the sheet's
 * frame, each easing from wherever it is when a change comes, so a change
 * mid-sweep starts from what is on screen.
 */
export class SheetMotion {
	layers: Layer[] = [];
	marks: MarksLayer[] = [];
	view: View = { began: -Infinity };

	/** Outgoing generations kept at most; older ones drop. */
	static keep = 3;

	get sheet(): CodeSheet | undefined {
		return this.target?.swept.sheet;
	}

	get target(): Layer | undefined {
		return this.layers.at(-1);
	}

	/** Shows `sheet` at once, with nothing in flight. */
	reset(sheet: CodeSheet | undefined) {
		this.layers = sheet ? [settledLayer(sheet)] : [];
		this.marks = sheet
			? [{ sheet, from: 1, to: 1, began: -Infinity }]
			: [];
		this.view = { began: -Infinity };
	}

	/** Swaps in a sheet of the same modules under a crossfade, keeping what is in flight. */
	restyle(sheet: CodeSheet) {
		const target = this.target;
		if (!target) return this.reset(sheet);
		target.swept = prepare(sheet);
		const lit = this.marks.at(-1);
		if (lit && lit.to === 1) lit.sheet = sheet;
		else
			this.marks.push({
				sheet,
				from: 1,
				to: 1,
				began: -Infinity,
			});
	}

	placementAt(placer: Placer, now: number): Placement | undefined {
		const sheet = this.sheet;
		const placed = sheet && placer(sheet);
		const { from, began } = this.view;
		if (!placed || !from) return placed;
		const t = layout(began, now);
		return {
			sheet: lerpRect(from.sheet, placed.sheet, t),
			origin: {
				x: lerp(from.origin.x, placed.origin.x, t),
				y: lerp(from.origin.y, placed.origin.y, t),
			},
			pitch: lerp(from.pitch, placed.pitch, t),
		};
	}

	marksAlpha(layer: MarksLayer, now: number) {
		return lerp(layer.from, layer.to, layout(layer.began, now));
	}

	/** Sweeps from what is on screen at `now` to `next`, whose modules differ. */
	sweep(next: CodeSheet, placer: Placer, now: number) {
		const target = this.target;
		if (!target) return this.reset(next);
		const before = target.swept.sheet;
		const view = this.placementAt(placer, now);
		const sameSize =
			rowsOf(before) === rowsOf(next) &&
			columnsOf(before) === columnsOf(next);
		const placedBefore = placer(before);
		const gridNow = placedBefore
			? gridAt(target, gridOf(before, placedBefore), now)
			: undefined;

		if (next.anchor === 'none' && !sameSize) {
			const outgoing = this.layers.map((layer) => {
				const placed = placer(layer.swept.sheet);
				return rebase(
					layer,
					now,
					placed &&
						gridAt(
							layer,
							gridOf(
								layer.swept
									.sheet,
								placed,
							),
							now,
						),
				);
			});
			const incoming = settledLayer(next);
			incoming.from.fill(0);
			incoming.began = now;
			this.layers = [
				...outgoing.slice(-SheetMotion.keep),
				incoming,
			];
		} else {
			const shift =
				next.anchor === 'centre'
					? [
							Math.trunc(
								(rowsOf(next) -
									rowsOf(
										before,
									)) /
									2,
							),
							Math.trunc(
								(columnsOf(
									next,
								) -
									columnsOf(
										before,
									)) /
									2,
							),
						]
					: [0, 0];
			const [dr, dc] = shift as [number, number];
			const top = Math.min(0, target.top + dr);
			const left = Math.min(0, target.left + dc);
			const bottom = Math.max(
				rowsOf(next),
				target.top + target.rows + dr,
			);
			const right = Math.max(
				columnsOf(next),
				target.left + target.columns + dc,
			);
			const rows = bottom - top;
			const columns = right - left;
			const from = new Float32Array(rows * columns);
			const ghosts = new Array<Path2D | undefined>(
				rows * columns,
			);
			const swept = prepare(next);
			for (let i = 0; i < rows * columns; i++) {
				const r =
					top +
					Math.floor(i / columns) -
					dr -
					target.top;
				const c =
					left + (i % columns) - dc - target.left;
				if (
					r < 0 ||
					c < 0 ||
					r >= target.rows ||
					c >= target.columns
				)
					continue;
				const j = r * target.columns + c;
				from[i] = shareAt(target, j, now);
				ghosts[i] = pathAt(target, j);
			}
			const grid = gridNow && {
				x: gridNow.x - dc * gridNow.width,
				y: gridNow.y - dr * gridNow.height,
				width: gridNow.width,
				height: gridNow.height,
			};
			this.layers = [
				...this.layers.slice(0, -1),
				{
					swept,
					began: now,
					top,
					left,
					rows,
					columns,
					from,
					ghosts,
					fading: false,
					grid,
					moves: true,
				},
			];
		}

		this.view = { from: view, began: now };
		const lit = this.marks.at(-1);
		if (
			lit &&
			lit.to === 1 &&
			lit.sheet.marksKey === next.marksKey
		) {
			lit.sheet = next;
		} else {
			this.marks = [
				...this.marks.map((layer) => ({
					sheet: layer.sheet,
					from: this.marksAlpha(layer, now),
					to: 0,
					began: now,
				})),
				{ sheet: next, from: 0, to: 1, began: now },
			].slice(-SheetMotion.keep - 1);
		}
	}

	/** Every layer has reached its target. */
	settled(now: number) {
		const done = (began: number) => now - began >= duration;
		return (
			this.layers.every((layer) => done(layer.began)) &&
			this.marks.every((layer) => done(layer.began)) &&
			done(this.view.began)
		);
	}

	/** Drops what has gone, once settled. */
	compact() {
		const sheet = this.sheet;
		if (sheet) this.reset(sheet);
	}
}

/** The layer fading from what it shows at `now`, its cells frozen where they are. */
function rebase(layer: Layer, now: number, grid: Grid | undefined): Layer {
	const from = new Float32Array(layer.from.length);
	const ghosts = new Array<Path2D | undefined>(layer.from.length);
	for (let i = 0; i < from.length; i++) {
		from[i] = shareAt(layer, i, now);
		ghosts[i] = pathAt(layer, i);
	}
	return {
		...layer,
		from,
		ghosts,
		began: now,
		fading: true,
		grid,
		moves: false,
	};
}
