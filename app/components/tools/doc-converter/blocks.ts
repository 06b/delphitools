/**
 * The block model behind the ledger picture (iOS DocConvert.Block and
 * DocConvertLedger): Markdown and HTML read locally, any other source
 * through Pandoc's JSON AST, and a one-line sample per output format.
 */

export interface Inline {
	text: string;
	bold?: boolean;
	italic?: boolean;
	code?: boolean;
	link?: string;
}

export type Block =
	| { kind: 'heading'; level: number; runs: Inline[] }
	| { kind: 'paragraph'; runs: Inline[] }
	| { kind: 'list'; ordered: boolean; items: Inline[][] }
	| { kind: 'quote'; runs: Inline[] }
	| { kind: 'code'; text: string }
	| { kind: 'rule' };

export const ELEMENTS = [
	'heading',
	'paragraph',
	'bullets',
	'numbered',
	'quote',
	'code',
	'rule',
	'bold',
	'italic',
	'codeSpan',
	'link',
] as const;

export type LedgerElement = (typeof ELEMENTS)[number];

export const MARKS: Record<LedgerElement, string> = {
	heading: 'H',
	paragraph: '¶',
	bullets: '•',
	numbered: '1.',
	quote: '“',
	code: '{ }',
	rule: '—',
	bold: 'B',
	italic: 'I',
	codeSpan: '` `',
	link: '↗',
};

export interface Row {
	element: LedgerElement;
	count: number;
	example: Block;
}

function headingParts(line: string): [number, string] | null {
	const hashes = /^#*/.exec(line)![0].length;
	if (hashes < 1 || hashes > 6) return null;
	const rest = line.slice(hashes);
	if (rest && !rest.startsWith(' ')) return null;
	return [hashes, rest.trim().replace(/#+$/, '').trim()];
}

// commonmark setext underline
function setextLevel(line: string): number | null {
	return /^(=+|-+)$/.test(line) && line.length >= 2
		? line[0] === '='
			? 1
			: 2
		: null;
}

function isRule(line: string): boolean {
	return /^([-*_])\1{2,}$/.test(line.replaceAll(' ', ''));
}

function bulletBody(line: string): string | null {
	return /^[-*+] /.test(line) ? line.slice(2) : null;
}

function orderedBody(line: string): string | null {
	const match = /^\d+[.)] /.exec(line);
	return match ? line.slice(match[0].length) : null;
}

export function parseMarkdown(source: string): Block[] {
	const blocks: Block[] = [];
	const lines = source.replaceAll('\r\n', '\n').split('\n');
	let paragraph: string[] = [];
	let index = 0;

	const flush = () => {
		if (!paragraph.length) return;
		blocks.push({
			kind: 'paragraph',
			runs: parseInline(paragraph.join(' ')),
		});
		paragraph = [];
	};

	while (index < lines.length) {
		const line = lines[index]!.trim();
		if (!line) {
			flush();
			index++;
			continue;
		}
		if (line.startsWith('```') || line.startsWith('~~~')) {
			flush();
			const fence = line.slice(0, 3);
			const body: string[] = [];
			index++;
			while (
				index < lines.length &&
				!lines[index]!.trim().startsWith(fence)
			)
				body.push(lines[index++]!);
			if (index < lines.length) index++;
			blocks.push({ kind: 'code', text: body.join('\n') });
			continue;
		}
		const heading = headingParts(line);
		if (heading) {
			flush();
			index++;
			blocks.push({
				kind: 'heading',
				level: heading[0],
				runs: parseInline(heading[1]),
			});
			continue;
		}
		const setext = paragraph.length ? setextLevel(line) : null;
		if (setext) {
			const runs = parseInline(paragraph.join(' '));
			paragraph = [];
			index++;
			blocks.push({ kind: 'heading', level: setext, runs });
			continue;
		}
		if (isRule(line)) {
			flush();
			index++;
			blocks.push({ kind: 'rule' });
			continue;
		}
		if (line.startsWith('>')) {
			flush();
			const body: string[] = [];
			while (index < lines.length) {
				const quoted = lines[index]!.trim();
				if (!quoted.startsWith('>')) break;
				body.push(quoted.slice(1).trim());
				index++;
			}
			blocks.push({
				kind: 'quote',
				runs: parseInline(body.join(' ')),
			});
			continue;
		}
		if (bulletBody(line) !== null || orderedBody(line) !== null) {
			const ordered = bulletBody(line) === null;
			flush();
			const items: Inline[][] = [];
			while (index < lines.length) {
				const item = lines[index]!.trim();
				const body = ordered
					? orderedBody(item)
					: bulletBody(item);
				if (body === null) break;
				items.push(parseInline(body));
				index++;
			}
			blocks.push({ kind: 'list', ordered, items });
			continue;
		}
		paragraph.push(line);
		index++;
	}
	flush();
	return blocks;
}

const letter = /\p{L}/u;

export function parseInline(source: string): Inline[] {
	const runs: Inline[] = [];
	const chars = Array.from(source);
	let buffer = '';
	let index = 0;
	// forward-only: an unclosed `[` would rescan the rest for every bracket
	let bracketCursor = 0;

	const flush = () => {
		if (buffer) runs.push({ text: buffer });
		buffer = '';
	};
	const find = (needle: string, from: number) => {
		const at = chars.indexOf(needle, from);
		return at < 0 ? null : at;
	};
	const findMarker = (marker: string, from: number) => {
		for (let at = from; at + marker.length <= chars.length; at++)
			if (
				chars.slice(at, at + marker.length).join('') ===
				marker
			)
				return at;
		return null;
	};
	const closeBracket = (from: number) => {
		bracketCursor = Math.max(bracketCursor, from);
		while (
			bracketCursor < chars.length &&
			chars[bracketCursor] !== ']'
		)
			bracketCursor++;
		return bracketCursor < chars.length ? bracketCursor : null;
	};

	while (index < chars.length) {
		const char = chars[index]!;
		if (char === '\\' && index + 1 < chars.length) {
			buffer += chars[index + 1];
			index += 2;
			continue;
		}
		if (char === '`') {
			const end = find('`', index + 1);
			if (end !== null && end > index + 1) {
				flush();
				runs.push({
					text: chars
						.slice(index + 1, end)
						.join(''),
					code: true,
				});
				index = end + 1;
				continue;
			}
		}
		if (char === '*' || char === '_') {
			const doubled = chars[index + 1] === char;
			const marker = doubled ? char + char : char;
			const size = marker.length;
			// commonmark: no intraword emphasis
			const boundary =
				char === '*' ||
				index === 0 ||
				!letter.test(chars[index - 1]!);
			const end = boundary
				? findMarker(marker, index + size)
				: null;
			if (
				end !== null &&
				end > index + size &&
				(char === '*' ||
					end + size >= chars.length ||
					!letter.test(chars[end + size]!))
			) {
				flush();
				for (const run of parseInline(
					chars.slice(index + size, end).join(''),
				))
					runs.push(
						doubled
							? { ...run, bold: true }
							: {
									...run,
									italic: true,
								},
					);
				index = end + size;
				continue;
			}
		}
		if (char === '[') {
			const close = closeBracket(index + 1);
			const paren =
				close !== null && chars[close + 1] === '('
					? find(')', close + 2)
					: null;
			if (close !== null && paren !== null) {
				const link = chars
					.slice(close + 2, paren)
					.join('');
				flush();
				for (const run of parseInline(
					chars.slice(index + 1, close).join(''),
				))
					runs.push({ ...run, link });
				index = paren + 1;
				continue;
			}
		}
		buffer += char;
		index++;
	}
	flush();
	return runs;
}

export function parseHtml(source: string): Block[] {
	const body = new DOMParser().parseFromString(source, 'text/html').body;
	const blocks: Block[] = [];
	let runs: Inline[] = [];
	let text = '';
	let bold = 0;
	let italic = 0;
	let code = 0;
	let link: string | undefined;
	let pending: string | null = null;
	let level = 1;
	let items: Inline[][] = [];
	let ordered = false;
	let inList = false;

	const flushText = () => {
		if (!text) return;
		const run: Inline = { text };
		if (bold) run.bold = true;
		if (italic) run.italic = true;
		if (code) run.code = true;
		if (link !== undefined) run.link = link;
		runs.push(run);
		text = '';
	};
	const closeBlock = () => {
		flushText();
		const content = runs;
		const kind = pending;
		runs = [];
		pending = null;
		if (content.every((run) => !run.text.trim())) return;
		if (kind === 'li') items.push(content);
		else if (kind === 'pre')
			blocks.push({
				kind: 'code',
				text: content.map((run) => run.text).join(''),
			});
		else if (kind === 'blockquote')
			blocks.push({ kind: 'quote', runs: content });
		else if (kind === 'h')
			blocks.push({ kind: 'heading', level, runs: content });
		else blocks.push({ kind: 'paragraph', runs: content });
	};
	const closeList = () => {
		closeBlock();
		if (items.length) blocks.push({ kind: 'list', ordered, items });
		items = [];
		inList = false;
	};
	const tag = (
		element: Element | null,
		name: string,
		closing: boolean,
	) => {
		switch (name) {
			case 'p':
			case 'div':
			case 'blockquote':
			case 'pre':
			case 'li':
			case 'h1':
			case 'h2':
			case 'h3':
			case 'h4':
			case 'h5':
			case 'h6':
				closeBlock();
				if (closing) break;
				if (name[0] === 'h') {
					pending = 'h';
					level = Number(name[1]);
				} else pending = name === 'div' ? 'p' : name;
				break;
			case 'ul':
			case 'ol':
				if (closing) {
					closeList();
					break;
				}
				if (inList) closeList();
				closeBlock();
				inList = true;
				ordered = name === 'ol';
				items = [];
				break;
			case 'hr':
				if (closing) break;
				closeBlock();
				blocks.push({ kind: 'rule' });
				break;
			case 'br':
				if (!closing) text += ' ';
				break;
			case 'strong':
			case 'b':
				flushText();
				bold = Math.max(0, bold + (closing ? -1 : 1));
				break;
			case 'em':
			case 'i':
				flushText();
				italic = Math.max(
					0,
					italic + (closing ? -1 : 1),
				);
				break;
			case 'code':
				flushText();
				code = Math.max(0, code + (closing ? -1 : 1));
				break;
			case 'a':
				flushText();
				if (closing) link = undefined;
				else if (element?.hasAttribute('href'))
					link = element.getAttribute('href')!;
				break;
		}
	};
	const walk = (node: Node) => {
		for (const child of node.childNodes) {
			if (child.nodeType === Node.TEXT_NODE) {
				const raw = child.nodeValue ?? '';
				const collapsed =
					pending === 'pre'
						? raw
						: raw.replace(/\s+/g, ' ');
				// keeps inter-tag word gaps
				if (!collapsed.trim()) {
					if (runs.length || text) text += ' ';
				} else text += collapsed;
			} else if (child instanceof window.Element) {
				const name = child.localName;
				if (
					name === 'script' ||
					name === 'style' ||
					name === 'template'
				)
					continue;
				tag(child, name, false);
				walk(child);
				tag(null, name, true);
			}
		}
	};
	walk(body);
	// `<li>` outside any list still has items to flush
	closeList();
	return blocks;
}

interface PandocNode {
	t: string;
	c?: unknown;
}

type Marks = Omit<Inline, 'text'>;

function astInlines(nodes: unknown, marks: Marks = {}): Inline[] {
	const out: Inline[] = [];
	const push = (text: string, more: Marks = {}) => {
		const run = { ...marks, ...more, text };
		const last = out.at(-1);
		if (
			last &&
			!!last.bold === !!run.bold &&
			!!last.italic === !!run.italic &&
			!!last.code === !!run.code &&
			last.link === run.link
		)
			last.text += text;
		else out.push(run);
	};
	const nested = (inner: unknown, more: Marks) => {
		for (const run of astInlines(inner, { ...marks, ...more }))
			push(run.text, run);
	};
	for (const node of (nodes as PandocNode[] | undefined) ?? []) {
		const c = node.c as unknown[];
		switch (node.t) {
			case 'Str':
				push(node.c as string);
				break;
			case 'Space':
			case 'SoftBreak':
			case 'LineBreak':
				push(' ');
				break;
			case 'Strong':
				nested(c, { bold: true });
				break;
			case 'Emph':
				nested(c, { italic: true });
				break;
			case 'Code':
				push(c[1] as string, { code: true });
				break;
			case 'Math':
				push(c[1] as string);
				break;
			case 'Link':
				nested(c[1], { link: (c[2] as string[])[0] });
				break;
			case 'Image':
			case 'Span':
			case 'Quoted':
			case 'Cite':
				nested(c[1], {});
				break;
			case 'Underline':
			case 'Strikeout':
			case 'Superscript':
			case 'Subscript':
			case 'SmallCaps':
				nested(c, {});
				break;
		}
	}
	return out;
}

function astText(blocks: PandocNode[]): Inline[] {
	const runs: Inline[] = [];
	for (const block of blocks) {
		if (block.t === 'Para' || block.t === 'Plain') {
			if (runs.length) runs.push({ text: ' ' });
			runs.push(...astInlines(block.c));
		}
	}
	return runs;
}

export function parsePandocJson(json: string): Block[] {
	const blocks: Block[] = [];
	const walk = (nodes: PandocNode[]) => {
		for (const node of nodes) {
			const c = node.c as unknown[];
			switch (node.t) {
				case 'Header':
					blocks.push({
						kind: 'heading',
						level: c[0] as number,
						runs: astInlines(c[2]),
					});
					break;
				case 'Para':
				case 'Plain':
					blocks.push({
						kind: 'paragraph',
						runs: astInlines(node.c),
					});
					break;
				case 'BlockQuote':
					blocks.push({
						kind: 'quote',
						runs: astText(
							node.c as PandocNode[],
						),
					});
					break;
				case 'BulletList':
				case 'OrderedList': {
					const items = (
						node.t === 'BulletList'
							? c
							: c[1]
					) as PandocNode[][];
					blocks.push({
						kind: 'list',
						ordered:
							node.t ===
							'OrderedList',
						items: items.map(astText),
					});
					break;
				}
				case 'CodeBlock':
					blocks.push({
						kind: 'code',
						text: c[1] as string,
					});
					break;
				case 'HorizontalRule':
					blocks.push({ kind: 'rule' });
					break;
				case 'Div':
					walk(c[1] as PandocNode[]);
					break;
				case 'Figure':
					walk(c[2] as PandocNode[]);
					break;
			}
		}
	};
	walk((JSON.parse(json) as { blocks?: PandocNode[] }).blocks ?? []);
	return blocks;
}

/** Markdown and HTML sources read live; null for those only Pandoc reads. */
export const readsLocally = (format: string) =>
	['html', 'markdown', 'gfm', 'commonmark'].includes(format);

export function parseLocally(source: string, format: string): Block[] | null {
	if (!readsLocally(format)) return null;
	return format === 'html' ? parseHtml(source) : parseMarkdown(source);
}

export function ledgerRows(blocks: Block[]): Row[] {
	const counts = new Map<LedgerElement, number>();
	const examples = new Map<LedgerElement, Block>();
	const add = (element: LedgerElement, example: () => Block) => {
		counts.set(element, (counts.get(element) ?? 0) + 1);
		if (!examples.has(element)) examples.set(element, example());
	};
	const inline = (runs: Inline[]) => {
		for (const run of runs) {
			const one = (): Block => ({
				kind: 'paragraph',
				runs: [run],
			});
			if (run.bold) add('bold', one);
			if (run.italic) add('italic', one);
			if (run.code) add('codeSpan', one);
			if (run.link !== undefined) add('link', one);
		}
	};
	for (const block of blocks) {
		switch (block.kind) {
			case 'heading':
				add('heading', () => block);
				inline(block.runs);
				break;
			case 'paragraph':
				add('paragraph', () => block);
				inline(block.runs);
				break;
			case 'quote':
				add('quote', () => block);
				inline(block.runs);
				break;
			case 'list':
				add(
					block.ordered ? 'numbered' : 'bullets',
					() => ({
						...block,
						items: block.items.slice(0, 1),
					}),
				);
				block.items.forEach(inline);
				break;
			case 'code':
				add('code', () => block);
				break;
			case 'rule':
				add('rule', () => block);
				break;
		}
	}
	return ELEMENTS.flatMap((element) =>
		counts.has(element)
			? [
					{
						element,
						count: counts.get(element)!,
						example: examples.get(element)!,
					},
				]
			: [],
	);
}

interface Writer {
	heading: (level: number, s: string) => string;
	paragraph?: (s: string) => string;
	item: (ordered: boolean, s: string) => string;
	quote: (s: string) => string;
	code: (text: string) => string;
	/** null: the format has no rule */
	rule: string | null;
	text?: (text: string) => string;
	sep?: string;
	bold: (s: string) => string;
	italic: (s: string) => string;
	codeSpan: (text: string) => string;
	link: (s: string, url: string) => string;
}

const esc = (text: string) =>
	text
		.replaceAll('&', '&amp;')
		.replaceAll('<', '&lt;')
		.replaceAll('>', '&gt;')
		.replaceAll('"', '&quot;');
const q = (text: string) => JSON.stringify(text);
const xmlList = (list: string, item: string, para: string, s: string) =>
	`<${list}><${item}><${para}>${s}</${para}></${item}></${list.split(' ')[0]}>`;
const NO_ATTR = '["",[],[]]';
const LATEX_HEADINGS = [
	'section',
	'subsection',
	'subsubsection',
	'paragraph',
	'subparagraph',
	'subparagraph',
];
const RST_UNDERLINES = '=-~^"\'';

const markdown: Writer = {
	heading: (level, s) => `${'#'.repeat(level)} ${s}`,
	item: (ordered, s) => `${ordered ? '1.' : '-'} ${s}`,
	quote: (s) => `> ${s}`,
	code: (text) => `\`\`\`\n${text}\n\`\`\``,
	rule: '---',
	bold: (s) => `**${s}**`,
	italic: (s) => `*${s}*`,
	codeSpan: (text) => `\`${text}\``,
	link: (s, url) => `[${s}](${url})`,
};

const html: Writer = {
	heading: (level, s) => `<h${level}>${s}</h${level}>`,
	paragraph: (s) => `<p>${s}</p>`,
	item: (ordered, s) =>
		ordered ? `<ol><li>${s}</li></ol>` : `<ul><li>${s}</li></ul>`,
	quote: (s) => `<blockquote><p>${s}</p></blockquote>`,
	code: (text) => `<pre><code>${esc(text)}</code></pre>`,
	rule: '<hr />',
	text: esc,
	bold: (s) => `<strong>${s}</strong>`,
	italic: (s) => `<em>${s}</em>`,
	codeSpan: (text) => `<code>${esc(text)}</code>`,
	link: (s, url) => `<a href="${esc(url)}">${s}</a>`,
};

const plain: Writer = {
	heading: (_, s) => s,
	item: (ordered, s) => `${ordered ? '1.' : '-'} ${s}`,
	quote: (s) => s,
	code: (text) => text,
	rule: '---',
	bold: (s) => s,
	italic: (s) => s,
	codeSpan: (text) => text,
	link: (s) => s,
};

const latex: Writer = {
	heading: (level, s) => `\\${LATEX_HEADINGS[level - 1]}{${s}}`,
	item: (ordered, s) => {
		const env = ordered ? 'enumerate' : 'itemize';
		return `\\begin{${env}}\n\\item ${s}\n\\end{${env}}`;
	},
	quote: (s) => `\\begin{quote}\n${s}\n\\end{quote}`,
	code: (text) => `\\begin{verbatim}\n${text}\n\\end{verbatim}`,
	rule: '\\begin{center}\\rule{0.5\\linewidth}{0.5pt}\\end{center}',
	bold: (s) => `\\textbf{${s}}`,
	italic: (s) => `\\emph{${s}}`,
	codeSpan: (text) => `\\texttt{${text}}`,
	link: (s, url) => `\\href{${url}}{${s}}`,
};

const WRITERS: Record<string, Writer> = {
	markdown,
	gfm: markdown,
	commonmark: markdown,
	ipynb: markdown,
	html,
	revealjs: html,
	plain,
	latex,
	beamer: latex,
	rst: {
		heading: (level, s) =>
			`${s}\n${RST_UNDERLINES[level - 1]!.repeat(Array.from(s).length)}`,
		item: (ordered, s) => `${ordered ? '1.' : '-'} ${s}`,
		quote: (s) => `   ${s}`,
		code: (text) => `::\n\n   ${text}`,
		rule: '----',
		bold: (s) => `**${s}**`,
		italic: (s) => `*${s}*`,
		codeSpan: (text) => `\`\`${text}\`\``,
		link: (s, url) => `\`${s} <${url}>\`__`,
	},
	org: {
		heading: (level, s) => `${'*'.repeat(level)} ${s}`,
		item: (ordered, s) => `${ordered ? '1.' : '-'} ${s}`,
		quote: (s) => `#+begin_quote\n${s}\n#+end_quote`,
		code: (text) => `#+begin_example\n${text}\n#+end_example`,
		rule: '-----',
		bold: (s) => `*${s}*`,
		italic: (s) => `/${s}/`,
		codeSpan: (text) => `=${text}=`,
		link: (s, url) => `[[${url}][${s}]]`,
	},
	mediawiki: {
		heading: (level, s) =>
			`${'='.repeat(level)} ${s} ${'='.repeat(level)}`,
		item: (ordered, s) => `${ordered ? '#' : '*'} ${s}`,
		quote: (s) => `<blockquote>${s}</blockquote>`,
		code: (text) => `<pre>${text}</pre>`,
		rule: '-----',
		bold: (s) => `'''${s}'''`,
		italic: (s) => `''${s}''`,
		codeSpan: (text) => `<code>${text}</code>`,
		link: (s, url) => `[${url} ${s}]`,
	},
	textile: {
		heading: (level, s) => `h${level}. ${s}`,
		item: (ordered, s) => `${ordered ? '#' : '*'} ${s}`,
		quote: (s) => `bq. ${s}`,
		code: (text) => `bc. ${text}`,
		rule: '<hr />',
		bold: (s) => `*${s}*`,
		italic: (s) => `_${s}_`,
		codeSpan: (text) => `@${text}@`,
		link: (s, url) => `"${s}":${url}`,
	},
	asciidoc: {
		heading: (level, s) => `${'='.repeat(level + 1)} ${s}`,
		item: (ordered, s) => `${ordered ? '.' : '*'} ${s}`,
		quote: (s) => `____\n${s}\n____`,
		code: (text) => `----\n${text}\n----`,
		rule: "'''''",
		bold: (s) => `*${s}*`,
		italic: (s) => `_${s}_`,
		codeSpan: (text) => `\`${text}\``,
		link: (s, url) => `${url}[${s}]`,
	},
	docbook: {
		heading: (_, s) => `<section><title>${s}</title></section>`,
		paragraph: (s) => `<para>${s}</para>`,
		item: (ordered, s) =>
			ordered
				? xmlList(
						'orderedlist numeration="arabic"',
						'listitem',
						'para',
						s,
					)
				: xmlList(
						'itemizedlist',
						'listitem',
						'para',
						s,
					),
		quote: (s) => `<blockquote><para>${s}</para></blockquote>`,
		code: (text) => `<programlisting>${esc(text)}</programlisting>`,
		rule: null,
		text: esc,
		bold: (s) => `<emphasis role="strong">${s}</emphasis>`,
		italic: (s) => `<emphasis>${s}</emphasis>`,
		codeSpan: (text) => `<literal>${esc(text)}</literal>`,
		link: (s, url) => `<link xlink:href="${esc(url)}">${s}</link>`,
	},
	jats: {
		heading: (_, s) => `<sec><title>${s}</title></sec>`,
		paragraph: (s) => `<p>${s}</p>`,
		item: (ordered, s) =>
			xmlList(
				`list list-type="${ordered ? 'order' : 'bullet'}"`,
				'list-item',
				'p',
				s,
			),
		quote: (s) => `<disp-quote><p>${s}</p></disp-quote>`,
		code: (text) => `<preformat>${esc(text)}</preformat>`,
		rule: null,
		text: esc,
		bold: (s) => `<bold>${s}</bold>`,
		italic: (s) => `<italic>${s}</italic>`,
		codeSpan: (text) => `<monospace>${esc(text)}</monospace>`,
		link: (s, url) =>
			`<ext-link ext-link-type="uri" xlink:href="${esc(url)}">${s}</ext-link>`,
	},
	typst: {
		heading: (level, s) => `${'='.repeat(level)} ${s}`,
		item: (ordered, s) => `${ordered ? '+' : '-'} ${s}`,
		quote: (s) => `#quote(block: true)[${s}]`,
		code: (text) => `\`\`\`\n${text}\n\`\`\``,
		rule: '#horizontalrule',
		bold: (s) => `#strong[${s}]`,
		italic: (s) => `#emph[${s}]`,
		codeSpan: (text) => `\`${text}\``,
		link: (s, url) => `#link(${q(url)})[${s}]`,
	},
	json: {
		heading: (level, s) =>
			`{"t":"Header","c":[${level},${NO_ATTR},[${s}]]}`,
		paragraph: (s) => `{"t":"Para","c":[${s}]}`,
		item: (ordered, s) =>
			ordered
				? `{"t":"OrderedList","c":[[1,{"t":"Decimal"},{"t":"Period"}],[[{"t":"Plain","c":[${s}]}]]]}`
				: `{"t":"BulletList","c":[[{"t":"Plain","c":[${s}]}]]}`,
		quote: (s) =>
			`{"t":"BlockQuote","c":[{"t":"Para","c":[${s}]}]}`,
		code: (text) => `{"t":"CodeBlock","c":[${NO_ATTR},${q(text)}]}`,
		rule: '{"t":"HorizontalRule"}',
		text: (text) => `{"t":"Str","c":${q(text)}}`,
		sep: ',',
		bold: (s) => `{"t":"Strong","c":[${s}]}`,
		italic: (s) => `{"t":"Emph","c":[${s}]}`,
		codeSpan: (text) => `{"t":"Code","c":[${NO_ATTR},${q(text)}]}`,
		link: (s, url) =>
			`{"t":"Link","c":[${NO_ATTR},[${s}],[${q(url)},""]]}`,
	},
	native: {
		heading: (level, s) =>
			`Header ${level} ( "" , [] , [] ) [ ${s} ]`,
		paragraph: (s) => `Para [ ${s} ]`,
		item: (ordered, s) =>
			ordered
				? `OrderedList ( 1 , Decimal , Period ) [ [ Plain [ ${s} ] ] ]`
				: `BulletList [ [ Plain [ ${s} ] ] ]`,
		quote: (s) => `BlockQuote [ Para [ ${s} ] ]`,
		code: (text) => `CodeBlock ( "" , [] , [] ) ${q(text)}`,
		rule: 'HorizontalRule',
		text: (text) => `Str ${q(text)}`,
		sep: ' , ',
		bold: (s) => `Strong [ ${s} ]`,
		italic: (s) => `Emph [ ${s} ]`,
		codeSpan: (text) => `Code ( "" , [] , [] ) ${q(text)}`,
		link: (s, url) =>
			`Link ( "" , [] , [] ) [ ${s} ] ( ${q(url)} , "" )`,
	},
	man: {
		heading: (level, s) => `${level === 1 ? '.SH' : '.SS'} ${s}`,
		paragraph: (s) => `.PP ${s}`,
		item: (ordered, s) =>
			ordered ? `.IP "1." 3 ${s}` : `.IP \\(bu 2 ${s}`,
		quote: (s) => `.RS ${s} .RE`,
		code: (text) => `.IP\n.EX\n${text}\n.EE`,
		rule: '.PP * * * * *',
		bold: (s) => `\\fB${s}\\fR`,
		italic: (s) => `\\fI${s}\\fR`,
		codeSpan: (text) => `\\f[CR]${text}\\f[R]`,
		link: (s, url) => `${s} <${url}>`,
	},
};

const RICH = new Set(['docx', 'odt', 'rtf', 'epub', 'pdf', 'pptx']);

/** Shown in muted type: the target has no way to keep the element. */
export function isLost(element: LedgerElement, format: string): boolean {
	if (element === 'rule') return WRITERS[format]?.rule === null;
	return (
		format === 'plain' &&
		[
			'heading',
			'quote',
			'bold',
			'italic',
			'codeSpan',
			'link',
		].includes(element)
	);
}

function inlineText(runs: Inline[], writer: Writer): string {
	return runs
		.map((run) => {
			let out = run.code
				? writer.codeSpan(run.text)
				: (writer.text?.(run.text) ?? run.text);
			if (run.bold) out = writer.bold(out);
			if (run.italic) out = writer.italic(out);
			if (run.link !== undefined)
				out = writer.link(out, run.link);
			return out;
		})
		.join(writer.sep ?? '');
}

function blockText(block: Block, writer: Writer): string {
	switch (block.kind) {
		case 'heading':
			return writer.heading(
				block.level,
				inlineText(block.runs, writer),
			);
		case 'paragraph': {
			const s = inlineText(block.runs, writer);
			return writer.paragraph?.(s) ?? s;
		}
		case 'list':
			return writer.item(
				block.ordered,
				inlineText(block.items[0] ?? [], writer),
			);
		case 'quote':
			return writer.quote(inlineText(block.runs, writer));
		case 'code':
			return writer.code(block.text);
		case 'rule':
			return writer.rule ?? '';
	}
}

export type Sample =
	| { rich: false; text: string }
	| {
			rich: true;
			kind: Block['kind'];
			level: number;
			prefix: string;
			runs: Inline[];
	  };

// ponytail: the picture shows one line; longer text only costs layout
const SAMPLE_LIMIT = 240;

/** One line of `block` as `format` writes it: source text, or styled runs for word-processor and page formats. */
export function sample(block: Block, format: string): Sample {
	if (RICH.has(format)) {
		const runs =
			block.kind === 'list'
				? (block.items[0] ?? [])
				: block.kind === 'code'
					? [
							{
								text:
									block.text.split(
										'\n',
									)[0] ??
									'',
								code: true,
							},
						]
					: block.kind === 'rule'
						? []
						: block.runs;
		return {
			rich: true,
			kind: block.kind,
			level: block.kind === 'heading' ? block.level : 0,
			prefix:
				block.kind === 'list'
					? block.ordered
						? '1. '
						: '• '
					: '',
			runs,
		};
	}
	const text = blockText(block, WRITERS[format] ?? markdown)
		.slice(0, SAMPLE_LIMIT * 4)
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean)
		.join(' ')
		.slice(0, SAMPLE_LIMIT);
	return { rich: false, text };
}
