export interface Size {
	width: number;
	height: number;
}

export interface Rect extends Size {
	x: number;
	y: number;
}

export interface Cell {
	row: number;
	col: number;
	/** `row-column` from 1, the tile's file name suffix. */
	label: string;
}

export const counts = { min: 1, max: 20 };

/** Whole pixels a tile; the remainder on the trailing and bottom edges is left out. */
export function tileSize(pixels: Size, rows: number, cols: number): Size {
	return {
		width: Math.floor(pixels.width / Math.max(1, cols)),
		height: Math.floor(pixels.height / Math.max(1, rows)),
	};
}

/** The pixels left out after the whole tiles. */
export function trimmed(pixels: Size, rows: number, cols: number): Size {
	const tile = tileSize(pixels, rows, cols);
	return {
		width: pixels.width - tile.width * cols,
		height: pixels.height - tile.height * rows,
	};
}

export function cells(rows: number, cols: number): Cell[] {
	return Array.from({ length: rows * cols }, (_, i) => {
		const row = Math.floor(i / cols);
		const col = i % cols;
		return { row, col, label: `${row + 1}-${col + 1}` };
	});
}

/** The cell's crop in image pixels, top-left origin. */
export function cellRect(
	cell: Cell,
	pixels: Size,
	rows: number,
	cols: number,
): Rect {
	const { width, height } = tileSize(pixels, rows, cols);
	return {
		x: cell.col * width,
		y: cell.row * height,
		width,
		height,
	};
}

/** Widest seam between tiles, and the least tile size that carries its label (iOS tuning). */
export const tuning = { seam: 8, labelWidth: 44, labelHeight: 28 };

/** The seam for a grid in an area: thinner with more tiles. */
export function seamFor(area: Size, rows: number, cols: number): number {
	return Math.min(
		tuning.seam,
		Math.min(area.width, area.height) / (Math.max(rows, cols) * 6),
	);
}

/** Tile frames, row by row, for a grid of `tile`-sized pixels fitted into `area` with seams, centred. */
export function frames(
	rows: number,
	cols: number,
	tile: Size,
	seam: number,
	area: Size,
): Rect[] {
	if (rows <= 0 || cols <= 0 || tile.width <= 0 || tile.height <= 0)
		return [];
	const room = {
		width: area.width - seam * (cols - 1),
		height: area.height - seam * (rows - 1),
	};
	const scale = Math.max(
		0,
		Math.min(
			room.width / (tile.width * cols),
			room.height / (tile.height * rows),
		),
	);
	const side = { width: tile.width * scale, height: tile.height * scale };
	const whole = {
		width: side.width * cols + seam * (cols - 1),
		height: side.height * rows + seam * (rows - 1),
	};
	const origin = {
		x: (area.width - whole.width) / 2,
		y: (area.height - whole.height) / 2,
	};
	return cells(rows, cols).map(({ row, col }) => ({
		x: origin.x + col * (side.width + seam),
		y: origin.y + row * (side.height + seam),
		...side,
	}));
}
