import Route from '@ember/routing/route';
import { service } from '@ember/service';
import type RouterService from '@ember/routing/router-service';
import { getToolById } from 'delphitools-v2/lib/tools';
import { loadToolComponent } from 'delphitools-v2/components/tools/registry';
import type { Tool } from 'delphitools-v2/lib/tools';
import type { ComponentLike } from '@glint/template';

export interface ToolModel {
	tool: Tool;
	component: ComponentLike<object> | undefined;
}

export default class ToolRoute extends Route<ToolModel> {
	@service declare router: RouterService;

	beforeModel() {
		const { tool_id: id } = this.paramsFor('tools.tool') as {
			tool_id: string;
		};
		if (!getToolById(id))
			this.router.replaceWith('not-found', `tools/${id}`);
	}

	async model(params: { tool_id: string }): Promise<ToolModel> {
		const tool = getToolById(params.tool_id);
		if (!tool) throw new Error(`Unknown tool: ${params.tool_id}`);
		return {
			tool,
			component: await loadToolComponent(params.tool_id),
		};
	}
}
