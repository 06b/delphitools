import { fileOpen } from 'browser-fs-access';
import { importImageFile } from 'delphitools-v2/lib/substrata/import-raster';
import {
	getActiveSubs,
	getActiveTool,
	setActiveSub,
	type ToolId,
} from 'delphitools-v2/lib/substrata/tool';

// the omnibar's tools: iOS editor mode (move, crop, image, text, shape) plus
// the web's select and draw; each maps onto tool.ts's tool and subtool
export type EditorTool =
	'move' | 'crop' | 'select' | 'image' | 'text' | 'shape' | 'draw';

export interface EditorToolDef {
	id: EditorTool;
	title: string;
	icon: string;
	// letter keys from the web omnibar; a tool with several takes each
	keys: Record<string, [ToolId, string]>;
}

export const EDITOR_TOOLS: readonly EditorToolDef[] = [
	{
		id: 'move',
		title: 'Move',
		icon: 'move',
		keys: { v: ['move', 'move'] },
	},
	{
		id: 'crop',
		title: 'Crop',
		icon: 'crop',
		keys: { c: ['move', 'crop'] },
	},
	{
		id: 'select',
		title: 'Select',
		icon: 'lasso',
		keys: {
			m: ['select', 'select'],
			l: ['select', 'lasso'],
			w: ['select', 'wand'],
		},
	},
	{ id: 'image', title: 'Image', icon: 'image', keys: {} },
	{
		id: 'text',
		title: 'Text',
		icon: 'type',
		keys: { t: ['text', 'text'] },
	},
	{
		id: 'shape',
		title: 'Shape',
		icon: 'shapes',
		keys: {
			u: ['pieces', 'primitives'],
			p: ['pieces', 'pieces'],
		},
	},
	{
		id: 'draw',
		title: 'Draw',
		icon: 'pencil',
		keys: {
			b: ['pieces', 'brush'],
			n: ['pieces', 'pencil'],
		},
	},
];

export const PANEL_DEFS = [
	{ id: 'layers', title: 'Layers', icon: 'layers' },
	{ id: 'inspector', title: 'Inspector', icon: 'sliders-horizontal' },
	{ id: 'fx', title: 'FX', icon: '' },
] as const;

export function currentEditorTool(): EditorTool {
	const tool = getActiveTool();
	const sub = getActiveSubs()[tool];
	if (tool === 'move') return sub === 'crop' ? 'crop' : 'move';
	if (tool === 'select') return 'select';
	if (tool === 'text') return 'text';
	if (tool === 'pieces')
		return sub === 'brush' || sub === 'pencil' ? 'draw' : 'shape';
	return 'move';
}

// last subtool per group, so Select and Shape come back as they were left
export function chooseTool(id: EditorTool): void {
	const subs = getActiveSubs();
	switch (id) {
		case 'move':
			return setActiveSub('move', 'move');
		case 'crop':
			return setActiveSub('move', 'crop');
		case 'select':
			return setActiveSub('select', subs.select);
		case 'text':
			return setActiveSub('text', 'text');
		case 'shape':
			return setActiveSub(
				'pieces',
				subs.pieces === 'pieces'
					? 'pieces'
					: 'primitives',
			);
		case 'draw':
			return setActiveSub(
				'pieces',
				subs.pieces === 'pencil' ? 'pencil' : 'brush',
			);
		case 'image':
			void pickImages();
	}
}

// iOS: the image tool opens the import and goes back to move
export async function pickImages(): Promise<void> {
	try {
		const files = await fileOpen({
			mimeTypes: ['image/*'],
			multiple: true,
		});
		for (const f of Array.isArray(files) ? files : [files])
			void importImageFile(f);
		setActiveSub('move', 'move');
	} catch {
		// picker cancelled
	}
}

export function toolForKey(key: string): [ToolId, string] | undefined {
	for (const t of EDITOR_TOOLS) {
		const hit = t.keys[key.toLowerCase()];
		if (hit) return hit;
	}
	return undefined;
}
