import type * as Mupdf from 'mupdf';
import { rawImport } from 'delphitools-v2/lib/raw-import';

let mupdf: Promise<typeof Mupdf> | null = null;

// self-hosted, outside bundling
export function getMupdf(): Promise<typeof Mupdf> {
	mupdf ??= rawImport<typeof Mupdf>('/mupdf/mupdf.js');
	return mupdf;
}
