import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import type { TOC } from '@ember/component/template-only';
import { fn } from '@ember/helper';
import { service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import type RouterService from '@ember/routing/router-service';
import type { ComponentLike } from '@glint/template';
import { modifier } from 'ember-modifier';
import { pageTitle } from 'ember-page-title';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCommand, {
	type CanonCommandItem,
} from 'delphicanon/components/canon-command';
import CanonDialog, {
	type CanonDialogClose,
} from 'delphicanon/components/canon-dialog';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonPage from 'delphicanon/components/canon-page';
import CanonSheet from 'delphicanon/components/canon-sheet';
import CanonSidebar from 'delphicanon/components/canon-sidebar';
import CanonSidebarRow from 'delphicanon/components/canon-sidebar-row';
import { IconSvg } from 'delphitools-v2/components/icon';
import 'delphitools-v2/components/canon-docs/icons';
import DocsBody from 'delphitools-v2/components/canon-docs/pages';
import {
	docsPages,
	docsSections,
	neighbours,
	pageFor,
	type DocsPage,
} from 'delphitools-v2/lib/canon-docs';
import './canon-docs.css';

const iconFor = (name: string): ComponentLike => <template>
	<IconSvg @name={{name}} />
</template>;

const commandItems: CanonCommandItem[] = docsPages.map((page) => ({
	id: page.url,
	title: page.heading,
	group: page.section,
	keywords: [page.title],
	icon: iconFor(page.icon),
}));

const paletteStyle = htmlSafe('--canon-dialog-width: 640px');
const MenuIcon = iconFor('panel-left');
const SearchIcon = iconFor('search');
const PreviousIcon = iconFor('arrow-left');
const NextIcon = iconFor('arrow-right');
const eq = (a: unknown, b: unknown) => a === b;
const shortcut = navigator.platform.startsWith('Mac') ? '⌘K' : 'Ctrl K';

/** A plain click navigates in the app; modified clicks keep the link's own behaviour. */
export type DocsGo = (event: MouseEvent) => void;

const Nav: TOC<{
	Args: {
		current: string;
		go: DocsGo;
		/** Focuses the current row when the sheet opens, instead of its scroller. */
		autofocus?: boolean;
	};
}> = <template>
	{{#each docsSections as |section|}}
		<CanonHeading @text={{section.title}} />
		{{#each section.pages as |page|}}
			<CanonSidebarRow
				@title={{page.title}}
				@href={{page.url}}
				@selected={{eq page.id @current}}
				@onClick={{@go}}
				{{! showModal focuses the first focusable element, else the scroller }}
				{{! template-lint-disable no-autofocus-attribute }}
				autofocus={{if
					@autofocus
					(eq page.id @current)
				}}
			/>
		{{/each}}
	{{/each}}
</template>;

/** The /canon docs: a nav beside one page, a ⌘K palette, the nav in a sheet when narrow. */
export default class CanonDocs extends Component {
	@service declare router: RouterService;

	@tracked palette = false;
	@tracked sheet = false;

	shortcut = shortcut;

	get page(): DocsPage {
		return (
			pageFor(
				this.router.currentRouteName,
				this.router.currentRoute?.params,
			) ?? docsPages[0]!
		);
	}

	get pager() {
		return neighbours(this.page);
	}

	get maxWidth() {
		return this.page.kind === 'block' ? 1200 : 760;
	}

	go = (event: MouseEvent) => {
		const link = event.currentTarget as HTMLAnchorElement;
		if (
			event.button !== 0 ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey
		)
			return;
		event.preventDefault();
		this.sheet = false;
		void this.router.transitionTo(link.getAttribute('href')!);
	};

	// the app sidebar's ⌘K skips a handled event
	listen = modifier(() => {
		const keydown = (event: KeyboardEvent) => {
			if (event.key.toLowerCase() !== 'k') return;
			if (!(event.metaKey || event.ctrlKey) || event.altKey)
				return;
			event.preventDefault();
			this.palette = true;
		};
		document.addEventListener('keydown', keydown);
		return () => document.removeEventListener('keydown', keydown);
	});

	// the page scroller starts at the top of every page
	scrollTop = modifier((element: HTMLElement, [id]: [string]) => {
		if (id) element.scrollTop = 0;
	});

	// keeps the current row in the nav's view
	reveal = modifier((nav: HTMLElement, [id]: [string]) => {
		if (!id) return;
		const scroller = nav.querySelector<HTMLElement>(
			'.canon-sidebar-scroll',
		);
		const row = nav.querySelector<HTMLElement>(
			'[aria-current="page"]',
		);
		if (!scroller || !row) return;
		const top = row.offsetTop - scroller.offsetTop;
		if (
			top < scroller.scrollTop ||
			top + row.offsetHeight >
				scroller.scrollTop + scroller.clientHeight
		)
			scroller.scrollTop = top - scroller.clientHeight / 3;
	});

	openPalette = () => (this.palette = true);
	closePalette = () => (this.palette = false);
	pick = (close: CanonDialogClose, item: CanonCommandItem) => {
		close(item.id);
		void this.router.transitionTo(item.id);
	};

	openSheet = () => (this.sheet = true);
	closeSheet = () => (this.sheet = false);

	<template>
		{{pageTitle this.page.heading}}
		<div class="cd-docs" {{this.listen}}>
			<CanonSidebar
				class="cd-nav"
				@compact={{true}}
				@collapsed={{false}}
				aria-label="Docs"
				{{this.reveal this.page.id}}
			>
				<Nav
					@current={{this.page.id}}
					@go={{this.go}}
				/>
			</CanonSidebar>
			<div class="cd-pane">
				<div class="cd-toolbar">
					<CanonButton
						class="cd-menu"
						@kind="cell"
						@icon={{MenuIcon}}
						@label="Docs"
						@onClick={{this.openSheet}}
					/>
					<CanonButton
						class="cd-search"
						@kind="cell"
						@text="Search"
						@icon={{SearchIcon}}
						@onClick={{this.openPalette}}
						aria-keyshortcuts="Meta+K Control+K"
					/>
					<kbd
						class="cd-key"
					>{{this.shortcut}}</kbd>
				</div>
				<CanonPage
					class="cd-page"
					@maxWidth={{this.maxWidth}}
					{{this.scrollTop this.page.id}}
				>
					<DocsBody
						@page={{this.page}}
						@go={{this.go}}
					/>
					<nav
						class="cd-pager"
						aria-label="Pages"
					>
						{{#if this.pager.previous}}
							<CanonSidebarRow
								class="cd-previous"
								rel="prev"
								@title={{this.pager.previous.heading}}
								@icon={{PreviousIcon}}
								@href={{this.pager.previous.url}}
								@onClick={{this.go}}
							/>
						{{/if}}
						{{#if this.pager.next}}
							<CanonSidebarRow
								class="cd-next"
								rel="next"
								@title={{this.pager.next.heading}}
								@icon={{NextIcon}}
								@href={{this.pager.next.url}}
								@onClick={{this.go}}
							/>
						{{/if}}
					</nav>
				</CanonPage>
			</div>
		</div>

		<CanonDialog
			@open={{this.palette}}
			@onClose={{this.closePalette}}
			aria-label="Search docs"
			style={{paletteStyle}}
		>
			<:default as |close|>
				<CanonCommand
					@items={{commandItems}}
					@placeholder="Search docs"
					@onSelect={{fn this.pick close}}
				/>
			</:default>
		</CanonDialog>

		<CanonSheet
			@open={{this.sheet}}
			@edge="start"
			@title="Docs"
			@onClose={{this.closeSheet}}
		>
			<:default>
				<div class="cd-sheet-rows">
					<Nav
						@current={{this.page.id}}
						@go={{this.go}}
						@autofocus={{true}}
					/>
				</div>
			</:default>
		</CanonSheet>
	</template>
}
