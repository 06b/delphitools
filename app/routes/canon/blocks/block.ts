import Route from '@ember/routing/route';
import { service } from '@ember/service';
import type RouterService from '@ember/routing/router-service';

// blocks were renamed patterns
export default class CanonBlockRoute extends Route {
	@service declare router: RouterService;

	beforeModel() {
		const { name } = this.paramsFor(this.routeName);
		this.router.replaceWith('canon.patterns.pattern', String(name));
	}
}
