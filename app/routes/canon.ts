import Route from '@ember/routing/route';
import type { ComponentLike } from '@glint/template';

// the docs import every kit component and their demos: their own chunk
export default class CanonRoute extends Route<ComponentLike> {
	async model() {
		const docs =
			await import('delphitools-v2/components/canon-docs/docs');
		return docs.default as ComponentLike;
	}
}
