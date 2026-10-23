import RouteTemplate from 'ember-route-template';
import { pageTitle } from 'ember-page-title';
import CanonTool from 'delphitools-v2/components/canon-tool';
import type { ToolModel } from 'delphitools-v2/routes/tools/tool';

export default RouteTemplate<{ Args: { model: ToolModel } }>(
	<template>
		{{pageTitle @model.tool.name}}

		<h1 class="dt-sr-only">{{@model.tool.name}}</h1>
		<CanonTool
			@tool={{@model.tool}}
			@component={{@model.component}}
		/>
	</template>,
);
