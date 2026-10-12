import Component from '@glimmer/component';
import { cached } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import Icon from 'delphitools-v2/components/icon';
import ToolPanel, {
	Field,
	PageScope,
	PageScopeState,
} from 'delphitools-v2/components/errata/tool-panel';
import {
	duplicateAfter,
	flipPages,
	insertBlackAfter,
	insertBlankAfter,
	insertPageAfter,
	insertTextPageAfter,
	rotatePages,
	updatePages,
} from 'delphitools-v2/lib/errata/page-ops';
import { imagePage } from 'delphitools-v2/lib/errata/source';
import {
	currentPage,
	getPageIndex,
	store,
	subscribePage,
} from 'delphitools-v2/lib/errata/store';
import { closeMode } from 'delphitools-v2/lib/errata/ui';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import type { ErrataPage } from 'delphitools-v2/lib/errata/doc-model';

type Turn = (pages: readonly ErrataPage[], ids: Set<string>) => ErrataPage[];
type Insert = (pageId: string) => void;

interface Strip<T> {
	icon: string;
	text: string;
	run: T;
	label?: string;
}

const ROTATE: Strip<Turn>[] = [
	{
		label: 'Rotate left',
		icon: 'rotate-ccw',
		text: 'Left',
		run: (p, ids) => rotatePages(p, ids, -1),
	},
	{
		label: 'Rotate right',
		icon: 'rotate-cw',
		text: 'Right',
		run: (p, ids) => rotatePages(p, ids, 1),
	},
];

const FLIP: Strip<Turn>[] = [
	{
		label: 'Flip horizontal',
		icon: 'flip-horizontal-2',
		text: 'Horizontal',
		run: (p, ids) => flipPages(p, ids, 'horizontal'),
	},
	{
		label: 'Flip vertical',
		icon: 'flip-vertical-2',
		text: 'Vertical',
		run: (p, ids) => flipPages(p, ids, 'vertical'),
	},
];

interface Signature {
	Args: { open: boolean };
}

class Strips<T> extends Component<{
	Args: {
		strips: readonly Strip<T>[];
		onRun: (run: T) => void;
		disabled?: boolean;
	};
	Blocks: { default: [] };
}> {
	<template>
		<span class="segmented err-mode-seg">
			{{#each @strips key="text" as |s|}}
				<button
					type="button"
					class="sub-seg-cell err-strip-cell"
					aria-label={{s.label}}
					disabled={{@disabled}}
					{{on "click" (fn @onRun s.run)}}
				>
					<Icon @name={{s.icon}} />
					{{s.text}}
				</button>
			{{/each}}
			{{yield}}
		</span>
	</template>
}

export class RotatePanel extends Component<Signature> {
	doc = new TrackedExternal(store.subscribe, store.getSnapshot);
	pageIndex = new TrackedExternal(subscribePage, getPageIndex);
	pages = new PageScopeState('current');

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.pageIndex.unsubscribe();
	}

	@cached
	get indices(): number[] | null {
		return this.pages.indices(
			this.doc.current?.pages.length ?? 0,
			this.pageIndex,
		);
	}

	get invalid() {
		return this.indices === null;
	}

	// one undo step
	turn = (run: Turn) => {
		const pages = this.doc.current?.pages ?? [];
		const ids = new Set(
			(this.indices ?? []).flatMap((i) =>
				pages[i] ? [pages[i].id] : [],
			),
		);
		if (ids.size > 0) updatePages((p) => run(p, ids));
	};

	<template>
		<ToolPanel
			@open={{@open}}
			@mode="rotate"
			@icon="rotate-cw"
			@label="Rotate"
			@onCancel={{closeMode}}
			@cancelLabel="Close"
		>
			<Field @label="Rotate">
				<Strips
					@strips={{ROTATE}}
					@disabled={{this.invalid}}
					@onRun={{this.turn}}
				/>
			</Field>
			<Field @label="Flip">
				<Strips
					@strips={{FLIP}}
					@disabled={{this.invalid}}
					@onRun={{this.turn}}
				/>
			</Field>
			<PageScope
				@state={{this.pages}}
				@invalid={{this.invalid}}
			/>
		</ToolPanel>
	</template>
}

const INSERTS: Strip<Insert>[] = [
	{ icon: 'file-plus', text: 'Blank', run: insertBlankAfter },
	{ icon: 'copy', text: 'Duplicate', run: duplicateAfter },
	{ icon: 'square', text: 'Black', run: insertBlackAfter },
	{
		icon: 'type',
		text: 'Text',
		run: (id) => insertTextPageAfter(id, 'Title'),
	},
];

/** inserts after current page */
export class InsertPanel extends Component<Signature> {
	#input: HTMLInputElement | null = null;

	insert = (run: Insert) => {
		const page = currentPage();
		if (page) run(page.id);
	};

	pickImage = () => this.#input?.click();

	bindInput = modifier((el: HTMLInputElement) => {
		this.#input = el;
	});

	onImage = async (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		insertPageAfter(
			currentPage()?.id ?? null,
			await imagePage(file),
		);
	};

	<template>
		<ToolPanel
			@open={{@open}}
			@mode="insert"
			@icon="file-plus"
			@label="Insert page"
			@onCancel={{closeMode}}
			@cancelLabel="Close"
		>
			<Field @label="Page">
				<Strips
					@strips={{INSERTS}}
					@onRun={{this.insert}}
				>
					<button
						type="button"
						class="sub-seg-cell err-strip-cell"
						{{on "click" this.pickImage}}
					>
						<Icon @name="file-image" />
						Image
					</button>
				</Strips>
				<input
					type="file"
					accept="image/*"
					class="sub-topbar-file-input"
					aria-label="Image page"
					{{this.bindInput}}
					{{on "change" this.onImage}}
				/>
			</Field>
		</ToolPanel>
	</template>
}
