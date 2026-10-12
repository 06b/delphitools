import Service, { service } from '@ember/service';
import type Owner from '@ember/owner';
import type RouterService from '@ember/routing/router-service';
import { tracked } from '@glimmer/tracking';

const COOKIE = 'sidebar_state';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
const SHORTCUT = 'b';
// the open drawer pushes the page off a narrower window
const NARROW = '(max-width: 639px)';

export default class SidebarService extends Service {
	@service declare router: RouterService;

	@tracked open = true;

	constructor(owner: Owner) {
		super(owner);
		if (typeof window === 'undefined') return;

		// match cookie boundary
		const stored = new RegExp(
			`(?:^|;\\s*)${COOKIE}=(true|false)`,
		).exec(document.cookie);
		this.open = stored
			? stored[1] === 'true'
			: !window.matchMedia(NARROW).matches;

		window.addEventListener('keydown', this.#onKeydown);
		this.router.on('routeDidChange', this.#onRouteChange);
	}

	willDestroy() {
		super.willDestroy();
		window.removeEventListener('keydown', this.#onKeydown);
		this.router.off('routeDidChange', this.#onRouteChange);
	}

	toggle = () => {
		this.setOpen(!this.open);
	};

	setOpen = (open: boolean) => {
		this.open = open;
		document.cookie = `${COOKIE}=${open}; path=/; max-age=${COOKIE_MAX_AGE}`;
	};

	#onRouteChange = () => {
		if (this.open && window.matchMedia(NARROW).matches)
			this.open = false;
	};

	#onKeydown = (e: KeyboardEvent) => {
		if (e.key === SHORTCUT && (e.metaKey || e.ctrlKey)) {
			e.preventDefault();
			this.toggle();
		}
	};
}

declare module '@ember/service' {
	interface Registry {
		sidebar: SidebarService;
	}
}
