import { createHistoryStore } from 'delphitools-v2/lib/history-store';
import type { SubstrataDoc } from './doc-model';

export const {
	getSnapshot,
	subscribe,
	setDoc,
	update,
	isGestureActive,
	beginTransient,
	updateTransient,
	rollbackTransient,
	commitTransient,
	canUndo,
	canRedo,
	undo,
	redo,
} = createHistoryStore<SubstrataDoc>();
