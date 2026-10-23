export const OG_TYPES = ['website', 'article', 'product'];
export const TWITTER_CARDS = ['summary', 'summary_large_image'];
/** Where search results cut the title and the description. */
export const LIMITS = { title: 60, description: 160 };

export interface MetaFields {
	title: string;
	description: string;
	keywords: string;
	author: string;
	url: string;
	image: string;
	siteName: string;
	twitterHandle: string;
	ogType: string;
	twitterCard: string;
}

// unescaped quotes broke tags
function escapeAttribute(value: string): string {
	return value
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
}

/** MetaTagGeneratorViewModel.generatedHTML, with the web tool's title meta and twitter:url kept. */
export function generateMetaTags(fields: MetaFields): string {
	const e = escapeAttribute;
	const { title, description, keywords, author, url, image } = fields;
	const lines: string[] = [];
	const add = (when: string, line: string) => {
		if (when) lines.push(line);
	};

	add(title, `<title>${e(title)}</title>`);
	add(title, `<meta name="title" content="${e(title)}">`);
	add(
		description,
		`<meta name="description" content="${e(description)}">`,
	);
	add(keywords, `<meta name="keywords" content="${e(keywords)}">`);
	add(author, `<meta name="author" content="${e(author)}">`);
	add(url, `<link rel="canonical" href="${e(url)}">`);

	lines.push('', '<!-- Open Graph -->');
	add(title, `<meta property="og:title" content="${e(title)}">`);
	add(
		description,
		`<meta property="og:description" content="${e(description)}">`,
	);
	lines.push(`<meta property="og:type" content="${e(fields.ogType)}">`);
	add(url, `<meta property="og:url" content="${e(url)}">`);
	add(image, `<meta property="og:image" content="${e(image)}">`);
	add(
		fields.siteName,
		`<meta property="og:site_name" content="${e(fields.siteName)}">`,
	);

	lines.push('', '<!-- Twitter Card -->');
	lines.push(
		`<meta name="twitter:card" content="${e(fields.twitterCard)}">`,
	);
	add(url, `<meta name="twitter:url" content="${e(url)}">`);
	add(title, `<meta name="twitter:title" content="${e(title)}">`);
	add(
		description,
		`<meta name="twitter:description" content="${e(description)}">`,
	);
	add(image, `<meta name="twitter:image" content="${e(image)}">`);
	add(
		fields.twitterHandle,
		`<meta name="twitter:creator" content="${e(fields.twitterHandle)}">`,
	);

	return lines.join('\n');
}

function parse(address: string): URL | undefined {
	try {
		return new URL(address.trim());
	} catch {
		return undefined;
	}
}

/** The host of a page address without a leading www; empty when there is none. */
export function host(address: string): string {
	return parse(address)?.hostname.replace(/^www\./, '') ?? '';
}

/** The address as a trail: the host, then each path part after a chevron; empty without a host. */
export function trail(address: string): string {
	const url = parse(address);
	if (!url?.hostname) return '';
	const parts = url.pathname.split('/').filter(Boolean);
	return [`${url.protocol}//${url.hostname}`, ...parts].join(' › ');
}

/** Text cut after `limit` characters at the last word break, with an ellipsis. */
export function cut(text: string, limit: number): string {
	const chars = [...text];
	if (chars.length <= limit) return text;
	const head = chars.slice(0, limit).join('');
	const space = head.lastIndexOf(' ');
	const word = space < 0 ? head : head.slice(0, space);
	return `${word.replace(/^[\s\p{P}]+|[\s\p{P}]+$/gu, '')} …`;
}

/** The last part of the image address, else the size the card wants. */
export function imageLabel(address: string, large: boolean): string {
	const last = parse(address)?.pathname.split('/').filter(Boolean).at(-1);
	return last ?? (large ? '1200 × 630' : '144 × 144');
}
