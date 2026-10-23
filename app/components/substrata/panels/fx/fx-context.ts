import {
	beginTransient,
	commitTransient,
	isGestureActive,
} from 'delphitools-v2/lib/substrata/doc-store';
import {
	setFxParams,
	type FxItem,
	type FxStack,
} from 'delphitools-v2/lib/substrata/fx-ops';
import type {
	FxDefinition,
	ParamSpec,
} from 'delphitools-v2/lib/substrata/param-spec';
import type { RasterLayer } from 'delphitools-v2/lib/substrata/doc-model';
import { editorUi } from 'delphitools-v2/lib/substrata/editor-ui';
import { formatValue } from './fx-maths';

export type Patch = Record<string, number | string>;

// what an editor needs to read and write one fx
export interface FxContext {
	layer: RasterLayer;
	layerId: string;
	stack: FxStack;
	fx: FxItem;
	def: FxDefinition;
}

export function specOf(ctx: FxContext, key: string): ParamSpec | undefined {
	return ctx.def.params.find((p) => p.key === key);
}

export function labelOf(ctx: FxContext, key: string): string {
	return specOf(ctx, key)?.label ?? key;
}

export function defaultOf(
	ctx: FxContext,
	key: string,
): number | string | undefined {
	const spec = specOf(ctx, key);
	return spec && spec.kind !== 'pairs' ? spec.default : undefined;
}

export function numberOf(ctx: FxContext, key: string): number {
	const v = ctx.fx.params[key];
	if (typeof v === 'number') return v;
	const d = defaultOf(ctx, key);
	return typeof d === 'number' ? d : 0;
}

export function stringOf(ctx: FxContext, key: string): string {
	const v = ctx.fx.params[key];
	if (typeof v === 'string') return v;
	const d = defaultOf(ctx, key);
	return typeof d === 'string' ? d : '';
}

export function readoutOf(ctx: FxContext, key: string) {
	const spec = specOf(ctx, key);
	const fmt =
		spec && (spec.kind === 'slider' || spec.kind === 'stepper')
			? spec
			: { step: 1 };
	return (v: number) => formatValue(v, fmt);
}

// one undo step
export function write(ctx: FxContext, patch: Patch): void {
	setFxParams(ctx.layerId, ctx.stack, ctx.fx.id, patch);
}

// a frame of a drag; commit closes the undo step
export function preview(ctx: FxContext, patch: Patch): void {
	if (!isGestureActive()) beginTransient();
	setFxParams(ctx.layerId, ctx.stack, ctx.fx.id, patch, {
		transient: true,
	});
}

export function commit(): void {
	if (isGestureActive()) commitTransient();
}

export function reset(ctx: FxContext, key: string): void {
	const d = defaultOf(ctx, key);
	if (d !== undefined) write(ctx, { [key]: d });
}

// a double click resets, except on a control that takes taps (iOS TapAction)
export function resetOnDouble(ctx: FxContext, key: string) {
	return (event: MouseEvent) => {
		if ((event.target as Element).closest('button, input')) return;
		reset(ctx, key);
	};
}

// the ring sends a stream while it is open; the final colour closes it
export function pickColour(ctx: FxContext, key: string): void {
	editorUi.openRingFor({
		hex: stringOf(ctx, key),
		alpha: 1,
		send: (hex, _alpha, final) => {
			preview(ctx, { [key]: hex });
			if (final) commit();
		},
	});
}
