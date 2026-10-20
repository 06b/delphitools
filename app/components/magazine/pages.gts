import type { TOC } from '@ember/component/template-only';
import type { ComponentLike } from '@glint/template';
import Icon from 'delphitools-v2/components/icon';
import {
	CanonFeatureLeft,
	CanonFeatureRight,
} from 'delphitools-v2/components/magazine/canon-feature';
import { CANON_KIT_ID, getToolById } from 'delphitools-v2/lib/tools';
import './pages.css';

/** CSS px of one page; the textures scale from this. */
export const PAGE_WIDTH = 600;
export const PAGE_HEIGHT = 800;

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
	/** Listed on the contents page. */
	listed?: boolean;
	/** Words printed in a full-page image, for screen readers. */
	printed?: string[];
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

// a full-bleed image page; its printed words stay readable for screen readers
const Plate: TOC<PageSignature> = <template>
	<div class="dt-mag-plate">
		<img class="dt-mag-plate-art" src={{@page.art}} alt="" />
		{{#each @page.printed as |line|}}
			<p class="dt-sr-only">{{line}}</p>
		{{/each}}
	</div>
</template>;

// a plate with Apple's badge in the space the art leaves for it
const AppStorePlate: TOC<PageSignature> = <template>
	<div class="dt-mag-plate">
		<img class="dt-mag-plate-art" src={{@page.art}} alt="" />
		{{#each @page.printed as |line|}}
			<p class="dt-sr-only">{{line}}</p>
		{{/each}}
		<div class="dt-mag-store">
			{{#each @page.links as |link|}}
				<a
					href={{link.href}}
					class="dt-mag-store-badge"
					target="_blank"
					rel="noopener noreferrer"
					data-magazine-link
				><img
						src="/magazine/app-store-badge.svg"
						alt={{link.label}}
					/></a>
			{{/each}}
			<p>Visit the App Store today</p>
		</div>
	</div>
</template>;

const pageNumber = (pages: MagazinePage[], page: MagazinePage) =>
	pages.indexOf(page) + 1;
const anchor = (page: MagazinePage) => ({
	href: `#${page.id}`,
	label: page.name,
});
const listed = (pages: MagazinePage[]) => pages.filter((page) => page.listed);

const Contents: TOC<PageSignature> = <template>
	<div class="dt-mag-contents">
		<h2 class="dt-mag-title">Contents</h2>
		<ol class="dt-mag-toc">
			{{#each (listed @pages) as |entry|}}
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
		<section class="dt-mag-editorial">
			<img
				class="dt-mag-editor"
				src="/magazine/editor.webp"
				alt=""
			/>
			<h3 class="dt-mag-kicker">From the editor</h3>
			<p class="dt-mag-letter">DELPHI MAGAZINE's readers like
				to stay on the leading edge of technology and to
				try things for themselves. We think this issue
				offers extraordinary opportunities for you to
				discover some of the most exciting developments
				at the forefront of independent digital
				toolcrafting. The new Substrata Image Editor for
				Apple's iOS platform is a tool that will
				rekindle your love to create on the go. We would
				love to know what you think, and hope you enjoy
				this and the many new changes in delphitools 2.3
				and delphitools for iOS 2.0.</p>
		</section>
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
		component: Plate,
		art: '/magazine/cover.webp',
		printed: ['DELPHI MAGAZINE', 'THE MULTIPLATFORM FRONTIER'],
		links: [],
	},
	{
		id: 'substrata-ad',
		name: 'Substrata',
		component: Plate,
		art: '/magazine/substrata-ad.webp',
		printed: [
			"AND YOU THOUGHT YOU COULDN'T GET DIGITAL PAINT THAT'S THIS REALISTIC.",
			'Based on the work of industry legends, Substrata comes with real time fluid-simulated paint approximation. Oil, Watercolour, Acrylic and more, computed on your device in real time. Substrata is unmatched in speed, simulation fidelity and freedom of choice. And, of course, it has the best colour blending system imaginable. No muddy colours, no drab browns. And all this at an unbeatable price: Free.',
		],
		links: [],
	},
	{ id: 'contents', name: 'Contents', component: Contents, links: [] },
	{
		id: IOS.id,
		name: IOS.name,
		component: Plate,
		art: '/magazine/ios-left.webp',
		listed: true,
		links: [],
	},
	{
		id: 'ios-app-feature',
		name: IOS.name,
		component: AppStorePlate,
		art: '/magazine/ios-right.webp',
		printed: [
			'Looking good.',
			'Federal regulations require us to inform you that delphitools for iOS 2.0 is... looking pretty good.',
			"Featuring full tool parity with the web version, completely redesigned tool interfaces, Metal-accelerated 3D elements, a completely custom implementation of the new Canon design language in UIKit and the low low price of completely free, you'd be a fool not to download this free update.",
			"And it doesn't end there. We also fully support your iPad-brand tablet computer and the new iPhone Duo pocket terminal. Take your tools on the go.",
			"With delphitools-iOS 2.0's new redesigned tool interfaces, you'll finally enjoy the digital chores you've been going to shady websites for. Quicker access to tools and an intuitive search interface make it easy to find what you're looking for, and save time doing it.",
			"If you've been looking at truly convenient open source software designed with love and care by industry professionals, compare them with delphitools. You'll be amazed what it can do.",
		],
		links: [{ href: IOS.href, label: 'Download on the App Store' }],
	},
	{
		id: 'canon-feature',
		name: 'delphitools 2.3',
		component: CanonFeatureLeft,
		listed: true,
		links: [],
	},
	{
		id: 'canon-feature-2',
		name: 'delphitools 2.3',
		component: CanonFeatureRight,
		links: [{ href: KIT.href, label: 'Open the kit' }],
	},
	{
		id: 'substrata-ios',
		name: 'Substrata for iOS',
		art: '/magazine/substrata-shot.webp',
		component: Product,
		listed: true,
		links: [],
	},
	{
		id: CLI.id,
		name: CLI.name,
		description: CLI.description,
		component: Terminal,
		listed: true,
		links: [{ href: CLI.href, label: 'GitHub' }],
	},
	{
		id: KIT.id,
		name: KIT.name,
		description: KIT.description,
		icon: KIT.icon,
		component: Product,
		listed: true,
		links: [{ href: KIT.href, label: 'Open' }],
	},
	{
		id: 'android',
		name: 'delphitools for Android',
		art: '/magazine/android-icon.webp',
		component: Product,
		listed: true,
		links: [],
		soon: true,
	},
	{
		id: 'mac',
		name: 'delphitools for Macintosh',
		art: '/magazine/mac-icon.webp',
		component: Product,
		listed: true,
		links: [],
		soon: true,
	},
	{
		id: 'cli-2',
		name: 'delphitools CLI 2.0',
		icon: 'square-terminal',
		component: Product,
		listed: true,
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
