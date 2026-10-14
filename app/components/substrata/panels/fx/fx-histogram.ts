import { FabricImage } from 'fabric';
import type { RasterLayer } from 'delphitools-v2/lib/substrata/doc-model';
import { buildFabricFilters } from 'delphitools-v2/lib/substrata/filter-factory';
import type { FxStack } from 'delphitools-v2/lib/substrata/fx-ops';
import { getRaster } from 'delphitools-v2/lib/substrata/raster-cache';
import { countLuminance, normalised } from './fx-maths';

// proxy longest side
const SIDE = 256;
// ponytail: a handful of edited layers; a byte budget if many are open at once
const LIMIT = 16;
const done = new Map<string, number[]>();

// the layer's luminance as the fx sees it: the filters above it applied
export function histogram(
	layer: RasterLayer,
	stack: FxStack,
	fxId: string,
): number[] | null {
	const at = layer.filters.findIndex((f) => f.id === fxId);
	const before =
		stack === 'effects'
			? layer.filters
			: layer.filters.slice(0, at);
	const upstream = before.filter((f) => f.enabled);
	const key =
		layer.blobHash +
		JSON.stringify(upstream.map((f) => [f.type, f.params]));
	const hit = done.get(key);
	if (hit) return hit;

	// the cache has no subscription; the next doc change asks again
	const source = getRaster(layer.blobHash);
	if (!source?.width || !source.height) return null;
	const scale = Math.min(1, SIDE / Math.max(source.width, source.height));
	const w = Math.max(1, Math.round(source.width * scale));
	const h = Math.max(1, Math.round(source.height * scale));
	const proxy = document.createElement('canvas');
	proxy.width = w;
	proxy.height = h;
	proxy.getContext('2d')?.drawImage(source, 0, 0, w, h);

	let pixels: HTMLCanvasElement = proxy;
	if (upstream.length) {
		try {
			const image = new FabricImage(proxy);
			image.filters = buildFabricFilters(upstream, {
				width: w,
				height: h,
			});
			image.applyFilters();
			pixels = image.getElement() as HTMLCanvasElement;
		} catch {
			pixels = proxy;
		}
	}
	const data = pixels
		.getContext('2d', { willReadFrequently: true })
		?.getImageData(0, 0, pixels.width, pixels.height).data;
	if (!data) return null;
	const bins = normalised(countLuminance(data));
	done.set(key, bins);
	if (done.size > LIMIT) done.delete(done.keys().next().value!);
	return bins;
}
