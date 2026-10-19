import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { LinkTo } from '@ember/routing';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import { or } from 'ember-truth-helpers';
import CanonGrid from 'delphicanon/components/canon-grid';
import Icon from 'delphitools-v2/components/icon';
import type { Tool } from 'delphitools-v2/lib/tools';
import './tool-grid.css';

export interface ToolGridSignature {
	Element: HTMLDivElement;
	Args: {
		tools: Tool[];
		query?: Record<string, string>;
		carryLabel?: string;
		onPick?: (id: string) => void;
	};
}

const EMPTY_QUERY: Record<string, string> = {};
const noop = () => {};

export function queryOrEmpty(query?: Record<string, string>) {
	return query ?? EMPTY_QUERY;
}

// ios HomeMetrics.columns
const COLUMN_WIDTH = 195;

export function latticeColumns(width: number) {
	return Math.min(6, Math.max(2, Math.floor(width / COLUMN_WIDTH)));
}

export default class ToolGrid extends Component<ToolGridSignature> {
	@tracked columns = 2;

	measure = modifier((element: HTMLElement) => {
		let frame = 0;
		// a new count changes the height; set it next frame, outside the observation
		const observer = new ResizeObserver(([entry]) => {
			const columns = latticeColumns(
				entry?.contentRect.width ?? 0,
			);
			cancelAnimationFrame(frame);
			if (columns !== this.columns)
				frame = requestAnimationFrame(
					() => (this.columns = columns),
				);
		});
		observer.observe(element);
		return () => {
			cancelAnimationFrame(frame);
			observer.disconnect();
		};
	});

	<template>
		<CanonGrid
			@columns={{this.columns}}
			class="dt-grid"
			{{this.measure}}
			...attributes
		>
			{{#each @tools as |tool|}}
				{{#if tool.external}}
					<a
						href={{tool.href}}
						class="dt-cell"
						target="_blank"
						rel="noopener noreferrer"
					>
						<Icon
							@name={{tool.icon}}
							class="dt-cell-icon"
						/>
						<span
							class="dt-cell-name"
						>{{tool.name}}</span>
						<span
							class="dt-cell-desc"
						>{{tool.description}}</span>
					</a>
				{{else if tool.route}}
					<LinkTo
						@route={{tool.route}}
						class="dt-cell
							{{if
								tool.highlight
								'is-highlight'
							}}"
					>
						<Icon
							@name={{tool.icon}}
							class="dt-cell-icon"
						/>
						<span
							class="dt-cell-name"
						>{{tool.name}}</span>
						<span
							class="dt-cell-desc"
						>{{tool.description}}</span>
					</LinkTo>
				{{else}}
					<LinkTo
						@route="tools.tool"
						@model={{tool.id}}
						@query={{queryOrEmpty @query}}
						data-tool={{tool.id}}
						class="dt-cell
							{{if
								tool.highlight
								'is-highlight'
							}}"
						{{on
							"click"
							(fn
								(or
									@onPick
									noop
								)
								tool.id
							)
						}}
					>
						<Icon
							@name={{tool.icon}}
							class="dt-cell-icon"
						/>
						<span
							class="dt-cell-name"
						>{{tool.name}}</span>
						<span
							class="dt-cell-desc"
						>{{tool.description}}</span>
						{{#if @carryLabel}}
							<span
								class="dt-cell-carry"
							>{{@carryLabel}}</span>
						{{/if}}
					</LinkTo>
				{{/if}}
			{{/each}}
		</CanonGrid>
	</template>
}
