import type {
	BlendMode,
	Layer,
	SubstrataDoc,
	Transform,
} from 'delphitools-v2/lib/substrata/doc-model';
import {
	getSnapshot,
	update,
	updateTransient,
} from 'delphitools-v2/lib/substrata/doc-store';
import { setTransform } from 'delphitools-v2/lib/substrata/layer-ops';
import {
	findLayer,
	isGroup,
	mapLayerInTree,
} from 'delphitools-v2/lib/substrata/layer-tree';

export type InspectorSection =
	| 'artboard'
	| 'shared'
	| 'group'
	| 'raster'
	| 'text'
	| 'shape'
	| 'freehand';

// iOS PanelLogic.inspectorSections; transform and arrange follow a leaf
export function inspectorSection(
	doc: SubstrataDoc | null,
	selected: readonly string[],
): InspectorSection {
	const layers = doc
		? selected.flatMap((id) => findLayer(doc.layers, id) ?? [])
		: [];
	const layer = layers[layers.length - 1];
	if (!layer) return 'artboard';
	if (layers.length > 1) return 'shared';
	return isGroup(layer) ? 'group' : layer.kind;
}

function applyOp(a: number, op: string, b: number): number {
	switch (op) {
		case '+':
			return a + b;
		case '-':
			return a - b;
		case '*':
			return a * b;
		case '/':
			return b === 0 ? a : a / b;
		default:
			return b;
	}
}

// "+100" "-50" "*1.5" "/2" act on the current value; "100+50" is a sum;
// null discards the edit
export function evalField(raw: string, current: number): number | null {
	const s = raw.trim().replace(/\s+/g, '').replace(',', '.');
	if (s === '') return null;

	let m = /^([+\-*/])(-?\d*\.?\d+)$/.exec(s);
	if (m) {
		const n = parseFloat(m[2]!);
		return Number.isFinite(n) ? applyOp(current, m[1]!, n) : null;
	}

	m = /^(-?\d*\.?\d+)([+\-*/])(-?\d*\.?\d+)$/.exec(s);
	if (m) {
		const a = parseFloat(m[1]!);
		const b = parseFloat(m[3]!);
		return Number.isFinite(a) && Number.isFinite(b)
			? applyOp(a, m[2]!, b)
			: null;
	}

	const n = parseFloat(s);
	return Number.isFinite(n) ? n : null;
}

export function formatField(value: number, decimals: number): string {
	return String(Number(value.toFixed(decimals)));
}

function eachLayer(
	ids: readonly string[],
	body: (layer: Layer) => Layer,
): (doc: SubstrataDoc) => SubstrataDoc {
	return (doc) => {
		let layers = doc.layers;
		for (const id of ids) layers = mapLayerInTree(layers, id, body);
		return { ...doc, layers, updatedAt: Date.now() };
	};
}

// one undo step for the whole selection
export function setOpacities(
	ids: readonly string[],
	opacity: number,
	transient = false,
): void {
	const apply = eachLayer(ids, (l) => ({ ...l, opacity }));
	if (transient) updateTransient(apply);
	else update(apply);
}

export function setBlendModes(
	ids: readonly string[],
	blendMode: BlendMode,
): void {
	update(eachLayer(ids, (l) => ({ ...l, blendMode })));
}

export function renameLayer(id: string, name: string): void {
	const doc = getSnapshot();
	const layer = doc ? findLayer(doc.layers, id) : null;
	if (!layer || layer.name === name) return;
	update(eachLayer([id], (l) => ({ ...l, name })));
}

// reads the live transform so a stale render never undoes a canvas drag
export function patchTransform(id: string, patch: Partial<Transform>): void {
	const doc = getSnapshot();
	const layer = doc ? findLayer(doc.layers, id) : null;
	if (layer) setTransform(id, { ...layer.transform, ...patch });
}
