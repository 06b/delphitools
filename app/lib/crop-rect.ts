export interface Point {
	x: number;
	y: number;
}

export interface Size {
	width: number;
	height: number;
}

export interface Rect extends Point, Size {}

export interface Edges {
	left: boolean;
	top: boolean;
	right: boolean;
	bottom: boolean;
}

/** Display px a grab reaches past an edge; also the margin round the image (iOS PDFCropCanvas.reach). */
export const reach = 22;
/** Least crop side in image px, as iOS has it. */
const least = 8;

export const whole = ({ width, height }: Size): Rect => ({
	x: 0,
	y: 0,
	width,
	height,
});

export const isWhole = (crop: Rect, pixels: Size) =>
	crop.x === 0 &&
	crop.y === 0 &&
	crop.width === pixels.width &&
	crop.height === pixels.height;

/** `size` scaled to fit inside `area`, centred (AVMakeRect). */
export function fit(size: Size, area: Rect): Rect {
	const scale =
		Math.min(area.width / size.width, area.height / size.height) ||
		0;
	const width = Math.max(0, size.width * scale);
	const height = Math.max(0, size.height * scale);
	return {
		x: area.x + (area.width - width) / 2,
		y: area.y + (area.height - height) / 2,
		width,
		height,
	};
}

/** Whole pixels covering the rect (CGRect.integral). */
export function integral({ x, y, width, height }: Rect): Rect {
	const left = Math.floor(x);
	const top = Math.floor(y);
	return {
		x: left,
		y: top,
		width: Math.ceil(x + width) - left,
		height: Math.ceil(y + height) - top,
	};
}

/** The edges a point within `reach` of the shown crop grabs; none inside or outside. */
export function edgesAt(point: Point, shown: Rect): Edges | undefined {
	const { x, y } = point;
	const right = shown.x + shown.width;
	const bottom = shown.y + shown.height;
	if (
		shown.width <= 0 ||
		x < shown.x - reach ||
		x > right + reach ||
		y < shown.y - reach ||
		y > bottom + reach
	)
		return undefined;
	const toLeft = Math.abs(x - shown.x);
	const toRight = Math.abs(x - right);
	const toTop = Math.abs(y - shown.y);
	const toBottom = Math.abs(y - bottom);
	const edges = {
		left: toLeft < reach && toLeft <= toRight,
		top: toTop < reach && toTop <= toBottom,
		right: false,
		bottom: false,
	};
	edges.right = !edges.left && toRight < reach;
	edges.bottom = !edges.top && toBottom < reach;
	return edges.left || edges.right || edges.top || edges.bottom
		? edges
		: undefined;
}

/** The grabbed edges moved to `to`, an image point already inside the image. */
export function dragEdges(crop: Rect, edges: Edges, to: Point): Rect {
	let left = crop.x;
	let top = crop.y;
	let right = crop.x + crop.width;
	let bottom = crop.y + crop.height;
	if (edges.left) left = Math.min(to.x, right - least);
	if (edges.right) right = Math.max(to.x, left + least);
	if (edges.top) top = Math.min(to.y, bottom - least);
	if (edges.bottom) bottom = Math.max(to.y, top + least);
	return { x: left, y: top, width: right - left, height: bottom - top };
}

/** The crop with its origin at `origin`, kept inside the image. */
export function moved(crop: Rect, origin: Point, pixels: Size): Rect {
	return {
		...crop,
		x: Math.min(Math.max(origin.x, 0), pixels.width - crop.width),
		y: Math.min(Math.max(origin.y, 0), pixels.height - crop.height),
	};
}

const arrows: Record<string, Point> = {
	ArrowLeft: { x: -1, y: 0 },
	ArrowRight: { x: 1, y: 0 },
	ArrowUp: { x: 0, y: -1 },
	ArrowDown: { x: 0, y: 1 },
};

/**
 * An arrow key moves the crop a hundredth of the image, a tenth with Shift;
 * with Alt it moves the right or bottom edge instead. Undefined for other keys.
 */
export function nudged(
	crop: Rect,
	pixels: Size,
	key: { key: string; shiftKey: boolean; altKey: boolean },
): Rect | undefined {
	const arrow = arrows[key.key];
	if (!arrow) return undefined;
	const share = key.shiftKey ? 0.1 : 0.01;
	const dx = arrow.x * Math.max(1, Math.round(pixels.width * share));
	const dy = arrow.y * Math.max(1, Math.round(pixels.height * share));
	if (!key.altKey)
		return moved(crop, { x: crop.x + dx, y: crop.y + dy }, pixels);
	const right = Math.min(
		Math.max(crop.x + crop.width + dx, crop.x + least),
		pixels.width,
	);
	const bottom = Math.min(
		Math.max(crop.y + crop.height + dy, crop.y + least),
		pixels.height,
	);
	return { ...crop, width: right - crop.x, height: bottom - crop.y };
}
