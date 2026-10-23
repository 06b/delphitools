/* develop writes as doc mutators, for one transient: iOS PanelLogic */

import { newId } from './doc-model';
import type { Filter, Layer, SubstrataDoc } from './doc-model';
import { getFilterDef } from './filters';
import { findLayer, mapLayerInTree } from './layer-tree';
import { defaultParams } from './param-spec';

export const LOOK_TYPE = 'film-sim';

/** the filter's amount, 0 without the filter */
export function adjustment(layer: Layer, type: string): number {
	const value = layer.filters.find((f) => f.type === type)?.params[
		'amount'
	];
	return typeof value === 'number' ? value : 0;
}

export function getLook(layer: Layer): Filter | null {
	return layer.filters.find((f) => f.type === LOOK_TYPE) ?? null;
}

function withFilters(
	doc: SubstrataDoc,
	layerId: string,
	fn: (list: Filter[]) => Filter[],
): SubstrataDoc {
	const layer = findLayer(doc.layers, layerId);
	const filters = layer && fn(layer.filters);
	if (!filters || filters === layer.filters) return doc;
	const layers = mapLayerInTree(doc.layers, layerId, (l) => ({
		...l,
		filters,
	}));
	return { ...doc, layers, updatedAt: Date.now() };
}

// adds the filter with its defaults first (looks after the adjustments,
// as addFx); a filter switched off in the FX panel comes back on
function setFilterParam(
	doc: SubstrataDoc,
	layerId: string,
	type: string,
	key: string,
	value: number | string,
): SubstrataDoc {
	return withFilters(doc, layerId, (list) => {
		if (list.some((f) => f.type === type))
			return list.map((f) =>
				f.type === type
					? {
							...f,
							enabled: true,
							params: {
								...f.params,
								[key]: value,
							},
						}
					: f,
			);
		const def = getFilterDef(type);
		if (!def) return list;
		const fx: Filter = {
			id: newId(),
			type,
			enabled: true,
			params: { ...defaultParams(def.params), [key]: value },
		};
		return type === LOOK_TYPE ? [...list, fx] : [fx, ...list];
	});
}

export const setAdjustment = (
	doc: SubstrataDoc,
	layerId: string,
	type: string,
	amount: number,
) => setFilterParam(doc, layerId, type, 'amount', amount);

export const removeFilter = (
	doc: SubstrataDoc,
	layerId: string,
	type: string,
) =>
	withFilters(doc, layerId, (list) =>
		list.some((f) => f.type === type)
			? list.filter((f) => f.type !== type)
			: list,
	);

export const setLook = (doc: SubstrataDoc, layerId: string, preset: string) =>
	setFilterParam(doc, layerId, LOOK_TYPE, 'preset', preset);

export function setLookIntensity(
	doc: SubstrataDoc,
	layerId: string,
	percent: number,
): SubstrataDoc {
	const layer = findLayer(doc.layers, layerId);
	if (!layer || !getLook(layer)) return doc;
	return setFilterParam(doc, layerId, LOOK_TYPE, 'intensity', percent);
}
