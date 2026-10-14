import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import type { TOC } from '@ember/component/template-only';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import { IconSvg } from 'delphitools-v2/components/icon';

const GAP = 8;

interface Signature {
	Args: {
		// the control that opened the card; the card sits level with it
		anchor: HTMLElement;
		width?: number;
		label: string;
		onClose: () => void;
	};
	Blocks: { default: [] };
}

// iOS FloatingCard: rows floating beside the panel that opened them, over a
// scrim; a click outside or Esc closes it
export default class FloatingCard extends Component<Signature> {
	@tracked place = { x: 0, y: 0, onRight: false };

	// the card leaves the rail so its scrim covers the whole editor
	get host(): HTMLElement {
		return (
			this.args.anchor.closest<HTMLElement>('.sub-ed') ??
			document.body
		);
	}

	get style() {
		const { x, y, onRight } = this.place;
		return htmlSafe(
			`inset-inline-start: ${x}px; inset-block-start: ${y}px; inline-size: ${this.args.width ?? 300}px; --sub-card-from: ${onRight ? 12 : -12}px`,
		);
	}

	position = modifier((card: HTMLElement) => {
		const root = this.host;
		const room = root.getBoundingClientRect();
		const anchor = this.args.anchor.getBoundingClientRect();
		const panel = (
			this.args.anchor.closest('.sub-rail-panel') ??
			this.args.anchor
		).getBoundingClientRect();
		const width = Math.min(
			this.args.width ?? 300,
			room.width - 2 * GAP,
		);
		const height = Math.min(
			card.offsetHeight,
			room.height - 2 * GAP,
		);
		const onRight =
			panel.left + panel.width / 2 >
			room.left + room.width / 2;
		const beside = onRight
			? panel.left - GAP - width
			: panel.right + GAP;
		const x = Math.min(
			Math.max(beside, room.left + GAP),
			room.right - GAP - width,
		);
		const y = Math.min(
			Math.max(anchor.top, room.top + GAP),
			room.bottom - GAP - height,
		);
		this.place = { x: x - room.left, y: y - room.top, onRight };
		card.focus();
		const onKey = (e: KeyboardEvent) => {
			if (e.key !== 'Escape') return;
			e.stopPropagation();
			this.args.onClose();
		};
		window.addEventListener('keydown', onKey, true);
		return () => window.removeEventListener('keydown', onKey, true);
	});

	<template>
		{{#in-element this.host insertBefore=null}}
			<div class="sub-card-layer">
				<button
					type="button"
					class="sub-card-scrim"
					aria-label="Close"
					tabindex="-1"
					{{on "click" @onClose}}
				></button>
				<div
					class="sub-card"
					role="dialog"
					aria-label={{@label}}
					tabindex="-1"
					style={{this.style}}
					{{this.position}}
				>{{yield}}</div>
			</div>
		{{/in-element}}
	</template>
}

// iOS MenuCard: an icon over its name, a cell of a floating card's grid
export const MenuCard: TOC<{
	Args: {
		title: string;
		icon: string;
		disabled?: boolean;
		destructive?: boolean;
		onClick?: () => void;
	};
	Element: HTMLButtonElement;
}> = <template>
	<button
		type="button"
		class="sub-menu-card {{if @destructive 'is-destructive'}}"
		disabled={{@disabled}}
		{{on "click" (orNoop @onClick)}}
		...attributes
	>
		<span class="sub-menu-card-icon"><IconSvg
				@name={{@icon}}
			/></span>
		<span class="sub-menu-card-title">{{@title}}</span>
	</button>
</template>;

function orNoop(fn?: () => void) {
	return fn ?? (() => {});
}
