import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { LinkTo } from '@ember/routing';
import type { TOC } from '@ember/component/template-only';
import { modifier } from 'ember-modifier';
import { eq, not } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import ThemeToggle from 'delphitools-v2/components/theme-toggle';
import { exportCurrent } from 'delphitools-v2/lib/errata/export-file';
import {
	closeDoc,
	imagePage,
	openFile,
} from 'delphitools-v2/lib/errata/source';
import {
	cropPage,
	deletePage,
	insertBlankAfter,
	insertPageAfter,
	resizePage,
	rotateCurrent,
} from 'delphitools-v2/lib/errata/page-ops';
import {
	currentPage,
	getPageIndex,
	setPageIndex,
	store,
	subscribePage,
} from 'delphitools-v2/lib/errata/store';
import { deleteSelection, setMode } from 'delphitools-v2/lib/errata/ui';
import {
	getZoom,
	subscribeViewport,
	viewport,
} from 'delphitools-v2/lib/substrata/viewport';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import {
	Ab,
	Box,
	Item,
	Sep,
	UrButton,
} from 'delphitools-v2/components/errata/substrata-parts';

// menu id typed per-editor

type MenuId = 'document' | 'edit';

interface MenuSignature {
	Element: HTMLDivElement;
	Args: {
		id: MenuId;
		label: string;
		open: MenuId | null;
		onToggle: (id: MenuId) => void;
	};
	Blocks: { default: [] };
}

const Menu: TOC<MenuSignature> = <template>
	<div data-menu-root class="sub-topbar-menu-root">
		<button
			type="button"
			class="sub-topbar-menu-btn
				{{if (eq @open @id) 'is-open'}}"
			{{on "click" (fn @onToggle @id)}}
		>
			{{@label}}
		</button>
		{{#if (eq @open @id)}}
			<div class="sub-topbar-menu-pop">
				{{yield}}
			</div>
		{{/if}}
	</div>
</template>;

export default class TopBar extends Component {
	@tracked open: MenuId | null = null;
	@tracked busy = false;
	@tracked failed = false;

	doc = new TrackedExternal(store.subscribe, store.getSnapshot);
	undoable = new TrackedExternal(store.subscribe, store.canUndo);
	redoable = new TrackedExternal(store.subscribe, store.canRedo);
	zoom = new TrackedExternal(subscribeViewport, getZoom);
	pageIndex = new TrackedExternal(subscribePage, getPageIndex);

	failedText = 'Export failed. See console';

	#fileInput: HTMLInputElement | null = null;
	#imageInput: HTMLInputElement | null = null;

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.undoable.unsubscribe();
		this.redoable.unsubscribe();
		this.zoom.unsubscribe();
		this.pageIndex.unsubscribe();
	}

	registerFileInput = modifier((element: HTMLInputElement) => {
		this.#fileInput = element;
		return () => {
			this.#fileInput = null;
		};
	});

	registerImageInput = modifier((element: HTMLInputElement) => {
		this.#imageInput = element;
		return () => {
			this.#imageInput = null;
		};
	});

	watchOutsideClick = modifier(() => {
		if (!this.open) return;
		const onDown = (event: MouseEvent) => {
			if (
				!(event.target as HTMLElement).closest(
					'[data-menu-root]',
				)
			)
				this.close();
		};
		document.addEventListener('mousedown', onDown);
		return () => document.removeEventListener('mousedown', onDown);
	});

	toggle = (id: MenuId) => {
		this.open = this.open === id ? null : id;
	};

	close = () => {
		this.open = null;
	};

	get hasDoc() {
		return this.doc.current !== null;
	}

	get docName() {
		return this.doc.current?.name ?? '';
	}

	get zoomPct() {
		return Math.round(this.zoom.current * 100);
	}

	get pageLabel() {
		const total = this.doc.current?.pages.length ?? 0;
		return `Page ${this.pageIndex.current + 1} / ${total}`;
	}

	get canDeletePage() {
		return (this.doc.current?.pages.length ?? 0) > 1;
	}

	get page() {
		return this.doc.current?.pages[this.pageIndex.current] ?? null;
	}

	get hasCrop() {
		return this.page?.crop != null;
	}

	get hasResize() {
		return this.page?.resize != null;
	}

	doPageSize = () => {
		setMode('page-size');
		this.close();
	};

	doResetCrop = () => {
		if (this.page) cropPage(this.page.id, null);
		this.close();
	};

	doResetSize = () => {
		if (this.page) resizePage(this.page.id, null);
		this.close();
	};

	doOpen = () => {
		this.#fileInput?.click();
		this.close();
	};

	onPickFile = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (file) void openFile(file);
	};

	doAddImage = () => {
		this.#imageInput?.click();
		this.close();
	};

	onPickImage = async (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		const page = await imagePage(file);
		insertPageAfter(currentPage()?.id ?? null, page);
	};

	doAddBlank = () => {
		const page = currentPage();
		if (page) insertBlankAfter(page.id);
		this.close();
	};

	doRotate = () => {
		const page = currentPage();
		if (page) rotateCurrent(page.id, 1);
		this.close();
	};

	doDeletePage = () => {
		const page = currentPage();
		if (page) deletePage(page.id);
		this.close();
	};

	doClose = () => {
		closeDoc();
		this.close();
	};

	doUndo = () => store.undo();
	doRedo = () => store.redo();

	doDelete = () => {
		deleteSelection();
		this.close();
	};

	doFit = () => {
		viewport.fit();
		this.close();
	};

	doActual = () => {
		viewport.reset();
		this.close();
	};

	zoomOut = () => viewport.zoomOut();
	zoomIn = () => viewport.zoomIn();
	fit = () => viewport.fit();
	prev = () => setPageIndex(getPageIndex() - 1);
	next = () => setPageIndex(getPageIndex() + 1);

	export = async () => {
		if (!this.doc.current || this.busy) return;
		this.busy = true;
		this.failed = false;
		this.close();
		this.failed = !(await exportCurrent());
		this.busy = false;
	};

	<template>
		<div class="sub-topbar" {{this.watchOutsideClick}}>
			<input
				type="file"
				accept="application/pdf,image/*"
				class="sub-topbar-file-input"
				aria-label="Open file"
				{{this.registerFileInput}}
				{{on "change" this.onPickFile}}
			/>
			<input
				type="file"
				accept="image/*"
				class="sub-topbar-file-input"
				aria-label="Add image page"
				{{this.registerImageInput}}
				{{on "change" this.onPickImage}}
			/>

			<LinkTo
				@route="index"
				aria-label="back to delphitools"
				class="sub-topbar-home"
			>
				<img
					src="/delphi-lowlod.png"
					alt=""
					class="sub-topbar-home-img"
				/>
			</LinkTo>
			<span class="sub-topbar-wordmark">Errata</span>
			<span class="sub-topbar-divider"></span>

			<nav class="sub-topbar-nav">
				<Menu
					@id="document"
					@label="Document"
					@open={{this.open}}
					@onToggle={{this.toggle}}
				>
					<Box>
						<div
							class="sub-topbar-scene-items"
						>
							<Item
								@label="Open…"
								@onClick={{this.doOpen}}
							/>
							<Item
								@label="Export…"
								@disabled={{not
									this.hasDoc
								}}
								@onClick={{this.export}}
							/>
							<Sep />
							<Item
								@label="Add blank page"
								@disabled={{not
									this.hasDoc
								}}
								@onClick={{this.doAddBlank}}
							/>
							<Item
								@label="Add image page"
								@disabled={{not
									this.hasDoc
								}}
								@onClick={{this.doAddImage}}
							/>
							<Item
								@label="Rotate page"
								@disabled={{not
									this.hasDoc
								}}
								@onClick={{this.doRotate}}
							/>
							<Item
								@label="Delete page"
								@disabled={{not
									this.canDeletePage
								}}
								@onClick={{this.doDeletePage}}
							/>
							<Sep />
							<Item
								@label="Page size…"
								@disabled={{not
									this.hasDoc
								}}
								@onClick={{this.doPageSize}}
							/>
							<Item
								@label="Reset size"
								@disabled={{not
									this.hasResize
								}}
								@onClick={{this.doResetSize}}
							/>
							<Item
								@label="Reset crop"
								@disabled={{not
									this.hasCrop
								}}
								@onClick={{this.doResetCrop}}
							/>
							<Sep />
							<Item
								@label="Close"
								@disabled={{not
									this.hasDoc
								}}
								@onClick={{this.doClose}}
							/>
						</div>
					</Box>
				</Menu>
				<Menu
					@id="edit"
					@label="Edit"
					@open={{this.open}}
					@onToggle={{this.toggle}}
				>
					<div class="sub-topbar-edit-menu">
						<Box>
							<div
								class="sub-topbar-ur-row"
							>
								<UrButton
									@icon="undo-2"
									@label="Undo"
									@hint="⌘Z"
									@disabled={{not
										this.undoable.current
									}}
									@onClick={{this.doUndo}}
								/>
								<UrButton
									@icon="redo-2"
									@label="Redo"
									@hint="⇧⌘Z"
									@disabled={{not
										this.redoable.current
									}}
									@onClick={{this.doRedo}}
									class="sub-topbar-ur-btn-bordered"
								/>
							</div>
						</Box>
						<Box>
							<div
								class="segmented sub-topbar-ab-grid"
							>
								<Ab
									@icon="trash-2"
									@label="Delete"
									@hint="⌫"
									@disabled={{not
										this.hasDoc
									}}
									@onClick={{this.doDelete}}
								/>
								<Ab
									@icon="maximize-2"
									@label="Fit page"
									@hint="⌘0"
									@disabled={{not
										this.hasDoc
									}}
									@onClick={{this.doFit}}
								/>
								<Ab
									@icon="scan"
									@label="Actual size"
									@disabled={{not
										this.hasDoc
									}}
									@onClick={{this.doActual}}
								/>
							</div>
						</Box>
					</div>
				</Menu>
			</nav>

			{{#if this.hasDoc}}
				<div class="sub-topbar-centre">
					<span
						class="sub-topbar-scene-btn"
					>{{this.docName}}</span>
					<span class="sub-topbar-status">
						<button
							type="button"
							class="sub-topbar-fit-btn"
							aria-label="Previous page"
							title="Previous page"
							{{on "click" this.prev}}
						>
							<Icon
								@name="chevron-left"
							/>
						</button>
						<span
							data-page-label
						>{{this.pageLabel}}</span>
						<button
							type="button"
							class="sub-topbar-fit-btn"
							aria-label="Next page"
							title="Next page"
							{{on "click" this.next}}
						>
							<Icon
								@name="chevron-right"
							/>
						</button>
					</span>
				</div>
			{{/if}}

			<div class="sub-topbar-right">
				{{#if this.failed}}
					<span
						class="sub-topbar-status"
					>{{this.failedText}}</span>
				{{/if}}
				<button
					type="button"
					class="sub-toast-btn"
					disabled={{not this.undoable.current}}
					aria-label="Undo"
					title="Undo"
					{{on "click" this.doUndo}}
				>
					<Icon @name="undo-2" />
				</button>
				<button
					type="button"
					class="sub-toast-btn"
					disabled={{not this.redoable.current}}
					aria-label="Redo"
					title="Redo"
					{{on "click" this.doRedo}}
				>
					<Icon @name="redo-2" />
				</button>
				<span class="sub-topbar-divider"></span>
				<div class="sub-topbar-zoom">
					<button
						type="button"
						class="sub-topbar-zoom-btn"
						aria-label="Zoom out"
						title="Zoom out"
						{{on "click" this.zoomOut}}
					>−</button>
					<button
						type="button"
						class="sub-topbar-zoom-pct"
						aria-label="Fit page"
						title="Fit page"
						{{on "click" this.fit}}
					>{{this.zoomPct}}%</button>
					<button
						type="button"
						class="sub-topbar-zoom-btn"
						aria-label="Zoom in"
						title="Zoom in"
						{{on "click" this.zoomIn}}
					>+</button>
				</div>
				<button
					type="button"
					class="sub-topbar-fit-btn"
					aria-label="Fit to view"
					title="Fit to view"
					{{on "click" this.fit}}
				>
					<Icon @name="maximize-2" />
				</button>
				<span class="sub-topbar-divider"></span>
				<button
					type="button"
					class="sub-topbar-export"
					disabled={{not this.hasDoc}}
					{{on "click" this.export}}
				>
					<Icon @name="download" />
					{{if this.busy "Exporting" "Export"}}
				</button>
				<ThemeToggle />
			</div>
		</div>
	</template>
}
