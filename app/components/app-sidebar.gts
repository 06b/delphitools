import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { modifier } from 'ember-modifier';
import { LinkTo } from '@ember/routing';
import type RouterService from '@ember/routing/router-service';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonSidebar from 'delphicanon/components/canon-sidebar';
import CanonSidebarRow from 'delphicanon/components/canon-sidebar-row';
import Dialog from 'delphitools-v2/components/ui/dialog';
import Icon, { IconSvg } from 'delphitools-v2/components/icon';
import AboutDelphitoolsBody from 'delphitools-v2/components/about-delphitools';
import { toolCategories, featuredTools } from 'delphitools-v2/lib/tools';
import type { Tool, ToolCategory } from 'delphitools-v2/lib/tools';
import { matchesQuery } from 'delphitools-v2/lib/tool-search';
import { COMMIT_SHA, PRIDE, VERSION } from 'delphitools-v2/lib/build-flags';
import type SidebarService from 'delphitools-v2/services/sidebar';

const PAGES = [
	{ name: 'Home', icon: 'home', href: '/' },
	{ name: 'Substrata', icon: 'brush', href: '/editor' },
	{ name: 'Errata', icon: 'signature', href: '/errata' },
	{ name: 'Workflows', icon: 'workflow', href: '/workflows' },
	{ name: 'Experiments', icon: 'flask-conical', href: '/experiments' },
];

const SIDEBAR_CATEGORIES: ToolCategory[] = toolCategories.map((cat) => ({
	...cat,
	tools: cat.tools
		.filter((t) => !t.route)
		.sort(
			(a, b) =>
				Number(!!b.atlas) - Number(!!a.atlas) ||
				a.name.localeCompare(b.name),
		),
}));

interface NavRowSignature {
	Args: { name: string; icon: string; href: string; external?: boolean };
}

class NavRow extends Component<NavRowSignature> {
	@service declare router: RouterService;

	get selected() {
		return this.router.currentURL?.split('?')[0] === this.args.href;
	}

	// canon rows are plain links
	go = (event: MouseEvent) => {
		if (
			this.args.external ||
			event.button !== 0 ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey
		)
			return;
		event.preventDefault();
		void this.router.transitionTo(this.args.href);
	};

	<template>
		{{#if @external}}
			<CanonSidebarRow
				@title={{@name}}
				@icon={{component IconSvg name=@icon}}
				@href={{@href}}
				target="_blank"
				rel="noopener noreferrer"
			/>
		{{else}}
			<CanonSidebarRow
				@title={{@name}}
				@icon={{component IconSvg name=@icon}}
				@href={{@href}}
				@selected={{this.selected}}
				@onClick={{this.go}}
			/>
		{{/if}}
	</template>
}

export default class AppSidebar extends Component {
	@service declare sidebar: SidebarService;

	@tracked search = '';

	pride = PRIDE;
	commitSha = COMMIT_SHA;
	pages = PAGES;

	get query() {
		return this.search.toLowerCase();
	}

	get featured(): Tool[] {
		return featuredTools.filter((t) => matchesQuery(t, this.query));
	}

	@cached
	get categories(): ToolCategory[] {
		return SIDEBAR_CATEGORIES.flatMap((cat) => {
			const tools = cat.tools.filter((t) =>
				matchesQuery(t, this.query),
			);
			return tools.length > 0 ? [{ ...cat, tools }] : [];
		});
	}

	get empty() {
		return (
			this.query.length > 0 &&
			this.featured.length === 0 &&
			this.categories.length === 0
		);
	}

	shortcut = navigator.platform.startsWith('Mac') ? '⌘K' : 'Ctrl K';

	onSearch = (event: Event) => {
		this.search = (event.target as HTMLInputElement).value;
	};

	clearSearch = () => {
		this.search = '';
	};

	// the home omnibox claims the key first and prevents default
	searchKey = modifier((input: HTMLInputElement) => {
		const keydown = (event: KeyboardEvent) => {
			if (
				event.defaultPrevented ||
				!(event.metaKey || event.ctrlKey) ||
				event.key.toLowerCase() !== 'k'
			)
				return;
			event.preventDefault();
			this.sidebar.setOpen(true);
			// the drawer leaves inert on the next render
			requestAnimationFrame(() => {
				input.focus();
				input.select();
			});
		};
		window.addEventListener('keydown', keydown);
		return () => window.removeEventListener('keydown', keydown);
	});

	<template>
		<CanonSidebar
			class="dt-sidebar"
			@compact={{true}}
			@collapsed={{false}}
			aria-label="Main"
		>
			<:hero>
				<div class="dt-sidebar-hero">
					<LinkTo @route="index" class="dt-brand">
						<img
							src="/delphi-lowlod.png"
							width="64"
							height="64"
							alt=""
							class="dt-brand-logo
								{{if
									this.pride
									'pride-ring'
								}}"
						/>
						<span class="dt-brand-text">
							<span
								class="dt-brand-name
									{{if
										this.pride
										'pride-wordmark'
									}}"
							>
								delphitools
							</span>
							<span
								class="dt-brand-sub"
							>
								<span
									class="dt-brand-tagline
										{{if
											this.pride
											'pride-tagline'
										}}"
								>
									{{#if
										this.pride
									}}trans
										rights{{else}}indie
										tools{{/if}}
								</span>
								<span
									class="dt-brand-sha"
									title="Build commit"
								>
									v{{VERSION}}
									Â·
									{{this.commitSha}}
								</span>
							</span>
						</span>
					</LinkTo>
					<div class="dt-search">
						<IconSvg @name="search" />
						<input
							type="search"
							class="dt-search-input"
							placeholder="Search tools..."
							aria-label="Search tools"
							value={{this.search}}
							{{on
								"input"
								this.onSearch
							}}
							{{this.searchKey}}
						/>
						{{#if this.search}}
							<button
								type="button"
								class="dt-search-clear"
								aria-label="Clear search"
								{{on
									"click"
									this.clearSearch
								}}
							>
								<IconSvg
									@name="x"
								/>
							</button>
						{{else}}
							<kbd
								class="dt-search-key"
							>{{this.shortcut}}</kbd>
						{{/if}}
					</div>
				</div>
			</:hero>
			<:default>
				{{#unless this.query}}
					{{#each this.pages as |page|}}
						<NavRow
							@name={{page.name}}
							@icon={{page.icon}}
							@href={{page.href}}
						/>
					{{/each}}
				{{/unless}}

				{{#if this.empty}}
					<output
						class="dt-nav-empty"
						aria-live="polite"
					>No tools found</output>
				{{/if}}

				{{#if this.featured.length}}
					<CanonHeading @text="Greatest Hits" />
					{{#each this.featured as |tool|}}
						<NavRow
							@name={{tool.name}}
							@icon={{tool.icon}}
							@href={{tool.href}}
						/>
					{{/each}}
				{{/if}}

				{{#each this.categories as |category|}}
					<CanonHeading @text={{category.name}} />
					{{#each category.tools as |tool|}}
						<NavRow
							@name={{tool.name}}
							@icon={{tool.icon}}
							@href={{tool.href}}
							@external={{tool.external}}
						/>
					{{/each}}
				{{/each}}

				{{#unless this.query}}
					<CanonHeading @text="delphitools" />
					<Dialog as |d|>
						<CanonSidebarRow
							@title="About"
							@icon={{component
								IconSvg
								name="info"
							}}
							@onClick={{d.open}}
							{{d.focusOnClose}}
						/>
						<d.Content class="dt-dialog">
							<header
								class="dt-dialog-head"
							>
								<h2>About
									delphitools</h2>
								<button
									type="button"
									class="dt-dialog-close"
									aria-label="Close"
									{{on
										"click"
										d.close
									}}
								>
									<Icon
										@name="x"
									/>
								</button>
							</header>
							<AboutDelphitoolsBody />
						</d.Content>
					</Dialog>
					<NavRow
						@name="Privacy"
						@icon="shield-check"
						@href="/privacy"
					/>
				{{/unless}}
			</:default>
		</CanonSidebar>
	</template>
}
