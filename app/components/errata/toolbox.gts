import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { modifier } from 'ember-modifier';
import { eq } from 'ember-truth-helpers';
import CanonHeading from 'delphicanon/components/canon-heading';
import StampPanel, {
	CompressPanel,
	ImposePanel,
	RedactPanel,
} from 'delphitools-v2/components/errata/box-mode';
import Organise from 'delphitools-v2/components/errata/organise';
import CommentPanel from 'delphitools-v2/components/errata/comment-mode';
import FormPanel from 'delphitools-v2/components/errata/form-mode';
import PageSizePanel from 'delphitools-v2/components/errata/page-size-panel';
import {
	InsertPanel,
	RotatePanel,
} from 'delphitools-v2/components/errata/page-strips';
import ToolPanel from 'delphitools-v2/components/errata/tool-panel';
import { PanelHeader } from 'delphitools-v2/components/substrata/editor/cells';
import { MenuCard } from 'delphitools-v2/components/substrata/editor/floating-card';
import { cropFromDisplayed } from 'delphitools-v2/lib/errata/doc-model';
import { exportCurrent } from 'delphitools-v2/lib/errata/export-file';
import { cropPage } from 'delphitools-v2/lib/errata/page-ops';
import { store } from 'delphitools-v2/lib/errata/store';
import {
	boxMode,
	closeMode,
	cropDraft,
	modal,
	setMode,
	toolbox,
	type BoxMode,
} from 'delphitools-v2/lib/errata/ui';
import { allTools } from 'delphitools-v2/lib/tools';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

type BoxTool = 'fill-sign' | 'export' | BoxMode;

const STAMP_MODES = ['page-numbers', 'watermark', 'stamp'] as const;

interface BoxCell {
	label: string;
	icon: string;
	description: string;
	tool: BoxTool;
}

// descriptions come from the registry where a delphitools tool exists
function fromRegistry(id: string): string {
	return allTools.find((t) => t.id === id)?.description ?? '';
}

const BOX_GROUPS: { heading: string; cells: BoxCell[] }[] = [
	{
		heading: 'Pages',
		cells: [
			{
				label: 'Organise',
				icon: 'layout-grid',
				description: fromRegistry('pdf-organiser'),
				tool: 'organise',
			},
			{
				label: 'Page size',
				icon: 'scaling',
				description: 'Resize, crop and rescale pages',
				tool: 'page-size',
			},
			{
				label: 'Rotate',
				icon: 'rotate-cw',
				description: fromRegistry('pdf-rotate-crop'),
				tool: 'rotate',
			},
			{
				label: 'Crop',
				icon: 'crop',
				description:
					'Drag a rectangle to crop the page',
				tool: 'crop',
			},
			{
				label: 'Insert page',
				icon: 'file-plus',
				description: 'Add a blank page, or several',
				tool: 'insert',
			},
			{
				label: 'Page numbers',
				icon: 'hash',
				description: fromRegistry('pdf-page-numberer'),
				tool: 'page-numbers',
			},
		],
	},
	{
		heading: 'Prepare',
		cells: [
			{
				label: 'Prepare form',
				icon: 'text-cursor-input',
				description:
					'Add interactive fields like checkboxes',
				tool: 'form',
			},
			{
				label: 'Fill & sign',
				icon: 'signature',
				description:
					'Draw or upload your signature and place it',
				tool: 'fill-sign',
			},
			{
				label: 'Stamp',
				icon: 'stamp',
				description:
					'Stamp text or an image on the document',
				tool: 'stamp',
			},
			{
				label: 'Watermark',
				icon: 'droplet',
				description: 'Add a watermark to the document',
				tool: 'watermark',
			},
			{
				label: 'Redact',
				icon: 'eye-off',
				description: 'Remove content for good',
				tool: 'redact',
			},
		],
	},
	{
		heading: 'Review',
		cells: [
			{
				label: 'Comment',
				icon: 'message-square',
				description: 'Leave notes PDF viewers can read',
				tool: 'comment',
			},
			{
				label: 'Preflight',
				icon: 'list-checks',
				description: fromRegistry('pdf-preflight'),
				tool: 'preflight',
			},
			{
				label: 'Compress',
				icon: 'archive',
				description: fromRegistry('pdf-compressor'),
				tool: 'compress',
			},
		],
	},
	{
		heading: 'Output',
		cells: [
			{
				label: 'Impose',
				icon: 'book-open',
				description: fromRegistry('imposer'),
				tool: 'impose',
			},
			{
				label: 'Export',
				icon: 'download',
				description: 'Download the finished file',
				tool: 'export',
			},
		],
	},
];

// the Toolbox: a bottom drawer of the PDF tools in Substrata's MenuCard
// grid; a picked tool runs as a panel in the settings bar's place
export default class Toolbox extends Component<{ Args: { phone: boolean } }> {
	boxOpen = new TrackedExternal(toolbox.subscribe, toolbox.get);
	mode = new TrackedExternal(boxMode.subscribe, boxMode.get);
	draft = new TrackedExternal(cropDraft.subscribe, cropDraft.get);

	cropHint = 'Drag on the page';

	willDestroy() {
		super.willDestroy();
		this.boxOpen.unsubscribe();
		this.mode.unsubscribe();
		this.draft.unsubscribe();
		toolbox.set(false);
		closeMode();
	}

	closeBox = () => toolbox.set(false);

	applyCrop = () => {
		const draft = cropDraft.get();
		const page = store
			.getSnapshot()
			?.pages.find((p) => p.id === draft?.pageId);
		const crop =
			page && draft && cropFromDisplayed(page, draft.rect);
		if (page && crop) cropPage(page.id, crop);
		closeMode();
	};

	// a press outside the drawer and its key closes it
	outsideClose = modifier((sheet: HTMLElement, [open]: [boolean]) => {
		if (!open) return;
		const onDown = (event: PointerEvent) => {
			const target = event.target as HTMLElement;
			if (
				sheet.contains(target) ||
				target.closest('[data-toolbox]')
			)
				return;
			toolbox.set(false);
		};
		document.addEventListener('pointerdown', onDown);
		return () =>
			document.removeEventListener('pointerdown', onDown);
	});

	run = (tool: BoxTool) => {
		toolbox.set(false);
		if (tool === 'fill-sign') modal.set('signature');
		else if (tool === 'export') void exportCurrent();
		else setMode(tool);
	};

	<template>
		{{#if (eq this.mode.current "organise")}}
			<Organise />
		{{/if}}
		<section
			class="err-sheet
				{{if this.boxOpen.current 'is-open'}}
				{{if @phone 'is-phone'}}"
			aria-label="Toolbox"
			inert={{unless this.boxOpen.current true}}
			{{this.outsideClose this.boxOpen.current}}
		>
			<PanelHeader
				@title="Toolbox"
				@onClose={{this.closeBox}}
			/>
			<div class="err-sheet-body">
				{{#each BOX_GROUPS key="heading" as |g|}}
					<div class="err-sheet-group">
						<CanonHeading
							@text={{g.heading}}
						/>
						<div class="err-sheet-grid">
							{{#each
								g.cells
								key="label"
								as |c|
							}}
								<MenuCard
									@title={{c.label}}
									@icon={{c.icon}}
									title={{c.description}}
									@onClick={{fn
										this.run
										c.tool
									}}
								/>
							{{/each}}
						</div>
					</div>
				{{/each}}
			</div>
		</section>

		<div class="err-modes">
			<ToolPanel
				@open={{eq this.mode.current "crop"}}
				@mode="crop"
				@icon="crop"
				@label="Crop"
				@onCancel={{closeMode}}
				@onApply={{this.applyCrop}}
				@canApply={{if this.draft.current true false}}
			>
				<:status>
					<span
						class="err-mode-tag"
					>{{this.cropHint}}</span>
				</:status>
			</ToolPanel>
			{{#each STAMP_MODES as |m|}}
				<StampPanel
					@mode={{m}}
					@open={{eq this.mode.current m}}
				/>
			{{/each}}
			<CompressPanel
				@open={{eq this.mode.current "compress"}}
			/>
			<ImposePanel @open={{eq this.mode.current "impose"}} />
			<RedactPanel @open={{eq this.mode.current "redact"}} />
			<FormPanel @open={{eq this.mode.current "form"}} />
			<CommentPanel
				@open={{eq this.mode.current "comment"}}
			/>
			<PageSizePanel
				@open={{eq this.mode.current "page-size"}}
			/>
			<RotatePanel @open={{eq this.mode.current "rotate"}} />
			<InsertPanel @open={{eq this.mode.current "insert"}} />
		</div>
	</template>
}
