import Route from '@ember/routing/route';
import { service } from '@ember/service';
import type RouterService from '@ember/routing/router-service';
import { pageFor } from 'delphitools-v2/lib/canon-docs';

export default class CanonComponentRoute extends Route {
	@service declare router: RouterService;

	beforeModel() {
		const params = this.paramsFor(this.routeName);
		if (!pageFor(this.routeName, params))
			this.router.replaceWith(
				'not-found',
				`canon/components/${String(params['name'])}`,
			);
	}
}
