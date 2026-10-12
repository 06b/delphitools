import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import Icon from 'delphitools-v2/components/icon';
import ToolPanel from 'delphitools-v2/components/errata/tool-panel';
import { thumb } from 'delphitools-v2/components/errata/page-rail';
import type { ErrataPage } from 'delphitools-v2/lib/errata/doc-model';
import {
	deletePages,
	duplicatePages,
	insertBlank,
	movePages,
	rotatePages,
	updatePages,
} from 'delphitools-v2/lib/errata/organise';
import { setPageIndex, store } from 'delphitools-v2/lib/errata/store';
import { setMode } from 'delphitools-v2/lib/errata/ui';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

// 2x the 140px frame
const THUMB_PX = 280;

export default class Organise extends Component {
	doc = new TrackedExternal(store.subscribe, store.getSnapshot);
	@tracked selected: ReadonlySet<string> = new Set();
	@tracked dropAt: number | null = null;
	#anchor: string | null = null;
	#dragging = false;

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		// canvas opens first selection
		const first = this.pages.findIndex((p) =>
			this.selected.has(p.id),
		);
		if (first !== -1) setPageIndex(first);
	}

	get pages(): readonly ErrataPage[] {
		return this.doc.current?.pages ?? [];
	}

	get rows() {
		const last = this.pages.length - 1;
		return this.pages.map((page, index) => ({
			page,
			index,
			number: index + 1,
			selected: this.selected.has(page.id),
			dropBefore: this.dropAt === index,
			dropAfter: index === last && this.dropAt === index + 1,
		}));
	}

	get count() {
		return this.pages.filter((p) => this.selected.has(p.id)).length;
	}

	get none() {
		return this.count === 0;
	}

	get cannotDelete() {
		return this.none || this.count === this.pages.length;
	}

	select = (index: number, event: MouseEvent) => {
		const id = this.pages[index]!.id;
		const anchor = this.pages.findIndex(
			(p) => p.id === this.#anchor,
		);
		if (event.shiftKey && anchor !== -1) {
			const [a, b] = [anchor, index].sort((x, y) => x - y);
			this.selected = new Set(
				this.pages.slice(a, b! + 1).map((p) => p.id),
			);
			return;
		}
		this.#anchor = id;
		if (event.metaKey || event.ctrlKey) {
			const next = new Set(this.selected);
			if (!next.delete(id)) next.add(id);
			this.selected = next;
		} else this.selected = new Set([id]);
	};

	selectAll = () => {
		this.selected = new Set(this.pages.map((p) => p.id));
	};

	open = (index: number) => {
		this.selected = new Set([this.pages[index]!.id]);
		setMode(null);
	};

	done = () => setMode(null);

	rotate = (turns: 1 | -1) =>
		updatePages((p) => rotatePages(p, this.selected, turns));

	remove = () => {
		if (this.cannotDelete) return;
		updatePages((p) => deletePages(p, this.selected));
		this.selected = new Set();
	};

	#selectAdded(before: readonly ErrataPage[]) {
		const old = new Set(before.map((p) => p.id));
		this.selected = new Set(
			this.pages
				.filter((p) => !old.has(p.id))
				.map((p) => p.id),
		);
	}

	duplicate = () => {
		const before = this.pages;
		updatePages((p) => duplicatePages(p, this.selected));
		this.#selectAdded(before);
	};

	insert = () => {
		const before = this.pages;
		updatePages((p) => insertBlank(p, this.selected));
		this.#selectAdded(before);
	};

	dragStart = (index: number, event: DragEvent) => {
		const id = this.pages[index]!.id;
		if (!this.selected.has(id)) {
			this.selected = new Set([id]);
			this.#anchor = id;
		}
		this.#dragging = true;
		if (event.dataTransfer) {
			event.dataTransfer.effectAllowed = 'move';
			event.dataTransfer.setData('text/plain', id);
		}
	};

	dragOver = (index: number, event: DragEvent) => {
		if (!this.#dragging) return;
		event.preventDefault();
		const r = (
			event.currentTarget as HTMLElement
		).getBoundingClientRect();
		const at =
			event.clientX < r.left + r.width / 2
				? index
				: index + 1;
		if (at !== this.dropAt) this.dropAt = at;
	};

	drop = (event: DragEvent) => {
		event.preventDefault();
		const to = this.dropAt;
		if (this.#dragging && to !== null)
			updatePages((p) => movePages(p, this.selected, to));
		this.dragEnd();
	};

	dragEnd = () => {
		this.#dragging = false;
		this.dropAt = null;
	};

	// capture: preempts errata-shortcuts
	behaviour = modifier((grid: HTMLElement) => {
		const onKey = (e: KeyboardEvent) => {
			const t = e.target as HTMLElement | null;
			if (
				t?.closest(
					'input, textarea, select, [contenteditable]',
				)
			)
				return;
			const mod = e.metaKey || e.ctrlKey;
			if (
				!mod &&
				(e.key === 'Delete' || e.key === 'Backspace')
			)
				this.remove();
			else if (mod && e.key.toLowerCase() === 'a')
				this.selectAll();
			else return;
			e.preventDefault();
			e.stopPropagation();
		};
		const onClick = (e: MouseEvent) => {
			if (e.target === grid) this.selected = new Set();
		};
		window.addEventListener('keydown', onKey, true);
		grid.addEventListener('click', onClick);
		return () => {
			window.removeEventListener('keydown', onKey, true);
			grid.removeEventListener('click', onClick);
		};
	});

	<template>
		<div class="err-organise">
			<div class="err-organise-grid" {{this.behaviour}}>
				{{#each this.rows key="page.id" as |row|}}
					<button
						type="button"
						class="err-organise-cell
							{{if
								row.selected
								'is-selected'
							}}
							{{if
								row.dropBefore
								'is-drop-before'
							}}
							{{if
								row.dropAfter
								'is-drop-after'
							}}"
						draggable="true"
						aria-label="Page {{row.number}}"
						aria-pressed={{if
							row.selected
							"true"
							"false"
						}}
						{{on
							"click"
							(fn
								this.select
								row.index
							)
						}}
						{{on
							"dblclick"
							(fn this.open row.index)
						}}
						{{on
							"dragstart"
							(fn
								this.dragStart
								row.index
							)
						}}
						{{on
							"dragover"
							(fn
								this.dragOver
								row.index
							)
						}}
						{{on "drop" this.drop}}
						{{on "dragend" this.dragEnd}}
					>
						<span
							class="err-organise-frame"
						>
							<img
								alt=""
								class="err-page-thumb"
								{{thumb
									row.page
									THUMB_PX
								}}
							/>
						</span>
						<span
							class="err-page-num"
						>{{row.number}}</span>
					</button>
				{{/each}}
			</div>

			<ToolPanel
				@open={{true}}
				@mode="organise"
				@icon="layout-grid"
				@label="Organise"
				@onApply={{this.done}}
				@applyLabel="Done"
			>
				<:status>
					<span
						class="sub-omni-tag"
					>{{this.count}}
						selected</span>
				</:status>
				<:actions>
					<button
						type="button"
						class="sub-modal-btn is-ghost is-icon"
						title="Rotate left"
						aria-label="Rotate left"
						disabled={{this.none}}
						{{on
							"click"
							(fn this.rotate -1)
						}}
					>
						<Icon @name="rotate-ccw" />
					</button>
					<button
						type="button"
						class="sub-modal-btn is-ghost is-icon"
						title="Rotate right"
						aria-label="Rotate right"
						disabled={{this.none}}
						{{on
							"click"
							(fn this.rotate 1)
						}}
					>
						<Icon @name="rotate-cw" />
					</button>
					<button
						type="button"
						class="sub-modal-btn is-ghost is-icon"
						title="Duplicate"
						aria-label="Duplicate"
						disabled={{this.none}}
						{{on "click" this.duplicate}}
					>
						<Icon @name="copy" />
					</button>
					<button
						type="button"
						class="sub-modal-btn is-ghost is-icon"
						title="Insert blank page"
						aria-label="Insert blank page"
						{{on "click" this.insert}}
					>
						<Icon @name="file-plus" />
					</button>
					<button
						type="button"
						class="sub-modal-btn is-ghost is-icon"
						title="Delete"
						aria-label="Delete"
						disabled={{this.cannotDelete}}
						{{on "click" this.remove}}
					>
						<Icon @name="trash-2" />
					</button>
				</:actions>
			</ToolPanel>
		</div>
	</template>
}
