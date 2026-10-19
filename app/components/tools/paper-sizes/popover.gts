import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { guidFor } from '@ember/object/internals';
import { modifier } from 'ember-modifier';
import CanonButton from 'delphicanon/components/canon-button';
import CanonDecimalField from 'delphicanon/components/canon-decimal-field';
import CanonEmptyRow from 'delphicanon/components/canon-empty-row';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonTextCell from 'delphicanon/components/canon-text-cell';
import { ChevronsUpDown } from 'delphicanon/lib/control-icons';
import {
	attach,
	hide,
	isOpen,
	panelFor,
	type CanonPlacement,
} from 'delphicanon/lib/popover';
import 'delphicanon/components/canon-menu-cell.css';
import 'delphicanon/components/canon-popover.css';
import { IconSvg } from 'delphitools-v2/components/icon';
import { allSeries } from 'delphitools-v2/components/tools/paper-sizes/data';
import {
	allPicks,
	choiceTitle,
	closest,
	dimensions,
	matches,
	parseQuery,
	signed,
	type PaperChoice,
	type PaperPick,
	type PaperQuery,
} from 'delphitools-v2/components/tools/paper-sizes/paper';

export type { PaperChoice };
import Cell from 'delphitools-v2/components/tools/paper-sizes/cell';
import './popover.css';

interface Signature {
	Args: {
		selected?: PaperChoice;
		/** Title of the caller's own choice above the list, as iOS `extra`. */
		extra?: string;
		/** Shows the custom width and height section. */
		custom?: boolean;
		/** Custom side range in millimetres; default iOS 10 to 5000. */
		min?: number;
		max?: number;
		/** Trigger title while nothing is selected. */
		placeholder?: string;
		label?: string;
		labelledBy?: string;
		disabled?: boolean;
		/** Default bottom-start. */
		placement?: CanonPlacement;
		onPick: (choice: PaperChoice) => void;
	};
	Element: HTMLButtonElement;
}

const findPlaceholder = 'A4 · 210×297 · 8.5x11in';
const columns = 3;
const mm = (pick: PaperPick) => dimensions(pick.size, 0, 300);
const Check = <template><IconSvg @name="check" /></template>;

/**
 * The iOS paper size sheet as a popover on a menu-cell trigger: find a
 * size by name or dimensions, take the caller's extra choice, type a
 * custom size, or pick from every series. Escape or a click outside
 * closes it; a pick closes it too.
 */
export default class PaperPopover extends Component<Signature> {
	id = `${guidFor(this)}-paper`;
	valueId = `${guidFor(this)}-paper-value`;
	@tracked text = '';
	@tracked query: PaperQuery = parseQuery('');
	@tracked width = 210;
	@tracked height = 297;
	#panel?: HTMLElement;

	get min() {
		return this.args.min ?? 10;
	}

	get max() {
		return this.args.max ?? 5000;
	}

	get title() {
		return (
			choiceTitle(this.args.selected, this.args.extra) ??
			this.args.placeholder ??
			''
		);
	}

	get labelledBy() {
		return this.args.labelledBy
			? `${this.args.labelledBy} ${this.valueId}`
			: undefined;
	}

	get extraSelected() {
		return this.args.selected?.kind === 'extra';
	}

	get selectedId() {
		const { selected } = this.args;
		return selected?.kind === 'paper' ? selected.id : undefined;
	}

	cell = (pick: PaperPick, detail?: string) => ({
		key: pick.key,
		pick,
		text: mm(pick),
		mark: pick.size.id === this.selectedId ? 1 : undefined,
		detail,
	});

	get closest() {
		const { query } = this;
		if (query.kind !== 'size') return [];
		return closest(query.width, query.height).map(
			({ pick, dw, dh }) =>
				this.cell(
					pick,
					`${signed(dw)} × ${signed(dh)} mm`,
				),
		);
	}

	get series() {
		return allSeries.flatMap((series) => {
			const cells = allPicks
				.filter(
					(pick) =>
						pick.series === series.id &&
						matches(this.query, pick),
				)
				.map((pick) => this.cell(pick));
			return cells.length
				? [{ id: series.id, name: series.name, cells }]
				: [];
		});
	}

	find = (text: string) => {
		this.text = text;
		this.query = parseQuery(text);
	};

	setWidth = (value: number) => (this.width = value);
	setHeight = (value: number) => (this.height = value);

	choose(choice: PaperChoice) {
		this.args.onPick(choice);
		if (this.#panel) hide(this.#panel);
	}

	pick = (pick: PaperPick) =>
		this.choose({ kind: 'paper', id: pick.size.id });
	pickExtra = () => this.choose({ kind: 'extra' });
	useCustom = () =>
		this.choose({
			kind: 'custom',
			width: this.width,
			height: this.height,
		});

	/** The custom fields start at the selected size, A4 otherwise (iOS). */
	#seed() {
		const { selected } = this.args;
		if (selected?.kind === 'custom') {
			this.width = selected.width;
			this.height = selected.height;
			return;
		}
		const pick =
			selected?.kind === 'paper'
				? allPicks.find(
						(p) =>
							p.size.id ===
							selected.id,
					)
				: undefined;
		this.width = pick?.size.widthMM ?? 210;
		this.height = pick?.size.heightMM ?? 297;
	}

	trigger = modifier((button: HTMLButtonElement) => {
		const panel = panelFor(button, this.id);
		this.#panel = panel;
		const detach = attach(panel, button, {
			placement: this.args.placement ?? 'bottom-start',
			invokes: true,
			haspopup: 'dialog',
		});
		const opening = (event: ToggleEvent) => {
			if (event.newState === 'open') this.#seed();
		};
		const opened = () => {
			if (!isOpen(panel)) return;
			const field =
				panel.querySelector<HTMLInputElement>(
					'.paper-find',
				);
			field?.focus({ preventScroll: true });
			field?.select();
		};
		panel.addEventListener('beforetoggle', opening);
		panel.addEventListener('toggle', opened);
		return () => {
			panel.removeEventListener('beforetoggle', opening);
			panel.removeEventListener('toggle', opened);
			detach();
		};
	});

	<template>
		<button
			type="button"
			class="canon-menu-cell paper-popover-trigger
				{{if @disabled 'canon-menu-cell--disabled'}}"
			aria-labelledby={{this.labelledBy}}
			aria-label={{@label}}
			disabled={{@disabled}}
			{{this.trigger}}
			...attributes
		>
			<span
				id={{this.valueId}}
				class="canon-menu-cell-title"
			>{{this.title}}</span>
			<span
				class="canon-menu-cell-icon"
				aria-hidden="true"
			><ChevronsUpDown /></span>
		</button>
		<div
			id={{this.id}}
			class="canon-popover paper-popover"
			popover="auto"
			role="dialog"
			aria-label={{if @label @label "Page size"}}
		>
			<CanonRows @framed={{true}}>
				<CanonHeading @text="Page size" />
				<CanonTextCell
					class="paper-find"
					aria-label="Find"
					autocomplete="off"
					autocapitalize="none"
					spellcheck="false"
					@value={{this.text}}
					@placeholder={{findPlaceholder}}
					@onChange={{this.find}}
				/>
			</CanonRows>
			{{#if @extra}}
				<CanonRows @framed={{true}}>
					<CanonGrid>
						<CanonButton
							class="paper-popover-extra"
							@kind="segment"
							@text={{@extra}}
							@selected={{this.extraSelected}}
							@onClick={{this.pickExtra}}
						/>
					</CanonGrid>
				</CanonRows>
			{{/if}}
			{{#if @custom}}
				<CanonRows
					class="paper-popover-custom"
					@framed={{true}}
				>
					<CanonHeading @text="Custom" />
					<CanonRow
						@title="Width"
						@form="flush"
						as |titleId|
					>
						<CanonDecimalField
							class="paper-popover-width"
							@value={{this.width}}
							@min={{this.min}}
							@max={{this.max}}
							@step={{1}}
							@decimals={{1}}
							@unit="mm"
							@labelledBy={{titleId}}
							@onChange={{this.setWidth}}
						/>
					</CanonRow>
					<CanonRow
						@title="Height"
						@form="flush"
						as |titleId|
					>
						<CanonDecimalField
							class="paper-popover-height"
							@value={{this.height}}
							@min={{this.min}}
							@max={{this.max}}
							@step={{1}}
							@decimals={{1}}
							@unit="mm"
							@labelledBy={{titleId}}
							@onChange={{this.setHeight}}
						/>
					</CanonRow>
					<CanonButton
						class="paper-popover-use"
						@kind="primary"
						@text="Use"
						@icon={{Check}}
						@onClick={{this.useCustom}}
					/>
				</CanonRows>
			{{/if}}
			{{#if this.closest.length}}
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Closest" />
					<CanonGrid @columns={{columns}}>
						{{#each
							this.closest key="key"
							as |cell|
						}}
							<Cell
								@size={{cell.pick.size}}
								@text={{cell.text}}
								@mark={{cell.mark}}
								@tick={{true}}
								@detail={{cell.detail}}
								@onPick={{fn
									this.pick
									cell.pick
								}}
							/>
						{{/each}}
					</CanonGrid>
				</CanonRows>
			{{/if}}
			<CanonRows class="paper-popover-list" @framed={{true}}>
				{{#each this.series key="id" as |series|}}
					<CanonHeading @text={{series.name}} />
					<CanonGrid @columns={{columns}}>
						{{#each
							series.cells key="key"
							as |cell|
						}}
							<Cell
								@size={{cell.pick.size}}
								@text={{cell.text}}
								@mark={{cell.mark}}
								@tick={{true}}
								@onPick={{fn
									this.pick
									cell.pick
								}}
							/>
						{{/each}}
					</CanonGrid>
				{{else}}
					<CanonEmptyRow @text="No match" />
				{{/each}}
			</CanonRows>
		</div>
	</template>
}
