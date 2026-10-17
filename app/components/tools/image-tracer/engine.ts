import type { TraceVectors } from 'delphitools-v2/components/tools/image-tracer/trace';

/** Longest side of the drawn picture; the trace itself runs at full size. */
export const DISPLAY_PIXELS = 1600;

// tokens.css light card and muted: the ground is always light, as iOS CanonChecks.paper
const CHECKS = ['rgb(252 248 237)', 'rgb(237 232 217)'];
// tokens.css light foreground and primary, as iOS outlineInk()
const INK_LINES = 'rgb(20 39 15)';
const INK_CURVES = 'rgb(30 102 38)';
const INK_WASH = 'rgb(255 255 255 / 0.78)';

export interface TraceReply {
	id: number;
	svg?: string;
	error?: string;
}

type Reply = (reply: TraceReply) => void;

/** Traces off the main thread: the vendored script in a blob worker. */
export async function createTracerWorker(reply: Reply): Promise<Worker | null> {
	try {
		const response = await fetch('/lib/imagetracer_v1.2.6.js');
		if (!response.ok) return null;
		const source = await response.text();
		const blob = new Blob(
			[
				source,
				`self.onmessage = function (e) {
					try {
						var imgd = new ImageData(
							new Uint8ClampedArray(e.data.buffer),
							e.data.width,
							e.data.height
						);
						self.postMessage({ id: e.data.id, svg: self.ImageTracer.imagedataToSVG(imgd, e.data.opts) });
					} catch (error) {
						self.postMessage({ id: e.data.id, error: String(error) });
					}
				};`,
			],
			{ type: 'application/javascript' },
		);
		const url = URL.createObjectURL(blob);
		const worker = new Worker(url);
		URL.revokeObjectURL(url);
		worker.onmessage = (event: MessageEvent<TraceReply>) =>
			reply(event.data);
		return worker;
	} catch {
		return null;
	}
}

export function displaySize(width: number, height: number) {
	const scale = Math.min(1, DISPLAY_PIXELS / Math.max(width, height, 1));
	return {
		width: Math.max(1, Math.round(width * scale)),
		height: Math.max(1, Math.round(height * scale)),
	};
}

function checks(
	context: CanvasRenderingContext2D,
	width: number,
	height: number,
) {
	const side = Math.max(width, height) / 48;
	context.fillStyle = CHECKS[0]!;
	context.fillRect(0, 0, width, height);
	context.fillStyle = CHECKS[1]!;
	for (let row = 0; row * side < height; row++)
		for (
			let column = row % 2 ? 0 : 1;
			column * side < width;
			column += 2
		)
			context.fillRect(column * side, row * side, side, side);
}

async function url(canvas: HTMLCanvasElement) {
	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, 'image/png'),
	);
	return blob ? URL.createObjectURL(blob) : undefined;
}

function canvasOf(width: number, height: number) {
	const canvas = document.createElement('canvas');
	canvas.width = width;
	canvas.height = height;
	return { canvas, context: canvas.getContext('2d')! };
}

/** The source at display size on the light checks, as iOS grounded(). */
export function grounded(
	image: CanvasImageSource,
	width: number,
	height: number,
) {
	const { canvas, context } = canvasOf(width, height);
	checks(context, width, height);
	context.drawImage(image, 0, 0, width, height);
	return url(canvas);
}

function loadSvg(svg: string) {
	const source = URL.createObjectURL(
		new Blob([svg], { type: 'image/svg+xml' }),
	);
	const image = new Image();
	image.src = source;
	return image
		.decode()
		.then(
			() => image,
			() => undefined,
		)
		.finally(() => URL.revokeObjectURL(source));
}

/**
 * The trace at display size on the light checks: filled as the browser
 * draws it, and with its outlines over a washed fill, straight segments and
 * curves in their own ink, a square on every node (iOS TraceVectors.render).
 */
export async function drawTrace(
	svg: string,
	vectors: TraceVectors,
	width: number,
	height: number,
) {
	const image = await loadSvg(svg);
	if (!image) return undefined;
	const { canvas, context } = canvasOf(width, height);
	checks(context, width, height);
	context.drawImage(image, 0, 0, width, height);
	const filled = await url(canvas);

	context.fillStyle = INK_WASH;
	context.fillRect(0, 0, width, height);
	const sx = width / vectors.width;
	const sy = height / vectors.height;
	context.setTransform(sx, 0, 0, sy, 0, 0);
	// ~1.5 device px
	const unit = Math.max(width, height) / 500 / Math.max(sx, sy);
	context.lineWidth = unit;
	context.lineJoin = 'round';
	const lines = new Path2D();
	const curves = new Path2D();
	const nodes = new Path2D();
	const node = unit * 2.5;
	for (const layer of vectors.layers) {
		const l = layer.lines;
		for (let i = 0; i < l.length; i += 4) {
			lines.moveTo(l[i]!, l[i + 1]!);
			lines.lineTo(l[i + 2]!, l[i + 3]!);
		}
		const c = layer.curves;
		for (let i = 0; i < c.length; i += 6) {
			curves.moveTo(c[i]!, c[i + 1]!);
			curves.quadraticCurveTo(
				c[i + 2]!,
				c[i + 3]!,
				c[i + 4]!,
				c[i + 5]!,
			);
		}
		const n = layer.nodes;
		for (let i = 0; i < n.length; i += 2)
			nodes.rect(
				n[i]! - node / 2,
				n[i + 1]! - node / 2,
				node,
				node,
			);
	}
	context.strokeStyle = INK_LINES;
	context.stroke(lines);
	context.strokeStyle = INK_CURVES;
	context.stroke(curves);
	context.fillStyle = INK_LINES;
	context.fill(nodes);
	const outlined = await url(canvas);
	if (!filled || !outlined) {
		for (const each of [filled, outlined])
			if (each) URL.revokeObjectURL(each);
		return undefined;
	}
	return { filled, outlined };
}
