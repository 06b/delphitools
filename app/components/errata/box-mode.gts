import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import { eq, not } from 'ember-truth-helpers';
import type { TOC } from '@ember/component/template-only';
import Icon from 'delphitools-v2/components/icon';
import NdsLoader from 'delphitools-v2/components/ui/nds-loader';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from 'delphitools-v2/components/ui/select';
import {
	PresetRow,
	type PresetOption,
} from 'delphitools-v2/components/substrata/preset-row';
import { exportCurrent } from 'delphitools-v2/lib/errata/export-file';
import {
	addStamped,
	pageNumberObjects,
	scopePages,
	stampObjects,
	watermarkObjects,
	type PageScope,
} from 'delphitools-v2/lib/errata/stamps';
import {
	getPageIndex,
	store,
	subscribePage,
} from 'delphitools-v2/lib/errata/store';
import type { Stamped } from 'delphitools-v2/lib/errata/doc-model';
import { dropRedactions, redactIds } from 'delphitools-v2/lib/errata/redact';
import {
	getMode,
	preview,
	setMode,
	type BoxMode as Mode,
} from 'delphitools-v2/lib/errata/ui';
import {
	DEFAULT_IMPOSITION_CONFIG,
	IMPOSITION_LAYOUTS,
	PAPER_SIZES,
	imposePdf,
} from 'delphitools-v2/lib/imposition';
import {
	ANCHORS,
	ANCHOR_ICON,
	type Anchor,
} from 'delphitools-v2/lib/pdf-stamp';
import { MAX_SIZES, compressPdf } from 'delphitools-v2/lib/pdf-compress';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

const SCOPES: { value: PageScope; label: string }[] = [
	{ value: 'all', label: 'All' },
	{ value: 'current', label: 'Current' },
	{ value: 'range', label: 'Range' },
];

const EDGE_ANCHORS = ANCHORS.filter((a) => !a.startsWith('middle')).map(
	(value) => ({ value, icon: ANCHOR_ICON[value] }),
);

const STAMPS = ['Approved', 'Draft', 'Final', 'Confidential', 'Void'];

const numbers = (values: number[], unit = ''): PresetOption[] =>
	values.map((v) => ({ value: v, label: `${v}${unit}` }));

const NUMBER_SIZES = numbers([8, 10, 12]);
const STAMP_SIZES = numbers([18, 24, 36]);
const OPACITIES = numbers([10, 15, 25, 40]);
const ANGLES = numbers([0, -30, -45], '°');
const QUALITIES = numbers([40, 65, 80]);

const LAYOUTS = IMPOSITION_LAYOUTS.filter(
	(l) => l.id !== 'gang-run' && l.id !== 'custom-nup',
);

interface SegmentedSignature {
	Args: {
		options: {
			value: string | number;
			label?: string;
			icon?: string;
		}[];
		value: string | number;
		onChange: (value: string | number) => void;
	};
}

const Segmented: TOC<SegmentedSignature> = <template>
	<span class="segmented err-mode-seg">
		{{#each @options key="value" as |o|}}
			<button
				type="button"
				class="sub-seg-cell
					{{if (eq @value o.value) 'is-active'}}"
				aria-label={{if o.icon o.value}}
				title={{if o.icon o.value}}
				{{on "click" (fn @onChange o.value)}}
			>
				{{#if o.icon}}
					<Icon @name={{o.icon}} />
				{{else}}
					{{o.label}}
				{{/if}}
			</button>
		{{/each}}
	</span>
</template>;

interface Signature {
	Args: {
		mode: Mode | null;
		label: string;
		icon: string;
		open: boolean;
	};
}

export default class BoxModeBar extends Component<Signature> {
	doc = new TrackedExternal(store.subscribe, store.getSnapshot);
	pageIndex = new TrackedExternal(subscribePage, getPageIndex);

	@tracked scope: PageScope = 'all';
	@tracked range = '';
	@tracked numberFormat = '{n} / {N}';
	@tracked numberAnchor: Anchor = 'bottom-center';
	@tracked numberSize = 10;
	@tracked watermark = 'DRAFT';
	@tracked opacity = 15;
	@tracked angle = -45;
	@tracked stamp = 'Approved';
	@tracked stampAnchor: Anchor = 'top-right';
	@tracked stampSize = 24;
	@tracked quality = 65;
	@tracked maxEdge = 0;
	@tracked layout = DEFAULT_IMPOSITION_CONFIG.layoutId;
	@tracked paper = DEFAULT_IMPOSITION_CONFIG.paperSize.id;
	@tracked busy = false;
	@tracked failedMode: Mode | null = null;

	// ∑CG: redact mode bar hint chip, beside the mark count
	//   spec: at most 32 chars, no period; drag on a page marks an area, a click on a text line marks that line
	//   sample: "Drag an area or click a line"
	redactHint = '∑CG';

	get failed() {
		return (
			this.failedMode !== null &&
			this.failedMode === this.args.mode
		);
	}

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.pageIndex.unsubscribe();
		preview([]);
	}

	get stamping() {
		const m = this.args.mode;
		return (
			m === 'page-numbers' ||
			m === 'watermark' ||
			m === 'stamp'
		);
	}

	@cached
	get indices(): number[] | null {
		const doc = this.doc.current;
		if (!doc) return null;
		return scopePages(
			this.scope,
			this.range,
			doc.pages.length,
			this.scope === 'current' ? this.pageIndex.current : 0,
		);
	}

	get rangeInvalid() {
		return this.scope === 'range' && this.indices === null;
	}

	@cached
	get items(): Stamped[] {
		const doc = this.doc.current;
		const indices = this.indices;
		if (!doc || !indices) return [];
		switch (this.args.mode) {
			case 'page-numbers':
				return pageNumberObjects(
					doc,
					indices,
					this.numberFormat,
					this.numberAnchor,
					this.numberSize,
				);
			case 'watermark':
				return watermarkObjects(
					doc,
					indices,
					this.watermark,
					this.opacity / 100,
					this.angle,
				);
			case 'stamp':
				return stampObjects(
					doc,
					indices,
					this.stamp.toUpperCase(),
					this.stampAnchor,
					this.stampSize,
				);
			default:
				return [];
		}
	}

	get marks() {
		return redactIds(this.doc.current).size;
	}

	get canApply() {
		if (!this.args.open || this.busy) return false;
		if (this.args.mode === 'redact') return this.marks > 0;
		return this.stamping ? this.items.length > 0 : true;
	}

	// cancel keeps earlier marks
	#kept = new Set<string>();
	redactSession = modifier(
		(_el: HTMLElement, [mode]: [Mode | null | undefined]) => {
			if (mode === 'redact')
				this.#kept = redactIds(store.getSnapshot());
		},
	);

	get layoutName() {
		return LAYOUTS.find((l) => l.id === this.layout)?.name ?? '';
	}

	get paperSize() {
		return (
			PAPER_SIZES.find((p) => p.id === this.paper) ??
			DEFAULT_IMPOSITION_CONFIG.paperSize
		);
	}

	livePreview = modifier(
		(_el: HTMLElement, [items]: [Stamped[] | undefined]) => {
			preview(items ?? []);
			return () => preview([]);
		},
	);

	pick = (key: string, value: unknown) => {
		(this as unknown as Record<string, unknown>)[key] = value;
	};

	setText = (key: string, event: Event) =>
		this.pick(key, (event.target as HTMLInputElement).value);

	cancel = () => {
		this.failedMode = null;
		if (this.args.mode === 'redact') dropRedactions(this.#kept);
		setMode(null);
	};

	compress = async (bytes: Uint8Array) =>
		(
			await compressPdf(bytes.slice().buffer, {
				recompressImages: true,
				quality: this.quality,
				maxEdge: this.maxEdge,
			})
		).bytes;

	impose = (bytes: Uint8Array) =>
		imposePdf(bytes, {
			...DEFAULT_IMPOSITION_CONFIG,
			layoutId: this.layout,
			paperSize: this.paperSize,
		});

	apply = async () => {
		if (!this.canApply) return;
		if (this.stamping) {
			addStamped(this.items);
			setMode(null);
			return;
		}
		const mode = this.args.mode;
		this.busy = true;
		this.failedMode = null;
		const compress = mode === 'compress';
		// exportPdf applies redactions
		const ok =
			mode === 'redact'
				? await exportCurrent(undefined, '-redacted')
				: await exportCurrent(
						compress
							? this.compress
							: this.impose,
						compress
							? '-compressed'
							: `-imposed-${this.layout}`,
					);
		this.busy = false;
		if (!ok) this.failedMode = mode;
		else if (getMode() === mode) setMode(null);
	};

	<template>
		<div
			class="err-mode pointer-events-auto
				{{if @open 'is-open'}}"
			data-mode={{@mode}}
			{{this.livePreview (if @open this.items)}}
			{{this.redactSession (if @open @mode)}}
		>
			<Icon @name={{@icon}} class="sub-omni-tool-glyph" />
			<span class="sub-omni-tool-name">{{@label}}</span>
			<span aria-hidden="true" class="sub-omni-sep"></span>

			{{#if (eq @mode "page-numbers")}}
				<label class="err-mode-field">
					<span
						class="sub-tool-row-label"
					>Format</span>
					<input
						class="err-mode-input"
						value={{this.numberFormat}}
						{{on
							"input"
							(fn
								this.setText
								"numberFormat"
							)
						}}
					/>
				</label>
				<span class="err-mode-field">
					<span
						class="sub-tool-row-label"
					>Position</span>
					<Segmented
						@options={{EDGE_ANCHORS}}
						@value={{this.numberAnchor}}
						@onChange={{fn
							this.pick
							"numberAnchor"
						}}
					/>
				</span>
				<span class="err-mode-field">
					<span
						class="sub-tool-row-label"
					>Size</span>
					<PresetRow
						@options={{NUMBER_SIZES}}
						@value={{this.numberSize}}
						@onChange={{fn
							this.pick
							"numberSize"
						}}
						@min={{4}}
						@max={{72}}
						@unit="pt"
					/>
				</span>
			{{else if (eq @mode "watermark")}}
				<label class="err-mode-field">
					<span
						class="sub-tool-row-label"
					>Text</span>
					<input
						class="err-mode-input"
						value={{this.watermark}}
						{{on
							"input"
							(fn
								this.setText
								"watermark"
							)
						}}
					/>
				</label>
				<span class="err-mode-field">
					<span
						class="sub-tool-row-label"
					>Opacity</span>
					<PresetRow
						@options={{OPACITIES}}
						@value={{this.opacity}}
						@onChange={{fn
							this.pick
							"opacity"
						}}
						@min={{1}}
						@max={{100}}
						@unit="%"
					/>
				</span>
				<span class="err-mode-field">
					<span
						class="sub-tool-row-label"
					>Angle</span>
					<PresetRow
						@options={{ANGLES}}
						@value={{this.angle}}
						@onChange={{fn
							this.pick
							"angle"
						}}
						@min={{-90}}
						@max={{90}}
						@unit="°"
					/>
				</span>
			{{else if (eq @mode "stamp")}}
				<span class="err-mode-field">
					<span
						class="sub-tool-row-label"
					>Label</span>
					<Select
						@value={{this.stamp}}
						@onValueChange={{fn
							this.pick
							"stamp"
						}}
					>
						<SelectTrigger
							class="sub-font-trigger err-mode-select"
							aria-label="Label"
						>
							<SelectValue
							>{{this.stamp}}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{{#each STAMPS as |s|}}
								<SelectItem
									@value={{s}}
								>{{s}}</SelectItem>
							{{/each}}
						</SelectContent>
					</Select>
				</span>
				<span class="err-mode-field">
					<span
						class="sub-tool-row-label"
					>Position</span>
					<Segmented
						@options={{EDGE_ANCHORS}}
						@value={{this.stampAnchor}}
						@onChange={{fn
							this.pick
							"stampAnchor"
						}}
					/>
				</span>
				<span class="err-mode-field">
					<span
						class="sub-tool-row-label"
					>Size</span>
					<PresetRow
						@options={{STAMP_SIZES}}
						@value={{this.stampSize}}
						@onChange={{fn
							this.pick
							"stampSize"
						}}
						@min={{6}}
						@max={{144}}
						@unit="pt"
					/>
				</span>
			{{else if (eq @mode "compress")}}
				<span class="err-mode-field">
					<span
						class="sub-tool-row-label"
					>Quality</span>
					<PresetRow
						@options={{QUALITIES}}
						@value={{this.quality}}
						@onChange={{fn
							this.pick
							"quality"
						}}
						@min={{10}}
						@max={{100}}
					/>
				</span>
				<span class="err-mode-field">
					<span
						class="sub-tool-row-label"
					>Images</span>
					<Segmented
						@options={{MAX_SIZES}}
						@value={{this.maxEdge}}
						@onChange={{fn
							this.pick
							"maxEdge"
						}}
					/>
				</span>
			{{else if (eq @mode "impose")}}
				<span class="err-mode-field">
					<span
						class="sub-tool-row-label"
					>Layout</span>
					<Select
						@value={{this.layout}}
						@onValueChange={{fn
							this.pick
							"layout"
						}}
					>
						<SelectTrigger
							class="sub-font-trigger err-mode-select"
							aria-label="Layout"
						>
							<SelectValue
							>{{this.layoutName}}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{{#each
								LAYOUTS key="id"
								as |l|
							}}
								<SelectItem
									@value={{l.id}}
								>{{l.name}}</SelectItem>
							{{/each}}
						</SelectContent>
					</Select>
				</span>
				<span class="err-mode-field">
					<span
						class="sub-tool-row-label"
					>Sheet</span>
					<Select
						@value={{this.paper}}
						@onValueChange={{fn
							this.pick
							"paper"
						}}
					>
						<SelectTrigger
							class="sub-font-trigger err-mode-select"
							aria-label="Sheet"
						>
							<SelectValue
							>{{this.paperSize.label}}</SelectValue>
						</SelectTrigger>
						<SelectContent>
							{{#each
								PAPER_SIZES
								key="id"
								as |p|
							}}
								<SelectItem
									@value={{p.id}}
								>{{p.label}}</SelectItem>
							{{/each}}
						</SelectContent>
					</Select>
				</span>
			{{else if (eq @mode "redact")}}
				<span
					class="sub-omni-tag"
				>{{this.redactHint}}</span>
				<span class="sub-omni-tag">{{this.marks}}
					marked</span>
			{{/if}}

			{{#if this.stamping}}
				<span class="err-mode-field">
					<span
						class="sub-tool-row-label"
					>Pages</span>
					<Segmented
						@options={{SCOPES}}
						@value={{this.scope}}
						@onChange={{fn
							this.pick
							"scope"
						}}
					/>
					{{#if (eq this.scope "range")}}
						<input
							class="err-mode-input is-narrow"
							aria-label="Range"
							aria-invalid={{if
								this.rangeInvalid
								"true"
								"false"
							}}
							placeholder="1-3, 5"
							value={{this.range}}
							{{on
								"input"
								(fn
									this.setText
									"range"
								)
							}}
						/>
					{{/if}}
				</span>
			{{/if}}

			{{#if this.failed}}
				<span
					class="sub-omni-tag err-mode-failed"
				>Failed</span>
			{{/if}}

			<span class="err-mode-actions">
				<button
					type="button"
					class="sub-modal-btn is-ghost"
					{{on "click" this.cancel}}
				>
					<Icon @name="x" />
					Cancel
				</button>
				<button
					type="button"
					class="sub-modal-btn is-primary"
					disabled={{not this.canApply}}
					{{on "click" this.apply}}
				>
					{{#if this.busy}}
						<NdsLoader />
					{{else}}
						<Icon @name="check" />
					{{/if}}
					Apply
				</button>
			</span>
		</div>
	</template>
}
