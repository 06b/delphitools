import type { Stamped } from './doc-model';

export interface PageRect {
	x: number;
	y: number;
	w: number;
	h: number;
}

export interface CanvasActions {
	deleteSelection(): void;
	/** client coordinates of a page, for rigs */
	pageRect(index: number): PageRect | null;
	/** outline boxes in displayed page space, for rigs; empty clears */
	debugBoxes(index: number, boxes: DebugBox[]): void;
	selectObject(id: string): void;
	/** non-interactive stand-ins for objects a mode would add; empty clears */
	preview(items: Stamped[]): void;
}

export interface DebugBox {
	x: number;
	y: number;
	width: number;
	height: number;
	colour: string;
}

let actions: CanvasActions | null = null;

export function registerCanvasActions(next: CanvasActions | null): void {
	actions = next;
}

export function deleteSelection(): void {
	actions?.deleteSelection();
}

export function pageRect(index: number): PageRect | null {
	return actions?.pageRect(index) ?? null;
}

export function debugBoxes(index: number, boxes: DebugBox[]): void {
	actions?.debugBoxes(index, boxes);
}

export function selectObject(id: string): void {
	actions?.selectObject(id);
}

export function preview(items: Stamped[]): void {
	actions?.preview(items);
}

export type ModalId = 'signature' | 'page-size';

let modal: ModalId | null = null;
const listeners = new Set<() => void>();

export function getOpenModal(): ModalId | null {
	return modal;
}

export function openModal(id: ModalId): void {
	if (modal === id) return;
	modal = id;
	for (const l of listeners) l();
}

export function closeModal(): void {
	if (modal === null) return;
	modal = null;
	for (const l of listeners) l();
}

export function subscribeUi(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

let toolboxOpen = false;

export function isToolboxOpen(): boolean {
	return toolboxOpen;
}

export function setToolboxOpen(open: boolean): void {
	if (open === toolboxOpen) return;
	toolboxOpen = open;
	for (const l of listeners) l();
}

let imagePicker: (() => void) | null = null;

/** the shell owns the hidden file input; tools ask for it here */
export function registerImagePicker(open: (() => void) | null): void {
	imagePicker = open;
}

export function pickImageFile(): void {
	imagePicker?.();
}

export type BoxMode =
	| 'page-numbers'
	| 'watermark'
	| 'stamp'
	| 'compress'
	| 'impose'
	| 'comment';

let mode: BoxMode | null = null;

/** a toolbox tool running as a mode bar */
export function getMode(): BoxMode | null {
	return mode;
}

export function setMode(next: BoxMode | null): void {
	if (next === mode) return;
	mode = next;
	for (const l of listeners) l();
}

let selectedIds: readonly string[] = [];

/** ids of the objects selected on the canvas */
export function getSelectedIds(): readonly string[] {
	return selectedIds;
}

export function setSelectedIds(ids: readonly string[]): void {
	if (ids.join() === selectedIds.join()) return;
	selectedIds = ids;
	for (const l of listeners) l();
}
