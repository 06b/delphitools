import { downloadBlob } from 'delphitools-v2/lib/download';
import { exportPdf } from './export';
import { getSourceBytes } from './source';
import { store } from './store';

let busy = false;

/** resolves false when nothing was written; the error is on the console */
export async function exportCurrent(
	transform?: (bytes: Uint8Array) => Promise<Uint8Array>,
	suffix = '',
): Promise<boolean> {
	const doc = store.getSnapshot();
	if (!doc || busy) return false;
	busy = true;
	try {
		let bytes = await exportPdf(doc, getSourceBytes());
		if (transform) bytes = await transform(bytes);
		// pdf-lib ArrayBufferLike incompatible with BlobPart
		downloadBlob(
			new Blob([new Uint8Array(bytes)], {
				type: 'application/pdf',
			}),
			`${doc.name}${suffix}.pdf`,
		);
		return true;
	} catch (error) {
		console.error(error);
		return false;
	} finally {
		busy = false;
	}
}
