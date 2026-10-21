import type { TOC } from '@ember/component/template-only';
import type { ComponentLike } from '@glint/template';
import {
	CanonFeatureLeft,
	CanonFeatureRight,
	text,
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
	/** Small capitals above the page. */
	kicker?: string;
	/** Window screenshots in public/magazine, overlapping. */
	shots?: string[];
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

// two overlapping window shots
const Shots: TOC<PageSignature> = <template>
	<div class="dt-mag-product">
		{{#if @page.kicker}}
			<p class="dt-mag-kicker">{{@page.kicker}}</p>
		{{/if}}
		<div class="dt-mag-shots">
			{{#each @page.shots as |shot|}}
				<img src={{shot}} alt="" />
			{{/each}}
		</div>
		{{#if @page.description}}
			<p class="dt-mag-description">{{@page.description}}</p>
		{{/if}}
	</div>
</template>;

type Ad = { copy: string; words: number } | { art: string; printed: string };

const ADS: Ad[] = [
	{
		// ∑CG: classified ad 1 on the advertising page, the largest ad, top of the first column
		//   spec: 48 words, a magazine classified: an uppercase lead word or two (WANTED, FOR SALE, LOST) then the ad, deadpan, about delphitools or its makers
		//   sample: "WANTED: one (1) Android phone owner with patience. Must enjoy waiting. Reward: delphitools, eventually, around Christmas."
		copy: '∑CG',
		words: 48,
	},
	{
		art: '/magazine/ad-xbox.png',
		printed: 'ACCEPT GARBAJCAM INTO YOUR HEART AND WIN A FREE XBOX. CLICK HERE',
	},
	{
		// ∑CG: classified ad 3 on the advertising page, a mid-size ad
		//   spec: 36 words, a magazine classified: an uppercase lead word or two (WANTED, FOR SALE, LOST) then the ad, deadpan, about delphitools or its makers
		//   sample: "LOST: my favourite colour palette. Last seen in a terminal. Five swatches, answers to random-cohesive. Please return to the palette generator."
		copy: '∑CG',
		words: 36,
	},
	{
		// ∑CG: classified ad 4 on the advertising page, a short ad
		//   spec: 40 words, a magazine classified: an uppercase lead word or two (WANTED, FOR SALE, LOST) then the ad, deadpan, about delphitools or its makers
		//   sample: "PEN PALS: Shavian enthusiast seeks same for letters. Must be able to read this ad."
		copy: '∑CG',
		words: 40,
	},
	{
		// ∑CG: classified ad 5 on the advertising page, the smallest ad
		//   spec: 32 words, a magazine classified: an uppercase lead word or two (WANTED, FOR SALE, LOST) then the ad, deadpan, about delphitools or its makers
		//   sample: "FREE to good home: 0BSD licence. Take as many as you like."
		copy: '∑CG',
		words: 32,
	},
	{
		// ∑CG: classified ad 6 on the advertising page, a mid-size ad, bottom of the second column
		//   spec: 48 words, a magazine classified: an uppercase lead word or two (WANTED, FOR SALE, LOST) then the ad, deadpan, about delphitools or its makers
		//   sample: "SERVICES: privacy-first utilities, all local, no logins. Fifty-five tools and counting. Visit any browser, any time."
		copy: '∑CG',
		words: 48,
	},
];

const isArt = (ad: Ad): ad is Extract<Ad, { art: string }> => 'art' in ad;

const Classifieds: TOC<PageSignature> = <template>
	<div class="dt-mag-product">
		<h2 class="dt-mag-title">{{@page.name}}</h2>
		<div class="dt-mag-ads">
			{{#each ADS as |ad|}}
				{{#if (isArt ad)}}
					<div class="dt-mag-ad dt-mag-ad-art">
						<img src={{ad.art}} alt="" />
						<p
							class="dt-sr-only"
						>{{ad.printed}}</p>
					</div>
				{{else}}
					<p class="dt-mag-ad">{{text
							ad.copy
							ad.words
						}}</p>
				{{/if}}
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
		id: 'android-ad',
		name: 'delphitools for Android',
		component: Plate,
		art: '/magazine/android-ad.webp',
		printed: [
			'NOW YOU CAN EXTEND THE BLESSINGS OF DELPHITOOLS TO LESS PRIVILEGED PLATFORMS.',
			'DELPHITOOLS FOR ANDROID. COMING CHRISTMAS 2026.',
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
		component: Plate,
		art: '/magazine/freetone-ad.webp',
		printed: [
			'FREETONE by Stuart Semple',
			'Now your Substrata Image Editing Suite can display beautiful, free colours.',
			'All FREETONE swatches are graciously provided by Stuart Semple and are free to use within Substrata.',
		],
		listed: true,
		links: [],
	},
	{
		id: 'substrata-ios-feature',
		name: 'Substrata for iOS',
		component: Plate,
		art: '/magazine/substrata-paint.webp',
		printed: [
			"AND YOU THOUGHT YOU COULDN'T GET DIGITAL PAINT THAT'S THIS REALISTIC.",
			"Yes, the above is NOT prerendered. It's not a photo. It's not some expensive fluid simulation system rendered on a Silicon Graphics compute farm.",
			'This is realtime rendered digital paint, in Substrata for iOS.',
			"Based on the work of Kubelka, Munk, Chu, Baxter and Liu, delphitools is proud to offer full realtime fluid paint simulation with a world's first - multicoloured brushes. Yes, you heard right - dip your brushes in oil paint, watercolours, acrylic, gouache and ink just how you would in real life, just without the mess. Layer paint on top of paint with the world's most realistic impasto simulation, all completely free and open-source. No expensive specialty programs, no complex user interfaces, just you and your art.",
			"Substrata matches Rebelle and Procreate in performance and beats them on price: Because it's free.",
		],
		links: [],
	},
	{
		id: 'cli-2',
		name: 'delphitools CLI 2.0',
		component: Plate,
		art: '/magazine/cli-2-ad.webp',
		printed: [
			'Rust is for old iron. We bet on Go.',
			'delphitools CLI 2.0. Rewritten. Coming Q4 2026.',
		],
		listed: true,
		links: [],
	},
	{
		id: CLI.id,
		name: 'Vito',
		description:
			'delphitools CLI 2.0 with the new Vito TUI enabled',
		component: Shots,
		shots: [
			'/magazine/vito-help.webp',
			'/magazine/vito-palette.webp',
		],
		listed: true,
		links: [],
	},
	{
		id: KIT.id,
		name: KIT.name,
		component: Plate,
		art: '/magazine/kit-left.webp',
		listed: true,
		links: [],
	},
	{
		id: 'canon-ui-kit-2',
		name: KIT.name,
		component: Plate,
		art: '/magazine/kit-right.webp',
		printed: [
			'Retcon your app.',
			'CANON UI KIT',
			'Available for Ember, Svelte, Vue, React, UIKit and Jetpack Compose',
		],
		links: [],
	},
	{
		id: 'android',
		name: 'delphitools for Android',
		component: Plate,
		art: '/magazine/android-left.webp',
		listed: true,
		links: [],
	},
	{
		id: 'android-2',
		name: 'delphitools for Android',
		component: Plate,
		art: '/magazine/android-right.webp',
		printed: ['XMAS 2026', 'NOW STOP BOTHERING ME'],
		links: [],
	},
	{
		id: 'mac',
		name: 'delphitools for Macintosh',
		kicker: 'A SNEAK PEEK AT DELPHITOOLS FOR MACINTOSH COMPUTERS',
		component: Shots,
		shots: [
			'/magazine/mac-clipboard.webp',
			'/magazine/mac-toolbox.webp',
		],
		listed: true,
		links: [],
	},
	{
		id: 'classifieds',
		name: 'Classifieds',
		component: Classifieds,
		links: [],
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
