import { getDB } from './db';
import { getSnapshot, update } from './doc-store';
import { DEFAULT_ARTBOARD, newId, type SubstrataDoc } from './doc-model';
import { loadProject, persistAll } from './autosave';
import { createScene, openLoaded } from './file-ops';
import { getPersistenceEnabled } from './persistence-pref';
import { viewport } from './viewport';

export interface ProjectSummary {
	id: string;
	name: string;
	updatedAt: number;
	thumbnail?: Blob;
}

function canPersist(): boolean {
	return typeof indexedDB !== 'undefined' && getPersistenceEnabled();
}

export function projectTitle(name: string): string {
	return name.trim() || 'Untitled scene';
}

// iOS DocumentLibrary.uniqueName: `base`, else `base n` from 2, case ignored
export function uniqueName(base: string, taken: Iterable<string>): string {
	const used = new Set([...taken].map((n) => n.toLowerCase()));
	if (!used.has(base.toLowerCase())) return base;
	const stem = base.replace(/ \d+$/, '');
	for (let n = 2; ; n++) {
		const name = `${stem} ${n}`;
		if (!used.has(name.toLowerCase())) return name;
	}
}

export async function listProjects(): Promise<ProjectSummary[]> {
	if (!canPersist()) return [];
	const recs = await getDB()
		.projects.orderBy('updatedAt')
		.reverse()
		.toArray();
	return recs.map((r) => ({
		id: r.id,
		name: r.name,
		updatedAt: r.updatedAt,
		thumbnail: r.thumbnail,
	}));
}

export async function saveThumbnail(id: string, blob: Blob): Promise<void> {
	if (!canPersist()) return;
	await getDB()
		.projects.where('id')
		.equals(id)
		.modify((rec) => {
			rec.thumbnail = blob;
		});
}

// saves the open document first, so its last edit survives the switch
async function saveOpen(): Promise<void> {
	const doc = getSnapshot();
	if (doc) await persistAll(doc);
}

export async function switchProject(id: string): Promise<boolean> {
	if (getSnapshot()?.id === id) return true;
	await saveOpen();
	const doc = await loadProject(id);
	if (!doc) return false;
	openLoaded(doc);
	return true;
}

// the open document renames as an undoable edit (iOS renameDocument)
export async function renameProject(id: string, name: string): Promise<void> {
	if (getSnapshot()?.id === id) {
		update((doc) => ({ ...doc, name }));
		return;
	}
	if (!canPersist()) return;
	const db = getDB();
	const rec = await db.projects.get(id);
	if (!rec) return;
	await db.projects.put({ ...rec, name, doc: { ...rec.doc, name } });
}

// a copy named after the first free name; it opens when `id` is open
export async function duplicateProject(id: string): Promise<void> {
	if (!canPersist()) return;
	const isOpen = getSnapshot()?.id === id;
	if (isOpen) await saveOpen();
	const db = getDB();
	const rec = await db.projects.get(id);
	if (!rec) return;
	const taken = (await db.projects.orderBy('name').keys()) as string[];
	const now = Date.now();
	const name = uniqueName(
		projectTitle(rec.name),
		taken.map(projectTitle),
	);
	const doc: SubstrataDoc = {
		...rec.doc,
		id: newId(),
		name,
		createdAt: now,
		updatedAt: now,
	};
	await db.projects.put({
		id: doc.id,
		name,
		doc,
		thumbnail: rec.thumbnail,
		createdAt: now,
		updatedAt: now,
	});
	if (isOpen) openLoaded((await loadProject(doc.id)) ?? doc);
}

// deleting the open document opens the newest one left, or a new one
// ponytail: raster blobs stay in the blobs table; blobs.ts never counts refs
export async function deleteProject(id: string): Promise<void> {
	if (!canPersist()) return;
	const db = getDB();
	await db.projects.delete(id);
	await db.snapshots.where('projectId').equals(id).delete();
	if (getSnapshot()?.id !== id) return;
	const next = (await listProjects())[0];
	const doc = next ? await loadProject(next.id) : null;
	if (doc) openLoaded(doc);
	else createScene({ ...DEFAULT_ARTBOARD });
	viewport.fit();
}
