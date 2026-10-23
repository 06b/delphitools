import type * as Mupdf from 'mupdf';
import { getMupdf } from 'delphitools-v2/lib/mupdf';
import type { MetadataEntry } from 'delphitools-v2/lib/metadata';

export interface PdfMetadataReport {
	// false for encrypted or corrupt input
	readable: boolean;
	entries: MetadataEntry[];
	xmp: boolean;
}

export interface PdfStripResult {
	data: Uint8Array;
	removed: string[];
}

const UNREADABLE: PdfMetadataReport = {
	readable: false,
	entries: [],
	xmp: false,
};

const INFO_FIELDS = [
	['Title', 'Title'],
	['Author', 'Author'],
	['Subject', 'Subject'],
	['Keywords', 'Keywords'],
	['Creator', 'Creator'],
	['Producer', 'Producer'],
] as const;

// xmp properties per info key, pdf spec 14.3.2 table 349
const XMP_FIELDS: Record<string, string> = {
	Title: 'dc:title',
	Author: 'dc:creator',
	Subject: 'dc:description',
	Keywords: 'pdf:Keywords',
	Creator: 'xmp:CreatorTool',
	Producer: 'pdf:Producer',
	CreationDate: 'xmp:CreateDate',
	ModDate: 'xmp:ModifyDate',
};

const pad = (n: string) => n.padStart(2, '0');

// pdf "D:YYYYMMDDHHmmSS+hh'mm'" or xmp iso 8601, shown in the file's own zone
export function formatPdfDate(raw: string): string {
	const m =
		/^(?:D:)?(\d{4})-?(\d{2})?-?(\d{2})?(?:T?(\d{2}):?(\d{2}))?/.exec(
			raw.trim(),
		);
	if (!m) return raw;
	const [, year, month = '01', day = '01', hour, minute] = m;
	const date = `${pad(day)}.${pad(month)}.${year}`;
	return hour && minute ? `${date} ${hour}:${minute}` : date;
}

// innermost text of the first element, rdf:Alt and rdf:Seq included
function xmpValue(xmp: string, tag: string): string | undefined {
	const element = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(
		xmp,
	)?.[1];
	const attribute = new RegExp(`${tag}="([^"]*)"`).exec(xmp)?.[1];
	const raw = element ?? attribute;
	if (raw === undefined) return undefined;
	const li = /<rdf:li[^>]*>([\s\S]*?)<\/rdf:li>/.exec(raw)?.[1];
	const text = (li ?? raw)
		.replace(/<[^>]+>/g, '')
		.replace(/&lt;/g, '<')
		.replace(/&gt;/g, '>')
		.replace(/&quot;/g, '"')
		.replace(/&apos;/g, "'")
		.replace(/&amp;/g, '&')
		.trim();
	return text || undefined;
}

function catalog(doc: Mupdf.PDFDocument) {
	return doc.getTrailer().get('Root');
}

function readXmp(doc: Mupdf.PDFDocument): string | null {
	const stream = catalog(doc).get('Metadata');
	if (!stream.isStream()) return null;
	const buffer = stream.readStream();
	try {
		return buffer.asString();
	} finally {
		buffer.destroy();
	}
}

function openPdf(
	mupdf: typeof Mupdf,
	data: Uint8Array,
): Mupdf.PDFDocument | null {
	try {
		const doc = mupdf.Document.openDocument(
			data,
			'application/pdf',
		);
		const pdf = doc.asPDF();
		if (!pdf || pdf.needsPassword()) {
			doc.destroy();
			return null;
		}
		return pdf;
	} catch {
		return null;
	}
}

function collect(doc: Mupdf.PDFDocument): MetadataEntry[] {
	const xmp = readXmp(doc) ?? '';
	const field = (key: string) => {
		const info = doc.getMetaData(`info:${key}`)?.trim();
		if (info) return info;
		const tag = XMP_FIELDS[key];
		return tag ? xmpValue(xmp, tag) : undefined;
	};
	const entries: MetadataEntry[] = [];
	for (const [key, label] of INFO_FIELDS) {
		const detail = field(key);
		if (detail) entries.push({ label, detail });
	}
	const lang = catalog(doc).get('Lang');
	if (lang.isString() && lang.asString().trim())
		entries.push({
			label: 'Language',
			detail: lang.asString().trim(),
		});
	const version = /^PDF ([\d.]+)/.exec(
		doc.getMetaData('format') ?? '',
	)?.[1];
	if (version) entries.push({ label: 'PDF version', detail: version });
	const created = field('CreationDate');
	if (created)
		entries.push({
			label: 'Created',
			detail: formatPdfDate(created),
		});
	const modified = field('ModDate');
	if (modified)
		entries.push({
			label: 'Modified',
			detail: formatPdfDate(modified),
		});
	return entries;
}

export async function parsePdfMetadata(
	data: Uint8Array,
): Promise<PdfMetadataReport> {
	const doc = openPdf(await getMupdf(), data);
	if (!doc) return UNREADABLE;
	try {
		return {
			readable: true,
			entries: collect(doc),
			xmp: readXmp(doc) !== null,
		};
	} catch {
		return UNREADABLE;
	} finally {
		doc.destroy();
	}
}

// null for unreadable input; language and page content are kept
export async function stripPdfMetadata(
	data: Uint8Array,
): Promise<PdfStripResult | null> {
	const doc = openPdf(await getMupdf(), data);
	if (!doc) return null;
	try {
		const removed = collect(doc)
			.map((entry) => entry.label)
			.filter(
				(label) =>
					label !== 'Language' &&
					label !== 'PDF version',
			);
		// mupdf 1.28 rewrites the trailer on save, so empty the info dict
		const info = doc.getTrailer().get('Info');
		if (info.isDictionary()) {
			const keys: (string | number)[] = [];
			info.forEach((_, key) => keys.push(key));
			for (const key of keys) info.delete(key);
		}
		const root = catalog(doc);
		if (!root.get('Metadata').isNull()) {
			root.delete('Metadata');
			removed.push('XMP packet');
		}
		// a full rewrite; garbage drops the orphaned xmp stream
		const buffer = doc.saveToBuffer('garbage=compact,compress');
		try {
			return { data: buffer.asUint8Array().slice(), removed };
		} finally {
			buffer.destroy();
		}
	} catch {
		return null;
	} finally {
		doc.destroy();
	}
}
