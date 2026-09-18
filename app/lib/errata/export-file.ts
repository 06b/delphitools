import { downloadBlob } from 'delphitools-v2/lib/download';
import { exportPdf } from './export';
import { getSourceBytes } from './source';
import { store } from './store';

let busy = false;

/** resolves false when nothing was written; the error is on the console */
export async function exportCurrent(): Promise<boolean> {
	const doc = store.getSnapshot();
	if (!doc || busy) return false;
	busy = true;
	try {
		const bytes = await exportPdf(doc, getSourceBytes());
		// pdf-lib ArrayBufferLike incompatible with BlobPart
		downloadBlob(
			new Blob([new Uint8Array(bytes)], {
				type: 'application/pdf',
			}),
			`${doc.name}.pdf`,
		);
		return true;
	} catch (error) {
		console.error(error);
		return false;
	} finally {
		busy = false;
	}
}
