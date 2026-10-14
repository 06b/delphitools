import Component from '@glimmer/component';
import { cached } from '@glimmer/tracking';
import type { TOC } from '@ember/component/template-only';
import CanonButton from 'delphicanon/components/canon-button';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import { IconSvg } from 'delphitools-v2/components/icon';
import type {
	Layer,
	SubstrataDoc,
	Transform,
} from 'delphitools-v2/lib/substrata/doc-model';
import {
	groupLayers,
	setTransforms,
	ungroupLayer,
} from 'delphitools-v2/lib/substrata/layer-ops';
import {
	findLayer,
	isGroup,
	leafLayers,
	leafRenderList,
} from 'delphitools-v2/lib/substrata/layer-tree';
import { layerDims } from 'delphitools-v2/lib/substrata/shape-geometry';

interface Dims {
	w: number;
	h: number;
}

interface Action {
	label: string;
	icon: string;
	run: () => void;
	disabled: boolean;
	lit?: boolean;
}

const pressed = (lit?: boolean) =>
	lit === undefined ? undefined : String(lit);

const wrap360 = (a: number) => ((a % 360) + 360) % 360;

function dimsOf(layer: Layer): Dims | null {
	const d = layerDims(layer);
	return d
		? {
				w: d.width * layer.transform.scaleX,
				h: d.height * layer.transform.scaleY,
			}
		: null;
}

const ActionGrid: TOC<{
	Args: { actions: Action[]; columns?: number; titled?: boolean };
}> = <template>
	<CanonGrid class="sub-ip-arrange" @columns={{@columns}}>
		{{#each @actions as |a|}}
			<CanonButton
				@kind="segment"
				@text={{if @titled a.label ""}}
				@icon={{component IconSvg name=a.icon}}
				@label={{a.label}}
				@selected={{a.lit}}
				@disabled={{a.disabled}}
				@onClick={{a.run}}
				title={{a.label}}
				aria-pressed={{pressed a.lit}}
			/>
		{{/each}}
	</CanonGrid>
</template>;

// iOS ArrangeSection on the web's ArrangeBody logic: each cell acts on the
// visible, unlocked leaves of the selection, one undo step a press
export default class ArrangeSection extends Component<{
	Args: {
		doc: SubstrataDoc;
		selected: readonly string[];
		active: Layer | null;
	};
}> {
	@cached
	get leaves(): Layer[] {
		const { doc } = this.args;
		const effective = new Map(
			leafRenderList(doc.layers).map((e) => [e.layer.id, e]),
		);
		const out: Layer[] = [];
		for (const id of this.args.selected) {
			const layer = findLayer(doc.layers, id);
			if (!layer) continue;
			for (const leaf of leafLayers(layer)) {
				const e = effective.get(leaf.id);
				if (
					e?.visible &&
					!e.locked &&
					!out.includes(leaf)
				)
					out.push(leaf);
			}
		}
		return out;
	}

	@cached
	get sized(): Layer[] {
		return this.leaves.filter((l) => dimsOf(l) !== null);
	}

	#align(patch: (d: Dims) => Partial<Transform>) {
		setTransforms(
			this.sized.map((l) => ({
				id: l.id,
				transform: {
					...l.transform,
					...patch(dimsOf(l)!),
				},
			})),
		);
	}

	#distribute(axis: 'x' | 'y') {
		const sorted = [...this.sized].sort(
			(a, b) => a.transform[axis] - b.transform[axis],
		);
		const lo = sorted[0]!.transform[axis];
		const hi = sorted[sorted.length - 1]!.transform[axis];
		const step = (hi - lo) / (sorted.length - 1);
		setTransforms(
			sorted.map((l, i) => ({
				id: l.id,
				transform: {
					...l.transform,
					[axis]: lo + i * step,
				},
			})),
		);
	}

	#each(patch: (t: Transform) => Partial<Transform>) {
		setTransforms(
			this.leaves.map((l) => ({
				id: l.id,
				transform: {
					...l.transform,
					...patch(l.transform),
				},
			})),
		);
	}

	#flipped(axis: 'flipX' | 'flipY') {
		return (
			this.leaves.length > 0 &&
			this.leaves.every((l) => l.transform[axis])
		);
	}

	get aligns(): Action[] {
		const { width: W, height: H } = this.args.doc.artboard;
		const disabled = this.sized.length === 0;
		const cell = (
			label: string,
			icon: string,
			patch: (d: Dims) => Partial<Transform>,
		): Action => ({
			label,
			icon,
			disabled,
			run: () => this.#align(patch),
		});
		return [
			cell('Align left', 'align-start-vertical', (d) => ({
				x: d.w / 2,
			})),
			cell('Align centre', 'align-center-vertical', () => ({
				x: W / 2,
			})),
			cell('Align right', 'align-end-vertical', (d) => ({
				x: W - d.w / 2,
			})),
			cell('Align top', 'align-start-horizontal', (d) => ({
				y: d.h / 2,
			})),
			cell('Align middle', 'align-center-horizontal', () => ({
				y: H / 2,
			})),
			cell('Align bottom', 'align-end-horizontal', (d) => ({
				y: H - d.h / 2,
			})),
		];
	}

	get distributes(): Action[] {
		const disabled = this.sized.length < 3;
		return [
			{
				label: 'Distribute horizontally',
				icon: 'align-horizontal-distribute-center',
				disabled,
				run: () => this.#distribute('x'),
			},
			{
				label: 'Distribute vertically',
				icon: 'align-vertical-distribute-center',
				disabled,
				run: () => this.#distribute('y'),
			},
		];
	}

	get turns(): Action[] {
		const disabled = this.leaves.length === 0;
		return [
			{
				label: 'Rotate left',
				icon: 'rotate-ccw',
				disabled,
				run: () =>
					this.#each((t) => ({
						angle: wrap360(t.angle - 90),
					})),
			},
			{
				label: 'Rotate right',
				icon: 'rotate-cw',
				disabled,
				run: () =>
					this.#each((t) => ({
						angle: wrap360(t.angle + 90),
					})),
			},
			{
				label: 'Flip horizontal',
				icon: 'flip-horizontal-2',
				disabled,
				lit: this.#flipped('flipX'),
				run: () =>
					this.#each((t) => ({
						flipX: !t.flipX,
					})),
			},
			{
				label: 'Flip vertical',
				icon: 'flip-vertical-2',
				disabled,
				lit: this.#flipped('flipY'),
				run: () =>
					this.#each((t) => ({
						flipY: !t.flipY,
					})),
			},
		];
	}

	get grouping(): Action[] {
		const { active, selected } = this.args;
		return [
			{
				label: 'Group',
				icon: 'group',
				disabled: selected.length < 2,
				run: () => groupLayers(selected),
			},
			{
				label: 'Ungroup',
				icon: 'ungroup',
				disabled: !active || !isGroup(active),
				run: () => active && ungroupLayer(active.id),
			},
		];
	}

	<template>
		<CanonHeading @text="Align" />
		<ActionGrid @actions={{this.aligns}} @columns={{3}} />
		<CanonHeading @text="Distribute" />
		<ActionGrid @actions={{this.distributes}} />
		<CanonHeading @text="Rotate and flip" />
		<ActionGrid @actions={{this.turns}} />
		<CanonHeading @text="Group" />
		<ActionGrid @actions={{this.grouping}} @titled={{true}} />
	</template>
}
