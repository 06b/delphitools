import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { eq } from 'ember-truth-helpers';
import { htmlSafe } from '@ember/template';
import ToolPanel, {
	AnchorPicker,
	Field,
	InputField,
	PageScope,
	PageScopeState,
	Segmented,
	Slider,
	livePreview,
	readText,
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
	STAMP_RED,
	stampObjects,
	watermarkObjects,
} from 'delphitools-v2/lib/errata/stamps';
import {
	getPageIndex,
	store,
	subscribePage,
} from 'delphitools-v2/lib/errata/store';
import type { Stamped } from 'delphitools-v2/lib/errata/doc-model';
import { dropRedactions, redactIds } from 'delphitools-v2/lib/errata/redact';
import { boxMode, closeMode, onMode } from 'delphitools-v2/lib/errata/ui';
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

type StampMode = 'page-numbers' | 'watermark' | 'stamp';

const STAMP_HEADS: Record<StampMode, { icon: string; label: string }> = {
	'page-numbers': { icon: 'hash', label: 'Page numbers' },
	watermark: { icon: 'droplet', label: 'Watermark' },
	stamp: { icon: 'stamp', label: 'Stamp' },
};

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
	Args: { open: boolean };
}

export default class StampPanel extends Component<{
	Args: { mode: StampMode; open: boolean };
}> {
	doc = new TrackedExternal(store.subscribe, store.getSnapshot);
	pageIndex = new TrackedExternal(subscribePage, getPageIndex);
	pages = new PageScopeState('all');

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

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.pageIndex.unsubscribe();
	}

	get head() {
		return STAMP_HEADS[this.args.mode];
	}

	@cached
	get indices(): number[] | null {
		const doc = this.doc.current;
		return doc
			? this.pages.indices(doc.pages.length, this.pageIndex)
			: null;
	}

	get invalid() {
		return this.indices === null;
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
			default:
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
		}
	}

	pick = (key: string, value: unknown) => {
		(this as unknown as Record<string, unknown>)[key] = value;
	};

	apply = () => {
		addStamped(this.items);
		closeMode();
	};

	<template>
		<ToolPanel
			@open={{@open}}
			@mode={{@mode}}
			@icon={{this.head.icon}}
			@label={{this.head.label}}
			@onCancel={{closeMode}}
			@onApply={{this.apply}}
			@canApply={{if this.items.length true false}}
			{{livePreview (if @open this.items)}}
		>
			{{#if (eq @mode "page-numbers")}}
				<InputField @label="Format">
					<input
						class="err-mode-input"
						aria-label="Format"
						value={{this.numberFormat}}
						{{on
							"input"
							(readText
								(fn
									this.pick
									"numberFormat"
								)
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
							(readText
								(fn
									this.pick
									"watermark"
								)
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

			{{else}}
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
								(readText
									(fn
										this.pick
										"stampText"
									)
								)
							}}
						/>
					{{/if}}
				</Field>
				<AnchorPicker
					@value={{this.stampAnchor}}
					@onChange={{fn this.pick "stampAnchor"}}
				/>
				<Field @label="Colour">
					<span class="segmented err-swatches">
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

			{{/if}}
			<PageScope
				@state={{this.pages}}
				@invalid={{this.invalid}}
			/>
		</ToolPanel>
	</template>
}

class ReplacePanel extends Component<Signature> {
	@tracked busy = false;
	@tracked failed = false;
	#run = 0;

	async replace(
		transform: (
			bytes: Uint8Array,
		) => Promise<Uint8Array> | Uint8Array,
	): Promise<boolean> {
		const run = ++this.#run;
		this.busy = true;
		this.failed = false;
		const ok = await replaceDocument(
			transform,
			() => run === this.#run,
		);
		this.busy = false;
		if (run !== this.#run) return false;
		this.failed = !ok;
		return ok;
	}

	discard = () => this.#run++;
}

export class CompressPanel extends ReplacePanel {
	doc = new TrackedExternal(store.subscribe, store.getSnapshot);
	@tracked quality = 65;
	@tracked maxEdge = 0;
	@tracked compressed: {
		source: string | undefined;
		before: number;
		after: number;
	} | null = null;
	// results last one session
	#off = onMode('compress', {
		enter: () => {
			this.compressed = null;
			this.failed = false;
		},
		exit: this.discard,
	});

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.#off();
	}

	// hidden once undone
	get result() {
		const c = this.compressed;
		return c && c.source === this.doc.current?.source
			? `${formatBytes(c.before)} → ${formatBytes(c.after)}`
			: null;
	}

	setQuality = (quality: number) => {
		this.quality = quality;
		this.compressed = null;
	};

	setMaxEdge = (maxEdge: number) => {
		this.maxEdge = maxEdge;
		this.compressed = null;
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

	apply = async () => {
		if (!(await this.replace(this.compress)))
			this.compressed = null;
		else if (this.compressed)
			this.compressed = {
				...this.compressed,
				source: store.getSnapshot()?.source,
			};
	};

	<template>
		<ToolPanel
			@open={{@open}}
			@mode="compress"
			@icon="archive"
			@label="Compress"
			@onCancel={{closeMode}}
			@cancelLabel={{if this.result "Close"}}
			@onApply={{this.apply}}
			@canApply={{if this.result false true}}
			@busy={{this.busy}}
			@failed={{this.failed}}
		>
			<:status>
				{{#if this.result}}
					<span
						class="sub-omni-tag"
						data-compress-result
					>{{this.result}}</span>
				{{/if}}
			</:status>
			<:default>
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
						@onChange={{this.setMaxEdge}}
					/>
				</Field>

			</:default>
		</ToolPanel>
	</template>
}

export class ImposePanel extends ReplacePanel {
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
	#off = onMode('impose', {
		enter: () => (this.failed = false),
		exit: this.discard,
	});

	willDestroy() {
		super.willDestroy();
		this.#off();
	}

	get layoutName() {
		return (
			IMPOSITION_LAYOUTS.find((l) => l.id === this.layout)
				?.name ?? ''
		);
	}

	get duplexAware() {
		return DUPLEX_AWARE_LAYOUTS.has(this.layout);
	}

	pick = (key: string, value: unknown) => {
		(this as unknown as Record<string, unknown>)[key] = value;
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

	apply = async () => {
		if (
			(await this.replace(this.impose)) &&
			boxMode.get() === 'impose'
		)
			closeMode();
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

	<template>
		<ToolPanel
			@open={{@open}}
			@mode="impose"
			@icon="book-open"
			@label="Impose"
			@onCancel={{closeMode}}
			@onApply={{this.apply}}
			@busy={{this.busy}}
			@failed={{this.failed}}
		>
			<Field @label="Layout">
				<Select
					@value={{this.layout}}
					@onValueChange={{this.setLayout}}
				>
					<SelectTrigger aria-label="Layout">
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
					@onValueChange={{fn this.pick "paper"}}
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
			{{else if (eq this.layout "custom-nup")}}
				<Field @label="Grid">
					<input
						type="number"
						class="err-mode-input is-narrow"
						aria-label="Rows"
						min="1"
						max="10"
						value={{this.rows}}
						{{on "change" this.setRows}}
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
						{{on "change" this.setCols}}
					/>
				</Field>
			{{/if}}
			<Field @label="Orientation">
				<Segmented
					@options={{ORIENTATIONS}}
					@value={{this.orientation}}
					@onChange={{fn this.pick "orientation"}}
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
		</ToolPanel>
	</template>
}

// export burns marks in
const burn = (bytes: Uint8Array) => bytes;

export class RedactPanel extends ReplacePanel {
	doc = new TrackedExternal(store.subscribe, store.getSnapshot);
	#kept = new Set<string>();
	// cancel drops new marks
	#off = onMode('redact', {
		enter: () => {
			this.#kept = redactIds(store.getSnapshot());
			this.failed = false;
		},
		exit: () => {
			this.discard();
			dropRedactions(this.#kept);
		},
	});

	redactHint = 'Drag an area or click a line';

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.#off();
	}

	get marks() {
		return redactIds(this.doc.current).size;
	}

	apply = async () => {
		if ((await this.replace(burn)) && boxMode.get() === 'redact')
			closeMode();
	};

	<template>
		<ToolPanel
			@open={{@open}}
			@mode="redact"
			@icon="eye-off"
			@label="Redact"
			@onCancel={{closeMode}}
			@onApply={{this.apply}}
			@canApply={{if this.marks true false}}
			@busy={{this.busy}}
			@failed={{this.failed}}
		>
			<:status>
				<span
					class="sub-omni-tag"
				>{{this.redactHint}}</span>
				<span class="sub-omni-tag">{{this.marks}}
					marked</span>
			</:status>
		</ToolPanel>
	</template>
}
