// The mosaic tree and its layout (iOS StitchEngine, ported from this tool),
// plus the picture geometry of iOS ImageStitcherPicture.

export type Side = 'top' | 'left' | 'right' | 'bottom';
export type Fit = 'match' | 'cheese' | 'matte';
export type Dir = 'row' | 'col';

export const SIDES: Side[] = ['top', 'left', 'right', 'bottom'];
export const FITS: Fit[] = ['match', 'cheese', 'matte'];
export const MATTE_COLOUR = '#ffffff';

export interface Src {
	id: string;
	name: string;
	el: CanvasImageSource;
	url: string;
	w: number;
	h: number;
}

export interface LeafNode {
	kind: 'img';
	key: string;
	srcId: string;
	fit: Fit;
}

export interface SplitNode {
	kind: 'split';
	key: string;
	dir: Dir;
	children: TreeNode[];
}

export type TreeNode = LeafNode | SplitNode;

export interface Rect {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface Op {
	src: Src;
	leafKey: string;
	isBase: boolean;
	fit: Fit;
	/** Source crop in image pixels. */
	source: Rect;
	/** Placement in composite pixels. */
	dest: Rect;
}

export interface Seam {
	id: string;
	splitKey: string;
	at: number;
	x: number;
	y: number;
	length: number;
	vertical: boolean;
}

export interface Layout {
	width: number;
	height: number;
	ops: Op[];
	seams: Seam[];
}

/** Where added images land. */
export type Target =
	| { kind: 'first' }
	/** Beside a node, or beside the whole composite when `node` is null. */
	| { kind: 'add'; node: string | null; side: Side }
	| { kind: 'insert'; split: string; at: number }
	| { kind: 'batch'; at: number };

/** Where a held tile is let go: the middle swaps, an edge band places beside. */
export type Drop =
	| { kind: 'swap'; key: string }
	| { kind: 'place'; key: string; side: Side };

let counter = 0;
const newKey = () => `n${++counter}`;

export const leaf = (srcId: string, fit: Fit = 'cheese'): LeafNode => ({
	kind: 'img',
	key: newKey(),
	srcId,
	fit,
});

export function leafSrcIds(node: TreeNode, into: string[] = []): string[] {
	if (node.kind === 'img') into.push(node.srcId);
	else node.children.forEach((c) => leafSrcIds(c, into));
	return into;
}

export function findLeaf(node: TreeNode, key: string): LeafNode | undefined {
	if (node.kind === 'img') return node.key === key ? node : undefined;
	for (const child of node.children) {
		const found = findLeaf(child, key);
		if (found) return found;
	}
	return undefined;
}

export function leafKeyOf(node: TreeNode, srcId: string): string | undefined {
	if (node.kind === 'img')
		return node.srcId === srcId ? node.key : undefined;
	for (const child of node.children) {
		const found = leafKeyOf(child, srcId);
		if (found) return found;
	}
	return undefined;
}

function mapLeaves(node: TreeNode, map: (l: LeafNode) => LeafNode): TreeNode {
	if (node.kind === 'img') return map(node);
	return {
		...node,
		children: node.children.map((c) => mapLeaves(c, map)),
	};
}

export const settingFit = (root: TreeNode, key: string, fit: Fit) =>
	mapLeaves(root, (l) => (l.key === key ? { ...l, fit } : l));

/** Wraps node `key` (null: the whole composite) in a split with `added` on `side`. */
export function wrapNode(
	root: TreeNode,
	key: string | null,
	side: Side,
	added: LeafNode[],
): TreeNode {
	const wrap = (node: TreeNode): TreeNode => ({
		kind: 'split',
		key: newKey(),
		dir: side === 'left' || side === 'right' ? 'row' : 'col',
		children:
			side === 'left' || side === 'top'
				? [...added, node]
				: [node, ...added],
	});
	if (key === null) return wrap(root);
	const walk = (node: TreeNode): TreeNode => {
		if (node.key === key) return wrap(node);
		if (node.kind === 'split')
			return { ...node, children: node.children.map(walk) };
		return node;
	};
	return walk(root);
}

export function insertIntoSplit(
	root: TreeNode,
	splitKey: string,
	at: number,
	added: LeafNode[],
): TreeNode {
	const walk = (node: TreeNode): TreeNode => {
		if (node.kind !== 'split') return node;
		if (node.key === splitKey) {
			const children = [...node.children];
			children.splice(
				Math.min(at, children.length),
				0,
				...added,
			);
			return { ...node, children };
		}
		return { ...node, children: node.children.map(walk) };
	};
	return walk(root);
}

/** Two leaves trade image and fit; the slots stay. */
export function swapLeafContent(
	root: TreeNode,
	aKey: string,
	bKey: string,
): TreeNode {
	const a = findLeaf(root, aKey);
	const b = findLeaf(root, bKey);
	if (!a || !b) return root;
	return mapLeaves(root, (l) => {
		if (l.key === aKey) return { ...l, srcId: b.srcId, fit: b.fit };
		if (l.key === bKey) return { ...l, srcId: a.srcId, fit: a.fit };
		return l;
	});
}

/** Removes a leaf; single-child splits collapse. Null when empty. */
export function removeLeafNode(root: TreeNode, key: string): TreeNode | null {
	if (root.kind === 'img') return root.key === key ? null : root;
	const children = root.children
		.map((c) => removeLeafNode(c, key))
		.filter((c): c is TreeNode => !!c);
	if (children.length === 0) return null;
	if (children.length === 1) return children[0]!;
	return { ...root, children };
}

export function moveLeafNode(
	root: TreeNode,
	movedKey: string,
	targetKey: string,
	side: Side,
): TreeNode {
	if (movedKey === targetKey) return root;
	const moved = findLeaf(root, movedKey);
	const without = removeLeafNode(root, movedKey);
	if (!moved || !without) return root;
	return wrapNode(without, targetKey, side, [moved]);
}

export function coverCrop(src: Src, aspect: number): Rect {
	if (src.w / src.h > aspect) {
		const width = src.h * aspect;
		return { x: (src.w - width) / 2, y: 0, width, height: src.h };
	}
	const height = src.w / aspect;
	return { x: 0, y: (src.h - height) / 2, width: src.w, height };
}

function nodeAspect(
	node: TreeNode,
	byId: Map<string, Src>,
	baseAspect: number,
): number {
	if (node.kind === 'img') {
		const src = byId.get(node.srcId);
		if (!src) return 1;
		return node.fit === 'cheese' ? src.w / src.h : baseAspect;
	}
	const as = node.children.map((c) => nodeAspect(c, byId, baseAspect));
	return node.dir === 'row'
		? as.reduce((s, a) => s + a, 0)
		: 1 / as.reduce((s, a) => s + 1 / a, 0);
}

/** Every leaf's crop and place and every seam, the base at its own pixel size. */
export function layoutTree(
	root: TreeNode,
	byId: Map<string, Src>,
	baseId: string,
): Layout | null {
	const base = byId.get(baseId);
	if (!base) return null;
	const baseAspect = base.w / base.h;
	const ops: Op[] = [];
	const seams: Seam[] = [];
	const walk = (node: TreeNode, rect: Rect) => {
		const { x, y, width: w, height: h } = rect;
		if (node.kind === 'img') {
			const src = byId.get(node.srcId);
			if (!src) return;
			ops.push({
				src,
				leafKey: node.key,
				isBase: node.srcId === baseId,
				fit: node.fit,
				source:
					node.fit === 'match'
						? coverCrop(src, w / h)
						: {
								x: 0,
								y: 0,
								width: src.w,
								height: src.h,
							},
				dest: rect,
			});
			return;
		}
		const as = node.children.map((c) =>
			nodeAspect(c, byId, baseAspect),
		);
		const row = node.dir === 'row';
		const shares = row ? as : as.map((a) => 1 / a);
		const total = shares.reduce((s, a) => s + a, 0);
		let at = row ? x : y;
		node.children.forEach((child, i) => {
			const span = (row ? w : h) * (shares[i]! / total);
			if (i > 0)
				seams.push({
					id: `${node.key}-${i}`,
					splitKey: node.key,
					at: i,
					x: row ? at : x,
					y: row ? y : at,
					length: row ? h : w,
					vertical: row,
				});
			walk(
				child,
				row
					? { x: at, y, width: span, height: h }
					: { x, y: at, width: w, height: span },
			);
			at += span;
		});
	};
	const rootAspect = nodeAspect(root, byId, baseAspect);
	walk(root, { x: 0, y: 0, width: rootAspect * 1000, height: 1000 });
	const baseOp = ops.find((o) => o.isBase);
	const k = baseOp ? base.w / baseOp.dest.width : 1;
	const scale = (r: Rect): Rect => ({
		x: r.x * k,
		y: r.y * k,
		width: r.width * k,
		height: r.height * k,
	});
	return {
		width: rootAspect * 1000 * k,
		height: 1000 * k,
		ops: ops.map((op) => ({ ...op, dest: scale(op.dest) })),
		seams: seams.map((s) => ({
			...s,
			x: s.x * k,
			y: s.y * k,
			length: s.length * k,
		})),
	};
}

/** Near-square grid, each cell the first image's size, every image cover-cropped to it. */
export function layoutBatch(srcs: Src[]): Layout | null {
	const first = srcs[0];
	if (!first) return null;
	const { w: cellW, h: cellH } = first;
	const cols = Math.ceil(Math.sqrt(srcs.length));
	return {
		width: cols * cellW,
		height: Math.ceil(srcs.length / cols) * cellH,
		ops: srcs.map((src, i) => ({
			src,
			leafKey: src.id,
			isBase: i === 0,
			fit: 'match',
			source: coverCrop(src, cellW / cellH),
			dest: {
				x: (i % cols) * cellW,
				y: Math.floor(i / cols) * cellH,
				width: cellW,
				height: cellH,
			},
		})),
		seams: [],
	};
}

export function batchGrid(layout: Layout) {
	const cell = layout.ops[0]?.dest;
	if (!cell) return { columns: 0, rows: 0 };
	return {
		columns: Math.round(layout.width / cell.width),
		rows: Math.round(layout.height / cell.height),
	};
}

// canvas side cap; 64 MP is 256 MB of RGBA
export const maxExportSide = 16384;
export const maxExportPixels = 64_000_000;

/** The pixel size a layout renders at, downscaled past either cap. */
export function exportSize(width: number, height: number) {
	const area = Math.max(width * height, 1);
	const scale = Math.min(
		1,
		maxExportSide / Math.max(width, height, 1),
		Math.sqrt(maxExportPixels / area),
	);
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	};
}

/** Draws the layout at its export size; `opaque` mattes the canvas white first. */
export function drawLayout(
	canvas: HTMLCanvasElement,
	layout: Layout,
	opaque: boolean,
) {
	const size = exportSize(layout.width, layout.height);
	const scale = size.width / Math.max(layout.width, 1);
	canvas.width = size.width;
	canvas.height = size.height;
	const ctx = canvas.getContext('2d');
	if (!ctx) return;
	ctx.imageSmoothingQuality = 'high';
	if (opaque) {
		ctx.fillStyle = MATTE_COLOUR;
		ctx.fillRect(0, 0, size.width, size.height);
	}
	for (const op of layout.ops) {
		const d = op.dest;
		const dest = {
			x: d.x * scale,
			y: d.y * scale,
			width: d.width * scale,
			height: d.height * scale,
		};
		if (op.fit === 'matte') {
			ctx.fillStyle = MATTE_COLOUR;
			ctx.fillRect(dest.x, dest.y, dest.width, dest.height);
		}
		const s = op.source;
		const at = imageFrame(op, dest);
		if (op.fit === 'match')
			ctx.drawImage(
				op.src.el,
				s.x,
				s.y,
				s.width,
				s.height,
				dest.x,
				dest.y,
				dest.width,
				dest.height,
			);
		else
			ctx.drawImage(
				op.src.el,
				dest.x + at.x,
				dest.y + at.y,
				at.width,
				at.height,
			);
	}
}

/** Where the whole image sits inside a tile of `box`, relative to the tile. */
export function imageFrame(
	op: Pick<Op, 'fit' | 'source' | 'src'>,
	box: { width: number; height: number },
): Rect {
	const { w, h } = op.src;
	if (op.fit === 'cheese')
		return { x: 0, y: 0, width: box.width, height: box.height };
	if (op.fit === 'match') {
		const scale = box.width / Math.max(op.source.width, 1);
		return {
			x: -op.source.x * scale,
			y: -op.source.y * scale,
			width: w * scale,
			height: h * scale,
		};
	}
	const scale = Math.min(
		box.width / Math.max(w, 1),
		box.height / Math.max(h, 1),
	);
	const width = w * scale;
	const height = h * scale;
	return {
		x: (box.width - width) / 2,
		y: (box.height - height) / 2,
		width,
		height,
	};
}

// iOS ImageStitcherPicture.tuning, in CSS px
export const tuning = {
	gutter: 26,
	gap: 6,
	// a dimension line (32) and its gap
	dimension: 38,
	hold: 300,
	ghost: 76,
	lift: 22,
	band: 28,
	roomy: 120,
	button: 26,
	adder: 28,
};

/** The composite fitted into `area` with room for gutters and the dimension lines on the top and left. */
export function compositeFrame(
	size: { width: number; height: number },
	area: Rect,
	gutters: boolean,
): Rect {
	const gutter = gutters ? tuning.gutter + tuning.gap : 0;
	const { dimension } = tuning;
	const room = {
		width: area.width - dimension - gutter * 2,
		height: area.height - dimension - gutter * 2,
	};
	if (
		size.width <= 0 ||
		size.height <= 0 ||
		room.width <= 0 ||
		room.height <= 0
	)
		return { x: 0, y: 0, width: 0, height: 0 };
	const scale = Math.min(
		room.width / size.width,
		room.height / size.height,
	);
	const width = size.width * scale;
	const height = size.height * scale;
	return {
		x:
			area.x +
			(area.width - width - dimension - gutter * 2) / 2 +
			gutter +
			dimension,
		y:
			area.y +
			(area.height - height - dimension - gutter * 2) / 2 +
			dimension +
			gutter,
		width,
		height,
	};
}

/** `pixels` in composite pixels mapped onto the frame on screen. */
export function onScreen(pixels: Rect, frame: Rect, layout: Layout): Rect {
	const scale = frame.width / Math.max(layout.width, 1);
	return {
		x: frame.x + pixels.x * scale,
		y: frame.y + pixels.y * scale,
		width: pixels.width * scale,
		height: pixels.height * scale,
	};
}

export const contains = (r: Rect, x: number, y: number) =>
	x >= r.x && x < r.x + r.width && y >= r.y && y < r.y + r.height;

/** The nearest edge of `rect` and the distance to it, negative outside. */
export function nearest(x: number, y: number, rect: Rect) {
	const distances: [Side, number][] = [
		['top', y - rect.y],
		['left', x - rect.x],
		['right', rect.x + rect.width - x],
		['bottom', rect.y + rect.height - y],
	];
	return distances.reduce((a, b) => (b[1] < a[1] ? b : a));
}

export const band = (rect: Rect) =>
	Math.min(tuning.band, rect.width * 0.3, rect.height * 0.3);

export function drop(
	x: number,
	y: number,
	tiles: { key: string; rect: Rect }[],
	excluding: string,
): Drop | undefined {
	const tile = tiles.find(
		(t) => t.key !== excluding && contains(t.rect, x, y),
	);
	if (!tile) return undefined;
	const [side, distance] = nearest(x, y, tile.rect);
	return distance < band(tile.rect)
		? { kind: 'place', key: tile.key, side }
		: { kind: 'swap', key: tile.key };
}

/** The edge band of `rect` on `side`. */
export function zone(side: Side, rect: Rect): Rect {
	const b = band(rect);
	switch (side) {
		case 'top':
			return { ...rect, height: b };
		case 'left':
			return { ...rect, width: b };
		case 'right':
			return {
				...rect,
				x: rect.x + rect.width - b,
				width: b,
			};
		case 'bottom':
			return {
				...rect,
				y: rect.y + rect.height - b,
				height: b,
			};
	}
}

/** Centres for seam buttons of `side` px, short seams first, sliding along a seam to clear the others. */
export function seamCentres(
	lines: { id: string; line: Rect }[],
	side: number,
): { id: string; x: number; y: number }[] {
	const placed: { id: string; x: number; y: number }[] = [];
	const longest = (r: Rect) => Math.max(r.width, r.height);
	for (const { id, line } of [...lines].sort(
		(a, b) => longest(a.line) - longest(b.line),
	)) {
		const vertical = line.width < line.height;
		const reach = Math.max(0, longest(line) / 2 - side / 2);
		const mid = {
			x: line.x + line.width / 2,
			y: line.y + line.height / 2,
		};
		const spots: { x: number; y: number }[] = [];
		for (let step = 0; step <= 16; step++) {
			const offset =
				Math.floor((step + 1) / 2) *
				(step % 2 === 0 ? -1 : 1) *
				(side + 4);
			if (Math.abs(offset) > reach) continue;
			spots.push(
				vertical
					? { x: mid.x, y: mid.y + offset }
					: { x: mid.x + offset, y: mid.y },
			);
		}
		const free = spots.find(
			(spot) =>
				!placed.some(
					(p) =>
						Math.hypot(
							p.x - spot.x,
							p.y - spot.y,
						) <
						side + 2,
				),
		);
		placed.push({ id, ...(free ?? mid) });
	}
	return placed;
}
