import {
	acceptsFile,
	matchesAccept,
} from 'delphitools-v2/modifiers/file-paste';
import {
	COLOUR_OUTPUT,
	allTools,
	getCategoryByToolId,
	getToolById,
	type Tool,
} from './tools';

export interface Workflow {
	id: string;
	name: string;
	steps: string[];
}

// workflow contracts in tests
export const WORKFLOWS: Workflow[] = [
	{
		id: 'trim-caption-burn',
		name: 'Trim, caption, burn',
		steps: ['video-trimmer', 'auto-subtitle', 'subtitle-studio'],
	},
	{
		id: 'record-trim-gif',
		name: 'Record, trim, GIF',
		steps: ['screen-recorder', 'video-trimmer', 'video-to-gif'],
	},
	{
		id: 'trim-and-mute',
		name: 'Trim and mute',
		steps: ['video-trimmer', 'video-muter'],
	},
	{
		id: 'frame-and-cut-out',
		name: 'Frame, cut out',
		steps: ['frame-extractor', 'background-remover'],
	},
	{
		id: 'audio-to-subtitles',
		name: 'Audio to subtitles',
		steps: ['audio-extractor', 'audio-trimmer', 'auto-subtitle'],
	},
	{
		id: 'extract-and-normalise',
		name: 'Extract and normalise',
		steps: ['audio-extractor', 'audio-normaliser'],
	},
	{
		id: 'record-level-transcribe',
		name: 'Record, level, transcribe',
		steps: ['voice-recorder', 'audio-normaliser', 'auto-subtitle'],
	},
	{
		id: 'paste-and-strip',
		name: 'Paste and strip',
		steps: ['paste-image', 'metadata-stripper'],
	},
	{
		id: 'cut-out-crop-compress',
		name: 'Cut out, crop, compress',
		steps: [
			'background-remover',
			'social-cropper',
			'image-compressor',
		],
	},
	{
		id: 'watermark-and-compress',
		name: 'Watermark and compress',
		steps: ['watermarker', 'image-compressor'],
	},
	{
		id: 'trace-and-optimise',
		name: 'Trace and optimise',
		steps: ['image-tracer', 'svg-optimiser'],
	},
	{
		id: 'straighten-to-pdf',
		name: 'Straighten, then PDF',
		steps: ['image-deskewer', 'image-to-pdf', 'pdf-compressor'],
	},
	{
		id: 'images-to-pdf',
		name: 'Images to PDF',
		steps: ['image-to-pdf', 'pdf-compressor'],
	},
	{
		id: 'organise-number-compress',
		name: 'Organise, number, compress',
		steps: ['pdf-organiser', 'pdf-page-numberer', 'pdf-compressor'],
	},
	{
		id: 'crop-and-impose',
		name: 'Crop and impose',
		steps: ['pdf-rotate-crop', 'zine-imposer'],
	},
	{
		id: 'colour-to-gradient',
		name: 'Colour to gradient',
		steps: ['colour-converter', 'gradient-genny'],
	},
	{
		id: 'pick-then-gradient',
		name: 'Pick, then gradient',
		steps: ['pixel-picker', 'gradient-genny'],
	},
];

export const SLOTS = 3;
export const CUSTOM_PREFIX = 'custom:';
export const CUSTOM_NAME = 'Custom workflow';
export const ORDINALS = ['First,', 'Then...', 'Finally,'];

export const MIME: Record<string, string> = {
	'.png': 'image/png',
	'.jpg': 'image/jpeg',
	'.webp': 'image/webp',
	'.gif': 'image/gif',
	'.avif': 'image/avif',
	'.tiff': 'image/tiff',
	'.jxl': 'image/jxl',
	'.svg': 'image/svg+xml',
	'.ico': 'image/x-icon',
	'.pdf': 'application/pdf',
	'.zip': 'application/zip',
	'.json': 'application/json',
	'.txt': 'text/plain',
	'.md': 'text/markdown',
	'.html': 'text/html',
	'.srt': 'application/x-subrip',
	'.vtt': 'text/vtt',
	'.mp4': 'video/mp4',
	'.webm': 'video/webm',
	'.wav': 'audio/wav',
	'.m4a': 'audio/mp4',
	'.ogg': 'audio/ogg',
	'.flac': 'audio/flac',
};

// file for accept matching
export function sample(produced: string): File {
	const isExt = produced.startsWith('.');
	const ext = isExt
		? produced
		: (Object.keys(MIME).find((key) => MIME[key] === produced) ??
			'');
	return new File([], `out${ext}`, {
		type: isExt ? (MIME[produced] ?? '') : produced,
	});
}

// steps must capture files
const eligible = (tool: Tool) =>
	!tool.route && !tool.external && (tool.produces?.length ?? 0) > 0;

export function canFollow(prev: Tool, next: Tool): boolean {
	if (!eligible(next)) return false;
	const out = prev.produces ?? [];
	if (next.carryColour && out.includes(COLOUR_OUTPUT)) return true;
	return out.some(
		(produced) =>
			produced !== COLOUR_OUTPUT &&
			acceptsFile(next, sample(produced)),
	);
}

export const START_TOOLS = allTools.filter(eligible);

export const nextTools = (prev: Tool): Tool[] =>
	allTools.filter((tool) => canFollow(prev, tool));

export function customWorkflow(steps: string[]): Workflow | undefined {
	if (steps.length < 2 || steps.length > SLOTS) return undefined;
	const tools = steps.map((id) => getToolById(id));
	const first = tools[0];
	if (!first || !eligible(first)) return undefined;
	for (let i = 1; i < tools.length; i++) {
		const tool = tools[i];
		if (!tool || !canFollow(tools[i - 1]!, tool)) return undefined;
	}
	// colour tails never finish
	if (!tools.at(-1)!.produces!.some((p) => p !== COLOUR_OUTPUT))
		return undefined;
	return {
		id: CUSTOM_PREFIX + stepsPath(steps),
		name: CUSTOM_NAME,
		steps,
	};
}

// /w/:steps segment
export const stepsPath = (steps: string[]) => steps.join('.');

export const workflowFromPath = (path: string) =>
	customWorkflow(path.split('.'));

export function getWorkflowById(id: string): Workflow | undefined {
	if (id.startsWith(CUSTOM_PREFIX))
		return workflowFromPath(id.slice(CUSTOM_PREFIX.length));
	return WORKFLOWS.find((workflow) => workflow.id === id);
}

export function workflowTools(workflow: Workflow): Tool[] {
	return workflow.steps.flatMap((id) => getToolById(id) ?? []);
}

export function workflowCategory(workflow: Workflow): string {
	return getCategoryByToolId(workflow.steps[0] ?? '')?.name ?? '';
}

/** select latest accepted files */
export function pendingFor<T extends { file: File }>(
	bag: T[],
	accept?: string,
): T[] {
	const patterns = accept ? accept.split(',') : [''];
	const picked = new Set<T>();
	for (const pattern of patterns) {
		const match = bag.findLast(
			(item) => !pattern || matchesAccept(item.file, pattern),
		);
		if (match) picked.add(match);
	}
	return bag.filter((item) => picked.has(item));
}
