import Route from '@ember/routing/route';
import { service } from '@ember/service';
import type RouterService from '@ember/routing/router-service';

// blocks were renamed patterns
export default class CanonBlocksRoute extends Route {
	@service declare router: RouterService;

	beforeModel() {
		this.router.replaceWith('canon.patterns');
	}
}
