import type { TOC } from '@ember/component/template-only';
import type { ComponentLike } from '@glint/template';
import Icon from 'delphitools-v2/components/icon';
import { CANON_KIT_ID, getToolById } from 'delphitools-v2/lib/tools';
import './pages.css';

/** CSS px of one page; the textures scale from this. */
export const PAGE_WIDTH = 600;
export const PAGE_HEIGHT = 780;

export interface MagazineLink {
	/** `https://…` opens a tab, `/…` routes in-app, `#<page id>` turns to that page. */
	href: string;
	label: string;
}

export interface PageSignature {
	Args: { page: MagazinePage; pages: MagazinePage[] };
}

export interface MagazinePage {
	id: string;
	/** Read out on a turn and used as the page's accessible name. */
	name: string;
	component: ComponentLike<PageSignature>;
	links: MagazineLink[];
	description?: string;
	/** An image in public/magazine. */
	art?: string;
	/** A lucide icon, for a page without art. */
	icon?: string;
	soon?: boolean;
}

const tool = (id: string) => getToolById(id)!;
const IOS = tool('ios-app');
const CLI = tool('cli');
const KIT = tool(CANON_KIT_ID);

const isExternal = (href: string) => /^https?:/.test(href);

export const MagazineLinkButton: TOC<{ Args: { link: MagazineLink } }> =
	<template>
		{{#if (isExternal @link.href)}}
			<a
				href={{@link.href}}
				class="dt-mag-link"
				target="_blank"
				rel="noopener noreferrer"
				data-magazine-link
			>{{@link.label}}</a>
		{{else}}
			<a
				href={{@link.href}}
				class="dt-mag-link"
				data-magazine-link
			>{{@link.label}}</a>
		{{/if}}
	</template>;

const issueDate = new Intl.DateTimeFormat('en-GB', {
	month: 'long',
	year: 'numeric',
}).format(new Date());

const COVER_ART = [
	'/magazine/ios-icon.webp',
	'/magazine/substrata-icon.webp',
	'/magazine/mac-icon.webp',
	'/magazine/android-icon.webp',
];

const Cover: TOC<PageSignature> = <template>
	<div class="dt-mag-cover">
		<p class="dt-mag-issue">
			<span>No. 1</span>
			<span>{{issueDate}}</span>
			<span>Free</span>
		</p>
		<h2 class="dt-mag-masthead">DELPHI MAGAZINE</h2>
		<div class="dt-mag-cover-art">
			{{#each COVER_ART as |src|}}
				<img src={{src}} alt="" />
			{{/each}}
		</div>
		<p class="dt-mag-headline">DELPHI ELSEWHERE</p>
	</div>
</template>;

const pageNumber = (pages: MagazinePage[], page: MagazinePage) =>
	pages.indexOf(page) + 1;
const anchor = (page: MagazinePage) => ({
	href: `#${page.id}`,
	label: page.name,
});
// between the contents page and the back cover
const products = (pages: MagazinePage[]) => pages.slice(2, -1);

const Contents: TOC<PageSignature> = <template>
	<div class="dt-mag-contents">
		<h2 class="dt-mag-title">Contents</h2>
		<ol class="dt-mag-toc">
			{{#each (products @pages) as |entry|}}
				<li>
					<span
						class="dt-mag-toc-num"
					>{{pageNumber @pages entry}}</span>
					<MagazineLinkButton
						@link={{anchor entry}}
					/>
				</li>
			{{/each}}
		</ol>
	</div>
</template>;

const Product: TOC<PageSignature> = <template>
	<div class="dt-mag-product">
		{{#if @page.soon}}
			<p class="dt-mag-kicker">Coming soon</p>
		{{/if}}
		<h2 class="dt-mag-title">{{@page.name}}</h2>
		{{#if @page.description}}
			<p class="dt-mag-description">{{@page.description}}</p>
		{{/if}}
		<div class="dt-mag-art">
			{{#if @page.art}}
				<img src={{@page.art}} alt="" />
			{{else if @page.icon}}
				<Icon
					@name={{@page.icon}}
					class="dt-mag-art-icon"
				/>
			{{/if}}
		</div>
		<div class="dt-mag-links">
			{{#each @page.links as |link|}}
				<MagazineLinkButton @link={{link}} />
			{{/each}}
		</div>
	</div>
</template>;

// `delphitools --help` opens with this banner; the session is real output, NO_COLOR=1
const BANNER = String.raw`     __    __     __   _ __            __
 ___/ /__ / /__  / /  (_) /____  ___  / /__
/ _  / -_) / _ \/ _ \/ / __/ _ \/ _ \/ (_-<
\_,_/\__/_/ .__/_//_/_/\__/\___/\___/_/___/
         /_/`;

const SESSION = [
	['delphitools paper a4', 'A4: 210 × 297 mm'],
	['delphitools px2rem 24', '24px = 1.5000rem (base 16px)'],
]
	.map(([input, output]) => `\n$ ${input}\n${output}`)
	.join('');

const TERMINAL = `${BANNER}\n${SESSION}`;

const Terminal: TOC<PageSignature> = <template>
	<div class="dt-mag-product">
		<h2 class="dt-mag-title">{{@page.name}}</h2>
		<p class="dt-mag-description">{{@page.description}}</p>
		<pre
			class="dt-mag-terminal"
			aria-hidden="true"
		>{{TERMINAL}}</pre>
		<div class="dt-mag-links">
			{{#each @page.links as |link|}}
				<MagazineLinkButton @link={{link}} />
			{{/each}}
		</div>
	</div>
</template>;

const BackCover: TOC<PageSignature> = <template>
	<div class="dt-mag-back">
		<p class="dt-mag-masthead">delphitools</p>
	</div>
</template>;

/**
 * The magazine, one entry per page in reading order: front cover first,
 * back cover last. The count must stay even (pages pair into leaves).
 */
export const MAGAZINE_PAGES: MagazinePage[] = [
	{
		id: 'cover',
		name: 'DELPHI ELSEWHERE',
		component: Cover,
		links: [],
	},
	{ id: 'contents', name: 'Contents', component: Contents, links: [] },
	{
		id: IOS.id,
		name: IOS.name,
		description: IOS.description,
		art: '/magazine/ios-shot.webp',
		component: Product,
		links: [{ href: IOS.href, label: 'App Store' }],
	},
	{
		id: 'substrata-ios',
		name: 'Substrata for iOS',
		art: '/magazine/substrata-shot.webp',
		component: Product,
		links: [],
	},
	{
		id: CLI.id,
		name: CLI.name,
		description: CLI.description,
		component: Terminal,
		links: [{ href: CLI.href, label: 'GitHub' }],
	},
	{
		id: KIT.id,
		name: KIT.name,
		description: KIT.description,
		icon: KIT.icon,
		component: Product,
		links: [{ href: KIT.href, label: 'Open' }],
	},
	{
		id: 'android',
		name: 'delphitools for Android',
		art: '/magazine/android-icon.webp',
		component: Product,
		links: [],
		soon: true,
	},
	{
		id: 'mac',
		name: 'delphitools for Macintosh',
		art: '/magazine/mac-icon.webp',
		component: Product,
		links: [],
		soon: true,
	},
	{
		id: 'cli-2',
		name: 'delphitools CLI 2.0',
		icon: 'square-terminal',
		component: Product,
		links: [],
		soon: true,
	},
	{
		id: 'back-cover',
		name: 'Back cover',
		component: BackCover,
		links: [],
	},
];

export function pageIndex(id: string | undefined): number {
	return Math.max(
		0,
		MAGAZINE_PAGES.findIndex((page) => page.id === id),
	);
}
