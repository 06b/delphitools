import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import ToolPanel, {
	AnchorPicker,
	Field,
	Group,
	InputField,
	PageScope,
	Segmented,
} from 'delphitools-v2/components/errata/tool-panel';
import PaperSizeCombobox from 'delphitools-v2/components/ui/paper-size-combobox';
import Switch from 'delphitools-v2/components/ui/switch';
import {
	flipAnchor,
	pageSize,
	rotateAnchor,
	totalRotation,
	type Anchor,
	type ErrataPage,
	type PageResize,
	type ResizeMode,
} from 'delphitools-v2/lib/errata/doc-model';
import { resizePages } from 'delphitools-v2/lib/errata/page-ops';
import {
	scopePages,
	type PageScope as Scope,
} from 'delphitools-v2/lib/errata/stamps';
import {
	currentPage,
	getPageIndex,
	store,
	subscribePage,
} from 'delphitools-v2/lib/errata/store';
import { getMode, setMode, subscribeUi } from 'delphitools-v2/lib/errata/ui';
import { MM_TO_POINTS, PAPER_SIZES } from 'delphitools-v2/lib/imposition';
import { findPaperSize } from 'delphitools-v2/lib/paper-sizes';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

// mm shown, points stored

const PRESET_IDS = ['a4', 'a3', 'sra4', 'letter', 'legal', 'tabloid'];
const PRESETS = PRESET_IDS.map((id) => {
	const size = PAPER_SIZES.find((p) => p.id === id)!;
	return { ...size, value: id, label: size.label.split(' ')[0]! };
});

const PLACEMENTS = [
	{ value: 'anchor', label: 'Anchor to page' },
	{ value: 'resample', label: 'Resample' },
] as const;

const RESAMPLES = [
	{ value: 'fit', label: 'Fit page' },
	{ value: 'fill', label: 'Fill page' },
] as const;

const BLEED_MM = 3;

function mm(points: number): string {
	return (points / MM_TO_POINTS).toFixed(1).replace(/\.0$/, '');
}

function parseMm(value: string): number | null {
	const n = Number(value.replace(',', '.'));
	return Number.isFinite(n) && n > 0 ? n * MM_TO_POINTS : null;
}

export default class PageSizePanel extends Component {
	mode = new TrackedExternal(subscribeUi, getMode);
	doc = new TrackedExternal(store.subscribe, store.getSnapshot);
	pageIndex = new TrackedExternal(subscribePage, getPageIndex);
	@tracked width = '';
	@tracked height = '';
	@tracked placement: 'anchor' | 'resample' = 'anchor';
	@tracked resample: 'fit' | 'fill' = 'fit';
	@tracked anchor: Anchor = 'top-left';
	@tracked bleed = false;
	@tracked otherId = 'custom';
	@tracked scope: Scope = 'current';
	@tracked range = '';

	willDestroy() {
		super.willDestroy();
		this.mode.unsubscribe();
		this.doc.unsubscribe();
		this.pageIndex.unsubscribe();
	}

	get open() {
		return this.mode.current === 'page-size';
	}

	#seeded = false;
	// seed from the current page on every open, in displayed orientation
	seedOnOpen = modifier((_el: HTMLElement, [open]: [boolean]) => {
		const page = currentPage();
		if (open && !this.#seeded && page) this.seed(page);
		this.#seeded = open;
	});

	seed(page: ErrataPage) {
		const { width, height } = pageSize(page);
		const turns = totalRotation(page) / 90;
		const bleed = page.resize?.bleed ?? 0;
		this.width = mm(width - 2 * bleed);
		this.height = mm(height - 2 * bleed);
		this.bleed = bleed > 0;
		const mode: ResizeMode = page.resize?.mode ?? 'anchor';
		this.placement = mode === 'anchor' ? 'anchor' : 'resample';
		this.resample = mode === 'fill' ? 'fill' : 'fit';
		this.anchor = page.resize
			? rotateAnchor(
					flipAnchor(page.resize.anchor, page),
					turns,
				)
			: 'top-left';
		this.otherId = 'custom';
	}

	@cached
	get indices(): number[] | null {
		return scopePages(
			this.scope,
			this.range,
			this.doc.current?.pages.length ?? 0,
			this.pageIndex.current,
		);
	}

	get rangeInvalid() {
		return this.scope === 'range' && this.indices === null;
	}

	readInput = (set: (value: string) => void) => (event: Event) =>
		set((event.target as HTMLInputElement).value);

	setWidth = (v: string) => {
		this.width = v;
		this.otherId = 'custom';
	};

	setHeight = (v: string) => {
		this.height = v;
		this.otherId = 'custom';
	};

	#setMm(widthMm: number, heightMm: number) {
		const landscape = this.isLandscape;
		this.width = String(landscape ? heightMm : widthMm);
		this.height = String(landscape ? widthMm : heightMm);
	}

	preset = (id: string) => {
		const size = PRESETS.find((p) => p.id === id);
		if (!size) return;
		this.#setMm(size.widthMm, size.heightMm);
		this.otherId = 'custom';
	};

	pickOther = (id: string) => {
		const size = findPaperSize(id);
		if (!size) return;
		this.#setMm(size.widthMm, size.heightMm);
		this.otherId = id;
	};

	get isLandscape() {
		return (parseMm(this.width) ?? 0) > (parseMm(this.height) ?? 0);
	}

	get activePreset(): string | null {
		const w = parseMm(this.width);
		const h = parseMm(this.height);
		if (w === null || h === null) return null;
		const [a, b] = [w, h].sort((x, y) => x - y);
		return (
			PRESETS.find(
				(p) =>
					Math.abs(
						p.widthMm * MM_TO_POINTS - a!,
					) < 1 &&
					Math.abs(
						p.heightMm * MM_TO_POINTS - b!,
					) < 1,
			)?.id ?? null
		);
	}

	swap = () => {
		[this.width, this.height] = [this.height, this.width];
	};

	setBleed = (on: boolean) => (this.bleed = on);
	setPlacement = (placement: 'anchor' | 'resample') =>
		(this.placement = placement);
	setAnchor = (anchor: Anchor) => (this.anchor = anchor);
	setResample = (resample: 'fit' | 'fill') => (this.resample = resample);
	setScope = (scope: Scope) => (this.scope = scope);
	setRange = (range: string) => (this.range = range);

	get valid() {
		return (
			parseMm(this.width) !== null &&
			parseMm(this.height) !== null &&
			this.indices !== null
		);
	}

	get targets(): Set<string> {
		const pages = this.doc.current?.pages ?? [];
		return new Set(
			(this.indices ?? []).flatMap((i) =>
				pages[i] ? [pages[i].id] : [],
			),
		);
	}

	// displayed size per page
	resizeFor(page: ErrataPage, w: number, h: number): PageResize {
		const turns = totalRotation(page) / 90;
		const swap = turns % 2 !== 0;
		const bleed = this.bleed ? BLEED_MM * MM_TO_POINTS : 0;
		return {
			width: (swap ? h : w) + 2 * bleed,
			height: (swap ? w : h) + 2 * bleed,
			mode:
				this.placement === 'anchor'
					? 'anchor'
					: this.resample,
			anchor: flipAnchor(
				rotateAnchor(this.anchor, -turns),
				page,
			),
			...(bleed > 0 ? { bleed } : {}),
		};
	}

	apply = () => {
		const w = parseMm(this.width);
		const h = parseMm(this.height);
		if (w === null || h === null || this.indices === null) return;
		resizePages(this.targets, (page) => this.resizeFor(page, w, h));
		setMode(null);
	};

	reset = () => {
		if (this.indices === null) return;
		resizePages(this.targets, () => null);
		setMode(null);
	};

	close = () => setMode(null);

	<template>
		<ToolPanel
			@open={{this.open}}
			@mode="page-size"
			@icon="scaling"
			@label="Page size"
			@onCancel={{this.close}}
			@onApply={{this.apply}}
			@canApply={{this.valid}}
			{{this.seedOnOpen this.open}}
		>
			<:actions>
				<button
					type="button"
					class="sub-modal-btn is-ghost"
					disabled={{if this.indices false true}}
					{{on "click" this.reset}}
				>
					<Icon @name="undo-2" />
					Reset
				</button>
			</:actions>
			<:default>
				<Group class="is-tall">
					<Field @label="Preset">
						<Segmented
							@options={{PRESETS}}
							@value={{this.activePreset}}
							@onChange={{this.preset}}
						/>
					</Field>
					<Field @label="">
						<PaperSizeCombobox
							@value={{this.otherId}}
							@onValueChange={{this.pickOther}}
							@customLabel="Other…"
							@caret="chevron-down"
						/>
					</Field>
					<Field @label="Size">
						<input
							class="err-mode-input is-narrow"
							inputmode="decimal"
							aria-label="Width"
							value={{this.width}}
							{{on
								"input"
								(this.readInput
									this.setWidth
								)
							}}
						/>
						<span
							class="segmented err-mode-seg"
						>
							<button
								type="button"
								class="sub-seg-cell"
								aria-label="Swap"
								title="Swap"
								{{on
									"click"
									this.swap
								}}
							>
								<Icon
									@name="arrow-left-right"
								/>
							</button>
						</span>
						<input
							class="err-mode-input is-narrow"
							inputmode="decimal"
							aria-label="Height"
							value={{this.height}}
							{{on
								"input"
								(this.readInput
									this.setHeight
								)
							}}
						/>
						<span
							class="sub-tool-row-label"
						>mm</span>
					</Field>
					<InputField @label="Bleed">
						<Switch
							@checked={{this.bleed}}
							@onChange={{this.setBleed}}
						/>
						<span
							class="sub-tool-row-label"
						>3 mm</span>
					</InputField>
				</Group>
				<Group>
					<Field @label="Content">
						<Segmented
							@options={{PLACEMENTS}}
							@value={{this.placement}}
							@onChange={{this.setPlacement}}
						/>
					</Field>
					{{#if (eq this.placement "anchor")}}
						<AnchorPicker
							@value={{this.anchor}}
							@onChange={{this.setAnchor}}
						/>
					{{else}}
						<Field @label="Scale">
							<Segmented
								@options={{RESAMPLES}}
								@value={{this.resample}}
								@onChange={{this.setResample}}
							/>
						</Field>
					{{/if}}
				</Group>
				<PageScope
					@scope={{this.scope}}
					@range={{this.range}}
					@invalid={{this.rangeInvalid}}
					@onScope={{this.setScope}}
					@onRange={{this.setRange}}
				/>
			</:default>
		</ToolPanel>
	</template>
}
