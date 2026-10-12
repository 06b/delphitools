import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import type { ComponentLike } from '@glint/template';
import type { TOC } from '@ember/component/template-only';
import { on } from '@ember/modifier';
import type { Tool } from 'delphitools-v2/lib/tools';

const KEY = 'dt-canon-expanded';

// the iOS keyboard's one-handed chevron: tall, thin, faint
const Chevron: TOC<{ Args: { points: 'start' | 'end' } }> = <template>
	<svg
		class="dt-canon-chevron is-{{@points}}"
		viewBox="0 0 12 40"
		aria-hidden="true"
	><path d="M10 2 L2 20 L10 38" /></svg>
</template>;

function stored(): Set<string> {
	try {
		const ids: unknown = JSON.parse(
			localStorage.getItem(KEY) ?? '[]',
		);
		return new Set(Array.isArray(ids) ? ids.map(String) : []);
	} catch {
		return new Set();
	}
}

interface CanonToolSignature {
	Args: { tool: Tool; component: ComponentLike<object> | undefined };
}

// the sheet's slot for a canon tool; an `expands` tool can leave the 1200 px column
export default class CanonTool extends Component<CanonToolSignature> {
	@tracked expandedIds = stored();

	get expanded() {
		return this.expandedIds.has(this.args.tool.id);
	}

	toggle = () => {
		const ids = new Set(this.expandedIds);
		if (ids.has(this.args.tool.id)) ids.delete(this.args.tool.id);
		else ids.add(this.args.tool.id);
		this.expandedIds = ids;
		try {
			localStorage.setItem(KEY, JSON.stringify([...ids]));
		} catch {
			// private mode: the choice lasts this visit only
		}
	};

	<template>
		<div
			class="dt-canon-tool
				{{if @tool.expands 'is-expandable'}}
				{{if this.expanded 'is-expanded'}}"
		>
			{{#if @component}}
				<@component />
			{{/if}}
			{{#if @tool.expands}}
				{{#if this.expanded}}
					<button
						type="button"
						class="dt-canon-edge is-start"
						aria-label="Full width"
						aria-pressed="true"
						{{on "click" this.toggle}}
					><Chevron @points="end" /></button>
				{{else}}
					<button
						type="button"
						class="dt-canon-edge is-start"
						aria-label="Full width"
						aria-pressed="false"
						{{on "click" this.toggle}}
					><Chevron @points="start" /></button>
					{{! one tab stop; the mirror is for the pointer }}
					<button
						type="button"
						class="dt-canon-edge is-end"
						tabindex="-1"
						aria-hidden="true"
						{{on "click" this.toggle}}
					><Chevron @points="end" /></button>
				{{/if}}
			{{/if}}
		</div>
	</template>
}
