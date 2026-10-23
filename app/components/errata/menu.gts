import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import type RouterService from '@ember/routing/router-service';
import { modifier } from 'ember-modifier';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import FloatingCard, {
	MenuCard,
} from 'delphitools-v2/components/substrata/editor/floating-card';
import { closeDoc, imagePage } from 'delphitools-v2/lib/errata/source';
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
	store,
	subscribePage,
} from 'delphitools-v2/lib/errata/store';
import { deleteSelection, setMode } from 'delphitools-v2/lib/errata/ui';
import { viewport } from 'delphitools-v2/lib/substrata/viewport';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import type ThemeService from 'delphitools-v2/services/theme';

const APPEARANCES = ['Light', 'Dark'];

interface Signature {
	Args: {
		anchor: HTMLElement;
		onOpenPdf: () => void;
		onExport: () => void;
		onClose: () => void;
	};
}

// the ≡ cell's card: the old Document and Edit menus as MenuCards
export default class ErrataMenu extends Component<Signature> {
	@service declare theme: ThemeService;
	@service declare router: RouterService;

	doc = new TrackedExternal(store.subscribe, store.getSnapshot);
	pageIndex = new TrackedExternal(subscribePage, getPageIndex);
	#imageInput: HTMLInputElement | null = null;

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.pageIndex.unsubscribe();
	}

	get noDoc() {
		return this.doc.current === null;
	}

	get page() {
		return this.doc.current?.pages[this.pageIndex.current] ?? null;
	}

	get cannotDeletePage() {
		return (this.doc.current?.pages.length ?? 0) < 2;
	}

	get noCrop() {
		return this.page?.crop == null;
	}

	get noResize() {
		return this.page?.resize == null;
	}

	get appearance() {
		return this.theme.dark ? 1 : 0;
	}

	setAppearance = (index: number) => {
		if ((index === 1) !== this.theme.dark) this.theme.toggle();
	};

	#then = (action: () => void) => () => {
		action();
		this.args.onClose();
	};

	leave = this.#then(() => void this.router.transitionTo('index'));
	open = this.#then(() => this.args.onOpenPdf());
	export = this.#then(() => this.args.onExport());
	addBlank = this.#then(() => {
		const page = currentPage();
		if (page) insertBlankAfter(page.id);
	});
	addImage = () => this.#imageInput?.click();
	rotate = this.#then(() => {
		const page = currentPage();
		if (page) rotateCurrent(page.id, 1);
	});
	deletePage = this.#then(() => {
		const page = currentPage();
		if (page) deletePage(page.id);
	});
	pageSize = this.#then(() => setMode('page-size'));
	resetSize = this.#then(() => {
		if (this.page) resizePage(this.page.id, null);
	});
	resetCrop = this.#then(() => {
		if (this.page) cropPage(this.page.id, null);
	});
	closeDoc = this.#then(() => closeDoc());
	deleteSelection = this.#then(() => deleteSelection());
	fit = this.#then(() => viewport.fit());
	actual = this.#then(() => viewport.reset());

	registerImageInput = modifier((el: HTMLInputElement) => {
		this.#imageInput = el;
		return () => {
			this.#imageInput = null;
		};
	});

	onPickImage = async (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		this.args.onClose();
		if (!file) return;
		const page = await imagePage(file);
		insertPageAfter(currentPage()?.id ?? null, page);
	};

	<template>
		<FloatingCard
			@anchor={{@anchor}}
			@label="Menu"
			@width={{348}}
			@onClose={{@onClose}}
		>
			<input
				type="file"
				accept="image/*"
				class="dt-sr-only"
				aria-label="Add image page"
				{{this.registerImageInput}}
				{{on "change" this.onPickImage}}
			/>
			<div class="err-menu">
				<div class="err-menu-grid">
					<MenuCard
						@title="Back to delphitools"
						@icon="arrow-left"
						@onClick={{this.leave}}
					/>
					<MenuCard
						@title="Open…"
						@icon="folder-open"
						@onClick={{this.open}}
					/>
					<MenuCard
						@title="Export…"
						@icon="download"
						@disabled={{this.noDoc}}
						@onClick={{this.export}}
					/>
				</div>
				<CanonHeading @text="Page" />
				<div class="err-menu-grid">
					<MenuCard
						@title="Add blank page"
						@icon="file-plus"
						@disabled={{this.noDoc}}
						@onClick={{this.addBlank}}
					/>
					<MenuCard
						@title="Add image page"
						@icon="image-plus"
						@disabled={{this.noDoc}}
						@onClick={{this.addImage}}
					/>
					<MenuCard
						@title="Rotate page"
						@icon="rotate-cw"
						@disabled={{this.noDoc}}
						@onClick={{this.rotate}}
					/>
					<MenuCard
						@title="Page size…"
						@icon="scaling"
						@disabled={{this.noDoc}}
						@onClick={{this.pageSize}}
					/>
					<MenuCard
						@title="Reset size"
						@icon="undo-2"
						@disabled={{this.noResize}}
						@onClick={{this.resetSize}}
					/>
					<MenuCard
						@title="Reset crop"
						@icon="crop"
						@disabled={{this.noCrop}}
						@onClick={{this.resetCrop}}
					/>
					<MenuCard
						@title="Delete page"
						@icon="trash-2"
						@destructive={{true}}
						@disabled={{this.cannotDeletePage}}
						@onClick={{this.deletePage}}
					/>
				</div>
				<CanonHeading @text="Edit" />
				<div class="err-menu-grid">
					<MenuCard
						@title="Delete"
						@icon="trash-2"
						@disabled={{this.noDoc}}
						@onClick={{this.deleteSelection}}
					/>
					<MenuCard
						@title="Fit page"
						@icon="maximize-2"
						@disabled={{this.noDoc}}
						@onClick={{this.fit}}
					/>
					<MenuCard
						@title="Actual size"
						@icon="scan"
						@disabled={{this.noDoc}}
						@onClick={{this.actual}}
					/>
				</div>
				<CanonHeading @text="Appearance" />
				<CanonSegmented
					@items={{APPEARANCES}}
					@selected={{this.appearance}}
					@onChange={{this.setAppearance}}
				/>
				<div class="err-menu-grid">
					<MenuCard
						@title="Close"
						@icon="x"
						@disabled={{this.noDoc}}
						@onClick={{this.closeDoc}}
					/>
				</div>
			</div>
		</FloatingCard>
	</template>
}
