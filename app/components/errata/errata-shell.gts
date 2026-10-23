import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import { eq } from 'ember-truth-helpers';
import CanonFigure from 'delphicanon/components/canon-figure';
import CanonLoader from 'delphicanon/components/canon-loader';
import { IconSvg } from 'delphitools-v2/components/icon';
import CommentPopover from 'delphitools-v2/components/errata/comment-popover';
import ErrataMenu from 'delphitools-v2/components/errata/menu';
import PageCanvas from 'delphitools-v2/components/errata/page-canvas';
import PageRail from 'delphitools-v2/components/errata/page-rail';
import PreflightPanel from 'delphitools-v2/components/errata/preflight-panel';
import SettingsBar from 'delphitools-v2/components/errata/settings-bar';
import SignatureModal from 'delphitools-v2/components/errata/signature-modal';
import Toolbox from 'delphitools-v2/components/errata/toolbox';
import { Cell, Cells } from 'delphitools-v2/components/substrata/editor/cells';
import {
	MenuCell,
	menuIcon,
	type BarMenuEntry,
} from 'delphitools-v2/components/substrata/editor/tool-bar/bar-cells';
import errataShortcuts from 'delphitools-v2/modifiers/errata-shortcuts';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { exportPdf } from 'delphitools-v2/lib/errata/export';
import { exportCurrent } from 'delphitools-v2/lib/errata/export-file';
import {
	getSourceBytes,
	openFile,
	opening,
	pageFontFace,
	debugActivePdf,
} from 'delphitools-v2/lib/errata/source';
import type { PageCrop, PageResize } from 'delphitools-v2/lib/errata/doc-model';
import {
	cropPage,
	placeImage,
	resizePage,
} from 'delphitools-v2/lib/errata/page-ops';
import {
	currentPage,
	getPageIndex,
	setPageIndex,
	store,
	subscribePage,
} from 'delphitools-v2/lib/errata/store';
import {
	TOOL_ORDER,
	activeTool,
	type ToolEntry,
	type ToolId,
} from 'delphitools-v2/lib/errata/tool';
import {
	boxMode,
	debugBoxes,
	modal,
	pageRect,
	pickImageFile,
	registerImagePicker,
	setMode,
	toolbox,
	type BoxMode,
	type ModalId,
} from 'delphitools-v2/lib/errata/ui';
import { pageContent } from 'delphitools-v2/lib/errata/content';
import {
	getZoom,
	subscribeViewport,
	viewport,
} from 'delphitools-v2/lib/substrata/viewport';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import 'delphitools-v2/components/substrata/editor/editor.css';
import 'delphitools-v2/components/substrata/editor/tool-bar/tools.css';
import './errata.css';

// the Substrata frame's metrics (editor.gts), 1 pt = 1 px
const CELL = 44;
const FRAME = 2;
const PAD = 16;
const GAP = 8;
const PHONE_WIDTH = 600;
// the Toolbox key with its upright label, .err-box-key in errata.css
const BOX_KEY = 112;
// edit stack, tools, panel keys, the gaps and the frame
const COLUMN_FULL =
	(4 + TOOL_ORDER.length + 1) * CELL +
	BOX_KEY +
	(4 - 1) +
	(TOOL_ORDER.length - 1) +
	(2 - 1) +
	2 * GAP +
	6 * FRAME;

function toolTitle(tool: ToolEntry): string {
	return `${tool.label} (${tool.key})`;
}

export default class ErrataShell extends Component {
	@tracked width = 1400;
	@tracked height = 1000;
	// the phone starts with the pages closed
	@tracked pagesChoice: boolean | null = null;
	@tracked menuAnchor: HTMLElement | null = null;
	@tracked exporting = false;
	@tracked exportFailed = false;

	doc = new TrackedExternal(store.subscribe, store.getSnapshot);
	undoable = new TrackedExternal(store.subscribe, store.canUndo);
	redoable = new TrackedExternal(store.subscribe, store.canRedo);
	mode = new TrackedExternal(boxMode.subscribe, boxMode.get);
	sheet = new TrackedExternal(modal.subscribe, modal.get);
	boxOpen = new TrackedExternal(toolbox.subscribe, toolbox.get);
	tool = new TrackedExternal(activeTool.subscribe, activeTool.get);
	loading = new TrackedExternal(opening.subscribe, opening.get);
	zoom = new TrackedExternal(subscribeViewport, getZoom);
	pageIndex = new TrackedExternal(subscribePage, getPageIndex);
	#pdfInput: HTMLInputElement | null = null;
	#imageInput: HTMLInputElement | null = null;

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.undoable.unsubscribe();
		this.redoable.unsubscribe();
		this.mode.unsubscribe();
		this.sheet.unsubscribe();
		this.boxOpen.unsubscribe();
		this.tool.unsubscribe();
		this.loading.unsubscribe();
		this.zoom.unsubscribe();
		this.pageIndex.unsubscribe();
	}

	get phone() {
		return this.width < PHONE_WIDTH && this.height > this.width;
	}

	// the column keeps one tool cell, a menu of the rest, when the full
	// column does not fit the height
	get compact() {
		return this.phone || this.height - 2 * PAD < COLUMN_FULL;
	}

	get layoutClass() {
		if (this.phone) return 'is-phone';
		return this.compact ? 'is-compact' : 'is-full';
	}

	get hasDoc() {
		return this.doc.current !== null;
	}

	get title() {
		return this.doc.current?.name ?? '';
	}

	get pageLabel() {
		const total = this.doc.current?.pages.length ?? 0;
		return `Page ${this.pageIndex.current + 1} / ${total}`;
	}

	get zoomPercent() {
		return String(Math.round(this.zoom.current * 100));
	}

	get pagesOpen() {
		return this.pagesChoice ?? !this.phone;
	}

	// on the phone a panel or the toolbox takes the tray's place
	get phonePanel() {
		return (
			this.phone &&
			(this.boxOpen.current || this.mode.current !== null)
		);
	}

	get railShown() {
		return this.hasDoc && this.pagesOpen && !this.phonePanel;
	}

	// a mode or the toolbox takes the settings bar's place
	get barShown() {
		return (
			this.hasDoc &&
			!this.boxOpen.current &&
			this.mode.current === null &&
			this.sheet.current === null
		);
	}

	get activeToolEntry(): ToolEntry {
		return (
			TOOL_ORDER.find((t) => t.id === this.tool.current) ??
			TOOL_ORDER[0]!
		);
	}

	get toolItems(): BarMenuEntry[] {
		return TOOL_ORDER.map((t) => ({
			title: toolTitle(t),
			kind: 'radio',
			checked: t.id === this.tool.current,
			icon: menuIcon(t.icon),
			run: () => this.pick(t.id),
		}));
	}

	isTool = (id: ToolId) => this.tool.current === id;

	toolLabel = (tool: ToolEntry) => toolTitle(tool);

	pick = (id: ToolId) => {
		if (id === 'signature') {
			modal.set('signature');
			return;
		}
		if (id === 'image') {
			pickImageFile();
			return;
		}
		activeTool.set(id);
	};

	#menuCell: HTMLElement | null = null;

	keepMenuCell = modifier((el: HTMLElement) => {
		this.#menuCell = el;
		return () => {
			if (this.#menuCell === el) this.#menuCell = null;
		};
	});

	openMenu = () => {
		this.menuAnchor = this.menuAnchor ? null : this.#menuCell;
	};

	closeMenu = () => {
		this.menuAnchor = null;
	};

	togglePages = () => {
		this.pagesChoice = !this.pagesOpen;
	};

	toggleBox = () => toolbox.set(!this.boxOpen.current);

	doUndo = () => store.undo();
	doRedo = () => store.redo();
	fit = () => viewport.fit();
	prev = () => setPageIndex(getPageIndex() - 1);
	next = () => setPageIndex(getPageIndex() + 1);

	export = async () => {
		if (!this.hasDoc || this.exporting) return;
		this.exporting = true;
		this.exportFailed = false;
		this.exportFailed = !(await exportCurrent());
		this.exporting = false;
	};

	// scripts/verify/errata.mjs drives this
	rig = modifier(() => {
		if (!import.meta.env.DEV) return;
		const w = window as unknown as Record<string, unknown>;
		w.__errata = {
			open: (
				bytes: ArrayBuffer,
				name: string,
				type: string,
			) => openFile(new File([bytes], name, { type })),
			doc: () => store.getSnapshot(),
			pageIndex: () => getPageIndex(),
			setTool: (id: ToolId) => activeTool.set(id),
			setMode: (id: BoxMode | null) => setMode(id),
			pageRect: (index: number) => pageRect(index),
			activePdf: () => debugActivePdf(),
			fontFace: async (index: number, baseFont: string) => {
				const face = await pageFontFace(
					index,
					baseFont,
				);
				return face
					? {
							family: face.family,
							sample: face.display([
								116, 119, 111,
							]),
						}
					: null;
			},
			content: async (index: number) => {
				const page = store.getSnapshot()?.pages[index];
				const view = page
					? await pageContent(page)
					: null;
				if (!view) return null;
				return {
					items: view.content.items.map((it) => ({
						kind: it.kind,
						stream: it.stream,
						text:
							it.kind === 'text'
								? it.text
								: undefined,
						box: view.toDisplayed(it.bbox),
					})),
					lines: view.lines.map((l) => ({
						text: l.text,
						box: view.toDisplayed(l.bbox),
					})),
					warnings: view.content.warnings,
				};
			},
			showContent: async (index: number, on = true) => {
				const page = store.getSnapshot()?.pages[index];
				const view =
					page && on
						? await pageContent(page)
						: null;
				const colours = {
					text: '#d33',
					image: '#36c',
					form: '#c93',
					path: '#3a3',
				};
				debugBoxes(
					index,
					view
						? [
								...view.content.items
									.filter(
										(
											it,
										) =>
											it.kind !==
											'text',
									)
									.map(
										(
											it,
										) => ({
											...view.toDisplayed(
												it.bbox,
											),
											colour: colours[
												it
													.kind
											],
										}),
									),
								...view.lines.map(
									(
										l,
									) => ({
										...view.toDisplayed(
											l.bbox,
										),
										colour: colours.text,
									}),
								),
							]
						: [],
				);
			},
			resize: (resize: PageResize | null) => {
				const page = currentPage();
				if (page) resizePage(page.id, resize);
			},
			crop: (crop: PageCrop | null) => {
				const page = currentPage();
				if (page) cropPage(page.id, crop);
			},
			export: async () => {
				const doc = store.getSnapshot();
				if (!doc) return null;
				return [
					...(await exportPdf(
						doc,
						getSourceBytes(),
					)),
				];
			},
		};
		return () => {
			delete w.__errata;
		};
	});

	measure = modifier((root: HTMLElement) => {
		const pieces = new ResizeObserver(() => this.placeInset(root));
		const watch = () => {
			pieces.disconnect();
			pieces.observe(root);
			for (const el of root.querySelectorAll(
				':scope > .sub-ed-title, :scope > .sub-ed-column, :scope > .sub-ed-row, :scope > .err-rail, :scope > .sub-ed-bar',
			))
				pieces.observe(el);
		};
		const size = new ResizeObserver(() => {
			this.width = root.clientWidth;
			this.height = root.clientHeight;
		});
		size.observe(root);
		const children = new MutationObserver(() => {
			watch();
			this.placeInset(root);
		});
		children.observe(root, { childList: true });
		watch();
		return () => {
			pieces.disconnect();
			size.disconnect();
			children.disconnect();
		};
	});

	// the pages keep clear of the title, the column, the rail and the
	// settings bar; panels and the toolbox float over them
	placeInset = (root: HTMLElement) => {
		const area = root.querySelector<HTMLElement>(
			':scope > .sub-shell-canvas-area',
		);
		if (!area) return;
		const box = area.getBoundingClientRect();
		const inset = { top: PAD, right: PAD, bottom: PAD, left: PAD };
		const rect = (sel: string) => {
			const r = root
				.querySelector(`:scope > ${sel}`)
				?.getBoundingClientRect();
			return r && r.width && r.height ? r : null;
		};
		const title = rect('.sub-ed-title');
		if (title) inset.top = title.bottom - box.top + PAD;
		const column = rect('.sub-ed-column');
		if (column) inset.right = box.right - column.left + PAD;
		// the findings rail slides in; its offset ignores the slide
		const findings = root.querySelector<HTMLElement>(
			':scope > .err-preflight.is-open',
		);
		if (findings && !this.phone)
			inset.right = Math.max(
				inset.right,
				root.clientWidth - findings.offsetLeft + PAD,
			);
		const rail = rect('.err-rail');
		root.style.setProperty(
			'--sub-tray-h',
			`${rail && this.phone ? rail.height + GAP : 0}px`,
		);
		if (rail && !this.phone)
			inset.left = rail.right - box.left + PAD;
		const row = rect('.sub-ed-row');
		if (row) inset.bottom = box.bottom - row.top + PAD;
		const bar = rect('.sub-ed-bar');
		if (bar)
			inset.bottom = Math.max(
				inset.bottom,
				box.bottom - bar.top + PAD,
			);
		const next = [
			inset.top,
			inset.right,
			inset.bottom,
			inset.left,
		].join(',');
		if (area.dataset['inset'] === next) return;
		area.dataset['inset'] = next;
		area.dispatchEvent(new CustomEvent('err-inset'));
	};

	// a mode opening or closing moves the findings rail
	reinset = modifier(
		(
			root: HTMLElement,
			[mode, sheet]: [BoxMode | null, ModalId | null],
		) => {
			void mode;
			void sheet;
			const frame = requestAnimationFrame(() =>
				this.placeInset(root),
			);
			return () => cancelAnimationFrame(frame);
		},
	);

	// with a document open an image file lands on the page; a pdf always opens
	take = (file: File) =>
		store.getSnapshot() && file.type.startsWith('image/')
			? placeImage(file)
			: openFile(file);

	paste = (file: File) => void this.take(file);

	registerPdfInput = modifier((el: HTMLInputElement) => {
		this.#pdfInput = el;
		return () => {
			this.#pdfInput = null;
		};
	});

	registerImageInput = modifier((el: HTMLInputElement) => {
		this.#imageInput = el;
		registerImagePicker(() => el.click());
		return () => {
			this.#imageInput = null;
			registerImagePicker(null);
		};
	});

	pickPdf = () => this.#pdfInput?.click();
	pickImage = () => this.#imageInput?.click();

	onPick = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (file) void this.take(file);
	};

	dragOver = (event: DragEvent) => {
		if (event.dataTransfer?.types.includes('Files'))
			event.preventDefault();
	};

	drop = (event: DragEvent) => {
		const file = event.dataTransfer?.files[0];
		if (!file) return;
		event.preventDefault();
		void this.take(file);
	};

	<template>
		<div
			class="sub-ed err-ed {{this.layoutClass}}"
			{{this.measure}}
			{{this.reinset this.mode.current this.sheet.current}}
			{{this.rig}}
			{{errataShortcuts}}
			{{filePaste
				this.paste
				accept="application/pdf,image/*"
			}}
			{{on "dragover" this.dragOver}}
			{{on "drop" this.drop}}
		>
			<div class="sub-shell-canvas-area">
				{{! always mounted: the Image tool and the empty hint share them }}
				<input
					type="file"
					accept="application/pdf"
					class="dt-sr-only"
					aria-label="Open PDF"
					{{this.registerPdfInput}}
					{{on "change" this.onPick}}
				/>
				<input
					type="file"
					accept="image/*"
					class="dt-sr-only"
					aria-label="Open image"
					{{this.registerImageInput}}
					{{on "change" this.onPick}}
				/>
				<PageCanvas />
				{{#unless this.hasDoc}}
					{{#unless this.loading.current}}
						<div
							class="sub-empty"
							data-empty-hint
						>
							<div
								class="sub-empty-card"
							>
								<div
									class="sub-empty-actions"
								>
									<Cell
										@label="Open PDF"
										@text="Open PDF"
										@icon="file-text"
										@onClick={{this.pickPdf}}
									/>
									<Cell
										@label="Open image"
										@text="Open image"
										@icon="image-plus"
										@onClick={{this.pickImage}}
									/>
								</div>
								<p
									class="sub-empty-note"
								>Drop or paste</p>
							</div>
						</div>
					{{/unless}}
				{{/unless}}
				{{#if this.loading.current}}
					<div class="err-opening">
						<CanonLoader />
					</div>
				{{/if}}
			</div>

			{{#if this.hasDoc}}
				<div
					class="sub-ed-title"
					role="group"
					aria-label="Document"
				>
					<span
						class="sub-ed-title-name"
					>{{this.title}}</span>
					<button
						type="button"
						class="err-title-step"
						aria-label="Previous page"
						title="Previous page"
						{{on "click" this.prev}}
					><IconSvg
							@name="chevron-left"
						/></button>
					<span
						class="err-title-page"
						data-page-label
					>{{this.pageLabel}}</span>
					<button
						type="button"
						class="err-title-step"
						aria-label="Next page"
						title="Next page"
						{{on "click" this.next}}
					><IconSvg
							@name="chevron-right"
						/></button>
					<button
						type="button"
						class="sub-ed-title-zoom"
						aria-label="Fit page"
						title="Fit page"
						{{on "click" this.fit}}
					><CanonFigure
							@text={{this.zoomPercent}}
							@unit="%"
							@size={{13}}
							@colour="var(--canon-muted-foreground)"
						/></button>
				</div>
				{{#if this.exportFailed}}
					<div class="sub-ed-note-slot">
						<span
							class="sub-ed-note err-export-failed"
							role="status"
						>Export failed</span>
					</div>
				{{/if}}
			{{/if}}

			{{#if this.phone}}
				<Cells
					class="sub-ed-phone-stack"
					@axis="row"
					@small={{true}}
				>
					<Cell
						@label="Menu"
						@icon="menu"
						@selected={{if
							this.menuAnchor
							true
							false
						}}
						@onClick={{this.openMenu}}
						{{this.keepMenuCell}}
					/>
					<Cell
						@label="Export"
						@icon="download"
						@disabled={{if
							this.hasDoc
							false
							true
						}}
						@onClick={{this.export}}
					/>
				</Cells>
				{{#if this.hasDoc}}
					<div class="sub-ed-row">
						<Cells @axis="row">
							<MenuCell
								@label={{this.activeToolEntry.label}}
								@icon={{this.activeToolEntry.icon}}
								@items={{this.toolItems}}
								@placement="top-start"
							/>
						</Cells>
						<Cells @axis="row">
							<Cell
								@label="Undo"
								@icon="undo-2"
								@disabled={{if
									this.undoable.current
									false
									true
								}}
								@onClick={{this.doUndo}}
							/>
							<Cell
								@label="Redo"
								@icon="redo-2"
								@disabled={{if
									this.redoable.current
									false
									true
								}}
								@onClick={{this.doRedo}}
							/>
						</Cells>
						<span
							class="sub-ed-row-fill"
						></span>
						<Cells @axis="row">
							<Cell
								@label="Pages"
								@icon="panel-left"
								@selected={{this.pagesOpen}}
								@onClick={{this.togglePages}}
							/>
							<Cell
								@label="Toolbox"
								@text="Toolbox"
								class="err-box-key"
								@icon="briefcase"
								@selected={{this.boxOpen.current}}
								aria-expanded={{if
									this.boxOpen.current
									"true"
									"false"
								}}
								data-toolbox
								@onClick={{this.toggleBox}}
							/>
						</Cells>
					</div>
				{{/if}}
			{{else}}
				<div class="sub-ed-column">
					<Cells class="sub-ed-stack">
						<Cell
							@tip="left"
							@label="Menu"
							@icon="menu"
							@selected={{if
								this.menuAnchor
								true
								false
							}}
							@onClick={{this.openMenu}}
							{{this.keepMenuCell}}
						/>
						<Cell
							@tip="left"
							@label="Undo"
							@icon="undo-2"
							@disabled={{if
								this.undoable.current
								false
								true
							}}
							@onClick={{this.doUndo}}
						/>
						<Cell
							@tip="left"
							@label="Redo"
							@icon="redo-2"
							@disabled={{if
								this.redoable.current
								false
								true
							}}
							@onClick={{this.doRedo}}
						/>
						<Cell
							@tip="left"
							@label="Export"
							@icon="download"
							@disabled={{if
								this.hasDoc
								false
								true
							}}
							@onClick={{this.export}}
						/>
					</Cells>
					{{#if this.hasDoc}}
						<div class="sub-ed-omni">
							<Cells
								class="sub-ed-tools"
							>
								{{#if
									this.compact
								}}
									<MenuCell
										@label={{this.activeToolEntry.label}}
										@icon={{this.activeToolEntry.icon}}
										@items={{this.toolItems}}
										@placement="left-start"
									/>
								{{else}}
									{{#each
										TOOL_ORDER
										as |t|
									}}
										<Cell
											@tip="left"
											@label={{this.toolLabel
												t
											}}
											@icon={{t.icon}}
											@selected={{this.isTool
												t.id
											}}
											aria-pressed={{if
												(this.isTool
													t.id
												)
												"true"
												"false"
											}}
											data-tool={{t.id}}
											@onClick={{fn
												this.pick
												t.id
											}}
										/>
									{{/each}}
								{{/if}}
							</Cells>
							<Cells
								class="sub-ed-panel-keys"
							>
								<Cell
									@tip="left"
									@label="Pages"
									@icon="panel-left"
									@selected={{this.pagesOpen}}
									@onClick={{this.togglePages}}
								/>
								<Cell
									@tip="left"
									@label="Toolbox"
									@text="Toolbox"
									class="err-box-key"
									@icon="briefcase"
									@selected={{this.boxOpen.current}}
									aria-expanded={{if
										this.boxOpen.current
										"true"
										"false"
									}}
									data-toolbox
									@onClick={{this.toggleBox}}
								/>
							</Cells>
						</div>
					{{/if}}
				</div>
			{{/if}}

			{{#if this.railShown}}
				<PageRail
					class="err-rail
						{{if this.phone 'is-tray'}}"
					@onClose={{this.togglePages}}
				/>
			{{/if}}

			{{#if this.barShown}}
				<SettingsBar @phone={{this.phone}} />
			{{/if}}

			{{#if this.hasDoc}}
				<Toolbox @phone={{this.phone}} />
				<PreflightPanel
					@open={{eq
						this.mode.current
						"preflight"
					}}
				/>
				<CommentPopover />
			{{/if}}

			{{#if this.menuAnchor}}
				<ErrataMenu
					@anchor={{this.menuAnchor}}
					@onOpenPdf={{this.pickPdf}}
					@onExport={{this.export}}
					@onClose={{this.closeMenu}}
				/>
			{{/if}}
			<SignatureModal />
		</div>
	</template>
}
