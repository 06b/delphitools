// scripts/prerender.mjs imports this file in node: no imports

export interface DocsGroup {
	title: string;
	icon: string;
	names: string[];
}

export type DocsKind =
	| 'overview'
	| 'installation'
	| 'components'
	| 'component'
	| 'patterns'
	| 'pattern'
	| 'screens'
	| 'screen';

export interface DocsPage {
	id: string;
	kind: DocsKind;
	/** Nav row title. */
	title: string;
	/** Page heading, pager and palette title. */
	heading: string;
	section: string;
	url: string;
	icon: string;
	/** The kit module (`canon-slider`), the pattern or screen id (`halves`), else empty. */
	name: string;
}

export const componentGroups: DocsGroup[] = [
	{
		title: 'Layout',
		icon: 'layout-grid',
		names: [
			'canon-bar',
			'canon-canvas',
			'canon-empty-row',
			'canon-grid',
			'canon-heading',
			'canon-jump-heading',
			'canon-page',
			'canon-row',
			'canon-rows',
			'canon-rule',
			'canon-split',
		],
	},
	{
		title: 'Controls',
		icon: 'sliders-horizontal',
		names: [
			'canon-big-number-field',
			'canon-button',
			'canon-decimal-field',
			'canon-drop-zone',
			'canon-dual-list',
			'canon-figure',
			'canon-file-cell',
			'canon-from-to',
			'canon-loader',
			'canon-menu-cell',
			'canon-number-field',
			'canon-segmented',
			'canon-slider',
			'canon-status',
			'canon-stepper',
			'canon-switch',
			'canon-text-area',
			'canon-text-cell',
		],
	},
	{
		title: 'Text',
		icon: 'type',
		names: [
			'canon-code-block',
			'canon-glyph-flow',
			'canon-text-input',
			'canon-text-output',
		],
	},
	{
		title: 'Colour',
		icon: 'palette',
		names: [
			'canon-colour-card',
			'canon-colour-controls',
			'canon-colour-notation-input',
			'canon-colour-solid',
			'canon-colour-strip',
			'canon-colour-well',
			'canon-detent-wheel',
			'canon-detent-wheel-row',
			'canon-loupe',
			'canon-palette-card',
			'canon-swatch',
			'canon-value-line',
		],
	},
	{
		title: 'Maths',
		icon: 'sigma',
		names: [
			'canon-math-editor',
			'canon-math-field',
			'canon-math-input',
			'canon-math-key',
			'canon-math-keypad',
			'canon-math-rail',
			'canon-math-tabs',
			'canon-math-view',
		],
	},
	{
		title: 'Display',
		icon: 'monitor',
		names: [
			'canon-compression-scale',
			'canon-dimension-line',
			'canon-icon',
			'canon-image-compare',
			'canon-lamps',
			'canon-page-strip',
			'canon-preview-panel',
			'canon-readout-band',
			'canon-tiles',
			'canon-timecode',
			'canon-toast',
		],
	},
	{
		title: 'Overlays',
		icon: 'layers',
		names: [
			'canon-command',
			'canon-dialog',
			'canon-jump-grid',
			'canon-sheet',
		],
	},
	{
		title: 'Menus',
		icon: 'menu',
		names: [
			'canon-context-menu',
			'canon-menu',
			'canon-menu-bar',
			'canon-popover',
			'canon-tooltip',
		],
	},
	{
		title: 'Shell',
		icon: 'app-window',
		names: ['canon-sidebar', 'canon-sidebar-row', 'canon-window'],
	},
];

export interface DocsEntry {
	id: string;
	title: string;
	icon: string;
}

/** The home grid's cards first, in grid order, then the tool layouts. */
export const docsPatterns: (DocsEntry & { card: boolean })[] = [
	{ id: 'tone', title: 'Tone', icon: 'audio-lines', card: true },
	{ id: 'swatch', title: 'Swatch', icon: 'pipette', card: true },
	{ id: 'lamps', title: 'Lamps', icon: 'toggle-right', card: true },
	{ id: 'maths', title: 'Maths', icon: 'sigma', card: true },
	{ id: 'paper', title: 'Paper', icon: 'ruler', card: true },
	{ id: 'contrast', title: 'Contrast', icon: 'contrast', card: true },
	{ id: 'timecode', title: 'Timecode', icon: 'clock', card: true },
	{ id: 'palette', title: 'Palette', icon: 'swatch-book', card: true },
	{ id: 'glyphs', title: 'Glyphs', icon: 'type', card: true },
	{ id: 'compare', title: 'Compare', icon: 'git-compare', card: true },
	{ id: 'loaders', title: 'Loaders', icon: 'circle-dashed', card: true },
	{ id: 'columns', title: 'Columns', icon: 'columns-2', card: true },
	{ id: 'halves', title: 'Halves', icon: 'columns-2', card: false },
	{ id: 'banner', title: 'Banner', icon: 'panel-top', card: false },
	{
		id: 'readout-band',
		title: 'Readout band',
		icon: 'audio-lines',
		card: false,
	},
	{
		id: 'drop-slot',
		title: 'Drop slot',
		icon: 'image-plus',
		card: false,
	},
	{ id: 'job-panel', title: 'Job panel', icon: 'download', card: false },
	{ id: 'text-tool', title: 'Text tool', icon: 'text', card: false },
];

export const docsScreens: DocsEntry[] = [
	{ id: 'media-editor', title: 'Media editor', icon: 'clapperboard' },
	{ id: 'colour-picker', title: 'Colour picker', icon: 'pipette' },
	{ id: 'converter', title: 'Converter', icon: 'file-image' },
	{ id: 'settings', title: 'Settings', icon: 'settings' },
];

/** `canon-big-number-field` to `CanonBigNumberField`. */
export const className = (name: string) =>
	name.replace(/(^|-)([a-z])/g, (_, _dash, letter: string) =>
		letter.toUpperCase(),
	);

export const slugOf = (name: string) => name.replace(/^canon-/, '');

export const importLine = (name: string) =>
	`import ${className(name)} from 'delphicanon/components/${name}';`;

export const componentNames = componentGroups.flatMap((group) => group.names);

const entryPages = (
	entries: DocsEntry[],
	kind: 'pattern' | 'screen',
	section: string,
) =>
	entries.map((entry): DocsPage => ({
		id: `${kind}-${entry.id}`,
		kind,
		title: entry.title,
		heading: entry.title,
		section,
		url: `/canon/${kind}s/${entry.id}`,
		icon: entry.icon,
		name: entry.id,
	}));

export const docsPages: DocsPage[] = [
	{
		id: 'overview',
		kind: 'overview',
		title: 'Home',
		heading: 'Home',
		section: '',
		url: '/canon',
		icon: 'home',
		name: '',
	},
	{
		id: 'installation',
		kind: 'installation',
		title: 'Installation',
		heading: 'Installation',
		section: '',
		url: '/canon/installation',
		icon: 'package',
		name: '',
	},
	{
		id: 'components',
		kind: 'components',
		title: 'All components',
		heading: 'Components',
		section: 'Components',
		url: '/canon/components',
		icon: 'component',
		name: '',
	},
	...componentGroups.flatMap((group) =>
		group.names.map((name): DocsPage => ({
			id: name,
			kind: 'component',
			title: className(name).replace(/^Canon/, ''),
			heading: className(name),
			section: group.title,
			url: `/canon/components/${slugOf(name)}`,
			icon: group.icon,
			name,
		})),
	),
	{
		id: 'patterns',
		kind: 'patterns',
		title: 'All patterns',
		heading: 'Patterns',
		section: 'Patterns',
		url: '/canon/patterns',
		icon: 'blocks',
		name: '',
	},
	...entryPages(docsPatterns, 'pattern', 'Patterns'),
	{
		id: 'screens',
		kind: 'screens',
		title: 'All screens',
		heading: 'Screens',
		section: 'Screens',
		url: '/canon/screens',
		icon: 'monitor',
		name: '',
	},
	...entryPages(docsScreens, 'screen', 'Screens'),
];

/** Rows that open a section carry its icon; the entries inside are text only. */
export const opensSection = (page: DocsPage) =>
	!['component', 'pattern', 'screen'].includes(page.kind);

/** The nav's headed runs, in page order; the first has no heading. */
export const docsSections: { title: string; pages: DocsPage[] }[] = [];
for (const page of docsPages) {
	const last = docsSections[docsSections.length - 1];
	if (last?.title === page.section) last.pages.push(page);
	else docsSections.push({ title: page.section, pages: [page] });
}

/** The nav's runs, keeping the pages whose title, heading or section holds every word. */
export function searchDocs(query: string) {
	const words = query.toLowerCase().split(/\s+/).filter(Boolean);
	if (!words.length) return docsSections;
	return docsSections.flatMap((section) => {
		const pages = section.pages.filter((page) => {
			const text =
				`${page.title} ${page.heading} ${page.section}`.toLowerCase();
			return words.every((word) => text.includes(word));
		});
		return pages.length ? [{ title: section.title, pages }] : [];
	});
}

const byId = new Map(docsPages.map((page) => [page.id, page]));

export function pageFor(
	routeName: string | null | undefined,
	params: Record<string, unknown> = {},
): DocsPage | undefined {
	const name = typeof params['name'] === 'string' ? params['name'] : '';
	switch (routeName) {
		case 'canon.index':
			return byId.get('overview');
		case 'canon.installation':
			return byId.get('installation');
		case 'canon.components.index':
			return byId.get('components');
		case 'canon.components.component':
			return byId.get(`canon-${name}`);
		case 'canon.patterns.index':
			return byId.get('patterns');
		case 'canon.patterns.pattern':
			return byId.get(`pattern-${name}`);
		case 'canon.screens.index':
			return byId.get('screens');
		case 'canon.screens.screen':
			return byId.get(`screen-${name}`);
		default:
			return undefined;
	}
}

export function neighbours(page: DocsPage) {
	const index = docsPages.indexOf(page);
	return {
		previous: index > 0 ? docsPages[index - 1] : undefined,
		next: docsPages[index + 1],
	};
}
