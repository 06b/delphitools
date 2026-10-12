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
	| 'extra-rounded';
export type CornerSquareType = 'square' | 'dot' | 'extra-rounded';
export type CornerDotType = 'square' | 'dot';
export type ErrorLevel = 'L' | 'M' | 'Q' | 'H';

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

// unit squares, as qr-code-styling's QRDot draws them at size 1
const SIDE = 'M0 0v1h0.5a0.5 0.5 0 0 0 0 -1z';
const CORNER = 'M0 0v1h1v-0.5a0.5 0.5 0 0 0 -0.5 -0.5z';
const CORNER_EXTRA = 'M0 0v1h1a1 1 0 0 0 -1 -1z';
const CORNERS =
	'M0 0v0.5a0.5 0.5 0 0 0 0.5 0.5h0.5v-0.5a0.5 0.5 0 0 0 -0.5 -0.5z';

const units = new Map<string, Path2D>();

/** One unit path, turned `quarters` × 90° about the square's centre. */
function unit(kind: string, quarters = 0): Path2D {
	const key = `${kind}${quarters}`;
	const known = units.get(key);
	if (known) return known;
	const base = new Path2D();
	if (kind === 'dot') base.arc(0.5, 0.5, 0.5, 0, Math.PI * 2);
	else if (kind === 'square') base.rect(0, 0, 1, 1);
	else base.addPath(new Path2D(kind));
	let path = base;
	if (quarters) {
		path = new Path2D();
		path.addPath(
			base,
			new DOMMatrix()
				.translate(0.5, 0.5)
				.rotate(quarters * 90)
				.translate(-0.5, -0.5),
		);
	}
	units.set(key, path);
	return path;
}

/** QRDot.draw for one dark module whose dark neighbours are left, right, top and bottom. */
export function dotPath(
	type: DotType,
	left: boolean,
	right: boolean,
	top: boolean,
	bottom: boolean,
): Path2D {
	const count = +left + +right + +top + +bottom;
	switch (type) {
		case 'dots':
			return unit('dot');
		case 'rounded':
		case 'extra-rounded': {
			if (count === 0) return unit('dot');
			if (count > 2 || (left && right) || (top && bottom))
				return unit('square');
			if (count === 2) {
				const turn =
					left && top
						? 1
						: top && right
							? 2
							: right && bottom
								? -1
								: 0;
				return unit(
					type === 'rounded'
						? CORNER
						: CORNER_EXTRA,
					turn,
				);
			}
			return unit(
				SIDE,
				top ? 1 : right ? 2 : bottom ? -1 : 0,
			);
		}
		case 'classy':
		case 'classy-rounded': {
			const corner =
				type === 'classy' ? CORNER : CORNER_EXTRA;
			if (count === 0) return unit(CORNERS, 1);
			if (!left && !top) return unit(corner, -1);
			if (!right && !bottom) return unit(corner, 1);
			return unit('square');
		}
		default:
			return unit('square');
	}
}

/** A finder's 7 × 7 ring at (x, y) in modules, filled even-odd. */
export function eyePath(type: CornerSquareType, x: number, y: number) {
	if (type === 'dot') {
		const path = new Path2D();
		path.arc(x + 3.5, y + 3.5, 3.5, 0, Math.PI * 2);
		path.moveTo(x + 6, y + 3.5);
		path.arc(x + 3.5, y + 3.5, 2.5, 0, Math.PI * 2);
		return path;
	}
	if (type === 'extra-rounded')
		return new Path2D(
			`M${x} ${y + 2.5}v2a2.5 2.5 0 0 0 2.5 2.5h2a2.5 2.5 0 0 0 2.5 -2.5v-2a2.5 2.5 0 0 0 -2.5 -2.5h-2a2.5 2.5 0 0 0 -2.5 2.5` +
				`M${x + 2.5} ${y + 1}h2a1.5 1.5 0 0 1 1.5 1.5v2a1.5 1.5 0 0 1 -1.5 1.5h-2a1.5 1.5 0 0 1 -1.5 -1.5v-2a1.5 1.5 0 0 1 1.5 -1.5`,
		);
	return new Path2D(`M${x} ${y}v7h7v-7zM${x + 1} ${y + 1}h5v5h-5z`);
}

/** A finder's 3 × 3 pupil, its eye at (x, y). */
export function pupilPath(type: CornerDotType, x: number, y: number) {
	const path = new Path2D();
	if (type === 'dot') path.arc(x + 3.5, y + 3.5, 1.5, 0, Math.PI * 2);
	else path.rect(x + 2, y + 2, 3, 3);
	return path;
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
	context.fill(eyePath(eye, 0, 0), 'evenodd');
	context.fill(pupilPath(pupil, 0, 0));
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
	const eyes = new Path2D();
	const pupils = new Path2D();
	for (const [x, y] of corners) {
		eyes.addPath(eyePath(style.cornerSquareType, x, y));
		pupils.addPath(pupilPath(style.cornerDotType, x, y));
	}
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

	return {
		count,
		pixels: {
			width: style.size,
			height: style.size + (info?.blockHeight ?? 0),
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
