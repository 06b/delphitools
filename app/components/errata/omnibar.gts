import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import type { TOC } from '@ember/component/template-only';
import { modifier } from 'ember-modifier';
import { eq, or } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import BoxModeBar from 'delphitools-v2/components/errata/box-mode';
import Organise from 'delphitools-v2/components/errata/organise';
import CommentModeBar from 'delphitools-v2/components/errata/comment-mode';
import { Bloom } from 'delphitools-v2/components/substrata/omnibar/omnibar';
import {
	ColourCell,
	Row,
} from 'delphitools-v2/components/substrata/omnibar/tool-settings';
import {
	PresetRow,
	type PresetOption,
} from 'delphitools-v2/components/substrata/preset-row';
import type { ShapeKind } from 'delphitools-v2/lib/errata/doc-model';
import { exportCurrent } from 'delphitools-v2/lib/errata/export-file';
import {
	insertBlankAfter,
	rotateCurrent,
} from 'delphitools-v2/lib/errata/page-ops';
import { currentPage } from 'delphitools-v2/lib/errata/store';
import {
	TOOL_ORDER,
	getActiveTool,
	getToolSettings,
	setActiveTool,
	subscribeTool,
	updateToolSettings,
	type ToolEntry,
	type ToolId,
	type ToolSettings,
} from 'delphitools-v2/lib/errata/tool';
import {
	getMode,
	isToolboxOpen,
	OWN_BAR_MODES,
	openModal,
	pickImageFile,
	setMode,
	setToolboxOpen,
	subscribeUi,
	type BoxMode,
} from 'delphitools-v2/lib/errata/ui';
import { allTools } from 'delphitools-v2/lib/tools';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

// substrata omnibar shapes, fixed at the bottom: markup bar + settings unit +
// toolbox unit. the toolbox is a bottom sheet that swaps places with the bar.

type Shape = Exclude<ShapeKind, 'highlight'>;

const SHAPE_CELLS: { shape: Shape; label: string; icon: string }[] = [
	{ shape: 'rect', label: 'Rectangle', icon: 'square' },
	{ shape: 'ellipse', label: 'Ellipse', icon: 'circle' },
	{ shape: 'line', label: 'Line', icon: 'minus' },
];

const STROKE_SIZES: PresetOption[] = [1, 2, 4, 8].map((v) => ({
	value: v,
	label: String(v),
}));

const FONT_SIZES: PresetOption[] = [10, 12, 14, 18].map((v) => ({
	value: v,
	label: String(v),
}));

type BoxTool =
	| 'page-size'
	| 'rotate'
	| 'crop'
	| 'insert'
	| 'fill-sign'
	| 'export'
	| BoxMode;

interface BoxCell {
	label: string;
	icon: string;
	description: string;
	/** absent: not built yet, shown dimmed */
	tool?: BoxTool;
}

// descriptions come from the registry where a delphitools tool exists
function fromRegistry(id: string): string {
	return allTools.find((t) => t.id === id)?.description ?? '';
}

// cells without a tool are the agreed roadmap; each phase fills one
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

function toolLabel(id: ToolId): string {
	return TOOL_ORDER.find((t) => t.id === id)?.label ?? '';
}

function toolIcon(id: ToolId, s: ToolSettings): string {
	if (id === 'shape')
		return (
			SHAPE_CELLS.find((c) => c.shape === s.shape)?.icon ??
			'square'
		);
	return TOOL_ORDER.find((t) => t.id === id)?.icon ?? '';
}

function chips(id: ToolId, s: ToolSettings): string[] {
	switch (id) {
		case 'text':
			return [`${s.fontSize} pt`, s.colour];
		case 'ink':
			return [`${s.strokeWidth} pt`, s.colour];
		case 'shape':
			return [
				SHAPE_CELLS.find((c) => c.shape === s.shape)
					?.label ?? '',
				`${s.strokeWidth} pt`,
			];
		case 'highlight':
			return [s.highlightColour];
		default:
			return [];
	}
}

const Tag: TOC<{ Args: { value: string } }> = <template>
	<span class="sub-omni-tag">{{@value}}</span>
</template>;

const ToolButton: TOC<{
	Args: {
		tool: ToolEntry;
		active: boolean;
		onPick: (id: ToolId) => void;
	};
}> = <template>
	<button
		type="button"
		class="sub-omni-tool {{if @active 'is-active'}}"
		title={{@tool.label}}
		aria-label={{@tool.label}}
		aria-pressed={{if @active "true" "false"}}
		{{on "click" (fn @onPick @tool.id)}}
	>
		<Icon @name={{@tool.icon}} class="sub-omni-tool-glyph" />
		<span class="sub-omni-key">{{@tool.key}}</span>
	</button>
</template>;

export default class Omnibar extends Component {
	tool = new TrackedExternal(subscribeTool, getActiveTool);
	settings = new TrackedExternal(subscribeTool, getToolSettings);
	boxOpen = new TrackedExternal(subscribeUi, isToolboxOpen);
	mode = new TrackedExternal(subscribeUi, getMode);

	cropHint = 'Drag on the page';

	willDestroy() {
		super.willDestroy();
		this.tool.unsubscribe();
		this.settings.unsubscribe();
		this.boxOpen.unsubscribe();
		this.mode.unsubscribe();
		setToolboxOpen(false);
		setMode(null);
	}

	get s() {
		return this.settings.current;
	}

	get label() {
		return toolLabel(this.tool.current);
	}

	get icon() {
		return toolIcon(this.tool.current, this.s);
	}

	get chips() {
		return chips(this.tool.current, this.s);
	}

	get hasSettings() {
		return this.tool.current !== 'select';
	}

	// crop is a toolbox mode: the bar gives way to a mode bar
	get inMode() {
		return this.tool.current === 'crop';
	}

	get barHidden() {
		return (
			this.boxOpen.current ||
			this.inMode ||
			this.mode.current !== null
		);
	}

	get organising() {
		return this.mode.current === 'organise';
	}

	// these modes render own bars
	get boxModeOpen() {
		const mode = this.mode.current;
		return mode !== null && !OWN_BAR_MODES.includes(mode);
	}

	// kept for slide-out
	#lastMode: BoxMode | null = null;

	get modeCell() {
		const mode = this.mode.current ?? this.#lastMode;
		const cell = BOX_GROUPS.flatMap((g) => g.cells).find(
			(c) => c.tool === mode,
		);
		return {
			mode,
			label: cell?.label ?? '',
			icon: cell?.icon ?? '',
		};
	}

	pick = (id: ToolId) => {
		if (id === 'signature') {
			openModal('signature');
			return;
		}
		if (id === 'image') {
			pickImageFile();
			return;
		}
		setActiveTool(id);
	};

	pickShape = (shape: Shape) => {
		updateToolSettings({ shape });
		setActiveTool('shape');
	};

	setColour = (colour: string) => {
		if (this.tool.current === 'highlight')
			updateToolSettings({ highlightColour: colour });
		else updateToolSettings({ colour });
	};

	setStroke = (strokeWidth: number) =>
		updateToolSettings({ strokeWidth });
	setFontSize = (fontSize: number) => updateToolSettings({ fontSize });

	toggleBox = () => setToolboxOpen(!this.boxOpen.current);
	closeBox = () => setToolboxOpen(false);
	leaveMode = () => setActiveTool('select');

	// mousedown outside the sheet and its trigger closes it
	outsideClose = modifier((sheet: HTMLElement, [open]: [boolean]) => {
		if (!open) return;
		const onDown = (event: MouseEvent) => {
			const target = event.target as HTMLElement;
			if (
				sheet.contains(target) ||
				target.closest('[data-toolbox]')
			)
				return;
			setToolboxOpen(false);
		};
		document.addEventListener('mousedown', onDown);
		return () => document.removeEventListener('mousedown', onDown);
	});

	run = (tool: BoxTool | undefined) => {
		if (!tool) return;
		setToolboxOpen(false);
		const page = currentPage();
		switch (tool) {
			case 'page-size':
				openModal('page-size');
				break;
			case 'rotate':
				if (page) rotateCurrent(page.id, 1);
				break;
			case 'crop':
				setActiveTool('crop');
				break;
			case 'insert':
				if (page) insertBlankAfter(page.id);
				break;
			case 'fill-sign':
				openModal('signature');
				break;
			case 'export':
				void exportCurrent();
				break;
			default:
				setActiveTool('select');
				this.#lastMode = tool;
				setMode(tool);
		}
	};

	<template>
		{{#if this.organising}}
			<Organise />
		{{/if}}
		<div
			class="sub-omni-dock pointer-events-none absolute z-40 is-bottom"
		>
			<div
				class="sub-omni-barrow is-align-end err-barrow
					{{if this.barHidden 'is-hidden'}}"
			>
				<div
					class="sub-omni-box pointer-events-auto border shadow-lg"
				>
					{{#each TOOL_ORDER key="id" as |t|}}
						{{#if
							(or
								(eq t.id "text")
								(eq
									t.id
									"signature"
								)
							)
						}}
							<span
								aria-hidden="true"
								class="sub-omni-sep"
							></span>
						{{/if}}
						{{#if (eq t.id "shape")}}
							<div
								class="sub-omni-trigger"
							>
								<ToolButton
									@tool={{t}}
									@active={{eq
										this.tool.current
										t.id
									}}
									@onPick={{this.pick}}
								/>
								<Bloom
									@edge="bottom"
									@cross="center"
								>
									<div
										class="sub-tool-flyout"
									>
										{{#each
											SHAPE_CELLS
											key="shape"
											as |cell|
										}}
											<button
												type="button"
												title={{cell.label}}
												aria-label={{cell.label}}
												aria-pressed={{if
													(eq
														this.s.shape
														cell.shape
													)
													"true"
													"false"
												}}
												class="sub-tool-flyout-cell
													{{if
														(eq
															this.s.shape
															cell.shape
														)
														'is-active'
													}}"
												{{on
													"click"
													(fn
														this.pickShape
														cell.shape
													)
												}}
											>
												<Icon
													@name={{cell.icon}}
												/>
											</button>
										{{/each}}
									</div>
								</Bloom>
							</div>
						{{else}}
							<ToolButton
								@tool={{t}}
								@active={{eq
									this.tool.current
									t.id
								}}
								@onPick={{this.pick}}
							/>
						{{/if}}
					{{/each}}
				</div>

				<div
					class="sub-omni-unit pointer-events-auto border shadow-lg"
				>
					<div class="sub-omni-trigger">
						<div
							class="sub-omni-tool-btn"
							data-tool-unit="true"
						>
							<span
								class="sub-omni-tool-icon"
							>
								<Icon
									@name={{this.icon}}
									class="sub-omni-tool-glyph"
								/>
							</span>
							<span
								class="sub-omni-tool-meta"
							>
								<span
									class="sub-omni-tool-name"
								>{{this.label}}</span>
								{{#each
									this.chips
									key="@index"
									as |c|
								}}
									<Tag
										@value={{c}}
									/>
								{{/each}}
							</span>
						</div>
						{{#if this.hasSettings}}
							<Bloom
								@edge="bottom"
								@cross="end"
							>
								<div
									class="sub-tool-pane is-w200"
								>
									<Row
										@label="Colour"
									>
										<ColourCell
											@colour={{if
												(eq
													this.tool.current
													"highlight"
												)
												this.s.highlightColour
												this.s.colour
											}}
											@onChange={{this.setColour}}
											@aria={{if
												(eq
													this.tool.current
													"highlight"
												)
												"Highlight colour"
												"Colour"
											}}
										/>
									</Row>
									{{#if
										(eq
											this.tool.current
											"text"
										)
									}}
										<Row
											@label="Size"
										>
											<PresetRow
												@options={{FONT_SIZES}}
												@value={{this.s.fontSize}}
												@onChange={{this.setFontSize}}
												@min={{4}}
												@max={{200}}
												@unit="pt"
											/>
										</Row>
									{{else if
										(or
											(eq
												this.tool.current
												"ink"
											)
											(eq
												this.tool.current
												"shape"
											)
										)
									}}
										<Row
											@label="Size"
										>
											<PresetRow
												@options={{STROKE_SIZES}}
												@value={{this.s.strokeWidth}}
												@onChange={{this.setStroke}}
												@min={{1}}
												@max={{32}}
												@unit="pt"
											/>
										</Row>
									{{/if}}
								</div>
							</Bloom>
						{{/if}}
					</div>
				</div>

				<div
					class="sub-omni-unit pointer-events-auto border shadow-lg"
				>
					<button
						type="button"
						class="sub-omni-tool-btn
							{{if
								this.boxOpen.current
								'is-pinned'
							}}"
						data-toolbox="true"
						aria-expanded={{if
							this.boxOpen.current
							"true"
							"false"
						}}
						{{on "click" this.toggleBox}}
					>
						<span
							class="sub-omni-tool-icon"
						>
							<Icon
								@name="briefcase"
								class="sub-omni-tool-glyph"
							/>
						</span>
						<span
							class="sub-omni-tool-meta"
						>
							<span
								class="sub-omni-tool-name"
							>Toolbox</span>
						</span>
						<Icon
							@name={{if
								this.boxOpen.current
								"chevron-down"
								"chevron-up"
							}}
							class="err-box-chevron"
						/>
					</button>
				</div>
			</div>

			<div
				class="err-sheet pointer-events-auto border shadow-lg
					{{if this.boxOpen.current 'is-open'}}"
				{{this.outsideClose this.boxOpen.current}}
			>
				<div class="err-sheet-head">
					<Icon
						@name="briefcase"
						class="sub-omni-tool-glyph"
					/>
					<span
						class="sub-omni-tool-name"
					>Toolbox</span>
					<button
						type="button"
						class="sub-topbar-fit-btn err-sheet-close"
						aria-label="Close"
						{{on "click" this.closeBox}}
					>
						<Icon @name="x" />
					</button>
				</div>
				<div class="err-sheet-body">
					{{#each
						BOX_GROUPS key="heading"
						as |g|
					}}
						<section
							class="dt-section err-sheet-section"
						>
							<h2
								class="dt-section-title"
							>
								{{g.heading}}
								<span
									class="dt-section-count"
								>{{g.cells.length}}</span>
							</h2>
							<div class="dt-grid">
								{{#each
									g.cells
									key="label"
									as |c|
								}}
									<button
										type="button"
										class="dt-cell err-sheet-cell
											{{unless
												c.tool
												'is-soon'
											}}"
										disabled={{if
											c.tool
											false
											true
										}}
										{{on
											"click"
											(fn
												this.run
												c.tool
											)
										}}
									>
										<Icon
											@name={{c.icon}}
											class="dt-cell-icon"
										/>
										<span
											class="err-cell-title"
										>
											<span
												class="dt-cell-name"
											>{{c.label}}</span>
										</span>
										<span
											class="dt-cell-desc"
										>{{c.description}}</span>
									</button>
								{{/each}}
							</div>
						</section>
					{{/each}}
				</div>
			</div>

			<div
				class="err-mode pointer-events-auto
					{{if this.inMode 'is-open'}}"
			>
				<Icon
					@name="crop"
					class="sub-omni-tool-glyph"
				/>
				<span class="sub-omni-tool-name">Crop</span>
				<span
					class="sub-omni-tag"
				>{{this.cropHint}}</span>
				<span class="err-mode-actions">
					<button
						type="button"
						class="sub-modal-btn is-ghost"
						{{on "click" this.leaveMode}}
					>
						<Icon @name="x" />
						Cancel
					</button>
				</span>
			</div>

			<BoxModeBar
				@mode={{this.modeCell.mode}}
				@label={{this.modeCell.label}}
				@icon={{this.modeCell.icon}}
				@open={{this.boxModeOpen}}
			/>
			<CommentModeBar
				@open={{eq this.mode.current "comment"}}
			/>
		</div>
	</template>
}
