import Service from '@ember/service';
import type Owner from '@ember/owner';
import { tracked } from '@glimmer/tracking';

// index.html sets .dark and .classic
export default class ThemeService extends Service {
	@tracked dark = false;
	@tracked classic = false;

	constructor(owner: Owner) {
		super(owner);
		if (typeof document === 'undefined') return;
		this.dark = document.documentElement.classList.contains('dark');
		this.classic =
			document.documentElement.classList.contains('classic');
	}

	toggleFont = () => {
		this.classic = !this.classic;
		document.documentElement.classList.toggle(
			'classic',
			this.classic,
		);
		localStorage.setItem('font', this.classic ? 'classic' : 'open');
	};

	toggle = () => {
		this.dark = !this.dark;
		document.documentElement.classList.toggle('dark', this.dark);
		document.documentElement.classList.toggle('light', !this.dark);
		localStorage.setItem('theme', this.dark ? 'dark' : 'light');
	};
}

declare module '@ember/service' {
	interface Registry {
		theme: ThemeService;
	}
}
