import Service from '@ember/service';
import type Owner from '@ember/owner';
import { tracked } from '@glimmer/tracking';

const PARAM = 'magazine';

export const isPlainClick = (event: MouseEvent) =>
	event.button === 0 &&
	!event.metaKey &&
	!event.ctrlKey &&
	!event.shiftKey &&
	!event.altKey;

export default class MagazineService extends Service {
	@tracked isOpen = false;
	@tracked startPage: string | undefined;

	#opener: HTMLElement | null = null;

	constructor(owner: Owner) {
		super(owner);
		if (typeof window === 'undefined') return;
		const page = new URLSearchParams(window.location.search).get(
			PARAM,
		);
		if (page === null) return;
		this.startPage = page || undefined;
		this.isOpen = true;
	}

	open = (pageId?: string) => {
		this.#opener =
			document.activeElement instanceof HTMLElement
				? document.activeElement
				: null;
		this.startPage = pageId;
		this.isOpen = true;
	};

	close = () => {
		if (!this.isOpen) return;
		this.isOpen = false;
		const url = new URL(window.location.href);
		if (url.searchParams.has(PARAM)) {
			url.searchParams.delete(PARAM);
			history.replaceState(history.state, '', url);
		}
	};

	// the dialog calls this once it has left the top layer
	restoreFocus = () => {
		this.#opener?.focus();
		this.#opener = null;
	};
}

declare module '@ember/service' {
	interface Registry {
		magazine: MagazineService;
	}
}
