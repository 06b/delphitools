// The port of iOS PDFCropEngine. Display space: the page as viewed, rotation
// applied, top-left origin, points. Page space: PDF user space, bottom-left
// origin.

export interface CropBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface Size {
	width: number;
	height: number;
}

export interface Insets {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

interface Point {
	x: number;
	y: number;
}

/** Rotation in degrees, a multiple of 90 in 0..270. */
export function displaySize(box: Size, rotation: number): Size {
	return rotation % 180 === 0
		? { width: box.width, height: box.height }
		: { width: box.height, height: box.width };
}

export function boxFromPoints(
	ax: number,
	ay: number,
	bx: number,
	by: number,
): CropBox {
	return {
		x: Math.min(ax, bx),
		y: Math.min(ay, by),
		width: Math.abs(ax - bx),
		height: Math.abs(ay - by),
	};
}

// pdf boxes require area
export function intersectBox(a: CropBox, b: CropBox): CropBox | null {
	const x = Math.max(a.x, b.x);
	const y = Math.max(a.y, b.y);
	const right = Math.min(a.x + a.width, b.x + b.width);
	const bottom = Math.min(a.y + a.height, b.y + b.height);
	if (right - x <= 0 || bottom - y <= 0) return null;
	return { x, y, width: right - x, height: bottom - y };
}

export function cropFromInsets(size: Size, insets: Insets): CropBox | null {
	const { left, top, right, bottom } = insets;
	if (left < 0 || top < 0 || right < 0 || bottom < 0) return null;
	const width = size.width - left - right;
	const height = size.height - top - bottom;
	if (width <= 0 || height <= 0) return null;
	return { x: left, y: top, width, height };
}

export function insetsOf(rect: CropBox, size: Size): Insets {
	return {
		left: rect.x,
		top: rect.y,
		right: size.width - rect.x - rect.width,
		bottom: size.height - rect.y - rect.height,
	};
}

// callers clip overflow
export function cropToPaper(size: Size, paper: Size): CropBox {
	return {
		x: (size.width - paper.width) / 2,
		y: (size.height - paper.height) / 2,
		width: paper.width,
		height: paper.height,
	};
}

function pagePoint(point: Point, box: CropBox, rotation: number): Point {
	const { width: w, height: h } = box;
	const local =
		rotation === 90
			? { x: point.y, y: point.x }
			: rotation === 180
				? { x: w - point.x, y: point.y }
				: rotation === 270
					? { x: w - point.y, y: h - point.x }
					: { x: point.x, y: h - point.y };
	return { x: local.x + box.x, y: local.y + box.y };
}

function displayPoint(point: Point, box: CropBox, rotation: number): Point {
	const { width: w, height: h } = box;
	const u = point.x - box.x;
	const v = point.y - box.y;
	if (rotation === 90) return { x: v, y: u };
	if (rotation === 180) return { x: w - u, y: v };
	if (rotation === 270) return { x: h - v, y: w - u };
	return { x: u, y: h - v };
}

/** A display rect in page space; `box` is the page's crop box. */
export function toPage(rect: CropBox, box: CropBox, rotation: number): CropBox {
	const a = pagePoint(rect, box, rotation);
	const b = pagePoint(
		{ x: rect.x + rect.width, y: rect.y + rect.height },
		box,
		rotation,
	);
	return boxFromPoints(a.x, a.y, b.x, b.y);
}

export function toDisplay(
	rect: CropBox,
	box: CropBox,
	rotation: number,
): CropBox {
	const a = displayPoint(rect, box, rotation);
	const b = displayPoint(
		{ x: rect.x + rect.width, y: rect.y + rect.height },
		box,
		rotation,
	);
	return boxFromPoints(a.x, a.y, b.x, b.y);
}
