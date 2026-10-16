export type Position =
	'tl' | 'tc' | 'tr' | 'ml' | 'mc' | 'mr' | 'bl' | 'bc' | 'br' | 'random';

export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay';

export interface Size {
	width: number;
	height: number;
}

export interface Rect extends Size {
	x: number;
	y: number;
}

/** The nine anchors in reading order, as the iOS WatermarkPosition. */
export const zones: { id: Position; name: string }[] = [
	{ id: 'tl', name: 'Top left' },
	{ id: 'tc', name: 'Top centre' },
	{ id: 'tr', name: 'Top right' },
	{ id: 'ml', name: 'Middle left' },
	{ id: 'mc', name: 'Centre' },
	{ id: 'mr', name: 'Middle right' },
	{ id: 'bl', name: 'Bottom left' },
	{ id: 'bc', name: 'Bottom centre' },
	{ id: 'br', name: 'Bottom right' },
];

export const blends: { id: BlendMode; name: string }[] = [
	{ id: 'normal', name: 'Normal' },
	{ id: 'multiply', name: 'Multiply' },
	{ id: 'screen', name: 'Screen' },
	{ id: 'overlay', name: 'Overlay' },
];

// canvas has no 'normal'
const composite: Record<BlendMode, GlobalCompositeOperation> = {
	normal: 'source-over',
	multiply: 'multiply',
	screen: 'screen',
	overlay: 'overlay',
};

/** Font family of the text watermark: the app's condensed sans, bold. */
export const family = '"Open Sans Condensed", system-ui, sans-serif';

/** A bitmap or canvas: anything drawable that has a size. */
export type Stamp = CanvasImageSource & Size;

export interface WatermarkSpec {
	kind: 'text' | 'image';
	text: string;
	/** Points on an image whose long side is at most 3072 px. */
	fontSize: number;
	/** CSS colour of the text. */
	colour: string;
	stamp?: Stamp;
	/** Stamp width in % of the image width. */
	scale: number;
	/** 0 to 1. */
	opacity: number;
	/** % inset per edge. */
	padding: number;
	position: Position;
	/** 0 to 1 each, used by `random`. */
	random: { x: number; y: number };
	tiling: boolean;
	blend: BlendMode;
}

/**
 * Image pixels per iOS point. iOS caps the source at 3072 px before it
 * draws, so its 48 pt text is 48 / 3072 of the long side.
 */
export function unitOf({ width, height }: Size) {
	return Math.max(1, Math.max(width, height) / 3072);
}

/** Where a mark of `mark` pixels sits on `base`, edges inset by `padding` %. */
export function place(
	base: Size,
	mark: Size,
	position: Position,
	padding: number,
	random: { x: number; y: number },
): Rect {
	const { width, height } = mark;
	const padX = (base.width * padding) / 100;
	const padY = (base.height * padding) / 100;
	if (position === 'random')
		return {
			x: padX + random.x * (base.width - width - padX * 2),
			y: padY + random.y * (base.height - height - padY * 2),
			width,
			height,
		};
	const [row, col] = position;
	const x =
		col === 'l'
			? padX
			: col === 'c'
				? (base.width - width) / 2
				: base.width - width - padX;
	const y =
		row === 't'
			? padY
			: row === 'm'
				? (base.height - height) / 2
				: base.height - height - padY;
	return { x, y, width, height };
}

interface Mark extends Size {
	draw: (context: CanvasRenderingContext2D, x: number, y: number) => void;
}

/** The stamp at `out` pixels for an image of `source` pixels; none when there is nothing to draw. */
function markOf(
	context: CanvasRenderingContext2D,
	spec: WatermarkSpec,
	source: Size,
	out: Size,
): Mark | undefined {
	if (spec.kind === 'image') {
		const { stamp } = spec;
		if (!stamp) return undefined;
		const width = (out.width * spec.scale) / 100;
		const height = (stamp.height / stamp.width) * width;
		return {
			width,
			height,
			draw: (c, x, y) =>
				c.drawImage(stamp, x, y, width, height),
		};
	}
	if (!spec.text) return undefined;
	const px = spec.fontSize * unitOf(source) * (out.width / source.width);
	context.font = `700 ${px}px ${family}`;
	context.fillStyle = spec.colour;
	const metrics = context.measureText(spec.text);
	const ascent = metrics.fontBoundingBoxAscent;
	return {
		width: metrics.width,
		height: ascent + metrics.fontBoundingBoxDescent,
		draw: (c, x, y) => c.fillText(spec.text, x, y + ascent),
	};
}

/** iOS drawTiledStatic: a grid turned 30° about the centre, 60 pt apart. */
function tile(
	context: CanvasRenderingContext2D,
	out: Size,
	mark: Mark,
	gap: number,
) {
	const across = mark.width + gap;
	const down = mark.height + gap;
	context.translate(out.width / 2, out.height / 2);
	context.rotate(-Math.PI / 6);
	context.translate(-out.width, -out.height);
	for (let y = 0; y < out.height * 3; y += down)
		for (let x = 0; x < out.width * 3; x += across)
			mark.draw(context, x, y);
}

/**
 * Draws `base` with the watermark at `out` pixels. The marks go on their
 * own layer first, so tiles that overlap keep one opacity, as the iOS
 * transparency layer.
 */
export function paint(
	target: CanvasRenderingContext2D,
	base: CanvasImageSource,
	source: Size,
	out: Size,
	spec: WatermarkSpec,
) {
	target.globalAlpha = 1;
	target.globalCompositeOperation = 'source-over';
	target.clearRect(0, 0, out.width, out.height);
	target.drawImage(base, 0, 0, out.width, out.height);

	const layer = document.createElement('canvas');
	layer.width = out.width;
	layer.height = out.height;
	const context = layer.getContext('2d');
	if (!context) return;
	const mark = markOf(context, spec, source, out);
	if (!mark || mark.width <= 0 || mark.height <= 0) return;
	if (spec.tiling) {
		const gap = 60 * unitOf(source) * (out.width / source.width);
		tile(context, out, mark, gap);
	} else {
		const at = place(
			out,
			mark,
			spec.position,
			spec.padding,
			spec.random,
		);
		mark.draw(context, at.x, at.y);
	}

	target.globalAlpha = spec.opacity;
	target.globalCompositeOperation = composite[spec.blend];
	target.drawImage(layer, 0, 0);
	target.globalAlpha = 1;
	target.globalCompositeOperation = 'source-over';
}

/** True when `spec` draws something. */
export function marks(spec: WatermarkSpec) {
	return spec.kind === 'image' ? !!spec.stamp : spec.text.length > 0;
}

/** `<stem>-watermarked.png`, the web tool's name. */
export const fileName = (stem: string) => `${stem || 'image'}-watermarked.png`;
