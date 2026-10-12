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
	PageScope,
	Segmented,
	Slider,
} from 'delphitools-v2/components/errata/tool-panel';
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
import { exportCurrent } from 'delphitools-v2/lib/errata/export-file';
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
	type BoxMode as Mode,
} from 'delphitools-v2/lib/errata/ui';
import {
	DEFAULT_IMPOSITION_CONFIG,
	IMPOSITION_LAYOUTS,
	PAPER_SIZES,
	imposePdf,
} from 'delphitools-v2/lib/imposition';
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

const LAYOUTS = IMPOSITION_LAYOUTS.filter(
	(l) => l.id !== 'gang-run' && l.id !== 'custom-nup',
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

	// cancel keeps earlier marks
	#kept = new Set<string>();
	#sessionMode: Mode | null | undefined;
	// reruns on any ui change; snapshot on entry only
	session = modifier(
		(_el: HTMLElement, [mode]: [Mode | null | undefined]) => {
			if (mode === 'redact' && this.#sessionMode !== 'redact')
				this.#kept = redactIds(store.getSnapshot());
			// results last one session
			if (mode !== this.#sessionMode) this.compressed = null;
			this.#sessionMode = mode;
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
		if (this.args.mode === 'compress') this.compressed = null;
	};

	setText = (key: string, event: Event) =>
		this.pick(key, (event.target as HTMLInputElement).value);

	cancel = () => {
		this.failedMode = null;
		this.compressed = null;
		if (this.args.mode === 'redact') dropRedactions(this.#kept);
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
		// fields apply when drawn
		if (this.args.mode === 'form') {
			setMode(null);
			return;
		}
		const mode = this.args.mode;
		this.busy = true;
		this.failedMode = null;
		if (mode === 'compress') {
			const ok = await replaceDocument(this.compress);
			this.busy = false;
			const sizes = this.compressed;
			this.compressed =
				ok && sizes
					? {
							...sizes,
							source: store.getSnapshot()
								?.source,
						}
					: null;
			if (!ok) this.failedMode = mode;
			return;
		}
		// exportPdf applies redactions
		const ok =
			mode === 'redact'
				? await exportCurrent(undefined, '-redacted')
				: await exportCurrent(
						this.impose,
						`-imposed-${this.layout}`,
					);
		this.busy = false;
		if (!ok) this.failedMode = mode;
		else if (getMode() === mode) setMode(null);
	};

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
				<Slider
					@label="Opacity"
					@value={{this.opacity}}
					@min={{5}}
					@max={{100}}
					@unit="%"
					@onChange={{fn this.pick "opacity"}}
				/>
				<Slider
					@label="Angle"
					@value={{this.angle}}
					@min={{-90}}
					@max={{90}}
					@unit="°"
					@onChange={{fn this.pick "angle"}}
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
				<Field @label="Bold">
					<Switch
						@checked={{this.stampBold}}
						@onChange={{fn
							this.pick
							"stampBold"
						}}
						@label="Bold"
					/>
				</Field>
				<Field @label="Colour">
					<span class="err-swatches">
						{{#each STAMP_COLOURS as |c|}}
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
				<AnchorPicker
					@value={{this.stampAnchor}}
					@onChange={{fn this.pick "stampAnchor"}}
				/>
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
				{{#if this.compressResult}}
					<span
						class="sub-omni-tag"
						data-compress-result
					>{{this.compressResult}}</span>
				{{/if}}
			{{else if (eq @mode "form")}}
				<FormFields @open={{@open}} />
			{{else if (eq @mode "impose")}}
				<Field @label="Layout">
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
				</Field>
				<Field @label="Sheet">
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
				</Field>
			{{else if (eq @mode "redact")}}
				<span
					class="sub-omni-tag"
				>{{this.redactHint}}</span>
				<span class="sub-omni-tag">{{this.marks}}
					marked</span>
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
		</ToolPanel>
	</template>
}
