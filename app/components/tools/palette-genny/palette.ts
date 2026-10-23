import {
	STRATEGY_INFO,
	type PaletteCategory,
	type PaletteStrategy,
} from 'delphitools-v2/lib/palette-strategies';

export const MIN_COLOURS = 2;
export const MAX_COLOURS = 11;

/** The categories in the iOS order, with its segment titles. */
export const CATEGORIES: { key: PaletteCategory; title: string }[] = [
	{ key: 'random', title: 'Random' },
	{ key: 'color-theory', title: 'Theory' },
	{ key: 'mood', title: 'Mood' },
	{ key: 'era', title: 'Era' },
	{ key: 'nature', title: 'Nature' },
	{ key: 'cultural', title: 'Cultural' },
];

export const strategiesIn = (category: PaletteCategory) =>
	(Object.keys(STRATEGY_INFO) as PaletteStrategy[]).filter(
		(key) => STRATEGY_INFO[key].category === category,
	);

// share-link format
export function coloursFromQuery(search: string): string[] | null {
	const param = new URLSearchParams(search).get('colors');
	if (!param) return null;
	const hexes = param
		.split(',')
		.map((c) => c.trim())
		.map((c) => (c.startsWith('#') ? c : `#${c}`))
		.filter((c) => /^#[a-f\d]{6}$/i.test(c));
	return hexes.length >= MIN_COLOURS ? hexes : null;
}

/**
 * The iOS launch arguments as query flags, beside the ?colors= share link:
 * ?gennyStrategy=<id> ?gennyLocked=<index,index> ?gennyFocus=<index>.
 */
export function launchFlags(search: string) {
	const query = new URLSearchParams(search);
	const asked = query.get('gennyStrategy') as PaletteStrategy | null;
	const focus = Number(query.get('gennyFocus') ?? NaN);
	return {
		colours: coloursFromQuery(search),
		strategy: asked && asked in STRATEGY_INFO ? asked : undefined,
		locked: (query.get('gennyLocked') ?? '')
			.split(',')
			.filter((part) => /^\d+$/.test(part.trim()))
			.map(Number),
		focus: Number.isInteger(focus) ? focus : undefined,
	};
}

/** `:root` custom properties, one per colour, as the web tool copied them. */
export const cssBlock = (values: string[]) =>
	`:root {\n${values
		.map((value, i) => `  --palette-${i + 1}: ${value};`)
		.join('\n')}\n}`;

// slug mirrors collection file
export const slug = (name: string) =>
	name
		.toLowerCase()
		.replace(/[^a-z0-9\s-]/g, '')
		.replace(/\s+/g, '-')
		.replace(/-+/g, '-')
		.trim();

/** One hex per line, with or without a hash; null below the minimum. */
export function hexesFromLines(text: string): string[] | null {
	const parsed = text
		.trim()
		.split('\n')
		.map((line) => line.trim().replace(/^#/, ''))
		.filter((hex) => /^[a-f\d]{6}$/i.test(hex))
		.map((hex) => `#${hex}`);
	return parsed.length >= MIN_COLOURS ? parsed : null;
}
