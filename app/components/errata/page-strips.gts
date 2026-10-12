import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import Icon from 'delphitools-v2/components/icon';
import ToolPanel, {
	Field,
	PageScope,
} from 'delphitools-v2/components/errata/tool-panel';
import {
	flipPage,
	rotatePage,
	type ErrataPage,
} from 'delphitools-v2/lib/errata/doc-model';
import { updatePages } from 'delphitools-v2/lib/errata/organise';
import {
	duplicateAfter,
	insertBlackAfter,
	insertBlankAfter,
	insertPageAfter,
	insertTextPageAfter,
} from 'delphitools-v2/lib/errata/page-ops';
import { imagePage } from 'delphitools-v2/lib/errata/source';
import {
	scopePages,
	type PageScope as Scope,
} from 'delphitools-v2/lib/errata/stamps';
import {
	currentPage,
	getPageIndex,
	store,
	subscribePage,
} from 'delphitools-v2/lib/errata/store';
import { getMode, setMode, subscribeUi } from 'delphitools-v2/lib/errata/ui';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

const close = () => setMode(null);

type Turn = 'left' | 'right' | 'horizontal' | 'vertical';

const TURNS: Record<Turn, (page: ErrataPage) => ErrataPage> = {
	left: (p) => rotatePage(p, -1),
	right: (p) => rotatePage(p, 1),
	horizontal: (p) => flipPage(p, 'horizontal'),
	vertical: (p) => flipPage(p, 'vertical'),
};

export class RotatePanel extends Component {
	mode = new TrackedExternal(subscribeUi, getMode);
	doc = new TrackedExternal(store.subscribe, store.getSnapshot);
	pageIndex = new TrackedExternal(subscribePage, getPageIndex);
	@tracked scope: Scope = 'current';
	@tracked range = '';

	willDestroy() {
		super.willDestroy();
		this.mode.unsubscribe();
		this.doc.unsubscribe();
		this.pageIndex.unsubscribe();
	}

	get open() {
		return this.mode.current === 'rotate';
	}

	@cached
	get indices(): number[] | null {
		return scopePages(
			this.scope,
			this.range,
			this.doc.current?.pages.length ?? 0,
			this.pageIndex.current,
		);
	}

	get rangeInvalid() {
		return this.scope === 'range' && this.indices === null;
	}

	setScope = (scope: Scope) => (this.scope = scope);
	setRange = (range: string) => (this.range = range);

	// one undo step
	turn = (kind: Turn) => {
		const at = new Set(this.indices ?? []);
		if (at.size === 0) return;
		updatePages((pages) =>
			pages.map((p, i) => (at.has(i) ? TURNS[kind](p) : p)),
		);
	};

	<template>
		<ToolPanel
			@open={{this.open}}
			@mode="rotate"
			@icon="rotate-cw"
			@label="Rotate"
			@onCancel={{close}}
			@cancelLabel="Close"
		>
			<Field @label="Rotate">
				<span class="segmented err-mode-seg">
					<button
						type="button"
						class="sub-seg-cell err-strip-cell"
						aria-label="Rotate left"
						disabled={{this.rangeInvalid}}
						{{on
							"click"
							(fn this.turn "left")
						}}
					>
						<Icon @name="rotate-ccw" />
						Left
					</button>
					<button
						type="button"
						class="sub-seg-cell err-strip-cell"
						aria-label="Rotate right"
						disabled={{this.rangeInvalid}}
						{{on
							"click"
							(fn this.turn "right")
						}}
					>
						<Icon @name="rotate-cw" />
						Right
					</button>
				</span>
			</Field>
			<Field @label="Flip">
				<span class="segmented err-mode-seg">
					<button
						type="button"
						class="sub-seg-cell err-strip-cell"
						aria-label="Flip horizontal"
						disabled={{this.rangeInvalid}}
						{{on
							"click"
							(fn
								this.turn
								"horizontal"
							)
						}}
					>
						<Icon
							@name="flip-horizontal-2"
						/>
						Horizontal
					</button>
					<button
						type="button"
						class="sub-seg-cell err-strip-cell"
						aria-label="Flip vertical"
						disabled={{this.rangeInvalid}}
						{{on
							"click"
							(fn
								this.turn
								"vertical"
							)
						}}
					>
						<Icon @name="flip-vertical-2" />
						Vertical
					</button>
				</span>
			</Field>
			<PageScope
				@scope={{this.scope}}
				@range={{this.range}}
				@invalid={{this.rangeInvalid}}
				@onScope={{this.setScope}}
				@onRange={{this.setRange}}
			/>
		</ToolPanel>
	</template>
}

type Insert = 'blank' | 'duplicate' | 'black' | 'text';

const INSERTS: Record<Insert, (pageId: string) => void> = {
	blank: insertBlankAfter,
	duplicate: duplicateAfter,
	black: insertBlackAfter,
	text: (id) => insertTextPageAfter(id, 'Title'),
};

/** inserts after current page */
export class InsertPanel extends Component {
	mode = new TrackedExternal(subscribeUi, getMode);
	#input: HTMLInputElement | null = null;

	willDestroy() {
		super.willDestroy();
		this.mode.unsubscribe();
	}

	get open() {
		return this.mode.current === 'insert';
	}

	insert = (kind: Insert) => {
		const page = currentPage();
		if (page) INSERTS[kind](page.id);
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
			@open={{this.open}}
			@mode="insert"
			@icon="file-plus"
			@label="Insert page"
			@onCancel={{close}}
			@cancelLabel="Close"
		>
			<span class="segmented err-mode-seg">
				<button
					type="button"
					class="sub-seg-cell err-strip-cell"
					{{on "click" (fn this.insert "blank")}}
				>
					<Icon @name="file-plus" />
					Blank
				</button>
				<button
					type="button"
					class="sub-seg-cell err-strip-cell"
					{{on
						"click"
						(fn this.insert "duplicate")
					}}
				>
					<Icon @name="copy" />
					Duplicate
				</button>
				<button
					type="button"
					class="sub-seg-cell err-strip-cell"
					{{on "click" (fn this.insert "black")}}
				>
					<Icon @name="square" />
					Black
				</button>
				<button
					type="button"
					class="sub-seg-cell err-strip-cell"
					{{on "click" (fn this.insert "text")}}
				>
					<Icon @name="type" />
					Text
				</button>
				<button
					type="button"
					class="sub-seg-cell err-strip-cell"
					{{on "click" this.pickImage}}
				>
					<Icon @name="file-image" />
					Image
				</button>
			</span>
			<input
				type="file"
				accept="image/*"
				class="sub-topbar-file-input"
				aria-label="Image page"
				{{this.bindInput}}
				{{on "change" this.onImage}}
			/>
		</ToolPanel>
	</template>
}
