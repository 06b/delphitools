import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import { eq } from 'ember-truth-helpers';
import FormFields from 'delphitools-v2/components/errata/form-mode';
import { htmlSafe } from '@ember/template';
import ToolPanel, {
	AnchorPicker,
	Field,
	InputField,
	PageScope,
	Segmented,
	Slider,
	type SegmentedOption,
} from 'delphitools-v2/components/errata/tool-panel';
import PaperSizeCombobox from 'delphitools-v2/components/ui/paper-size-combobox';
import Switch from 'delphitools-v2/components/ui/switch';
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
import { replaceDocument } from 'delphitools-v2/lib/errata/source';
import {
	addStamped,
	pageNumberObjects,
	scopePages,
	STAMP_RED,
	stampObjects,
	watermarkObjects,
	type PageScope as Scope,
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
	subscribeUi,
	type BoxMode as Mode,
} from 'delphitools-v2/lib/errata/ui';
import {
	DEFAULT_IMPOSITION_CONFIG,
	DUPLEX_AWARE_LAYOUTS,
	GANG_RUN_GRIDS,
	IMPOSITION_LAYOUTS,
	imposePdf,
	type ImpositionConfig,
} from 'delphitools-v2/lib/imposition';
import { findPaperSize } from 'delphitools-v2/lib/paper-sizes';
import type { Anchor } from 'delphitools-v2/lib/pdf-stamp';
import {
	MAX_SIZES,
	compressPdf,
	formatBytes,
} from 'delphitools-v2/lib/pdf-compress';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import {
	getSourceWidgets,
	subscribeWidgets,
	widgetStandIns,
} from 'delphitools-v2/lib/errata/widgets';

const CUSTOM = 'Custom';
const STAMPS = ['Approved', 'Draft', 'Final', 'Confidential', 'Void', CUSTOM];

const STAMP_COLOURS = [
	{ value: STAMP_RED, label: 'Red' },
	{ value: '#000000', label: 'Black' },
	{ value: '#0550ae', label: 'Blue' },
	{ value: '#1a7f37', label: 'Green' },
].map((c) => ({ ...c, style: htmlSafe(`background-color: ${c.value}`) }));

const numbers = (values: number[], unit = ''): PresetOption[] =>
	values.map((v) => ({ value: v, label: `${v}${unit}` }));

const NUMBER_SIZES = numbers([8, 10, 12]);
const STAMP_SIZES = numbers([18, 24, 36]);

type Orientation = ImpositionConfig['orientation'];
type Flip = NonNullable<ImpositionConfig['duplexFlip']>;

// imposer.gts forces landscape
const FOLD_LAYOUTS = new Set([
	'saddle-stitch',
	'perfect-bind',
	'step-and-repeat',
]);

const ORIENTATIONS: SegmentedOption<Orientation>[] = [
	{ value: 'portrait', label: 'Portrait' },
	{ value: 'landscape', label: 'Landscape' },
];

const FLIPS: SegmentedOption<Flip>[] = [
	{ value: 'long-edge', label: 'Long edge' },
	{ value: 'short-edge', label: 'Short edge' },
];

const COPIES: SegmentedOption<number>[] = Object.keys(GANG_RUN_GRIDS).map(
	(n) => ({ value: Number(n), label: n }),
);

const clampGrid = (event: Event) =>
	Math.max(
		1,
		Math.min(
			10,
			parseInt(
				(event.target as HTMLInputElement).value,
				10,
			) || 1,
		),
	);

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
	widgets = new TrackedExternal(subscribeWidgets, getSourceWidgets);

	@tracked scope: Scope = 'all';
	@tracked range = '';
	@tracked numberFormat = '{n} / {N}';
	@tracked numberAnchor: Anchor = 'bottom-center';
	@tracked numberSize = 10;
	@tracked watermark = 'DRAFT';
	@tracked opacity = 15;
	@tracked angle = -45;
	@tracked stamp = 'Approved';
	@tracked stampText = '';
	@tracked stampBold = false;
	@tracked stampColour = STAMP_RED;
	@tracked stampAnchor: Anchor = 'top-right';
	@tracked stampSize = 24;
	@tracked quality = 65;
	@tracked maxEdge = 0;
	@tracked layout = DEFAULT_IMPOSITION_CONFIG.layoutId;
	@tracked paper = DEFAULT_IMPOSITION_CONFIG.paperSize.id;
	@tracked orientation = DEFAULT_IMPOSITION_CONFIG.orientation;
	@tracked margin = DEFAULT_IMPOSITION_CONFIG.marginMm;
	@tracked gutter = DEFAULT_IMPOSITION_CONFIG.gutterMm;
	@tracked creep = DEFAULT_IMPOSITION_CONFIG.creepMm;
	@tracked cropMarks = DEFAULT_IMPOSITION_CONFIG.cropMarks;
	@tracked copies = 4;
	@tracked rows = 2;
	@tracked cols = 2;
	@tracked flip: Flip = 'long-edge';
	@tracked busy = false;
	@tracked failedMode: Mode | null = null;
	@tracked compressed: {
		source: string | undefined;
		before: number;
		after: number;
	} | null = null;

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
		this.widgets.unsubscribe();
		this.#unsubscribeUi();
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
		if (doc && this.args.mode === 'form')
			return widgetStandIns(doc, this.widgets.current ?? []);
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
					this.stamp === CUSTOM
						? this.stampText
						: this.stamp.toUpperCase(),
					this.stampAnchor,
					this.stampSize,
					this.stampColour,
					this.stampBold,
				);
			default:
				return [];
		}
	}

	get marks() {
		return redactIds(this.doc.current).size;
	}

	// hidden once undone
	get compressResult() {
		const c = this.compressed;
		return c && c.source === this.doc.current?.source
			? `${formatBytes(c.before)} → ${formatBytes(c.after)}`
			: null;
	}

	get canApply() {
		if (!this.args.open || this.busy) return false;
		if (this.args.mode === 'redact') return this.marks > 0;
		if (this.args.mode === 'compress') return !this.compressResult;
		return this.stamping ? this.items.length > 0 : true;
	}

	// escape bypasses cancel
	#kept = new Set<string>();
	#lastMode = getMode();
	#unsubscribeUi = subscribeUi(() => {
		const mode = getMode();
		const last = this.#lastMode;
		if (mode === last) return;
		this.#lastMode = mode;
		if (mode === 'redact')
			this.#kept = redactIds(store.getSnapshot());
		else if (last === 'redact') dropRedactions(this.#kept);
	});

	#sessionMode: Mode | null | undefined;
	// results last one session
	session = modifier(
		(_el: HTMLElement, [mode]: [Mode | null | undefined]) => {
			if (mode !== this.#sessionMode) this.compressed = null;
			this.#sessionMode = mode;
		},
	);

	get layoutName() {
		return (
			IMPOSITION_LAYOUTS.find((l) => l.id === this.layout)
				?.name ?? ''
		);
	}

	get duplexAware() {
		return DUPLEX_AWARE_LAYOUTS.has(this.layout);
	}

	livePreview = modifier(
		(_el: HTMLElement, [items]: [Stamped[] | undefined]) => {
			preview(items ?? []);
			return () => preview([]);
		},
	);

	pick = (key: string, value: unknown) => {
		(this as unknown as Record<string, unknown>)[key] = value;
		if (this.args.mode === 'compress') this.compressed = null;
	};

	setText = (key: string, event: Event) =>
		this.pick(key, (event.target as HTMLInputElement).value);

	cancel = () => {
		this.failedMode = null;
		this.compressed = null;
		setMode(null);
	};

	compress = async (bytes: Uint8Array) => {
		const out = (
			await compressPdf(bytes.slice().buffer, {
				recompressImages: true,
				quality: this.quality,
				maxEdge: this.maxEdge,
			})
		).bytes;
		this.compressed = {
			source: undefined,
			before: bytes.length,
			after: out.length,
		};
		return out;
	};

	// layouts ignore foreign fields
	impose = (bytes: Uint8Array) =>
		imposePdf(bytes, {
			...DEFAULT_IMPOSITION_CONFIG,
			layoutId: this.layout,
			paperSize:
				findPaperSize(this.paper) ??
				DEFAULT_IMPOSITION_CONFIG.paperSize,
			orientation: this.orientation,
			marginMm: this.margin,
			gutterMm: this.gutter,
			creepMm: this.creep,
			cropMarks: this.cropMarks,
			nUp: this.copies,
			customGrid: [this.rows, this.cols],
			duplexFlip: this.flip,
		});

	// export burns marks in
	burn = (bytes: Uint8Array) => bytes;

	apply = async () => {
		if (!this.canApply) return;
		if (this.stamping) {
			addStamped(this.items);
			setMode(null);
			return;
		}
		// fields apply when drawn
		if (this.args.mode === 'form') {
			setMode(null);
			return;
		}
		const mode = this.args.mode;
		this.busy = true;
		this.failedMode = null;
		const ok = await replaceDocument(
			mode === 'compress'
				? this.compress
				: mode === 'impose'
					? this.impose
					: this.burn,
		);
		this.busy = false;
		if (!ok) {
			this.failedMode = mode;
			this.compressed = null;
		} else if (mode === 'compress') {
			const sizes = this.compressed;
			this.compressed = sizes && {
				...sizes,
				source: store.getSnapshot()?.source,
			};
		} else if (getMode() === mode) setMode(null);
	};

	setLayout = (id: string) => {
		this.layout = id;
		if (FOLD_LAYOUTS.has(id)) this.orientation = 'landscape';
	};
	setMargin = (mm: number) => (this.margin = mm);
	setGutter = (mm: number) => (this.gutter = mm);
	setCreep = (mm: number) => (this.creep = mm);
	setCropMarks = (on: boolean) => (this.cropMarks = on);
	setRows = (event: Event) => (this.rows = clampGrid(event));
	setCols = (event: Event) => (this.cols = clampGrid(event));

	setScope = (scope: Scope) => (this.scope = scope);
	setRange = (range: string) => (this.range = range);
	setQuality = (quality: number) => this.pick('quality', quality);

	<template>
		<ToolPanel
			@open={{@open}}
			@mode={{@mode}}
			@icon={{@icon}}
			@label={{@label}}
			@onCancel={{if (eq @mode "form") undefined this.cancel}}
			@cancelLabel={{if this.compressResult "Close"}}
			@onApply={{this.apply}}
			@applyLabel={{if (eq @mode "form") "Done"}}
			@canApply={{this.canApply}}
			@busy={{this.busy}}
			@failed={{this.failed}}
			{{this.livePreview (if @open this.items)}}
			{{this.session (if @open @mode)}}
		>
			<:status>
				{{#if (eq @mode "redact")}}
					<span
						class="sub-omni-tag"
					>{{this.redactHint}}</span>
					<span
						class="sub-omni-tag"
					>{{this.marks}}
						marked</span>
				{{else if this.compressResult}}
					<span
						class="sub-omni-tag"
						data-compress-result
					>{{this.compressResult}}</span>
				{{/if}}
			</:status>
			<:default>
				{{#if (eq @mode "page-numbers")}}
					<InputField @label="Format">
						<input
							class="err-mode-input"
							aria-label="Format"
							value={{this.numberFormat}}
							{{on
								"input"
								(fn
									this.setText
									"numberFormat"
								)
							}}
						/>
					</InputField>
					<AnchorPicker
						@value={{this.numberAnchor}}
						@onChange={{fn
							this.pick
							"numberAnchor"
						}}
					/>
					<Field @label="Size">
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
					</Field>
				{{else if (eq @mode "watermark")}}
					<InputField @label="Text">
						<input
							class="err-mode-input"
							aria-label="Text"
							value={{this.watermark}}
							{{on
								"input"
								(fn
									this.setText
									"watermark"
								)
							}}
						/>
					</InputField>
					<Slider
						@label="Opacity"
						@value={{this.opacity}}
						@min={{5}}
						@max={{100}}
						@unit="%"
						@onChange={{fn
							this.pick
							"opacity"
						}}
					/>
					<Slider
						@label="Angle"
						@value={{this.angle}}
						@min={{-90}}
						@max={{90}}
						@unit="°"
						@onChange={{fn
							this.pick
							"angle"
						}}
					/>
				{{else if (eq @mode "stamp")}}
					<Field @label="Label">
						<Select
							@value={{this.stamp}}
							@onValueChange={{fn
								this.pick
								"stamp"
							}}
						>
							<SelectTrigger
								aria-label="Label"
							>
								<SelectValue
								>{{this.stamp}}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{{#each
									STAMPS
									as |s|
								}}
									<SelectItem
										@value={{s}}
									>{{s}}</SelectItem>
								{{/each}}
							</SelectContent>
						</Select>
						{{#if (eq this.stamp CUSTOM)}}
							<input
								class="err-mode-input"
								aria-label="Custom label"
								value={{this.stampText}}
								{{on
									"input"
									(fn
										this.setText
										"stampText"
									)
								}}
							/>
						{{/if}}
					</Field>
					<AnchorPicker
						@value={{this.stampAnchor}}
						@onChange={{fn
							this.pick
							"stampAnchor"
						}}
					/>
					<Field @label="Colour">
						<span
							class="segmented err-swatches"
						>
							{{#each
								STAMP_COLOURS
								as |c|
							}}
								<button
									type="button"
									class="err-swatch
										{{if
											(eq
												this.stampColour
												c.value
											)
											'is-active'
										}}"
									style={{c.style}}
									aria-label={{c.label}}
									aria-pressed={{if
										(eq
											this.stampColour
											c.value
										)
										"true"
										"false"
									}}
									title={{c.label}}
									{{on
										"click"
										(fn
											this.pick
											"stampColour"
											c.value
										)
									}}
								></button>
							{{/each}}
						</span>
					</Field>
					<Field @label="Size">
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
					</Field>
					<InputField @label="Bold">
						<Switch
							@checked={{this.stampBold}}
							@onChange={{fn
								this.pick
								"stampBold"
							}}
							@label="Bold"
						/>
					</InputField>
				{{else if (eq @mode "compress")}}
					<Slider
						@label="Quality"
						@value={{this.quality}}
						@min={{10}}
						@max={{100}}
						@onChange={{this.setQuality}}
					/>
					<Field @label="Images">
						<Segmented
							@options={{MAX_SIZES}}
							@value={{this.maxEdge}}
							@onChange={{fn
								this.pick
								"maxEdge"
							}}
						/>
					</Field>
				{{else if (eq @mode "form")}}
					<FormFields @open={{@open}} />
				{{else if (eq @mode "impose")}}
					<Field @label="Layout">
						<Select
							@value={{this.layout}}
							@onValueChange={{this.setLayout}}
						>
							<SelectTrigger
								aria-label="Layout"
							>
								<SelectValue
								>{{this.layoutName}}</SelectValue>
							</SelectTrigger>
							<SelectContent>
								{{#each
									IMPOSITION_LAYOUTS
									key="id"
									as |l|
								}}
									<SelectItem
										@value={{l.id}}
									>{{l.name}}</SelectItem>
								{{/each}}
							</SelectContent>
						</Select>
					</Field>
					<Field @label="Sheet">
						<PaperSizeCombobox
							@value={{this.paper}}
							@onValueChange={{fn
								this.pick
								"paper"
							}}
							@caret="chevron-down"
						/>
					</Field>
					{{#if (eq this.layout "gang-run")}}
						<Field @label="Copies">
							<Segmented
								@options={{COPIES}}
								@value={{this.copies}}
								@onChange={{fn
									this.pick
									"copies"
								}}
							/>
						</Field>
					{{else if
						(eq this.layout "custom-nup")
					}}
						<Field @label="Grid">
							<input
								type="number"
								class="err-mode-input is-narrow"
								aria-label="Rows"
								min="1"
								max="10"
								value={{this.rows}}
								{{on
									"change"
									this.setRows
								}}
							/>
							<span
								class="sub-tool-row-label"
							>&times;</span>
							<input
								type="number"
								class="err-mode-input is-narrow"
								aria-label="Columns"
								min="1"
								max="10"
								value={{this.cols}}
								{{on
									"change"
									this.setCols
								}}
							/>
						</Field>
					{{/if}}
					<Field @label="Orientation">
						<Segmented
							@options={{ORIENTATIONS}}
							@value={{this.orientation}}
							@onChange={{fn
								this.pick
								"orientation"
							}}
						/>
					</Field>
					{{#if this.duplexAware}}
						<Field @label="Duplex">
							<Segmented
								@options={{FLIPS}}
								@value={{this.flip}}
								@onChange={{fn
									this.pick
									"flip"
								}}
							/>
						</Field>
					{{/if}}
					<Slider
						@label="Margins"
						@value={{this.margin}}
						@min={{0}}
						@max={{20}}
						@unit="mm"
						@onChange={{this.setMargin}}
					/>
					<Slider
						@label="Gutter"
						@value={{this.gutter}}
						@min={{0}}
						@max={{10}}
						@unit="mm"
						@onChange={{this.setGutter}}
					/>
					{{#if (eq this.layout "saddle-stitch")}}
						<Slider
							@label="Creep"
							@value={{this.creep}}
							@min={{0}}
							@max={{2}}
							@step={{0.1}}
							@unit="mm"
							@onChange={{this.setCreep}}
						/>
					{{/if}}
					<InputField @label="Crop marks">
						<Switch
							@checked={{this.cropMarks}}
							@onChange={{this.setCropMarks}}
							@label="Crop marks"
						/>
					</InputField>
				{{/if}}

				{{#if this.stamping}}
					<PageScope
						@scope={{this.scope}}
						@range={{this.range}}
						@invalid={{this.rangeInvalid}}
						@onScope={{this.setScope}}
						@onRange={{this.setRange}}
					/>
				{{/if}}
			</:default>
		</ToolPanel>
	</template>
}
