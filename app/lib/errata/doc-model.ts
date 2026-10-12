import type { Anchor } from 'delphitools-v2/lib/pdf-stamp';

export type Rotation = 0 | 90 | 180 | 270;
export type { Anchor } from 'delphitools-v2/lib/pdf-stamp';

/** displayed page space: points, origin top-left, centre-anchored objects */
interface BaseObject {
	id: string;
	cx: number;
	cy: number;
	w: number;
	h: number;
	scaleX: number;
	scaleY: number;
	/** degrees, clockwise on screen */
	angle: number;
}

export interface TextObject extends BaseObject {
	kind: 'text';
	text: string;
	fontSize: number;
	colour: string;
	/** 0..1, absent is opaque */
	opacity?: number;
}

/** d is in local coords, 0..w by 0..h */
export interface InkObject extends BaseObject {
	kind: 'ink';
	d: string;
	colour: string;
	strokeWidth: number;
}

export type ShapeKind = 'rect' | 'ellipse' | 'line' | 'highlight';

export interface ShapeObject extends BaseObject {
	kind: 'shape';
	shape: ShapeKind;
	colour: string;
	strokeWidth: number;
}

/** PNG data url, used for signatures */
export interface ImageObject extends BaseObject {
	kind: 'image';
	dataUrl: string;
}

/** a PDF /Text annotation; w and h are the note icon */
export interface CommentObject extends BaseObject {
	kind: 'comment';
	text: string;
	author: string;
	/** ISO 8601, empty when unknown */
	date: string;
}

/** burnt in on export */
export interface RedactObject extends BaseObject {
	kind: 'redact';
}

export type FieldType =
	'text' | 'checkbox' | 'radio' | 'dropdown' | 'signature';

export interface FieldObject extends BaseObject {
	kind: 'field';
	field: FieldType;
	name: string;
	/** radio buttons, dropdown choices */
	options: string[];
	required: boolean;
	/** ticked checkbox: 'on' */
	value: string;
}

export type PageObject =
	| TextObject
	| InkObject
	| ShapeObject
	| ImageObject
	| CommentObject
	| RedactObject
	| FieldObject;

export interface Stamped {
	index: number;
	object: PageObject;
}

export interface PageImage {
	dataUrl: string;
	naturalWidth: number;
	naturalHeight: number;
}

export type ResizeMode = 'anchor' | 'fit' | 'fill';

/** unrotated page space, points, y down */
export interface PageResize {
	width: number;
	height: number;
	mode: ResizeMode;
	anchor: Anchor;
	/** points on every side, inside width/height; content is placed on the trim box */
	bleed?: number;
}

/** unrotated source box coordinates, y down, relative to its top-left */
export interface PageCrop {
	x: number;
	y: number;
	width: number;
	height: number;
}

/** an edit to the source page's content stream, applied in order on the result of the previous one */
export type ContentEdit =
	| {
			kind: 'move';
			/** '' for the page stream, else the form XObject path */
			stream: string;
			from: number;
			to: number;
			/** user space delta, points */
			dx: number;
			dy: number;
	  }
	| { kind: 'delete'; stream: string; from: number; to: number }
	| {
			kind: 'text';
			stream: string;
			from: number;
			to: number;
			/** unicode where the font knows it, for display only */
			text: string;
			/** charcodes in the run's own font, or WinAnsi when `font` is set */
			codes: number[];
			/** the run's font lacked a glyph; written in this standard font instead */
			font?: 'Helvetica';
	  };

export interface ErrataPage {
	id: string;
	/** index into the source pdf, null for blank and image pages */
	sourceIndex: number | null;
	image: PageImage | null;
	/** the source page's own /Rotate */
	baseRotation: Rotation;
	/** added by the user */
	rotation: Rotation;
	/** unrotated crop box, points */
	baseWidth: number;
	baseHeight: number;
	crop: PageCrop | null;
	resize: PageResize | null;
	objects: PageObject[];
	edits: ContentEdit[];
}

export interface ErrataDoc {
	name: string;
	pages: ErrataPage[];
	/** source.ts version id */
	source?: string;
}

export function newId(): string {
	return crypto.randomUUID();
}

export function totalRotation(page: ErrataPage): Rotation {
	return ((page.baseRotation + page.rotation) % 360) as Rotation;
}

export function contentBox(page: ErrataPage): PageCrop {
	return (
		page.crop ?? {
			x: 0,
			y: 0,
			width: page.baseWidth,
			height: page.baseHeight,
		}
	);
}

export function unrotatedSize(page: ErrataPage): {
	width: number;
	height: number;
} {
	if (page.resize)
		return { width: page.resize.width, height: page.resize.height };
	const c = contentBox(page);
	return { width: c.width, height: c.height };
}

export function pageSize(page: ErrataPage): { width: number; height: number } {
	const u = unrotatedSize(page);
	const swap = totalRotation(page) % 180 !== 0;
	return swap ? { width: u.height, height: u.width } : u;
}

export const A4_POINTS = { width: 595.28, height: 841.89 };

/** where the content box lands on the unrotated page, y down */
export interface Placement {
	x: number;
	y: number;
	scale: number;
}

export function contentPlacement(page: ErrataPage): Placement {
	const resize = page.resize;
	if (!resize) return { x: 0, y: 0, scale: 1 };
	const c = contentBox(page);
	const b = resize.bleed ?? 0;
	const tw = resize.width - 2 * b;
	const th = resize.height - 2 * b;
	if (resize.mode !== 'anchor') {
		const rx = tw / c.width;
		const ry = th / c.height;
		const scale =
			resize.mode === 'fit'
				? Math.min(rx, ry)
				: Math.max(rx, ry);
		return {
			x: b + (tw - c.width * scale) / 2,
			y: b + (th - c.height * scale) / 2,
			scale,
		};
	}
	const [v, h] = resize.anchor.split('-');
	const x =
		h === 'left'
			? 0
			: h === 'center'
				? (tw - c.width) / 2
				: tw - c.width;
	const y =
		v === 'top'
			? 0
			: v === 'middle'
				? (th - c.height) / 2
				: th - c.height;
	return { x: b + x, y: b + y, scale: 1 };
}

const ANCHOR_GRID: Anchor[][] = [
	['top-left', 'top-center', 'top-right'],
	['middle-left', 'middle-center', 'middle-right'],
	['bottom-left', 'bottom-center', 'bottom-right'],
];

/** quarter turns clockwise */
export function rotateAnchor(anchor: Anchor, turns: number): Anchor {
	let row = ANCHOR_GRID.findIndex((r) => r.includes(anchor));
	let col = ANCHOR_GRID[row]!.indexOf(anchor);
	for (let i = 0; i < ((turns % 4) + 4) % 4; i++) {
		[col, row] = [2 - row, col];
	}
	return ANCHOR_GRID[row]![col]!;
}

/** displayed top-left point to unrotated page space, both y down */
export function displayedToUnrotated(
	dx: number,
	dy: number,
	rotation: Rotation,
	width: number,
	height: number,
): { x: number; y: number } {
	switch (rotation) {
		case 0:
			return { x: dx, y: dy };
		case 90:
			return { x: dy, y: height - dx };
		case 180:
			return { x: width - dx, y: height - dy };
		case 270:
			return { x: width - dy, y: dx };
	}
}

export function unrotatedToDisplayed(
	x: number,
	y: number,
	rotation: Rotation,
	width: number,
	height: number,
): { x: number; y: number } {
	switch (rotation) {
		case 0:
			return { x, y };
		case 90:
			return { x: height - y, y: x };
		case 180:
			return { x: width - x, y: height - y };
		case 270:
			return { x: y, y: width - x };
	}
}

/** keeps objects attached to the content when crop or resize changes */
export function retargetObjects(
	prev: ErrataPage,
	next: ErrataPage,
): PageObject[] {
	const r = totalRotation(prev);
	const pu = unrotatedSize(prev);
	const nu = unrotatedSize(next);
	const pp = contentPlacement(prev);
	const np = contentPlacement(next);
	const pc = contentBox(prev);
	const nc = contentBox(next);
	const ratio = np.scale / pp.scale;
	return prev.objects.map((o) => {
		const u = displayedToUnrotated(
			o.cx,
			o.cy,
			r,
			pu.width,
			pu.height,
		);
		const sx = pc.x + (u.x - pp.x) / pp.scale;
		const sy = pc.y + (u.y - pp.y) / pp.scale;
		const nx = np.x + (sx - nc.x) * np.scale;
		const ny = np.y + (sy - nc.y) * np.scale;
		const d = unrotatedToDisplayed(nx, ny, r, nu.width, nu.height);
		return {
			...o,
			cx: d.x,
			cy: d.y,
			scaleX: o.scaleX * ratio,
			scaleY: o.scaleY * ratio,
		};
	});
}

export function withResize(
	page: ErrataPage,
	resize: PageResize | null,
): ErrataPage {
	const next = { ...page, resize };
	return { ...next, objects: retargetObjects(page, next) };
}

export function withCrop(page: ErrataPage, crop: PageCrop | null): ErrataPage {
	const next = { ...page, crop };
	return { ...next, objects: retargetObjects(page, next) };
}

export function addRotation(a: Rotation, b: number): Rotation {
	return ((((a + b) % 360) + 360) % 360) as Rotation;
}

/** displayed top-left point to unrotated pdf user space (y up), before the crop box offset */
export function displayedToUser(
	dx: number,
	dy: number,
	rotation: Rotation,
	width: number,
	height: number,
): { x: number; y: number } {
	const u = displayedToUnrotated(dx, dy, rotation, width, height);
	return { x: u.x, y: height - u.y };
}

/** rotate a page a quarter turn clockwise, carrying its objects */
export function rotatePage(page: ErrataPage, quarterTurns: 1 | -1): ErrataPage {
	const { width, height } = pageSize(page);
	const objects = page.objects.map((o) =>
		quarterTurns === 1
			? {
					...o,
					cx: height - o.cy,
					cy: o.cx,
					angle: o.angle + 90,
				}
			: {
					...o,
					cx: o.cy,
					cy: width - o.cx,
					angle: o.angle - 90,
				},
	);
	return {
		...page,
		rotation: addRotation(page.rotation, quarterTurns * 90),
		objects,
	};
}

export function blankPage(width: number, height: number): ErrataPage {
	return {
		id: newId(),
		sourceIndex: null,
		image: null,
		baseRotation: 0,
		rotation: 0,
		baseWidth: width,
		baseHeight: height,
		crop: null,
		resize: null,
		objects: [],
		edits: [],
	};
}

/** canvas-style affine: x' = a x + c y + e, y' = b x + d y + f */
export type Matrix = [number, number, number, number, number, number];

export function multiply(m: Matrix, n: Matrix): Matrix {
	// m after n
	return [
		m[0] * n[0] + m[2] * n[1],
		m[1] * n[0] + m[3] * n[1],
		m[0] * n[2] + m[2] * n[3],
		m[1] * n[2] + m[3] * n[3],
		m[0] * n[4] + m[2] * n[5] + m[4],
		m[1] * n[4] + m[3] * n[5] + m[5],
	];
}

export function applyMatrix(m: Matrix, x: number, y: number) {
	return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

/** unrotated source box space (y down) to pixels of a tile covering `region` of the displayed page at `scale` */
export function tileTransform(
	page: ErrataPage,
	region: PageCrop,
	scale: number,
): Matrix {
	const c = contentBox(page);
	const p = contentPlacement(page);
	const u = unrotatedSize(page);
	const place: Matrix = [
		p.scale,
		0,
		0,
		p.scale,
		p.x - c.x * p.scale,
		p.y - c.y * p.scale,
	];
	const rotate: Matrix = (
		{
			0: [1, 0, 0, 1, 0, 0],
			90: [0, 1, -1, 0, u.height, 0],
			180: [-1, 0, 0, -1, u.width, u.height],
			270: [0, -1, 1, 0, 0, u.width],
		} as Record<Rotation, Matrix>
	)[totalRotation(page)];
	const tile: Matrix = [
		scale,
		0,
		0,
		scale,
		-region.x * scale,
		-region.y * scale,
	];
	return multiply(tile, multiply(rotate, place));
}
