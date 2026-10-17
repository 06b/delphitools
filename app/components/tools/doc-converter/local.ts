import { DOMParser as SchemaParser } from 'prosemirror-model';
import {
	docToBodyHtml,
	standaloneHtml,
} from 'delphitools-v2/lib/editor/export';
import {
	parseMarkdown,
	serializeDoc,
} from 'delphitools-v2/lib/editor/markdown';
import { schema } from 'delphitools-v2/lib/editor/schema';
import { injectPrintStyles } from 'delphitools-v2/lib/pandoc/print-pdf';

// ponytail: the markdown-writer schema is the document model, so every Markdown flavour writes the same GFM-style text; Pandoc when a flavour must differ
const LOCAL = new Set(['markdown', 'gfm', 'commonmark', 'html']);

/** Whether the browser converts `from` to `to` without the Pandoc engine. */
export const convertsLocally = (from: string, to: string) =>
	LOCAL.has(from) && LOCAL.has(to);

/** Markdown or HTML to Markdown or HTML, through the markdown-writer schema. */
export function convertLocally(
	text: string,
	from: string,
	to: string,
	standalone: boolean,
): string {
	const doc =
		from === 'html'
			? SchemaParser.fromSchema(schema).parse(
					new window.DOMParser().parseFromString(
						text,
						'text/html',
					).body,
				)
			: parseMarkdown(text);
	if (to !== 'html') return serializeDoc(doc);
	const body = docToBodyHtml(doc);
	return standalone ? injectPrintStyles(standaloneHtml(body)) : body;
}
