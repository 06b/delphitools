import Component from '@glimmer/component';
import { modifier } from 'ember-modifier';
import { on } from '@ember/modifier';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import NdsLoader from 'delphitools-v2/components/ui/nds-loader';
import CommentPopover from 'delphitools-v2/components/errata/comment-popover';
import Omnibar from 'delphitools-v2/components/errata/omnibar';
import PageCanvas from 'delphitools-v2/components/errata/page-canvas';
import PageRail from 'delphitools-v2/components/errata/page-rail';
import PreflightPanel from 'delphitools-v2/components/errata/preflight-panel';
import SignatureModal from 'delphitools-v2/components/errata/signature-modal';
import TopBar from 'delphitools-v2/components/errata/top-bar';
import errataShortcuts from 'delphitools-v2/modifiers/errata-shortcuts';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { exportPdf } from 'delphitools-v2/lib/errata/export';
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
	store,
} from 'delphitools-v2/lib/errata/store';
import { activeTool, type ToolId } from 'delphitools-v2/lib/errata/tool';
import {
	boxMode,
	debugBoxes,
	pageRect,
	registerImagePicker,
	setMode,
	type BoxMode,
} from 'delphitools-v2/lib/errata/ui';
import { pageContent } from 'delphitools-v2/lib/errata/content';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

export default class ErrataShell extends Component {
	doc = new TrackedExternal(store.subscribe, store.getSnapshot);
	mode = new TrackedExternal(boxMode.subscribe, boxMode.get);
	loading = new TrackedExternal(opening.subscribe, opening.get);
	#pdfInput: HTMLInputElement | null = null;
	#imageInput: HTMLInputElement | null = null;

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.mode.unsubscribe();
		this.loading.unsubscribe();
	}

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
			class="sub-shell"
			{{this.rig}}
			{{errataShortcuts}}
			{{filePaste
				this.paste
				accept="application/pdf,image/*"
			}}
			{{on "dragover" this.dragOver}}
			{{on "drop" this.drop}}
		>
			<TopBar />
			<div class="sub-shell-body">
				{{#if this.doc.current}}
					<PageRail />
				{{/if}}
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
					{{#if this.doc.current}}
						<Omnibar />
						<PreflightPanel
							@open={{eq
								this.mode.current
								"preflight"
							}}
						/>
						<CommentPopover />
					{{else}}{{#unless this.loading.current}}
							<div
								class="sub-empty-hint"
							>
								<div
									class="sub-empty-card pointer-events-auto border shadow-lg"
								>
									<div
										class="segmented sub-empty-actions"
									>
										<button
											type="button"
											class="sub-empty-action"
											{{on
												"click"
												this.pickPdf
											}}
										>
											<Icon
												@name="file-text"
											/>
											Open
											PDF
										</button>
										<button
											type="button"
											class="sub-empty-action"
											{{on
												"click"
												this.pickImage
											}}
										>
											<Icon
												@name="image-plus"
											/>
											Open
											image
										</button>
									</div>
									<div
										class="sub-empty-note"
									>Drop or
										paste</div>
								</div>
							</div>
						{{/unless}}{{/if}}
					{{#if this.loading.current}}
						<div class="err-opening">
							<NdsLoader
								class="is-stage"
							/>
						</div>
					{{/if}}
				</div>
			</div>
			<SignatureModal />
		</div>
	</template>
}
