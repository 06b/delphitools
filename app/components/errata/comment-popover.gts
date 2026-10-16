import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import {
	autoUpdate,
	computePosition,
	flip,
	offset,
	shift,
} from '@floating-ui/dom';
import { modifier } from 'ember-modifier';
import { Cell } from 'delphitools-v2/components/substrata/editor/cells';
import type { CommentObject } from 'delphitools-v2/lib/errata/doc-model';
import {
	findObject,
	patchObjects,
	removeObjects,
	store,
} from 'delphitools-v2/lib/errata/store';
import {
	objectRect,
	openNote,
	pushDismiss,
} from 'delphitools-v2/lib/errata/ui';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import './comment-popover.css';

interface Open {
	pageId: string;
	note: CommentObject;
}

export default class CommentPopover extends Component {
	doc = new TrackedExternal(store.subscribe, store.getSnapshot);
	openId = new TrackedExternal(openNote.subscribe, openNote.get);

	willDestroy() {
		super.willDestroy();
		this.doc.unsubscribe();
		this.openId.unsubscribe();
	}

	get open(): Open | null {
		const hit = findObject(this.doc.current, this.openId.current);
		return hit?.object.kind === 'comment'
			? { pageId: hit.page.id, note: hit.object }
			: null;
	}

	get date(): string {
		const iso = this.open?.note.date;
		return iso
			? new Date(iso).toLocaleString(undefined, {
					dateStyle: 'medium',
					timeStyle: 'short',
				})
			: '';
	}

	#text: HTMLTextAreaElement | null = null;

	commit = () => {
		const open = this.open;
		const text = this.#text?.value;
		if (!open || text === undefined || text === open.note.text)
			return;
		patchObjects(
			open.pageId,
			new Map([
				[
					open.note.id,
					{
						text,
						date: new Date().toISOString(),
					},
				],
			]),
		);
	};

	close = () => {
		this.commit();
		openNote.set(null);
	};

	remove = () => {
		const open = this.open;
		openNote.set(null);
		if (open) removeObjects(open.pageId, [open.note.id]);
	};

	place = modifier((el: HTMLElement, [id]: [string]) => {
		const anchor = {
			getBoundingClientRect: () => {
				const r = objectRect(id);
				return r
					? new DOMRect(r.x, r.y, r.w, r.h)
					: new DOMRect();
			},
		};
		const stop = autoUpdate(
			anchor,
			el,
			() =>
				void computePosition(anchor, el, {
					placement: 'right-start',
					strategy: 'fixed',
					middleware: [
						offset(6),
						flip(),
						shift({ padding: 8 }),
					],
				}).then(({ x, y }) => {
					el.style.left = `${x}px`;
					el.style.top = `${y}px`;
					el.style.visibility = 'visible';
				}),
			// tracks canvas pan, zoom
			{ animationFrame: true },
		);
		const onDown = (e: PointerEvent) => {
			if (!el.contains(e.target as Node)) this.close();
		};
		window.addEventListener('pointerdown', onDown, true);
		const undismiss = pushDismiss(this.close);
		return () => {
			stop();
			window.removeEventListener('pointerdown', onDown, true);
			undismiss();
		};
	});

	// unbound: keeps typed text
	fill = modifier(
		(el: HTMLTextAreaElement, [id, text]: [string, string]) => {
			this.#text = el;
			if (el.dataset.note === id) return;
			el.dataset.note = id;
			el.value = text;
			// after canvas steals focus
			if (text === '') setTimeout(() => el.focus());
		},
	);

	<template>
		{{#if this.open}}
			<div
				class="err-note"
				role="dialog"
				aria-label="Comment"
				{{this.place this.open.note.id}}
			>
				<textarea
					class="err-note-text"
					rows="4"
					aria-label="Note"
					{{on "blur" this.commit}}
					{{this.fill
						this.open.note.id
						this.open.note.text
					}}
				></textarea>
				<div class="err-note-meta">
					<span
						class="err-note-author"
					>{{this.open.note.author}}</span>
					<time
						datetime={{this.open.note.date}}
					>{{this.date}}</time>
					<Cell
						class="err-note-delete"
						@label="Delete"
						@icon="trash-2"
						@onClick={{this.remove}}
					/>
				</div>
			</div>
		{{/if}}
	</template>
}
