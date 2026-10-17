import {
	MM_TO_POINTS,
	getOuterEdges,
	type PagePlacement,
} from 'delphitools-v2/lib/imposition';

/** Millimetres, top-left origin. */
export interface Line {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}

export type Fit = 'fit' | 'fill' | 'actual';

/** One side of a sheet, as iOS PrintSheet; millimetres. */
export interface PrintSheet {
	width: number;
	height: number;
	cells: PagePlacement[];
	creases: Line[];
	marks: Line[];
	back: boolean;
}

export interface Picture {
	image: CanvasImageSource;
	width: number;
	height: number;
}

export interface PaintOptions {
	/** 1-based page to its picture. */
	pictures?: Map<number, Picture>;
	fit?: Fit;
	/** 1-based page to its size in millimetres, for `actual`. */
	pageSizes?: Map<number, { width: number; height: number }>;
	font?: string;
}

// ios PrintSheet.ink; light-only
const INK = {
	foreground: [20, 39, 15],
	muted: [237, 232, 217],
	primary: [30, 102, 38],
	border: [221, 216, 194],
} as const;

function rgba([r, g, b]: readonly number[], alpha = 1) {
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Matches the PDF writer's fold lines. */
export function creases(layoutId: string, width: number, height: number) {
	const across = { x1: width / 2, y1: 0, x2: width / 2, y2: height };
	const down = { x1: 0, y1: height / 2, x2: width, y2: height / 2 };
	switch (layoutId) {
		case 'saddle-stitch':
		case 'perfect-bind':
		case 'step-and-repeat':
			return [across];
		case 'four-up-booklet':
			return [across, down];
		default:
			return [];
	}
}

/** Corner marks on the outer edges, 10 pt long, as iOS. */
export function marks(placements: PagePlacement[]): Line[] {
	const length = 10 / MM_TO_POINTS;
	const edges = getOuterEdges(placements);
	return placements.flatMap((p, i) => {
		const e = edges[i]!;
		const [left, top] = [p.x, p.y];
		const [right, bottom] = [p.x + p.width, p.y + p.height];
		const lines: Line[] = [];
		const line = (x1: number, y1: number, x2: number, y2: number) =>
			lines.push({ x1, y1, x2, y2 });
		if (e.left) {
			line(left - length, top, left, top);
			line(left - length, bottom, left, bottom);
		}
		if (e.right) {
			line(right, top, right + length, top);
			line(right, bottom, right + length, bottom);
		}
		if (e.top) {
			line(left, top - length, left, top);
			line(right, top - length, right, top);
		}
		if (e.bottom) {
			line(left, bottom, left, bottom + length);
			line(right, bottom, right, bottom + length);
		}
		return lines;
	});
}

export function printSheet(
	placements: PagePlacement[],
	options: {
		layoutId: string;
		width: number;
		height: number;
		cropMarks: boolean;
		back: boolean;
	},
): PrintSheet {
	const { layoutId, width, height, cropMarks, back } = options;
	return {
		width,
		height,
		cells: placements,
		creases: creases(layoutId, width, height),
		marks: cropMarks ? marks(placements) : [],
		back,
	};
}

/** Pages of a saddle-stitched run: one signature of every sheet. */
export function signature(sheets: number) {
	return { sheets, from: 1, to: sheets * 4 };
}

function turned(
	context: CanvasRenderingContext2D,
	cell: { x: number; y: number; w: number; h: number },
	turn: number,
	body: (w: number, h: number) => void,
) {
	context.save();
	context.beginPath();
	context.rect(cell.x, cell.y, cell.w, cell.h);
	context.clip();
	context.translate(cell.x + cell.w / 2, cell.y + cell.h / 2);
	context.rotate((turn * Math.PI) / 180);
	const sideways = (turn / 90) % 2 !== 0;
	if (sideways) body(cell.h, cell.w);
	else body(cell.w, cell.h);
	context.restore();
}

function hatch(
	context: CanvasRenderingContext2D,
	cell: { x: number; y: number; w: number; h: number },
) {
	context.save();
	context.beginPath();
	context.rect(cell.x, cell.y, cell.w, cell.h);
	context.clip();
	context.strokeStyle = rgba(INK.foreground, 0.14);
	context.lineWidth = 1;
	context.beginPath();
	for (let x = cell.x - cell.h; x < cell.x + cell.w; x += 6) {
		context.moveTo(x, cell.y + cell.h);
		context.lineTo(x + cell.h, cell.y);
	}
	context.stroke();
	context.restore();
}

/** Draws one side into `rect` (px) as iOS PrintSheet.draw. */
export function paint(
	context: CanvasRenderingContext2D,
	sheet: PrintSheet,
	rect: { x: number; y: number; w: number; h: number },
	options: PaintOptions = {},
) {
	if (sheet.width <= 0 || rect.w <= 0) return;
	const scale = rect.w / sheet.width;
	const font = options.font ?? 'sans-serif';
	const px = (x: number) => rect.x + x * scale;
	const py = (y: number) => rect.y + y * scale;

	context.save();
	context.fillStyle = '#fff';
	context.fillRect(rect.x, rect.y, rect.w, rect.h);
	context.beginPath();
	context.rect(rect.x, rect.y, rect.w, rect.h);
	context.clip();

	const tint = sheet.back ? rgba(INK.muted) : rgba(INK.primary, 0.06);
	for (const p of sheet.cells) {
		const cell = {
			x: px(p.x),
			y: py(p.y),
			w: p.width * scale,
			h: p.height * scale,
		};
		if (cell.w <= 0.5 || cell.h <= 0.5) continue;
		if (p.pageNumber === 0) {
			hatch(context, cell);
		} else {
			context.fillStyle = tint;
			context.fillRect(cell.x, cell.y, cell.w, cell.h);
			const picture = options.pictures?.get(p.pageNumber);
			if (picture) {
				const size = options.pageSizes?.get(
					p.pageNumber,
				);
				turned(context, cell, p.rotation, (w, h) => {
					const aspect =
						picture.width /
						Math.max(picture.height, 1);
					let [dw, dh] = [w, h];
					if (options.fit === 'actual' && size) {
						[dw, dh] = [
							size.width * scale,
							size.height * scale,
						];
					} else {
						const wide =
							aspect >
							w / Math.max(h, 1);
						const byWidth =
							(options.fit !==
								'fill') ===
							wide;
						[dw, dh] = byWidth
							? [w, w / aspect]
							: [h * aspect, h];
					}
					context.drawImage(
						picture.image,
						-dw / 2,
						-dh / 2,
						dw,
						dh,
					);
					const tagSize = Math.min(
						15,
						Math.max(
							6,
							Math.min(w, h) * 0.12,
						),
					);
					context.font = `700 ${tagSize}px ${font}`;
					const text = String(p.pageNumber);
					const pad = tagSize * 0.3;
					const chipW =
						context.measureText(text)
							.width +
						pad * 2;
					const chipH = tagSize * 1.2 + pad * 0.6;
					context.fillStyle = rgba(INK.primary);
					context.fillRect(
						-w / 2,
						-h / 2,
						chipW,
						chipH,
					);
					context.fillStyle = '#fff';
					context.textAlign = 'left';
					context.textBaseline = 'middle';
					context.fillText(
						text,
						-w / 2 + pad,
						-h / 2 + chipH / 2,
					);
				});
			} else {
				turned(context, cell, p.rotation, (w, h) => {
					const size = Math.min(
						120,
						Math.max(
							6,
							Math.min(w, h) * 0.46,
						),
					);
					context.font = `700 ${size}px ${font}`;
					context.fillStyle = rgba(
						INK.foreground,
						0.82,
					);
					context.textAlign = 'center';
					context.textBaseline = 'middle';
					context.fillText(
						String(p.pageNumber),
						0,
						0,
					);
				});
			}
		}
		context.strokeStyle = rgba(INK.foreground, 0.16);
		context.lineWidth = 0.5;
		context.strokeRect(
			cell.x + 0.25,
			cell.y + 0.25,
			cell.w - 0.5,
			cell.h - 0.5,
		);
	}

	context.lineWidth = 1;
	context.strokeStyle = rgba(INK.primary);
	context.setLineDash([4, 3]);
	for (const line of sheet.creases) {
		context.beginPath();
		context.moveTo(px(line.x1), py(line.y1));
		context.lineTo(px(line.x2), py(line.y2));
		context.stroke();
	}
	context.setLineDash([]);

	context.strokeStyle = rgba(INK.foreground, 0.7);
	context.lineWidth = 0.75;
	context.beginPath();
	for (const line of sheet.marks) {
		context.moveTo(px(line.x1), py(line.y1));
		context.lineTo(px(line.x2), py(line.y2));
	}
	context.stroke();
	context.restore();

	context.strokeStyle = rgba(INK.border);
	context.lineWidth = 1;
	context.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
}

/** A side as a picture `height` px tall, for the page strip. */
export function sideImage(
	sheet: PrintSheet,
	height: number,
	density: number,
	options: PaintOptions,
): string {
	const width = Math.round(
		(height * sheet.width) / Math.max(sheet.height, 1),
	);
	const canvas = document.createElement('canvas');
	canvas.width = Math.round(width * density);
	canvas.height = Math.round(height * density);
	const context = canvas.getContext('2d');
	if (!context) return '';
	context.scale(density, density);
	paint(context, sheet, { x: 0, y: 0, w: width, h: height }, options);
	return canvas.toDataURL('image/png');
}

/** "297 × 210 mm", one decimal at most. */
export function millimetres(width: number, height: number) {
	const decimal = (value: number) => String(Math.round(value * 10) / 10);
	return `${decimal(width)} × ${decimal(height)} mm`;
}
