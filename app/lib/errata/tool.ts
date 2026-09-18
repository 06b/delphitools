import type { ShapeKind } from './doc-model';

export type ToolId =
	| 'select'
	| 'content'
	| 'crop'
	| 'text'
	| 'ink'
	| 'shape'
	| 'highlight'
	| 'image'
	| 'signature';

export interface ToolSettings {
	colour: string;
	highlightColour: string;
	strokeWidth: number;
	fontSize: number;
	shape: Exclude<ShapeKind, 'highlight'>;
}

export interface ToolEntry {
	id: ToolId;
	icon: string;
	key: string;
	label: string;
}

export const TOOL_ORDER: readonly ToolEntry[] = [
	{ id: 'select', icon: 'mouse-pointer-2', key: 'V', label: 'Select' },
	{
		id: 'content',
		icon: 'square-dashed-mouse-pointer',
		key: 'E',
		label: 'Edit',
	},
	{ id: 'text', icon: 'type', key: 'T', label: 'Text' },
	{ id: 'ink', icon: 'pen', key: 'P', label: 'Pen' },
	{ id: 'shape', icon: 'square', key: 'S', label: 'Shape' },
	{ id: 'highlight', icon: 'highlighter', key: 'H', label: 'Highlight' },
	{ id: 'image', icon: 'image-plus', key: 'I', label: 'Image' },
	{ id: 'signature', icon: 'signature', key: 'G', label: 'Signature' },
];

let active: ToolId = 'select';
let settings: ToolSettings = {
	colour: '#d1242f',
	highlightColour: '#ffe600',
	strokeWidth: 3,
	fontSize: 14,
	shape: 'rect',
};
const listeners = new Set<() => void>();

function emit(): void {
	for (const l of listeners) l();
}

export function getActiveTool(): ToolId {
	return active;
}

export function setActiveTool(tool: ToolId): void {
	if (tool === active) return;
	active = tool;
	emit();
}

export function getToolSettings(): ToolSettings {
	return settings;
}

export function updateToolSettings(patch: Partial<ToolSettings>): void {
	settings = { ...settings, ...patch };
	emit();
}

export function subscribeTool(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}
