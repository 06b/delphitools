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
	| 'blocks'
	| 'block';

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
	/** The kit module (`canon-slider`), the block id (`halves`), else empty. */
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

export const docsBlocks: { id: string; title: string; icon: string }[] = [
	{ id: 'halves', title: 'Halves', icon: 'columns-2' },
	{ id: 'banner', title: 'Banner', icon: 'panel-top' },
	{ id: 'readout-band', title: 'Readout band', icon: 'audio-lines' },
	{ id: 'drop-slot', title: 'Drop slot', icon: 'image-plus' },
	{ id: 'job-panel', title: 'Job panel', icon: 'download' },
	{ id: 'text-tool', title: 'Text tool', icon: 'text' },
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

const started = 'Getting started';

export const docsPages: DocsPage[] = [
	{
		id: 'overview',
		kind: 'overview',
		title: 'Overview',
		heading: 'Overview',
		section: started,
		url: '/canon',
		icon: 'book-open',
		name: '',
	},
	{
		id: 'installation',
		kind: 'installation',
		title: 'Installation',
		heading: 'Installation',
		section: started,
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
		id: 'blocks',
		kind: 'blocks',
		title: 'All blocks',
		heading: 'Blocks',
		section: 'Blocks',
		url: '/canon/blocks',
		icon: 'blocks',
		name: '',
	},
	...docsBlocks.map((block): DocsPage => ({
		id: `block-${block.id}`,
		kind: 'block',
		title: block.title,
		heading: block.title,
		section: 'Blocks',
		url: `/canon/blocks/${block.id}`,
		icon: block.icon,
		name: block.id,
	})),
];

/** The nav's headed runs, in page order. */
export const docsSections: { title: string; pages: DocsPage[] }[] = [];
for (const page of docsPages) {
	const last = docsSections[docsSections.length - 1];
	if (last?.title === page.section) last.pages.push(page);
	else docsSections.push({ title: page.section, pages: [page] });
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
		case 'canon.blocks.index':
			return byId.get('blocks');
		case 'canon.blocks.block':
			return byId.get(`block-${name}`);
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
