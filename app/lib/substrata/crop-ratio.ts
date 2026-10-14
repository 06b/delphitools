import type { CropRect, Transform } from './doc-model';
import { getSnapshot } from './doc-store';
import { setCrop } from './layer-ops';
import { findLayer } from './layer-tree';
import { getSelectedLayerIds } from './selection';
import { layerDims } from './shape-geometry';

// iOS ToolSettings.cropRatios: width over height of the cropped picture
export const CROP_RATIOS: readonly { title: string; ratio: number | null }[] = [
	{ title: 'Free', ratio: null },
	{ title: '1:1', ratio: 1 },
	{ title: '4:5', ratio: 0.8 },
	{ title: '16:9', ratio: 16 / 9 },
];

// layer pixels, the web's CROP_MIN
export const CROP_MIN = 8;

interface Dims {
	width: number;
	height: number;
}

let ratio: number | null = null;
const listeners = new Set<() => void>();

export function getCropRatio(): number | null {
	return ratio;
}

export function subscribeCropRatio(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

// a picture ratio in layer pixels, which the layer's scale stretches
export function localAspect(r: number, t: Transform): number {
	return (r * Math.abs(t.scaleY)) / Math.max(Math.abs(t.scaleX), 1e-9);
}

// the largest crop of `aspect` centred in the layer
export function fittedCrop(aspect: number, dims: Dims): CropRect {
	const w = Math.min(dims.width, dims.height * aspect);
	const h = w / aspect;
	return {
		x: Math.round((dims.width - w) / 2),
		y: Math.round((dims.height - h) / 2),
		w: Math.round(w),
		h: Math.round(h),
	};
}

// iOS CropRect.dragged: handle (hx, hy each -1, 0 or 1) dragged to the
// layer point (lx, ly); with an aspect, corners keep the opposite corner
// and sides keep the other axis's centre
export function draggedCrop(
	start: CropRect,
	hx: number,
	hy: number,
	lx: number,
	ly: number,
	dims: Dims,
	aspect: number | null = null,
): CropRect {
	let { x, y, w, h } = start;
	if (hx === -1) {
		const right = start.x + start.w;
		x = Math.min(Math.max(lx, 0), Math.max(0, right - CROP_MIN));
		w = right - x;
	} else if (hx === 1) {
		w =
			Math.min(Math.max(lx, start.x + CROP_MIN), dims.width) -
			start.x;
	}
	if (hy === -1) {
		const bottom = start.y + start.h;
		y = Math.min(Math.max(ly, 0), Math.max(0, bottom - CROP_MIN));
		h = bottom - y;
	} else if (hy === 1) {
		h =
			Math.min(
				Math.max(ly, start.y + CROP_MIN),
				dims.height,
			) - start.y;
	}
	if (aspect) {
		if (hx && hy) {
			const room =
				hy === 1
					? dims.height - start.y
					: start.y + start.h;
			h = Math.min(w / aspect, room);
			w = h * aspect;
			if (hx === -1) x = start.x + start.w - w;
			if (hy === -1) y = start.y + start.h - h;
		} else if (hx) {
			h = Math.min(w / aspect, dims.height);
			w = h * aspect;
			if (hx === -1) x = start.x + start.w - w;
			y = Math.min(
				Math.max(start.y + start.h / 2 - h / 2, 0),
				dims.height - h,
			);
		} else if (hy) {
			w = Math.min(h * aspect, dims.width);
			h = w / aspect;
			if (hy === -1) y = start.y + start.h - h;
			x = Math.min(
				Math.max(start.x + start.w / 2 - w / 2, 0),
				dims.width - w,
			);
		}
	}
	const rx = Math.round(x);
	const ry = Math.round(y);
	return {
		x: rx,
		y: ry,
		w: Math.round(x + w) - rx,
		h: Math.round(y + h) - ry,
	};
}

// the aspect the crop drag keeps for a layer, in layer pixels
export function cropAspect(t: Transform): number | null {
	return ratio ? localAspect(ratio, t) : null;
}

// iOS setCropRatio: a ratio crops the selected layer to its largest
// centred fit at once; Free leaves the crop as it is
export function setCropRatio(next: number | null): void {
	ratio = next;
	for (const l of listeners) l();
	if (!next) return;
	const doc = getSnapshot();
	const ids = getSelectedLayerIds();
	const layer =
		doc && ids.length === 1 ? findLayer(doc.layers, ids[0]!) : null;
	const dims = layer ? layerDims(layer) : null;
	if (!layer || !dims || dims.width <= 0 || dims.height <= 0) return;
	setCrop(layer.id, fittedCrop(localAspect(next, layer.transform), dims));
}
