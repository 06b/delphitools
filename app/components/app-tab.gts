import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { modifier } from 'ember-modifier';
import { IconSvg } from 'delphitools-v2/components/icon';
import type SidebarService from 'delphitools-v2/services/sidebar';

const SLOP = 4;

interface AppTabSignature {
	Args: { title: string; icon: string };
}

// the iOS folder tab (FanItemView): the current page, and the drawer's handle
export default class AppTab extends Component<AppTabSignature> {
	@service declare sidebar: SidebarService;

	#dragged = false;

	drag = modifier((tab: HTMLButtonElement) => {
		const frame = tab.closest<HTMLElement>('.dt-frame');
		if (!frame) return;
		let startX = 0;
		let startWidth = 0;
		let width = 0;
		let pointer: number | undefined;
		let drawer = 0;

		const down = (event: PointerEvent) => {
			if (event.button !== 0) return;
			pointer = event.pointerId;
			drawer = parseFloat(
				getComputedStyle(frame).getPropertyValue(
					'--dt-drawer-open',
				),
			);
			startX = event.clientX;
			startWidth = this.sidebar.open ? drawer : 0;
			this.#dragged = false;
		};
		const move = (event: PointerEvent) => {
			if (event.pointerId !== pointer) return;
			const dx = event.clientX - startX;
			if (!this.#dragged) {
				if (Math.abs(dx) < SLOP) return;
				this.#dragged = true;
				tab.setPointerCapture(event.pointerId);
				frame.classList.add('is-dragging');
			}
			width = Math.min(drawer, Math.max(0, startWidth + dx));
			frame.style.setProperty('--dt-drawer', `${width}px`);
		};
		const up = (event: PointerEvent) => {
			if (event.pointerId !== pointer) return;
			pointer = undefined;
			if (!this.#dragged) return;
			frame.classList.remove('is-dragging');
			frame.style.removeProperty('--dt-drawer');
			this.sidebar.setOpen(width > drawer / 2);
		};

		tab.addEventListener('pointerdown', down);
		tab.addEventListener('pointermove', move);
		tab.addEventListener('pointerup', up);
		tab.addEventListener('pointercancel', up);
		return () => {
			tab.removeEventListener('pointerdown', down);
			tab.removeEventListener('pointermove', move);
			tab.removeEventListener('pointerup', up);
			tab.removeEventListener('pointercancel', up);
		};
	});

	// a drag ends in a click; only a press toggles
	click = () => {
		if (this.#dragged) {
			this.#dragged = false;
			return;
		}
		this.sidebar.toggle();
	};

	<template>
		<button
			type="button"
			class="dt-tab"
			aria-expanded={{if this.sidebar.open "true" "false"}}
			aria-controls="dt-drawer"
			{{this.drag}}
			{{on "click" this.click}}
		>
			<span class="dt-tab-icon" aria-hidden="true"><IconSvg
					@name={{@icon}}
				/></span>
			<span class="dt-tab-name">{{@title}}</span>
		</button>
	</template>
}
