import type { Tool } from './tools';
import { MIME, sample } from './workflows';
import { acceptsFile } from 'delphitools-v2/modifiers/file-paste';

// "md", ".docx", "md to html", "png -> webp"
const FILE_TYPE = /^\.?([a-z0-9]+)$/;
const CONVERSION = /^\.?([a-z0-9]+)\s*(?:to|->|→)\s*\.?([a-z0-9]+)$/;

/** Extension for a query word, so "jpeg" finds ".jpg". */
function extension(word: string): string {
	const ext = `.${word}`;
	if (ext in MIME) return ext;
	return (
		Object.keys(MIME).find((key) =>
			MIME[key]!.endsWith(`/${word}`),
		) ?? ext
	);
}

// explicit entries only, wildcards would match every image tool
function lists(types: string[] | undefined, ext: string): boolean {
	return !!types?.some((t) => t === ext || t === MIME[ext]);
}

export function matchesQuery(tool: Tool, query: string): boolean {
	const q = query.trim().toLowerCase();
	if (
		tool.name.toLowerCase().includes(q) ||
		tool.description.toLowerCase().includes(q)
	)
		return true;

	const conversion = CONVERSION.exec(q);
	if (conversion)
		return (
			acceptsFile(tool, sample(extension(conversion[1]!))) &&
			lists(tool.produces, extension(conversion[2]!))
		);

	const fileType = FILE_TYPE.exec(q);
	if (!fileType) return false;
	const ext = extension(fileType[1]!);
	return lists(tool.accepts, ext) || lists(tool.produces, ext);
}
