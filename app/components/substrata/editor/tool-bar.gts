import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import { eq } from 'ember-truth-helpers';
import { Cell, Cells } from 'delphitools-v2/components/substrata/editor/cells';
import type { EditorTool } from 'delphitools-v2/components/substrata/editor/tools';
import {
	editorUi,
	type EditorEdge,
} from 'delphitools-v2/lib/substrata/editor-ui';
import { viewport } from 'delphitools-v2/lib/substrata/viewport';

interface Signature {
	Args: { tool: EditorTool; phone: boolean };
}

// a press that travels this far drags the bar instead of tapping a cell
const DRAG_SLOP = 8;

// iOS ToolSettingsBar: the tool's cells in a floating bar, 36 px cells,
// dragged to any edge of the canvas (the phone keeps it above the row)
export default class ToolBar extends Component<Signature> {
	@tracked dragging: { x: number; y: number } | null = null;
	#start: { x: number; y: number; id: number } | null = null;

	get edge(): EditorEdge {
		return this.args.phone ? 'bottom' : editorUi.settingsEdge;
	}

	get vertical() {
		return this.edge === 'leading' || this.edge === 'trailing';
	}

	get dragStyle() {
		const d = this.dragging;
		return d
			? htmlSafe(
					`--sub-drag-x: ${d.x}px; --sub-drag-y: ${d.y}px`,
				)
			: htmlSafe('');
	}

	fit = () => viewport.fit();
	actual = () => viewport.setZoom(1);

	down = (e: PointerEvent) => {
		if (this.args.phone || e.button !== 0) return;
		this.#start = { x: e.clientX, y: e.clientY, id: e.pointerId };
	};

	move = (e: PointerEvent) => {
		const s = this.#start;
		if (!s || s.id !== e.pointerId) return;
		const x = e.clientX - s.x;
		const y = e.clientY - s.y;
		if (!this.dragging && Math.hypot(x, y) < DRAG_SLOP) return;
		if (!this.dragging)
			(e.currentTarget as HTMLElement).setPointerCapture(
				e.pointerId,
			);
		this.dragging = { x, y };
	};

	up = (e: PointerEvent) => {
		const s = this.#start;
		this.#start = null;
		if (!s || !this.dragging) return;
		this.dragging = null;
		const root = (e.currentTarget as HTMLElement).closest(
			'.sub-ed',
		);
		if (!root) return;
		const box = root.getBoundingClientRect();
		const rtl = getComputedStyle(root).direction === 'rtl';
		const near: [EditorEdge, number][] = [
			['top', e.clientY - box.top],
			['bottom', box.bottom - e.clientY],
			[rtl ? 'trailing' : 'leading', e.clientX - box.left],
			[rtl ? 'leading' : 'trailing', box.right - e.clientX],
		];
		near.sort((a, b) => a[1] - b[1]);
		editorUi.setSettingsEdge(near[0]![0]);
	};

	// a drag ends without the cell under the pointer taking the click
	swallow = (e: MouseEvent) => {
		if (this.#wasDrag) {
			e.stopPropagation();
			e.preventDefault();
			this.#wasDrag = false;
		}
	};

	#wasDrag = false;

	markDrag = () => {
		this.#wasDrag = !!this.dragging;
	};

	draggable = modifier((el: HTMLElement) => {
		const listeners: [string, EventListener, boolean?][] = [
			['pointerdown', this.down as EventListener],
			['pointermove', this.move as EventListener],
			['pointerup', this.markDrag],
			['pointerup', this.up as EventListener],
			['pointercancel', this.up as EventListener],
			['click', this.swallow as EventListener, true],
		];
		for (const [type, fn, capture] of listeners)
			el.addEventListener(type, fn, capture);
		return () => {
			for (const [type, fn, capture] of listeners)
				el.removeEventListener(type, fn, capture);
		};
	});

	<template>
		<div
			class="sub-ed-bar is-{{this.edge}}
				{{if this.dragging 'is-dragging'}}"
			style={{this.dragStyle}}
			role="toolbar"
			aria-label="Tool settings"
			aria-orientation={{if
				this.vertical
				"vertical"
				"horizontal"
			}}
			{{this.draggable}}
		>
			{{#if (eq @tool "move")}}
				<Cells
					@axis={{if
						this.vertical
						"column"
						"row"
					}}
					@small={{true}}
				>
					<Cell
						@label="Fit"
						@text="Fit"
						@onClick={{this.fit}}
					/>
					<Cell
						@label="100 %"
						@text="100 %"
						@onClick={{this.actual}}
					/>
				</Cells>
			{{/if}}
		</div>
	</template>
}
