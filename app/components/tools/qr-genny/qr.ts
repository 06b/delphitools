import qrcode from 'qrcode-generator';
import type { CodeSheet, Point } from './code-sheet';

/**
 * The QR code as qr-code-styling 1.9 writes it, as a CodeSheet: the same
 * matrix, module size, offsets, shapes, eyes and logo clearing, so the
 * picture is the export.
 */
export type DotType =
	| 'square'
	| 'rounded'
	| 'dots'
	| 'classy'
	| 'classy-rounded'
	| 'extra-rounded'
	| 'diamond'
	| 'cushion';
export type CornerSquareType =
	'square' | 'dot' | 'extra-rounded' | 'leaf' | 'shield' | 'diamond';
export type CornerDotType =
	'square' | 'dot' | 'rounded' | 'diamond' | 'leaf' | 'cushion';
export type ErrorLevel = 'L' | 'M' | 'Q' | 'H';

const XML_ESCAPES: Record<string, string> = {
	'&': '&amp;',
	'<': '&lt;',
	'>': '&gt;',
	"'": '&apos;',
	'"': '&quot;',
};

export function escapeXml(value: string): string {
	return value.replace(/[&<>'"]/g, (c) => XML_ESCAPES[c] ?? c);
}

export const INFO_FONT =
	'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif';

// qr-code-styling's getMode
export function qrMode(data: string): 'Numeric' | 'Alphanumeric' | 'Byte' {
	if (/^[0-9]*$/.test(data)) return 'Numeric';
	if (/^[0-9A-Z $%*+\-./:]*$/.test(data)) return 'Alphanumeric';
	return 'Byte';
}

let cached: { key: string; matrix: boolean[][] | undefined } | undefined;

/** The module matrix qr-code-styling encodes; none when `data` does not fit a QR code. */
export function qrMatrix(
	data: string,
	level: ErrorLevel,
): boolean[][] | undefined {
	const key = `${level}\n${data}`;
	if (cached?.key === key) return cached.matrix;
	let matrix: boolean[][] | undefined;
	try {
		const qr = qrcode(0, level);
		qr.addData(data, qrMode(data));
		qr.make();
		const n = qr.getModuleCount();
		matrix = Array.from({ length: n }, (_, r) =>
			Array.from({ length: n }, (_, c) => qr.isDark(r, c)),
		);
	} catch {
		// code length overflow
		matrix = undefined;
	}
	cached = { key, matrix };
	return matrix;
}

/** Version from a module count. */
export const versionOf = (count: number) => (count - 17) / 4;

export interface QrLayout {
	count: number;
	/** Px per module, whole: dotsOptions.roundSize. */
	dot: number;
	/** Px from the image's edge to the code. */
	offset: number;
}

/** qr-code-styling's drawDots sizes for a square image of `size` px; none below 1 px a module. */
export function qrLayout(
	count: number,
	size: number,
	margin: number,
): QrLayout | undefined {
	if (count > size) return;
	const inner = size - 2 * Math.min(margin, size);
	const dot = Math.floor(inner / count);
	if (dot < 1) return;
	return { count, dot, offset: Math.floor((size - count * dot) / 2) };
}

const hiddenShare: Record<ErrorLevel, number> = {
	L: 0.07,
	M: 0.15,
	Q: 0.25,
	H: 0.3,
};

export interface LogoSpace {
	/** Modules cleared across and down, centred. */
	hideX: number;
	hideY: number;
	/** The logo's px box, its margin included. */
	width: number;
	height: number;
}

/** qr-code-styling's calculateImageSize. */
export function logoSpace(
	count: number,
	dot: number,
	image: { width: number; height: number },
	imageSize: number,
	level: ErrorLevel,
): LogoSpace {
	const maxHidden = Math.floor(
		imageSize * hiddenShare[level] * count * count,
	);
	const maxAxis = count - 14;
	const none = { hideX: 0, hideY: 0, width: 0, height: 0 };
	if (image.height <= 0 || image.width <= 0 || maxHidden <= 0 || dot <= 0)
		return none;
	const k = image.height / image.width;
	let hideX = Math.floor(Math.sqrt(maxHidden / k));
	if (hideX <= 0) hideX = 1;
	if (maxAxis && maxAxis < hideX) hideX = maxAxis;
	if (hideX % 2 === 0) hideX--;
	let width = hideX * dot;
	let hideY = 1 + 2 * Math.ceil((hideX * k - 1) / 2);
	let height = Math.round(width * k);
	if (hideY * hideX > maxHidden || (maxAxis && maxAxis < hideY)) {
		if (maxAxis && maxAxis < hideY) {
			hideY = maxAxis;
			if (hideY % 2 === 0) hideX--;
		} else {
			hideY -= 2;
		}
		height = hideY * dot;
		hideX = 1 + 2 * Math.ceil((hideY / k - 1) / 2);
		width = Math.round(height / k);
	}
	return { hideX, hideY, width, height };
}

export const inFinder = (r: number, c: number, count: number) =>
	(r < 7 && c < 7) ||
	(r < 7 && c >= count - 7) ||
	(c < 7 && r >= count - 7);

/** Corner radii, top-left then clockwise. */
type Radii = readonly [number, number, number, number];

/** A rect with rounded corners inside its square, or the diamond in it. */
export interface Shape {
	/** Share of the side cut from every edge. */
	inset?: number;
	radii?: Radii | number;
	diamond?: boolean;
}

const f = (n: number) => +n.toFixed(3);

/** Path data of `shape` in the square at (x, y), `side` long. */
export function shapeData(shape: Shape, x: number, y: number, side: number) {
	const cut = (shape.inset ?? 0) * side;
	const l = x + cut;
	const t = y + cut;
	const w = side - 2 * cut;
	if (shape.diamond)
		return `M${f(l + w / 2)} ${f(t)}L${f(l + w)} ${f(t + w / 2)}L${f(l + w / 2)} ${f(t + w)}L${f(l)} ${f(t + w / 2)}Z`;
	const radii = shape.radii ?? 0;
	const [tl, tr, br, bl] = (
		typeof radii === 'number' ? [radii, radii, radii, radii] : radii
	).map((r) => r * side);
	const arc = (r: number, ex: number, ey: number) =>
		r ? `A${f(r)} ${f(r)} 0 0 1 ${f(ex)} ${f(ey)}` : '';
	return (
		`M${f(l + tl!)} ${f(t)}H${f(l + w - tr!)}${arc(tr!, l + w, t + tr!)}` +
		`V${f(t + w - br!)}${arc(br!, l + w - br!, t + w)}` +
		`H${f(l + bl!)}${arc(bl!, l, t + w - bl!)}` +
		`V${f(t + tl!)}${arc(tl!, l + tl!, t)}Z`
	);
}

/** `radii` turned `quarters` × 90° clockwise. */
function turn(radii: Radii, quarters: number): Radii {
	const out = [0, 0, 0, 0];
	radii.forEach((r, i) => (out[(i + quarters + 4) % 4] = r));
	return out as unknown as Radii;
}

const SQUARE: Shape = {};
const DOT: Shape = { radii: 0.5 };

/** QRDot.draw for one dark module whose dark neighbours are left, right, top and bottom; iOS dotPath for diamond and cushion. */
export function dotShape(
	type: DotType,
	left: boolean,
	right: boolean,
	top: boolean,
	bottom: boolean,
): Shape {
	const count = +left + +right + +top + +bottom;
	switch (type) {
		case 'dots':
			return DOT;
		case 'diamond':
			return { inset: 0.05, diamond: true };
		case 'cushion':
			return { inset: 0.05, radii: 0.35 };
		case 'rounded':
		case 'extra-rounded': {
			if (count === 0) return DOT;
			if (count > 2 || (left && right) || (top && bottom))
				return SQUARE;
			if (count === 2) {
				const r = type === 'rounded' ? 0.5 : 1;
				const quarters =
					left && top
						? 1
						: top && right
							? 2
							: right && bottom
								? -1
								: 0;
				return { radii: turn([0, r, 0, 0], quarters) };
			}
			return {
				radii: turn(
					[0, 0.5, 0.5, 0],
					top ? 1 : right ? 2 : bottom ? -1 : 0,
				),
			};
		}
		case 'classy':
		case 'classy-rounded': {
			const r = type === 'classy' ? 0.5 : 1;
			if (count === 0) return { radii: [0.5, 0, 0.5, 0] };
			if (!left && !top) return { radii: [r, 0, 0, 0] };
			if (!right && !bottom) return { radii: [0, 0, r, 0] };
			return SQUARE;
		}
		default:
			return SQUARE;
	}
}

const units = new Map<string, Path2D>();

/** The module's path in the unit square, for the picture. */
export function dotPath(
	type: DotType,
	left: boolean,
	right: boolean,
	top: boolean,
	bottom: boolean,
): Path2D {
	const data = shapeData(
		dotShape(type, left, right, top, bottom),
		0,
		0,
		1,
	);
	let path = units.get(data);
	if (!path) units.set(data, (path = new Path2D(data)));
	return path;
}

// ring outer and hole, in sevenths and fifths of their sides
const EYES: Record<CornerSquareType, [Shape, Shape]> = {
	square: [SQUARE, SQUARE],
	dot: [DOT, DOT],
	'extra-rounded': [{ radii: 2.5 / 7 }, { radii: 1.5 / 5 }],
	leaf: [{ radii: [0.5, 0, 0.5, 0] }, { radii: [0.5, 0, 0.5, 0] }],
	shield: [
		{ radii: [2 / 7, 2 / 7, 0, 0] },
		{ radii: [1.2 / 5, 1.2 / 5, 0, 0] },
	],
	diamond: [{ diamond: true }, { diamond: true }],
};

const PUPILS: Record<CornerDotType, Shape> = {
	square: SQUARE,
	dot: DOT,
	rounded: { radii: 0.8 / 3 },
	diamond: { diamond: true },
	leaf: { radii: [0.5, 0, 0.5, 0] },
	cushion: { inset: 0.05, radii: 0.35 },
};

/** A finder's 7 × 7 ring at (x, y), `module` per module, filled even-odd. */
export function eyeData(
	type: CornerSquareType,
	x: number,
	y: number,
	module = 1,
) {
	const [ring, hole] = EYES[type];
	return (
		shapeData(ring, x, y, 7 * module) +
		shapeData(hole, x + module, y + module, 5 * module)
	);
}

/** A finder's 3 × 3 pupil, its eye at (x, y). */
export function pupilData(
	type: CornerDotType,
	x: number,
	y: number,
	module = 1,
) {
	return shapeData(
		PUPILS[type],
		x + 2 * module,
		y + 2 * module,
		3 * module,
	);
}

// swatch drawings, as iOS QRGeneratorViewController draws them
const patch = [
	[true, true, false],
	[true, false, true],
	[false, true, true],
];

function fillCells(
	context: CanvasRenderingContext2D,
	cells: boolean[][],
	type: DotType,
	module: number,
) {
	const dark = (r: number, c: number) => cells[r]?.[c] === true;
	const path = new Path2D();
	cells.forEach((row, r) =>
		row.forEach((on, c) => {
			if (!on) return;
			path.addPath(
				dotPath(
					type,
					dark(r, c - 1),
					dark(r, c + 1),
					dark(r - 1, c),
					dark(r + 1, c),
				),
				{
					a: module,
					d: module,
					e: c * module,
					f: r * module,
				},
			);
		}),
	);
	context.fill(path);
}

/** Three by three modules in a dot style, filling `side` px. */
export function drawDots(
	context: CanvasRenderingContext2D,
	side: number,
	type: DotType,
	ink: string,
) {
	context.fillStyle = ink;
	fillCells(context, patch, type, side / 3);
}

/** One finder, filling `side` px. */
export function drawEye(
	context: CanvasRenderingContext2D,
	side: number,
	eye: CornerSquareType,
	pupil: CornerDotType,
	ink: string,
) {
	context.save();
	context.scale(side / 7, side / 7);
	context.fillStyle = ink;
	context.fill(new Path2D(eyeData(eye, 0, 0)), 'evenodd');
	context.fill(new Path2D(pupilData(pupil, 0, 0)));
	context.restore();
}

const sampleCells = [
	[0, 8],
	[1, 8],
	[1, 9],
	[3, 9],
	[8, 0],
	[8, 1],
	[9, 1],
	[9, 3],
	[8, 5],
	[9, 5],
	[9, 6],
	[7, 8],
	[8, 8],
	[8, 9],
] as const;
const sample = Array.from({ length: 10 }, (_, r) =>
	Array.from({ length: 10 }, (_, c) =>
		sampleCells.some(([sr, sc]) => sr === r && sc === c),
	),
);

/** A corner of a code in a whole style, filling `side` px. */
export function drawSample(
	context: CanvasRenderingContext2D,
	side: number,
	dot: DotType,
	eye: CornerSquareType,
	pupil: CornerDotType,
	ink: string,
) {
	drawEye(context, (side * 7) / 10, eye, pupil, ink);
	context.fillStyle = ink;
	fillCells(context, sample, dot, side / 10);
}

export interface Logo {
	image: CanvasImageSource;
	width: number;
	height: number;
	/** Identifies the image in the marks key. */
	id: string;
}

export interface QrStyle {
	size: number;
	/** Px round the code: padding × 4. */
	margin: number;
	level: ErrorLevel;
	dotType: DotType;
	cornerSquareType: CornerSquareType;
	cornerDotType: CornerDotType;
	ink: string;
	/** None: transparent. */
	paper?: string;
	logo?: Logo;
	/** Share of the code, 0.1 to 0.5. */
	logoSize: number;
	logoMargin: number;
	/** The lines written under the code. */
	info: string[];
}

export interface InfoLayout {
	fontSize: number;
	lineHeight: number;
	lines: string[];
	blockHeight: number;
}

let measurer: CanvasRenderingContext2D | null | undefined;

/** Hard-breaks long words to fit the QR width. */
export function wrapText(
	ctx: CanvasRenderingContext2D,
	text: string,
	maxWidth: number,
): string[] {
	const lines: string[] = [];
	let line = '';
	for (const word of text.split(/\s+/)) {
		let chunk = word;
		while (
			ctx.measureText(chunk).width > maxWidth &&
			chunk.length > 1
		) {
			let cut = chunk.length - 1;
			while (
				cut > 1 &&
				ctx.measureText(chunk.slice(0, cut)).width >
					maxWidth
			) {
				cut--;
			}
			if (line) {
				lines.push(line);
				line = '';
			}
			lines.push(chunk.slice(0, cut));
			chunk = chunk.slice(cut);
		}
		const tryLine = line ? `${line} ${chunk}` : chunk;
		if (!line || ctx.measureText(tryLine).width <= maxWidth) {
			line = tryLine;
		} else {
			lines.push(line);
			line = chunk;
		}
	}
	if (line) lines.push(line);
	return lines;
}

/** The information block under an exported code `size` px wide, at `scale` px per px. */
export function infoLayout(
	texts: string[],
	size: number,
	scale = 1,
): InfoLayout | undefined {
	measurer ??= document.createElement('canvas').getContext('2d');
	if (!measurer) return;
	const fontSize = Math.max(13, Math.round(size * 0.055)) * scale;
	const lineHeight = Math.round(fontSize * 1.5);
	measurer.font = `500 ${fontSize}px ${INFO_FONT}`;
	const lines = texts.flatMap((text) =>
		wrapText(measurer!, text, size * 0.88 * scale),
	);
	return {
		fontSize,
		lineHeight,
		lines,
		blockHeight: lines.length * lineHeight + fontSize,
	};
}

export interface QrPicture {
	sheet: CodeSheet;
	/** The code as written, for PNG. */
	canvas: () => HTMLCanvasElement | undefined;
	/** The code as written, as SVG markup; the logo goes in as `logoHref`. */
	svg: (logoHref?: string) => string;
	/** The written image in px. */
	pixels: { width: number; height: number };
	count: number;
}

/** The sheet for `matrix` drawn in `style`; none when the image is too small for its modules. */
export function qrSheet(
	matrix: boolean[][],
	style: QrStyle,
): QrPicture | undefined {
	const count = matrix.length;
	const layout = qrLayout(count, style.size, style.margin);
	if (!layout) return;
	const { dot, offset } = layout;
	const { logo } = style;
	const space = logo
		? logoSpace(count, dot, logo, style.logoSize, style.level)
		: undefined;
	const hidden = (r: number, c: number) =>
		!!space &&
		r >= (count - space.hideY) / 2 &&
		r < (count + space.hideY) / 2 &&
		c >= (count - space.hideX) / 2 &&
		c < (count + space.hideX) / 2;
	const modules = matrix.map((row, r) =>
		row.map(
			(dark, c) =>
				dark && !inFinder(r, c, count) && !hidden(r, c),
		),
	);
	const dark = (r: number, c: number) => modules[r]?.[c] === true;

	const info =
		style.info.length > 0
			? infoLayout(style.info, style.size)
			: undefined;
	const footer = info ? info.blockHeight / dot : 0;
	const far = style.size - offset - count * dot;
	const corners = [
		[0, 0],
		[count - 7, 0],
		[0, count - 7],
	] as const;
	const eyesAt = (origin: number, module: number) =>
		corners
			.map(([x, y]) =>
				eyeData(
					style.cornerSquareType,
					origin + x * module,
					origin + y * module,
					module,
				),
			)
			.join('');
	const pupilsAt = (origin: number, module: number) =>
		corners
			.map(([x, y]) =>
				pupilData(
					style.cornerDotType,
					origin + x * module,
					origin + y * module,
					module,
				),
			)
			.join('');
	const eyes = new Path2D(eyesAt(0, 1));
	const pupils = new Path2D(pupilsAt(0, 1));
	const logoBox =
		logo && space && space.width > 0
			? {
					x:
						Math.floor(
							style.logoMargin +
								(count * dot -
									space.width) /
									2,
						) / dot,
					y:
						Math.floor(
							style.logoMargin +
								(count * dot -
									space.height) /
									2,
						) / dot,
					width:
						(space.width -
							2 * style.logoMargin) /
						dot,
					height:
						(space.height -
							2 * style.logoMargin) /
						dot,
				}
			: undefined;

	const marks = (
		context: CanvasRenderingContext2D,
		origin: Point,
		pitch: number,
	) => {
		context.save();
		context.translate(origin.x, origin.y);
		context.scale(pitch, pitch);
		context.fillStyle = style.ink;
		context.fill(eyes, 'evenodd');
		context.fill(pupils);
		if (logo && logoBox && logoBox.width > 0 && logoBox.height > 0)
			context.drawImage(
				logo.image,
				logoBox.x,
				logoBox.y,
				logoBox.width,
				logoBox.height,
			);
		context.restore();
		if (!info) return;
		const scale = pitch / dot;
		context.save();
		context.fillStyle = style.ink;
		context.font = `500 ${info.fontSize * scale}px ${INFO_FONT}`;
		context.textAlign = 'center';
		info.lines.forEach((line, i) => {
			context.fillText(
				line,
				origin.x + (style.size / 2 - offset) * scale,
				origin.y +
					(style.size +
						(i + 0.75) * info.lineHeight -
						offset) *
						scale,
			);
		});
		context.restore();
	};

	const height = style.size + (info?.blockHeight ?? 0);
	const writtenModules = () =>
		modules
			.flatMap((row, r) =>
				row.flatMap((on, c) =>
					on
						? [
								shapeData(
									dotShape(
										style.dotType,
										dark(
											r,
											c -
												1,
										),
										dark(
											r,
											c +
												1,
										),
										dark(
											r -
												1,
											c,
										),
										dark(
											r +
												1,
											c,
										),
									),
									offset +
										c *
											dot,
									offset +
										r *
											dot,
									dot,
								),
							]
						: [],
				),
			)
			.join('');

	const canvas = () => {
		const canvas = document.createElement('canvas');
		canvas.width = style.size;
		canvas.height = height;
		const context = canvas.getContext('2d');
		if (!context) return;
		if (style.paper) {
			context.fillStyle = style.paper;
			context.fillRect(0, 0, style.size, height);
		}
		context.fillStyle = style.ink;
		context.fill(new Path2D(writtenModules()));
		marks(context, { x: offset, y: offset }, dot);
		return canvas;
	};

	const svg = (logoHref?: string) => {
		const at = (n: number) => +(offset + n * dot).toFixed(3);
		const parts = [
			`<svg xmlns="http://www.w3.org/2000/svg" width="${style.size}" height="${height}" viewBox="0 0 ${style.size} ${height}">`,
		];
		if (style.paper)
			parts.push(
				`<rect width="100%" height="100%" fill="${style.paper}"/>`,
			);
		parts.push(
			`<path fill="${style.ink}" d="${writtenModules()}"/>`,
			`<path fill="${style.ink}" fill-rule="evenodd" d="${eyesAt(offset, dot)}"/>`,
			`<path fill="${style.ink}" d="${pupilsAt(offset, dot)}"/>`,
		);
		if (
			logoHref &&
			logoBox &&
			logoBox.width > 0 &&
			logoBox.height > 0
		)
			parts.push(
				`<image href="${escapeXml(logoHref)}" x="${at(logoBox.x)}" y="${at(logoBox.y)}" width="${+(logoBox.width * dot).toFixed(3)}" height="${+(logoBox.height * dot).toFixed(3)}" preserveAspectRatio="none"/>`,
			);
		info?.lines.forEach((line, i) =>
			parts.push(
				`<text x="${style.size / 2}" y="${style.size + (i + 0.75) * info.lineHeight}" text-anchor="middle" fill="${style.ink}" font-family='${INFO_FONT}' font-size="${info.fontSize}" font-weight="500">${escapeXml(line)}</text>`,
			),
		);
		parts.push('</svg>');
		return parts.join('');
	};

	return {
		count,
		canvas,
		svg,
		pixels: {
			width: style.size,
			height,
		},
		sheet: {
			modules,
			margin: {
				top: offset / dot,
				left: offset / dot,
				bottom: far / dot,
				right: far / dot,
			},
			footer,
			ink: style.ink,
			paper: style.paper,
			quietZone: 4,
			sweep: 'zigzag',
			anchor: 'none',
			shape:
				style.dotType === 'square'
					? undefined
					: (r, c) =>
							dotPath(
								style.dotType,
								dark(r, c - 1),
								dark(r, c + 1),
								dark(r - 1, c),
								dark(r + 1, c),
							),
			marks,
			marksKey: [
				count,
				style.cornerSquareType,
				style.cornerDotType,
				style.ink,
				logo?.id ?? '',
				space ? `${space.hideX}x${space.hideY}` : '',
				style.logoMargin,
				info?.lines.join('\n') ?? '',
				offset,
				dot,
			].join('|'),
		},
	};
}
