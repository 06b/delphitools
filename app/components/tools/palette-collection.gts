import Component from '@glimmer/component';
import { cached, tracked } from '@glimmer/tracking';
import { hash } from '@ember/helper';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import { LinkTo } from '@ember/routing';
import type Owner from '@ember/owner';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonDetentWheel from 'delphicanon/components/canon-detent-wheel';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonTextCell from 'delphicanon/components/canon-text-cell';
import CanonValueLine from 'delphicanon/components/canon-value-line';
import Icon from 'delphitools-v2/components/icon';
import { getColourName } from 'delphitools-v2/lib/colour-names';
import {
	COLLECTION_CATEGORIES,
	CURATED_PALETTES,
	getPalettesByCategory,
	type CuratedPalette,
	type PaletteCollectionCategory,
} from 'delphitools-v2/lib/palette-collection';
import type ColourNotationService from 'delphitools-v2/services/colour-notation';
import { COLOUR_NOTATIONS } from 'delphitools-v2/lib/colour-notation';
import Deck from 'delphitools-v2/components/tools/palette-collection/deck';
// the card markup without the component, which formats rows as hex
import 'delphicanon/components/canon-colour-card.css';
import './palette-collection/palette-collection.css';

const rowHeight = 56;
const wheelHeight = rowHeight * 7;

const shelves = Object.keys(
	COLLECTION_CATEGORIES,
) as PaletteCollectionCategory[];
const byCategory = getPalettesByCategory();
const sizes = [...new Set(CURATED_PALETTES.map((p) => p.colors.length))].sort(
	(a, b) => a - b,
);
const sizeTitles = ['Any size', ...sizes.map((n) => `${n} colours`)];

/**
 * The iOS launch arguments as query flags: ?collectionCategory=<key or
 * label> ?collectionPalette=<id> ?collectionSearch=<text>.
 */
function launchFlags(search: string) {
	const query = new URLSearchParams(search);
	const asked = query.get('collectionCategory')?.toLowerCase();
	const found = CURATED_PALETTES.find(
		(p) => p.id === query.get('collectionPalette'),
	);
	const shelf = found
		? shelves.indexOf(found.category)
		: shelves.findIndex(
				(key) =>
					key === asked ||
					COLLECTION_CATEGORIES[
						key
					].label.toLowerCase() === asked,
			);
	return {
		shelf: Math.max(shelf, 0),
		palette: found ? byCategory[found.category].indexOf(found) : 0,
		search: query.get('collectionSearch') ?? '',
	};
}

/** The port of PaletteCollectionViewController, without saved palettes. */
export default class PaletteCollection extends Component {
	@service declare colourNotation: ColourNotationService;

	@tracked shelf: number;
	@tracked selected: number;
	@tracked query: string;
	@tracked size = 0;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const flags = launchFlags(window.location.search);
		this.shelf = flags.shelf;
		this.selected = flags.palette;
		this.query = flags.search;
	}

	get searching() {
		return this.query.trim() !== '';
	}

	#fits = (palette: CuratedPalette) =>
		this.size === 0 ||
		palette.colors.length === sizes[this.size - 1];

	// match displayed notation too
	#matches = (palette: CuratedPalette) => {
		const query = this.query.trim().toLowerCase();
		return (
			palette.name.toLowerCase().includes(query) ||
			COLLECTION_CATEGORIES[palette.category].label
				.toLowerCase()
				.includes(query) ||
			palette.colors.some(
				(c) =>
					c.toLowerCase().includes(query) ||
					this.colourNotation
						.format(c)
						.toLowerCase()
						.includes(query),
			)
		);
	};

	shelfPalettes = (index: number) =>
		byCategory[shelves[index]!].filter(this.#fits);

	/** Palettes on the second wheel: the shelf's, or every match for the search. */
	@cached
	get shown(): CuratedPalette[] {
		return this.searching
			? CURATED_PALETTES.filter(this.#fits).filter(
					this.#matches,
				)
			: this.shelfPalettes(this.shelf);
	}

	get palette(): CuratedPalette | undefined {
		return this.shown[
			Math.min(this.selected, this.shown.length - 1)
		];
	}

	// the kit's row CanonColourCard shows hex whatever its format
	get colours() {
		return (this.palette?.colors ?? []).map((hex) => ({
			name: getColourName(hex),
			value: this.colourNotation.format(hex),
			swatch: htmlSafe(`background: ${hex}`),
		}));
	}

	get notationLabel() {
		const { notation } = this.colourNotation;
		return (
			COLOUR_NOTATIONS.find((n) => n.id === notation)
				?.label ?? ''
		);
	}

	get detail() {
		const { palette } = this;
		return palette
			? `${COLLECTION_CATEGORIES[palette.category].label} · ${palette.colors.length}`
			: undefined;
	}

	get category() {
		return COLLECTION_CATEGORIES[shelves[this.shelf]!];
	}

	get emptyTitle() {
		return this.searching ? this.query : this.category.label;
	}

	get countLabel() {
		if (!this.searching && this.size === 0)
			return `${CURATED_PALETTES.length} palettes`;
		const found = this.shown.length;
		return `${found} ${found === 1 ? 'result' : 'results'}`;
	}

	get colorsQuery() {
		return this.palette?.colors.join(',') ?? '';
	}

	shelfText = (index: number) =>
		COLLECTION_CATEGORIES[shelves[index]!].label;

	shelfRow = (index: number, focus: number) => ({
		title: this.shelfText(index),
		count: this.shelfPalettes(index).length,
		style: focusStyle(focus),
	});

	paletteText = (index: number) => this.shown[index]?.name ?? '';

	paletteRow = (index: number, focus: number) => {
		const palette = this.shown[index];
		return {
			title: palette?.name ?? '',
			style: focusStyle(focus),
			ribbon: htmlSafe(
				`block-size: ${3 + 4 * focus}px; background: linear-gradient(to right, ${(
					palette?.colors ?? []
				)
					.map(
						(c, i, all) =>
							`${c} ${(i / all.length) * 100}% ${((i + 1) / all.length) * 100}%`,
					)
					.join(', ')})`,
			),
		};
	};

	pickShelf = (index: number) => {
		this.shelf = index;
		this.selected = 0;
	};

	pickPalette = (index: number) => (this.selected = index);

	pickSize = (index: number) => {
		this.size = index;
		this.selected = 0;
	};

	search = (event: Event) => {
		this.query = (event.target as HTMLInputElement).value;
		this.selected = 0;
	};

	<template>
		<CanonSplit
			class="palette-collection"
			@halves={{true}}
			@collapsesTo={{240}}
		>
			<:sidebar>
				<CanonCanvas
					@aspect={{1.2}}
					@maxHeight={{640}}
					@background="var(--canon-muted)"
				>
					<Deck
						@palette={{this.palette}}
						@detail={{this.detail}}
						@emptyTitle={{this.emptyTitle}}
						@format={{this.colourNotation.format}}
					/>
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonCanvas
					@height={{wheelHeight}}
					@background="var(--canon-muted)"
				>
					<div
						style={{wheelStyle}}
						class="pc-wheels
							{{if
								this.searching
								'pc-wheels--searching'
							}}"
					>
						<span
							class="pc-window"
							aria-hidden="true"
						></span>
						<CanonDetentWheel
							class="pc-shelves"
							@count={{shelves.length}}
							@selected={{this.shelf}}
							@rowHeight={{rowHeight}}
							@onSelect={{this.pickShelf}}
							@text={{this.shelfText}}
							@label="Category"
							as |index focus|
						>
							{{#let
								(this.shelfRow
									index
									focus
								)
								as |row|
							}}
								<span
									class="pc-row"
									style={{row.style}}
								>
									<span
										class="pc-row-title"
									>{{row.title}}</span>
									<span
										class="pc-row-count"
									>{{row.count}}</span>
								</span>
							{{/let}}
						</CanonDetentWheel>
						<CanonDetentWheel
							class="pc-palettes"
							@count={{this.shown.length}}
							@selected={{this.selected}}
							@rowHeight={{rowHeight}}
							@onSelect={{this.pickPalette}}
							@text={{this.paletteText}}
							@label="Palette"
							as |index focus|
						>
							{{#let
								(this.paletteRow
									index
									focus
								)
								as |row|
							}}
								<span
									class="pc-row pc-row--palette"
									style={{row.style}}
								>
									<span
										class="pc-row-title"
									>{{row.title}}</span>
									<span
										class="pc-ribbon"
										style={{row.ribbon}}
									></span>
								</span>
							{{/let}}
						</CanonDetentWheel>
						{{#unless this.shown.length}}
							<p class="pc-empty">No
								palettes found
								matching your
								filters.</p>
						{{/unless}}
					</div>
				</CanonCanvas>
				<CanonRows @framed={{true}}>
					<label class="pc-search">
						<Icon @name="search" />
						<CanonTextCell
							class="pc-search-field"
							@value={{this.query}}
							@placeholder="Search palettes…"
							aria-label="Search palettes"
							spellcheck="false"
							autocomplete="off"
							{{on
								"input"
								this.search
							}}
						/>
						<span
							class="pc-count"
						>{{this.countLabel}}</span>
					</label>
					<CanonRow
						@title="Colours"
						@form="stacked"
					>
						<CanonSegmented
							@items={{sizeTitles}}
							@selected={{this.size}}
							@columns={{3}}
							@onChange={{this.pickSize}}
						/>
					</CanonRow>
					{{#unless this.searching}}
						<p
							class="pc-description"
						>{{this.category.label}}:
							{{this.category.description}}</p>
					{{/unless}}
				</CanonRows>
				{{#if this.palette}}
					<CanonRows @framed={{true}}>
						<CanonHeading
							@text={{this.palette.name}}
						/>
						{{#each
							this.colours
							as |colour|
						}}
							<div
								class="canon-colour-card canon-colour-card--row"
							>
								<div
									class="canon-colour-card-swatch"
									style={{colour.swatch}}
								></div>
								<div
									class="canon-colour-card-info"
								>
									<div
										class="canon-colour-card-name"
									>{{colour.name}}</div>
									<CanonValueLine
										@label={{this.notationLabel}}
										@value={{colour.value}}
									/>
								</div>
							</div>
						{{/each}}
						<LinkTo
							@route="tools.tool"
							@model="palette-genny"
							@query={{hash
								colors=this.colorsQuery
							}}
							class="pc-open"
						>
							<Icon @name="palette" />
							Open Palette Generator
						</LinkTo>
					</CanonRows>
				{{/if}}
			</:main>
		</CanonSplit>
	</template>
}

const wheelStyle = htmlSafe(`--pc-row: ${rowHeight}px`);

/** Titles grow, darken and gain weight towards the centre line. */
function focusStyle(focus: number) {
	return htmlSafe(
		`--pc-focus: ${focus}; font-size: ${15 + 5 * focus}px; font-weight: ${400 + Math.round(200 * focus)}`,
	);
}
