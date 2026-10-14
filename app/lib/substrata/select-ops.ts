import type { RasterLayer } from './doc-model';
import { createRasterLayer } from './doc-model';
import { getSnapshot, update } from './doc-store';
import { findLayer, mapLayerInTree } from './layer-tree';
import { insertAfter } from './layer-ops';
import { getActiveLayerId, setSelection } from './selection';
import { getRaster } from './raster-cache';
import { bakeCanvasToHash } from './blobs';
import {
	clearPixelSelection,
	getPixelSelection,
	getSelectionAlphaCanvas,
	setPixelSelectionMask,
} from './pixel-selection';
import type { MaskBounds, PixelMask } from './select-mask';
import {
	combineMask,
	featherMask,
	growMask,
	invertMask,
	maskBounds,
	shrinkMask,
} from './select-mask';
import { getToolSettings } from './tool-settings';

// iOS addToSelection: a new shape joins the selection, or in Remove mode
// leaves it; removing from nothing selects nothing
export function addToSelection(shape: PixelMask): void {
	const removes = getToolSettings().select.removes;
	const base = getPixelSelection()?.mask;
	if (!base || base.data.length !== shape.data.length) {
		if (removes) clearPixelSelection();
		else setPixelSelectionMask(shape);
		return;
	}
	setPixelSelectionMask(combineMask(base, shape, removes));
}

// iOS: inverting no selection selects the whole artboard
export function invertSelection(): void {
	// reconciler validates mask dimensions
	const sel = getPixelSelection();
	if (sel) return setPixelSelectionMask(invertMask(sel.mask));
	const doc = getSnapshot();
	if (!doc) return;
	const width = Math.round(doc.artboard.width);
	const height = Math.round(doc.artboard.height);
	const data = new Uint8Array(width * height).fill(255);
	setPixelSelectionMask({ data, width, height });
}

export function featherSelection(radius: number): void {
	const sel = getPixelSelection();
	if (!sel) return;
	setPixelSelectionMask(featherMask(sel.mask, radius));
}

export function growSelection(step = 2): void {
	const sel = getPixelSelection();
	if (!sel) return;
	setPixelSelectionMask(growMask(sel.mask, step));
}

export function shrinkSelection(step = 2): void {
	const sel = getPixelSelection();
	if (!sel) return;
	setPixelSelectionMask(shrinkMask(sel.mask, step));
}

export function canOperateOnActive(): boolean {
	const doc = getSnapshot();
	const id = getActiveLayerId();
	const layer = doc && id ? findLayer(doc.layers, id) : null;
	return layer !== null && layer.kind === 'raster' && !layer.locked;
}

function sceneMaskToLayerSpace(
	alpha: HTMLCanvasElement,
	layer: RasterLayer,
): HTMLCanvasElement | null {
	const t = layer.transform;
	const sx = t.scaleX * (t.flipX ? -1 : 1);
	const sy = t.scaleY * (t.flipY ? -1 : 1);
	if (sx === 0 || sy === 0) return null;
	const canvas = document.createElement('canvas');
	canvas.width = layer.naturalWidth;
	canvas.height = layer.naturalHeight;
	const ctx = canvas.getContext('2d');
	if (!ctx) return null;
	// invert layer transform
	ctx.translate(layer.naturalWidth / 2, layer.naturalHeight / 2);
	ctx.scale(1 / sx, 1 / sy);
	ctx.rotate((-t.angle * Math.PI) / 180);
	ctx.translate(-t.x, -t.y);
	ctx.drawImage(alpha, 0, 0);
	return canvas;
}

function alphaToMask(img: ImageData): PixelMask {
	const data = new Uint8Array(img.width * img.height);
	const px = img.data;
	for (let i = 0; i < data.length; i++)
		data[i] = px[i * 4 + 3] !== 0 ? 255 : 0;
	return { data, width: img.width, height: img.height };
}

interface ExtractBake {
	source: RasterLayer;
	sourceCanvas: HTMLCanvasElement;
	layerMask: HTMLCanvasElement;
	bounds: MaskBounds;
	newLayer: RasterLayer;
}

async function bakeExtractedLayer(): Promise<ExtractBake | null> {
	if (!canOperateOnActive()) return null;
	const alpha = getSelectionAlphaCanvas();
	if (!alpha) return null;
	const doc = getSnapshot();
	const id = getActiveLayerId();
	const source = doc && id ? findLayer(doc.layers, id) : null;
	if (!source || source.kind !== 'raster') return null;
	const sourceCanvas = getRaster(source.blobHash);
	if (!sourceCanvas) return null;

	const layerMask = sceneMaskToLayerSpace(alpha, source);
	const mctx = layerMask?.getContext('2d');
	if (!layerMask || !mctx) return null;
	const bounds = maskBounds(
		alphaToMask(
			mctx.getImageData(
				0,
				0,
				layerMask.width,
				layerMask.height,
			),
		),
	);
	if (!bounds) return null;

	// apply layer-space mask
	const crop = document.createElement('canvas');
	crop.width = bounds.w;
	crop.height = bounds.h;
	const cctx = crop.getContext('2d');
	if (!cctx) return null;
	cctx.drawImage(sourceCanvas, -bounds.x, -bounds.y);
	cctx.globalCompositeOperation = 'destination-in';
	cctx.drawImage(layerMask, -bounds.x, -bounds.y);

	// retain scene position
	const t = source.transform;
	const sx = t.scaleX * (t.flipX ? -1 : 1);
	const sy = t.scaleY * (t.flipY ? -1 : 1);
	const dx = (bounds.x + bounds.w / 2 - source.naturalWidth / 2) * sx;
	const dy = (bounds.y + bounds.h / 2 - source.naturalHeight / 2) * sy;
	const rad = (t.angle * Math.PI) / 180;

	const hash = await bakeCanvasToHash(crop);
	const newLayer: RasterLayer = {
		...createRasterLayer({
			name: source.name,
			blobHash: hash,
			naturalWidth: bounds.w,
			naturalHeight: bounds.h,
			transform: {
				...t,
				x:
					t.x +
					dx * Math.cos(rad) -
					dy * Math.sin(rad),
				y:
					t.y +
					dx * Math.sin(rad) +
					dy * Math.cos(rad),
			},
		}),
		opacity: source.opacity,
		blendMode: source.blendMode,
		filters: source.filters.map((f) => ({
			...f,
			params: { ...f.params },
		})),
		effects: source.effects.map((e) => ({
			...e,
			params: { ...e.params },
		})),
	};
	return { source, sourceCanvas, layerMask, bounds, newLayer };
}

// serialize raster bakes
let bakeInFlight = false;

// reject stale source
function sourceStillMatches(source: RasterLayer): boolean {
	const doc = getSnapshot();
	const live = doc ? findLayer(doc.layers, source.id) : null;
	if (!live || live.kind !== 'raster') return false;
	return (
		live.blobHash === source.blobHash &&
		JSON.stringify(live.transform) ===
			JSON.stringify(source.transform)
	);
}

function withBakeGuard(
	fn: () => Promise<string | null>,
): Promise<string | null> {
	if (bakeInFlight) return Promise.resolve(null);
	bakeInFlight = true;
	return fn().finally(() => {
		bakeInFlight = false;
	});
}

export function extractSelection(): Promise<string | null> {
	return withBakeGuard(extractSelectionInner);
}

async function extractSelectionInner(): Promise<string | null> {
	const baked = await bakeExtractedLayer();
	if (!baked || !sourceStillMatches(baked.source)) return null;
	const { source, newLayer } = baked;
	// reconciliation needs selection first
	setSelection([newLayer.id]);
	update((doc) => ({
		...doc,
		layers: insertAfter(doc.layers, source.id, newLayer),
		updatedAt: Date.now(),
	}));
	return newLayer.id;
}

export function cutSelection(): Promise<string | null> {
	return withBakeGuard(cutSelectionInner);
}

async function cutSelectionInner(): Promise<string | null> {
	const baked = await bakeExtractedLayer();
	if (!baked) return null;
	const { source, sourceCanvas, layerMask, newLayer } = baked;

	const holed = document.createElement('canvas');
	holed.width = source.naturalWidth;
	holed.height = source.naturalHeight;
	const ctx = holed.getContext('2d');
	if (!ctx) return null;
	ctx.drawImage(sourceCanvas, 0, 0);
	ctx.globalCompositeOperation = 'destination-out';
	ctx.drawImage(layerMask, 0, 0);
	const holeHash = await bakeCanvasToHash(holed);

	if (!sourceStillMatches(source)) return null;
	// reconciliation needs selection first
	setSelection([newLayer.id]);
	update((doc) => {
		const layers = mapLayerInTree(
			insertAfter(doc.layers, source.id, newLayer),
			source.id,
			(l) =>
				l.kind === 'raster'
					? { ...l, blobHash: holeHash }
					: l,
		);
		return { ...doc, layers, updatedAt: Date.now() };
	});
	return newLayer.id;
}

// the active raster redrawn through the selection, one undo step
function repaintActive(
	paint: (
		ctx: CanvasRenderingContext2D,
		layerMask: HTMLCanvasElement,
	) => void,
): Promise<string | null> {
	return withBakeGuard(async () => {
		if (!canOperateOnActive()) return null;
		const alpha = getSelectionAlphaCanvas();
		const doc = getSnapshot();
		const id = getActiveLayerId();
		const source = doc && id ? findLayer(doc.layers, id) : null;
		if (!alpha || !source || source.kind !== 'raster') return null;
		const sourceCanvas = getRaster(source.blobHash);
		const layerMask = sceneMaskToLayerSpace(alpha, source);
		if (!sourceCanvas || !layerMask) return null;
		const out = document.createElement('canvas');
		out.width = source.naturalWidth;
		out.height = source.naturalHeight;
		const ctx = out.getContext('2d');
		if (!ctx) return null;
		ctx.drawImage(sourceCanvas, 0, 0);
		paint(ctx, layerMask);
		const hash = await bakeCanvasToHash(out);
		if (!sourceStillMatches(source)) return null;
		update((d) => ({
			...d,
			layers: mapLayerInTree(d.layers, source.id, (l) =>
				l.kind === 'raster'
					? { ...l, blobHash: hash }
					: l,
			),
			updatedAt: Date.now(),
		}));
		// the new pixels replace the canvas object, which drops it
		setSelection([source.id]);
		return source.id;
	});
}

// iOS Clear: a hole where the selection is, no new layer
export function clearSelectionPixels(): Promise<string | null> {
	return repaintActive((ctx, layerMask) => {
		ctx.globalCompositeOperation = 'destination-out';
		ctx.drawImage(layerMask, 0, 0);
	});
}

// iOS Fill: the selection painted with `colour` on the active layer
export function fillSelection(colour: string): Promise<string | null> {
	return repaintActive((ctx, layerMask) => {
		const tint = document.createElement('canvas');
		tint.width = layerMask.width;
		tint.height = layerMask.height;
		const tctx = tint.getContext('2d');
		if (!tctx) return;
		tctx.drawImage(layerMask, 0, 0);
		tctx.globalCompositeOperation = 'source-in';
		tctx.fillStyle = colour;
		tctx.fillRect(0, 0, tint.width, tint.height);
		ctx.drawImage(tint, 0, 0);
	});
}
