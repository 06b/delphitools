import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn, get } from '@ember/helper';
import { on } from '@ember/modifier';
import type { TOC } from '@ember/component/template-only';
import { modifier } from 'ember-modifier';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import PaperSizeCombobox from 'delphitools-v2/components/ui/paper-size-combobox';
import Switch from 'delphitools-v2/components/ui/switch';
import {
	pageSize,
	rotateAnchor,
	totalRotation,
	type Anchor,
	type ErrataPage,
	type PageResize,
	type ResizeMode,
} from 'delphitools-v2/lib/errata/doc-model';
import { resizePage } from 'delphitools-v2/lib/errata/page-ops';
import { currentPage } from 'delphitools-v2/lib/errata/store';
import {
	closeModal,
	getOpenModal,
	subscribeUi,
} from 'delphitools-v2/lib/errata/ui';
import { MM_TO_POINTS, PAPER_SIZES } from 'delphitools-v2/lib/imposition';
import { findPaperSize } from 'delphitools-v2/lib/paper-sizes';
import { ANCHORS } from 'delphitools-v2/lib/pdf-stamp';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

// substrata canvas-size-modal chrome; sizes shown in mm, stored in points

const ANCHOR_ICONS: Record<Anchor, string> = {
	'top-left': 'arrow-up-left',
	'top-center': 'arrow-up',
	'top-right': 'arrow-up-right',
	'middle-left': 'arrow-left',
	'middle-center': 'dot',
	'middle-right': 'arrow-right',
	'bottom-left': 'arrow-down-left',
	'bottom-center': 'arrow-down',
	'bottom-right': 'arrow-down-right',
};

const PRESET_IDS = ['a4', 'a3', 'sra4', 'letter', 'legal', 'tabloid'];
const PRESETS = PRESET_IDS.map((id) => {
	const size = PAPER_SIZES.find((p) => p.id === id)!;
	return { ...size, short: size.label.split(' ')[0]! };
});

const BLEED_MM = 3;

function mm(points: number): string {
	return (points / MM_TO_POINTS).toFixed(1).replace(/\.0$/, '');
}

function parseMm(value: string): number | null {
	const n = Number(value.replace(',', '.'));
	return Number.isFinite(n) && n > 0 ? n * MM_TO_POINTS : null;
}

function pick(onChange: (value: string) => void) {
	return (event: Event) =>
		onChange((event.currentTarget as HTMLInputElement).value);
}

const NumberField: TOC<{
	Element: HTMLLabelElement;
	Args: {
		label: string;
		unit: string;
		value: string;
		onChange: (value: string) => void;
	};
}> = <template>
	<label class="sub-csm-field" ...attributes>
		<span class="sub-csm-field-label">{{@label}}</span>
		<input
			type="text"
			inputmode="decimal"
			value={{@value}}
			class="sub-csm-field-input"
			{{on "input" (pick @onChange)}}
		/>
		<span class="sub-csm-field-unit">{{@unit}}</span>
	</label>
</template>;

export default class PageSizeModal extends Component {
	modal = new TrackedExternal(subscribeUi, getOpenModal);
	@tracked width = '';
	@tracked height = '';
	@tracked placement: 'anchor' | 'resample' = 'anchor';
	@tracked resample: 'fit' | 'fill' = 'fit';
	@tracked anchor: Anchor = 'top-left';
	@tracked bleed = false;
	@tracked otherId = 'custom';
	@tracked pageId: string | null = null;
	presets = PRESETS;
	anchors = ANCHORS;
	icons = ANCHOR_ICONS;

	willDestroy() {
		super.willDestroy();
		this.modal.unsubscribe();
		if (getOpenModal() === 'page-size') closeModal();
	}

	get open() {
		return this.modal.current === 'page-size';
	}

	// seed from the current page on every open, in displayed orientation
	sync = modifier((dialog: HTMLDialogElement, [open]: [boolean]) => {
		if (open && !dialog.open) {
			const page = currentPage();
			if (page) this.seed(page);
			dialog.showModal();
		} else if (!open && dialog.open) dialog.close();
	});

	seed(page: ErrataPage) {
		const { width, height } = pageSize(page);
		const turns = totalRotation(page) / 90;
		const bleed = page.resize?.bleed ?? 0;
		this.pageId = page.id;
		this.width = mm(width - 2 * bleed);
		this.height = mm(height - 2 * bleed);
		this.bleed = bleed > 0;
		const mode: ResizeMode = page.resize?.mode ?? 'anchor';
		this.placement = mode === 'anchor' ? 'anchor' : 'resample';
		this.resample = mode === 'fill' ? 'fill' : 'fit';
		this.anchor = page.resize
			? rotateAnchor(page.resize.anchor, turns)
			: 'top-left';
		this.otherId = 'custom';
	}

	backdropDismiss = modifier((dialog: HTMLDialogElement) => {
		const onClick = (event: MouseEvent) => {
			if (event.target === dialog) dialog.close();
		};
		dialog.addEventListener('click', onClick);
		return () => dialog.removeEventListener('click', onClick);
	});

	onClose = () => {
		if (getOpenModal() === 'page-size') closeModal();
	};

	dismiss = (event: Event) => {
		(event.currentTarget as HTMLElement).closest('dialog')?.close();
	};

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

	setBleed = (on: boolean) => {
		this.bleed = on;
	};

	setPlacement = (placement: 'anchor' | 'resample') => {
		this.placement = placement;
	};

	setAnchor = (anchor: Anchor) => {
		this.anchor = anchor;
	};

	setResample = (resample: 'fit' | 'fill') => {
		this.resample = resample;
	};

	get valid() {
		return (
			parseMm(this.width) !== null &&
			parseMm(this.height) !== null
		);
	}

	apply = () => {
		const page = currentPage();
		const w = parseMm(this.width);
		const h = parseMm(this.height);
		if (
			!page ||
			page.id !== this.pageId ||
			w === null ||
			h === null
		)
			return;
		const turns = totalRotation(page) / 90;
		const swap = turns % 2 !== 0;
		const bleed = this.bleed ? BLEED_MM * MM_TO_POINTS : 0;
		const width = (swap ? h : w) + 2 * bleed;
		const height = (swap ? w : h) + 2 * bleed;
		const resize: PageResize = {
			width,
			height,
			mode:
				this.placement === 'anchor'
					? 'anchor'
					: this.resample,
			anchor: rotateAnchor(this.anchor, -turns),
			...(bleed > 0 ? { bleed } : {}),
		};
		resizePage(page.id, resize);
		closeModal();
	};

	reset = () => {
		const page = currentPage();
		if (page) resizePage(page.id, null);
		closeModal();
	};

	<template>
		<dialog
			class="sub-modal"
			{{this.sync this.open}}
			{{on "close" this.onClose}}
			{{this.backdropDismiss}}
		>
			<button
				type="button"
				class="sub-modal-x"
				aria-label="Close"
				{{on "click" this.dismiss}}
			>
				<Icon @name="x" />
			</button>
			<div class="sub-modal-frame">
				<div class="sub-modal-header">
					<h2 class="sub-modal-title">Page size</h2>
				</div>
				<div class="sub-modal-body">
					<section class="sub-csm-section">
						<div
							class="sub-modal-heading"
						>Preset</div>
						<div
							class="segmented sub-csm-presets"
						>
							{{#each
								this.presets
								key="id"
								as |p|
							}}
								<button
									type="button"
									class="sub-modal-opt
										{{if
											(eq
												this.activePreset
												p.id
											)
											'is-active'
										}}"
									{{on
										"click"
										(fn
											this.preset
											p.id
										)
									}}
								>
									{{p.short}}
								</button>
							{{/each}}
							<PaperSizeCombobox
								@value={{this.otherId}}
								@onValueChange={{this.pickOther}}
								@customLabel="Other…"
								@triggerClass="sub-modal-opt err-other"
							/>
						</div>
					</section>

					<section class="sub-csm-section">
						<div
							class="segmented sub-csm-dims err-dims"
						>
							<NumberField
								@label="Width"
								@unit="mm"
								@value={{this.width}}
								@onChange={{this.setWidth}}
							/>
							<button
								type="button"
								class="sub-modal-opt err-swap"
								aria-label="Swap"
								title="Swap"
								{{on
									"click"
									this.swap
								}}
							>
								<Icon
									@name="shuffle"
								/>
							</button>
							<NumberField
								@label="Height"
								@unit="mm"
								@value={{this.height}}
								@onChange={{this.setHeight}}
							/>
						</div>
						<div class="sub-csm-reflow">
							<span
								class="sub-csm-reflow-label"
							>3 mm bleed</span>
							<Switch
								@checked={{this.bleed}}
								@onChange={{this.setBleed}}
								@label="3 mm bleed"
							/>
						</div>
					</section>

					<section class="sub-csm-section">
						<div
							class="sub-modal-heading"
						>Content</div>
						<div
							class="segmented sub-seg-2 err-place-toggle"
						>
							<button
								type="button"
								class="sub-modal-opt
									{{if
										(eq
											this.placement
											'anchor'
										)
										'is-active'
									}}"
								{{on
									"click"
									(fn
										this.setPlacement
										"anchor"
									)
								}}
							>
								Anchor to page
							</button>
							<button
								type="button"
								class="sub-modal-opt
									{{if
										(eq
											this.placement
											'resample'
										)
										'is-active'
									}}"
								{{on
									"click"
									(fn
										this.setPlacement
										"resample"
									)
								}}
							>
								Resample
							</button>
						</div>
						{{#if
							(eq
								this.placement
								"anchor"
							)
						}}
							<div
								class="segmented err-anchor-grid"
							>
								{{#each
									this.anchors
									as |a|
								}}
									<button
										type="button"
										class="sub-modal-opt
											{{if
												(eq
													this.anchor
													a
												)
												'is-active'
											}}"
										aria-label={{a}}
										title={{a}}
										{{on
											"click"
											(fn
												this.setAnchor
												a
											)
										}}
									>
										<Icon
											@name={{get
												this.icons
												a
											}}
										/>
									</button>
								{{/each}}
							</div>
						{{else}}
							<div
								class="segmented sub-seg-2 err-place-modes"
							>
								<button
									type="button"
									class="sub-modal-opt
										{{if
											(eq
												this.resample
												'fit'
											)
											'is-active'
										}}"
									{{on
										"click"
										(fn
											this.setResample
											"fit"
										)
									}}
								>
									Fit page
								</button>
								<button
									type="button"
									class="sub-modal-opt
										{{if
											(eq
												this.resample
												'fill'
											)
											'is-active'
										}}"
									{{on
										"click"
										(fn
											this.setResample
											"fill"
										)
									}}
								>
									Fill
									page
								</button>
							</div>
						{{/if}}
					</section>
				</div>
				<div class="sub-modal-footer">
					<button
						type="button"
						class="sub-modal-btn is-ghost"
						{{on "click" this.reset}}
					>
						Reset
					</button>
					<button
						type="button"
						class="sub-modal-btn is-primary"
						disabled={{if
							this.valid
							false
							true
						}}
						{{on "click" this.apply}}
					>
						<Icon @name="check" />
						Apply
					</button>
				</div>
			</div>
		</dialog>
	</template>
}
