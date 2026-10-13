import Route from '@ember/routing/route';
import { service } from '@ember/service';
import type RouterService from '@ember/routing/router-service';

export default class CanonBlockRoute extends Route {
	@service declare router: RouterService;

	// the page table loads with the docs chunk, not the main one
	async beforeModel() {
		const { pageFor } =
			await import('delphitools-v2/lib/canon-docs');
		const params = this.paramsFor(this.routeName);
		if (!pageFor(this.routeName, params))
			this.router.replaceWith(
				'not-found',
				`canon/blocks/${String(params['name'])}`,
			);
	}
}
