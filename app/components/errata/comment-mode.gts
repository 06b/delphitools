import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import ToolPanel from 'delphitools-v2/components/errata/tool-panel';
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from 'delphitools-v2/components/ui/select';
import {
	commentAuthor,
	setCommentAuthor,
} from 'delphitools-v2/lib/errata/comments';
import {
	patchObjects,
	setPageIndex,
	store,
} from 'delphitools-v2/lib/errata/store';
import {
	getSelectedIds,
	selectObject,
	setMode,
	subscribeUi,
} from 'delphitools-v2/lib/errata/ui';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

interface Entry {
	id: string;
	pageId: string;
	index: number;
	text: string;
	label: string;
}

function excerpt(text: string): string {
	const flat = text.replace(/\s+/g, ' ').trim();
	return flat.length > 32 ? `${flat.slice(0, 31)}…` : flat;
}

export default class CommentModeBar extends Component<{
	Args: { open: boolean };
}> {
	doc = new TrackedExternal(store.subscribe, store.getSnapshot);
	selection = new TrackedExternal(subscribeUi, getSelectedIds);
	@tracked author = commentAuthor();

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.selection.unsubscribe();
	}

	@cached
	get entries(): Entry[] {
		return (this.doc.current?.pages ?? []).flatMap((page, index) =>
			page.objects.flatMap((o) =>
				o.kind === 'comment'
					? [
							{
								id: o.id,
								pageId: page.id,
								index,
								text: o.text,
								label: `${index + 1} · ${excerpt(o.text)}`,
							},
						]
					: [],
			),
		);
	}

	get selected(): Entry | null {
		const ids = this.selection.current;
		if (ids.length !== 1) return null;
		return this.entries.find((e) => e.id === ids[0]) ?? null;
	}

	pick = (id: string) => {
		const entry = this.entries.find((e) => e.id === id);
		if (!entry) return;
		setPageIndex(entry.index);
		selectObject(id);
	};

	#target: Entry | null = null;
	#known = new Set<string>();

	patchNote(entry: Entry, text: string) {
		if (text === entry.text) return;
		patchObjects(
			entry.pageId,
			new Map([
				[
					entry.id,
					{
						text,
						date: new Date().toISOString(),
					},
				],
			]),
		);
	}

	focusNote = () => {
		this.#target = this.selected;
	};

	commitNote = (event: Event) => {
		if (this.#target)
			this.patchNote(
				this.#target,
				(event.target as HTMLInputElement).value,
			);
	};

	setAuthor = (event: Event) => {
		this.author = (event.target as HTMLInputElement).value;
		setCommentAuthor(this.author);
	};

	// unbound: keeps typed text
	noteField = modifier(
		(
			el: HTMLInputElement,
			[id, text, open]: [string?, string?, boolean?],
		) => {
			const focused = el === document.activeElement;
			const pending = this.#target;
			if (focused && pending && pending.id !== id) {
				const typed = el.value;
				queueMicrotask(() =>
					this.patchNote(pending, typed),
				);
			}
			this.#target = focused ? this.selected : null;
			el.value = text ?? '';
			const placed = id !== undefined && !this.#known.has(id);
			this.#known = new Set(this.entries.map((e) => e.id));
			// after canvas steals focus
			if (open && placed && text === '')
				setTimeout(() => el.focus());
		},
	);

	done = () => setMode(null);

	<template>
		<ToolPanel
			@open={{@open}}
			@mode="comment"
			@icon="message-square"
			@label="Comment"
			@onApply={{this.done}}
			@applyLabel="Done"
		>

			<label class="err-mode-field">
				<span class="sub-tool-row-label">Note</span>
				<input
					class="err-mode-input is-wide"
					placeholder="Click to place"
					disabled={{if this.selected false true}}
					{{on "focus" this.focusNote}}
					{{on "change" this.commitNote}}
					{{this.noteField
						this.selected.id
						this.selected.text
						@open
					}}
				/>
			</label>
			<label class="err-mode-field">
				<span class="sub-tool-row-label">Author</span>
				<input
					class="err-mode-input is-narrow"
					value={{this.author}}
					{{on "input" this.setAuthor}}
				/>
			</label>
			<span class="err-mode-field">
				<span class="sub-tool-row-label">List</span>
				<Select
					@value={{this.selected.id}}
					@onValueChange={{this.pick}}
				>
					<SelectTrigger
						class="sub-font-trigger err-mode-select"
						aria-label="List"
					>
						<SelectValue>
							{{#if this.selected}}
								{{this.selected.label}}
							{{else}}
								{{this.entries.length}}
							{{/if}}
						</SelectValue>
					</SelectTrigger>
					<SelectContent>
						{{#each
							this.entries key="id"
							as |e|
						}}
							<SelectItem
								@value={{e.id}}
							>{{e.label}}</SelectItem>
						{{/each}}
					</SelectContent>
				</Select>
			</span>
		</ToolPanel>
	</template>
}
