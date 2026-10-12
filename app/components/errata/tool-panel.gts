import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import type { TOC } from '@ember/component/template-only';
import { eq } from 'ember-truth-helpers';
import Icon from 'delphitools-v2/components/icon';
import NdsLoader from 'delphitools-v2/components/ui/nds-loader';
import type { PageScope as Scope } from 'delphitools-v2/lib/errata/stamps';
import { ANCHORS, type Anchor } from 'delphitools-v2/lib/pdf-stamp';

export interface ToolPanelSignature {
	Element: HTMLDivElement;
	Args: {
		open: boolean;
		/** data-mode, for rigs */
		mode?: string | null;
		icon: string;
		label: string;
		/** absent: no cancel button */
		onCancel?: () => void;
		cancelLabel?: string;
		/** absent: no primary button */
		onApply?: () => void;
		applyLabel?: string;
		/** default true */
		canApply?: boolean;
		busy?: boolean;
		failed?: boolean;
	};
	Blocks: { default: [] };
}

/** wraps when controls overflow */
const ToolPanel: TOC<ToolPanelSignature> = <template>
	<div
		class="err-mode pointer-events-auto {{if @open 'is-open'}}"
		data-mode={{@mode}}
		...attributes
	>
		<span class="err-mode-head">
			<Icon @name={{@icon}} class="sub-omni-tool-glyph" />
			<span class="sub-omni-tool-name">{{@label}}</span>
		</span>
		<span class="err-mode-body">{{yield}}</span>
		<span class="err-mode-end">
			{{#if @failed}}
				<span
					class="sub-omni-tag err-mode-failed"
				>Failed</span>
			{{/if}}
			<span class="err-mode-actions">
				{{#if @onCancel}}
					<button
						type="button"
						class="sub-modal-btn is-ghost"
						{{on "click" @onCancel}}
					>
						<Icon @name="x" />
						{{if
							@cancelLabel
							@cancelLabel
							"Cancel"
						}}
					</button>
				{{/if}}
				{{#if @onApply}}
					<button
						type="button"
						class="sub-modal-btn is-primary"
						disabled={{if
							@busy
							true
							(eq @canApply false)
						}}
						{{on "click" @onApply}}
					>
						{{#if @busy}}
							<NdsLoader />
						{{else}}
							<Icon @name="check" />
						{{/if}}
						{{if
							@applyLabel
							@applyLabel
							"Apply"
						}}
					</button>
				{{/if}}
			</span>
		</span>
	</div>
</template>;

export default ToolPanel;

/** a labelled control group */
export const Field: TOC<{
	Element: HTMLSpanElement;
	Args: { label: string };
	Blocks: { default: [] };
}> = <template>
	<span class="err-mode-field" ...attributes>
		<span class="sub-tool-row-label">{{@label}}</span>
		{{yield}}
	</span>
</template>;

export interface SegmentedOption<V> {
	value: V;
	label?: string;
	/** icon only; value labels */
	icon?: string;
}

export class Segmented<V extends string | number> extends Component<{
	Args: {
		options: readonly SegmentedOption<V>[];
		value: V | null;
		onChange: (value: V) => void;
	};
}> {
	<template>
		<span class="segmented err-mode-seg">
			{{#each @options key="value" as |o|}}
				<button
					type="button"
					class="sub-seg-cell
						{{if
							(eq @value o.value)
							'is-active'
						}}"
					aria-label={{if o.icon o.value}}
					aria-pressed={{if
						(eq @value o.value)
						"true"
						"false"
					}}
					title={{if o.icon o.value}}
					{{on "click" (fn @onChange o.value)}}
				>
					{{#if o.icon}}
						<Icon @name={{o.icon}} />
					{{else}}
						{{o.label}}
					{{/if}}
				</button>
			{{/each}}
		</span>
	</template>
}

function readNumber(onChange: (value: number) => void) {
	return (event: Event) =>
		onChange(Number((event.target as HTMLInputElement).value));
}

export const Slider: TOC<{
	Args: {
		label: string;
		value: number;
		min: number;
		max: number;
		step?: number;
		unit?: string;
		onChange: (value: number) => void;
	};
}> = <template>
	<Field @label={{@label}}>
		<input
			type="range"
			class="sub-slider err-mode-slider"
			min={{@min}}
			max={{@max}}
			step={{if @step @step 1}}
			value={{@value}}
			aria-label={{@label}}
			{{on "input" (readNumber @onChange)}}
		/>
		<span class="err-mode-readout">{{@value}}{{@unit}}</span>
	</Field>
</template>;

const SCOPES: SegmentedOption<Scope>[] = [
	{ value: 'all', label: 'All' },
	{ value: 'current', label: 'Current' },
	{ value: 'range', label: 'Range' },
];

function readText(onChange: (value: string) => void) {
	return (event: Event) =>
		onChange((event.target as HTMLInputElement).value);
}

/** resolve with scopePages */
export const PageScope: TOC<{
	Args: {
		scope: Scope;
		range: string;
		/** range fails to parse */
		invalid: boolean;
		onScope: (scope: Scope) => void;
		onRange: (range: string) => void;
	};
}> = <template>
	<Field @label="Pages">
		<Segmented
			@options={{SCOPES}}
			@value={{@scope}}
			@onChange={{@onScope}}
		/>
		{{#if (eq @scope "range")}}
			<input
				class="err-mode-input is-narrow"
				aria-label="Range"
				aria-invalid={{if @invalid "true" "false"}}
				placeholder="1-3, 5"
				value={{@range}}
				{{on "input" (readText @onRange)}}
			/>
		{{/if}}
	</Field>
</template>;

/** a page-shaped 3x3 grid */
export const AnchorPicker: TOC<{
	Args: {
		value: Anchor;
		onChange: (anchor: Anchor) => void;
	};
}> = <template>
	<Field @label="Position">
		<span
			class="err-anchor-page"
			role="radiogroup"
			aria-label="Position"
		>
			{{#each ANCHORS as |a|}}
				<button
					type="button"
					role="radio"
					class="err-anchor-cell
						{{if
							(eq @value a)
							'is-active'
						}}"
					aria-checked={{if
						(eq @value a)
						"true"
						"false"
					}}
					aria-label={{a}}
					title={{a}}
					data-anchor={{a}}
					{{on "click" (fn @onChange a)}}
				></button>
			{{/each}}
		</span>
	</Field>
</template>;
