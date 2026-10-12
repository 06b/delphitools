import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import { registerDestructor } from '@ember/destroyable';
import type Owner from '@ember/owner';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonColourCard from 'delphicanon/components/canon-colour-card';
import CanonColourControls, {
	CanonColourSolidState,
} from 'delphicanon/components/canon-colour-controls';
import CanonColourNotationInput from 'delphicanon/components/canon-colour-notation-input';
import CanonColourSolid from 'delphicanon/components/canon-colour-solid';
import CanonColourStrip from 'delphicanon/components/canon-colour-strip';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSplit from 'delphicanon/components/canon-split';
import press from 'delphicanon/modifiers/canon-press';
import {
	contrastFigure,
	contrastRatio,
	hex,
	parseHex,
	type Rgb,
} from 'delphicanon/lib/colour';
import { solidSpaces, type SolidPoint } from 'delphicanon/lib/colour-space';
import { springEasing } from 'delphicanon/lib/motion';
import { IconSvg } from 'delphitools-v2/components/icon';
import { colourFromQuery } from 'delphitools-v2/lib/colour-query';
import { getColourName } from 'delphitools-v2/lib/colour-names';
import type ColourNotationService from 'delphitools-v2/services/colour-notation';
import {
	kitFormat,
	readColour,
} from 'delphitools-v2/components/tools/colour-atlas/atlas';
import {
	suggest,
	targets,
	type Target,
} from 'delphitools-v2/components/tools/contrast-checker/contrast';
import Specimen, {
	specimenHeight,
} from 'delphitools-v2/components/tools/contrast-checker/specimen';
import {
	Lamps,
	Scale,
} from 'delphitools-v2/components/tools/contrast-checker/verdict';
import './contrast-checker/contrast-checker.css';

const Flip = <template><IconSvg @name="arrow-left-right" /></template>;
const Wand = <template><IconSvg @name="wand-sparkles" /></template>;

/** Changes closer together than this follow at once, as a drag; ContrastCheckerViewController's 0.12 s. */
const followMs = 120;

// the channel titles beside the sliders truncate at the 340 px default
const sidebarWidth = 400;

// stacked, the band keeps the figure and its padding
const collapsedBand = 104;

const wellsStyle = htmlSafe(`--contrast-well-spring: ${springEasing(0.8)}`);

const swatch = (colour: Rgb) => htmlSafe(`background: ${hex(colour)}`);
const pair = (foreground: Rgb, background: Rgb) =>
	htmlSafe(`color: ${hex(foreground)}; background: ${hex(background)}`);
const closestName = (colour: Rgb) => getColourName(hex(colour));

/**
 * The iOS launch arguments as query flags: ?contrastFg= ?contrastBg= (any
 * notation) ?contrastWell=1 (background) ?contrastSpace=<picker index>
 * ?contrastLater (background well at 2 s, flip at 3.5 s, first suggestion
 * at 5 s). ?color= is the web's carried colour, as the foreground.
 */
function launchFlags(search: string) {
	const query = new URLSearchParams(search);
	const typed = (key: string) => {
		const text = query.get(key);
		return text ? readColour(text) : undefined;
	};
	const carried = colourFromQuery(search);
	return {
		foreground:
			typed('contrastFg') ??
			(carried ? readColour(carried) : undefined) ??
			parseHex('EAEAEA')!,
		background: typed('contrastBg') ?? parseHex('1A1A2E')!,
		onBackground: query.get('contrastWell') === '1',
		space:
			solidSpaces[
				Number(query.get('contrastSpace') ?? 3) || 0
			] ?? 'oklch',
		later: query.has('contrastLater'),
	};
}

interface Suggestion {
	target: Target;
	candidate?: Rgb;
	foreground: Rgb;
	background: Rgb;
	title: string;
	detail: string;
	ratio: string;
}

/** The port of ContrastCheckerViewController. */
export default class ContrastChecker extends Component {
	@service declare colourNotation: ColourNotationService;

	state: CanonColourSolidState;
	@tracked editsBackground: boolean;
	/** The well the solid does not edit. */
	@tracked fixed: Rgb;
	#lastPick = 0;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const flags = launchFlags(window.location.search);
		this.editsBackground = flags.onBackground;
		this.fixed = flags.onBackground
			? flags.foreground
			: flags.background;
		// sliced row, oklch hue
		this.state = new CanonColourSolidState({
			space: flags.space,
			colour: flags.onBackground
				? flags.background
				: flags.foreground,
			activeRow: 2,
		});
		if (!flags.later) return;
		const timers = [
			window.setTimeout(() => this.edit(true), 2000),
			window.setTimeout(() => this.flip(), 3500),
			window.setTimeout(() => {
				const first = this.suggestions.find(
					(row) => row.candidate,
				);
				if (first) this.apply(first);
			}, 5000),
		];
		registerDestructor(this, () =>
			timers.forEach((timer) => window.clearTimeout(timer)),
		);
	}

	get edited(): Rgb {
		return this.state.colour;
	}

	get foreground(): Rgb {
		return this.editsBackground ? this.fixed : this.edited;
	}

	get background(): Rgb {
		return this.editsBackground ? this.edited : this.fixed;
	}

	get ratio() {
		return contrastRatio(this.foreground, this.background);
	}

	get animated() {
		return this.state.animated;
	}

	get marks() {
		return [this.fixed];
	}

	get format() {
		return kitFormat(this.colourNotation.notation);
	}

	get foregroundText() {
		return this.colourNotation.format(hex(this.foreground));
	}

	get backgroundText() {
		return this.colourNotation.format(hex(this.background));
	}

	get wells() {
		return [
			{
				title: 'Foreground',
				colour: this.foreground,
				background: false,
			},
			{
				title: 'Background',
				colour: this.background,
				background: true,
			},
		].map((well) => ({
			...well,
			hex: hex(well.colour),
			swatch: swatch(well.colour),
			selected: well.background === this.editsBackground,
		}));
	}

	get suggestions(): Suggestion[] {
		const { foreground, background } = this;
		return targets.map((target) => {
			const candidate = suggest(
				target,
				foreground,
				background,
			);
			const [moving, fixed] = target.background
				? [background, foreground]
				: [foreground, background];
			const shown = candidate ?? moving;
			const met =
				contrastRatio(foreground, background) >=
				target.ratio;
			return {
				target,
				candidate,
				foreground: target.background
					? foreground
					: shown,
				background: target.background
					? shown
					: background,
				title: target.background
					? 'Background'
					: 'Foreground',
				detail: `${target.level} · ${hex(shown)}`,
				ratio: candidate
					? `${contrastFigure(contrastRatio(candidate, fixed))}:1`
					: met
						? '✓'
						: '—',
			};
		});
	}

	/** The solid's pick: one after another within 120 ms is a drag and follows at once. */
	pick = (point: SolidPoint) => {
		const now = performance.now();
		const eases = now - this.#lastPick > followMs;
		this.#lastPick = now;
		this.state.setPoint(point, eases);
	};

	/** Hands the solid the other well's colour, eased; the edited colour becomes the fixed one. */
	#trade() {
		const other = this.fixed;
		this.fixed = this.edited;
		this.state.use(other);
	}

	edit = (background: boolean) => {
		if (background === this.editsBackground) return;
		this.editsBackground = background;
		this.#trade();
	};

	flip = () => this.#trade();

	/** A colour for one well, whichever the solid edits. */
	put(background: boolean, colour: Rgb) {
		if (background === this.editsBackground) this.state.use(colour);
		else this.fixed = colour;
	}

	apply = (row: Suggestion) => {
		if (!row.candidate) return;
		if (row.target.background === this.editsBackground) {
			this.state.use(row.candidate);
		} else {
			this.fixed = row.candidate;
			this.state.animated = true;
		}
	};

	useForeground = (colour: Rgb) => this.put(false, colour);

	useBackground = (colour: Rgb) => this.put(true, colour);

	parseForeground = (text: string) => {
		const colour = readColour(text);
		if (colour) this.put(false, colour);
		return colour !== undefined;
	};

	parseBackground = (text: string) => {
		const colour = readColour(text);
		if (colour) this.put(true, colour);
		return colour !== undefined;
	};

	// the web fields answered every keystroke; the kit input waits 400 ms
	typeLive = (background: boolean, event: Event) => {
		const colour = readColour(
			(event.target as HTMLInputElement).value,
		);
		if (colour) this.put(background, colour);
	};

	// a click places the caret after focus, so select on the next frame
	focusField = (background: boolean, event: FocusEvent) => {
		this.edit(background);
		const field = event.target;
		if (field instanceof HTMLInputElement)
			requestAnimationFrame(() => field.select());
	};

	<template>
		<CanonSplit
			class="contrast-checker
				{{unless
					this.animated
					'contrast-checker--follows'
				}}"
			@sidebarWidth={{sidebarWidth}}
			@collapsesTo={{collapsedBand}}
		>
			<:banner>
				<CanonCanvas @height={{specimenHeight}}>
					<Specimen
						@foreground={{this.foreground}}
						@background={{this.background}}
						@ratio={{this.ratio}}
						@animated={{this.animated}}
					/>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<CanonRow
						class="contrast-field"
						@title="Foreground"
						@form="stacked"
						as |titleId|
					>
						<CanonColourNotationInput
							class="contrast-input"
							@colour={{this.foreground}}
							@text={{this.foregroundText}}
							@onColour={{this.useForeground}}
							@parse={{this.parseForeground}}
							@labelledBy={{titleId}}
							{{on
								"input"
								(fn
									this.typeLive
									false
								)
							}}
							{{on
								"focusin"
								(fn
									this.focusField
									false
								)
							}}
						/>
					</CanonRow>
					<CanonRow
						class="contrast-field"
						@title="Background"
						@form="stacked"
						as |titleId|
					>
						<CanonColourNotationInput
							class="contrast-input"
							@colour={{this.background}}
							@text={{this.backgroundText}}
							@onColour={{this.useBackground}}
							@parse={{this.parseBackground}}
							@labelledBy={{titleId}}
							{{on
								"input"
								(fn
									this.typeLive
									true
								)
							}}
							{{on
								"focusin"
								(fn
									this.focusField
									true
								)
							}}
						/>
					</CanonRow>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<div
						class="contrast-wells"
						style={{wellsStyle}}
					>
						{{#each this.wells as |well|}}
							<button
								type="button"
								class="contrast-well
									{{if
										well.selected
										'contrast-well--on'
									}}"
								aria-pressed={{if
									well.selected
									"true"
									"false"
								}}
								aria-label="{{well.title}} {{well.hex}}"
								{{press}}
								{{on
									"click"
									(fn
										this.edit
										well.background
									)
								}}
							>
								<span
									class="contrast-well-swatch"
									style={{well.swatch}}
								></span>
								<span
									class="contrast-well-text"
								>
									<span
										class="contrast-well-title"
									>{{well.title}}</span>
									<span
										class="contrast-well-hex"
									>{{well.hex}}</span>
								</span>
							</button>
						{{/each}}
						<CanonButton
							class="contrast-flip"
							@kind="cell"
							@icon={{Flip}}
							@label="Flip"
							@onClick={{this.flip}}
						/>
						<span
							class="contrast-wells-indicator
								{{if
									this.editsBackground
									'contrast-wells-indicator--end'
								}}"
						></span>
					</div>
					<div class="contrast-solid">
						<CanonColourSolid
							class="contrast-solid-picture"
							@space={{this.state.space}}
							@point={{this.state.point}}
							@animated={{this.state.animated}}
							@sliceAxis={{this.state.sliceAxis}}
							@isOrtho={{this.state.isOrtho}}
							@showsWhole={{this.state.showsWhole}}
							@marks={{this.marks}}
							@onChange={{this.pick}}
							@closestName={{closestName}}
						/>
						<CanonColourStrip
							@colour={{this.edited}}
							@nameOf={{getColourName}}
							@format={{this.format}}
						/>
					</div>
					<CanonColourControls
						@state={{this.state}}
						@hidesNotation={{true}}
					/>
				</CanonRows>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Contrast ratio" />
					<Scale @ratio={{this.ratio}} />
					<Lamps @ratio={{this.ratio}} />
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Suggestions" />
					{{#each this.suggestions as |row|}}
						<button
							type="button"
							class="contrast-suggestion"
							disabled={{unless
								row.candidate
								true
							}}
							aria-label="{{row.title}} {{row.target.level}}, {{row.detail}}, {{row.ratio}}"
							{{press}}
							{{on
								"click"
								(fn
									this.apply
									row
								)
							}}
						>
							<span
								class="contrast-suggestion-preview"
								style={{pair
									row.foreground
									row.background
								}}
								aria-hidden="true"
							>Aa</span>
							<span
								class="contrast-suggestion-cell"
							>
								<span
									class="contrast-suggestion-text"
								>
									<span
										class="contrast-suggestion-title"
									>{{row.title}}</span>
									<span
										class="contrast-suggestion-detail"
									>{{row.detail}}</span>
								</span>
								<span
									class="contrast-suggestion-ratio"
								>{{row.ratio}}</span>
								{{#if
									row.candidate
								}}
									<span
										class="contrast-suggestion-glyph"
										aria-hidden="true"
									><Wand
										/></span>
								{{/if}}
							</span>
						</button>
					{{/each}}
				</CanonRows>
				<div class="contrast-cards">
					<CanonColourCard
						@colour={{this.foreground}}
						@name="Foreground"
						@primaryFormat={{this.format}}
					/>
					<CanonColourCard
						@colour={{this.background}}
						@name="Background"
						@primaryFormat={{this.format}}
					/>
				</div>
			</:main>
		</CanonSplit>
	</template>
}
