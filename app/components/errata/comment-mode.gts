import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
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
import { setPageIndex, store } from 'delphitools-v2/lib/errata/store';
import {
	getSelectedIds,
	selectObject,
	setMode,
	setOpenNote,
	subscribeUi,
} from 'delphitools-v2/lib/errata/ui';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

interface Entry {
	id: string;
	index: number;
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
								index,
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
		setOpenNote(id);
	};

	setAuthor = (event: Event) => {
		this.author = (event.target as HTMLInputElement).value;
		setCommentAuthor(this.author);
	};

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
			<span class="sub-omni-tag">Click to place</span>
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
