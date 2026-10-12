import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import type Owner from '@ember/owner';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonColourControls, {
	CanonColourSolidState,
} from 'delphicanon/components/canon-colour-controls';
import CanonColourNotationInput from 'delphicanon/components/canon-colour-notation-input';
import CanonColourSolid from 'delphicanon/components/canon-colour-solid';
import CanonColourStrip from 'delphicanon/components/canon-colour-strip';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonValueLine from 'delphicanon/components/canon-value-line';
import { hex, parseHex, type Rgb } from 'delphicanon/lib/colour';
import {
	pointFor,
	solidSpaces,
	spaceNames,
	type SolidSpace,
} from 'delphicanon/lib/colour-space';
import { getColourName } from 'delphitools-v2/lib/colour-names';
import { carryColour } from 'delphitools-v2/lib/colour-query';
import {
	colourOf,
	decimalRgb,
	examples,
	format,
	launchFlags,
	pointOf,
	read,
	valuesAt,
	valuesOf,
} from 'delphitools-v2/components/tools/colour-converter/notation';
import Ribbons from 'delphitools-v2/components/tools/colour-converter/ribbons';
import './colour-converter/colour-converter.css';

const startColour = parseHex('3B82F6')!;

/** Fits "Decimal RGB" in the caption face. */
const labelWidth = 76;

const closestName = (colour: Rgb) => getColourName(hex(colour));

/** The port of ColourConverterViewController, without its colour management. */
export default class ColourConverter extends Component {
	state: CanonColourSolidState;

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const flags = launchFlags(window.location.search);
		// sliced row, rgb blue
		this.state = new CanonColourSolidState({
			space: flags.space ?? 'rgb',
			colour: flags.colour ?? startColour,
			activeRow: flags.row ?? 2,
		});
		this.state.viewPlane = flags.ortho;
		if (flags.typed) this.#take(flags.typed);
	}

	get colour(): Rgb {
		return this.state.colour;
	}

	get hex() {
		return hex(this.colour);
	}

	get carried() {
		return this.hex.toLowerCase();
	}

	/** The solid's own numbers keep a grey's hue. */
	values(space: SolidSpace) {
		return space === this.state.space
			? valuesAt(this.state.point, space)
			: valuesOf(this.colour, space);
	}

	get text() {
		return format(this.values(this.state.space), this.state.space);
	}

	get placeholder() {
		return examples[this.state.space];
	}

	get lit() {
		return this.state.slices
			? Math.min(this.state.activeRow, 2)
			: undefined;
	}

	get spaces() {
		return solidSpaces.map((space) => {
			const values = this.values(space);
			return {
				space,
				label: spaceNames[space].toUpperCase(),
				value: format(values, space),
				values,
				lit:
					space === this.state.space
						? this.lit
						: undefined,
				rgb: space === 'rgb',
				oklch: space === 'oklch',
			};
		});
	}

	get name() {
		return getColourName(this.hex);
	}

	get decimal() {
		return decimalRgb(this.colour);
	}

	/** Values in `space` reach the solid as its point, or as the colour they name. */
	pick = (space: SolidSpace, values: number[], animated: boolean) => {
		const point =
			space === this.state.space
				? pointOf(values, space)
				: pointFor(
						this.state.space,
						colourOf(values, space),
					);
		this.state.setPoint(point, animated);
	};

	#take(text: string) {
		const values = read(text, this.state.space);
		if (values) this.pick(this.state.space, values, true);
		return values;
	}

	/** The notation input's own read, after a pause and on Return; blank text is not marked as unread. */
	parse = (text: string) =>
		this.#take(text) !== undefined || text.trim() === '';

	// the web field answered every keystroke; the kit input waits 400 ms
	typeLive = (event: Event) =>
		void this.#take((event.target as HTMLInputElement).value);

	// a click places the caret after focus, so select on the next frame
	selectAll = (event: FocusEvent) => {
		const field = event.target;
		if (field instanceof HTMLInputElement)
			requestAnimationFrame(() => field.select());
	};

	<template>
		<CanonSplit
			class="colour-converter"
			@halves={{true}}
			@collapsesTo={{240}}
			{{carryColour this.carried}}
		>
			<:sidebar>
				<CanonCanvas
					@aspect={{1}}
					@maxHeight={{640}}
					@background="var(--canon-muted)"
				>
					<div class="cc-picture">
						<CanonColourSolid
							class="cc-solid"
							@space={{this.state.space}}
							@point={{this.state.point}}
							@animated={{this.state.animated}}
							@sliceAxis={{this.state.sliceAxis}}
							@isOrtho={{this.state.isOrtho}}
							@showsWhole={{this.state.showsWhole}}
							@onChange={{this.state.pick}}
							@closestName={{closestName}}
						/>
						<CanonColourStrip
							@colour={{this.colour}}
							@nameOf={{getColourName}}
						/>
					</div>
				</CanonCanvas>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonColourNotationInput
						class="cc-input"
						@colour={{this.colour}}
						@text={{this.text}}
						@onColour={{this.state.use}}
						@parse={{this.parse}}
						@placeholder={{this.placeholder}}
						@label="Any notation"
						{{on "input" this.typeLive}}
						{{on "focusin" this.selectAll}}
					/>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonColourControls
						@state={{this.state}}
						@hidesNotation={{true}}
					/>
				</CanonRows>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="All Formats" />
					<CanonValueLine
						@label="Name"
						@value={{this.name}}
						@labelWidth={{labelWidth}}
					/>
					{{#each
						this.spaces key="space"
						as |line|
					}}
						{{#if line.rgb}}
							<CanonHeading
								@text="sRGB"
							/>
							<CanonValueLine
								@label="HEX"
								@value={{this.hex}}
								@labelWidth={{labelWidth}}
							/>
						{{else if line.oklch}}
							<CanonHeading
								@text="D65"
							/>
						{{/if}}
						<CanonValueLine
							@label={{line.label}}
							@value={{line.value}}
							@labelWidth={{labelWidth}}
						/>
						{{#if line.rgb}}
							<CanonValueLine
								@label="Decimal RGB"
								@value={{this.decimal}}
								@labelWidth={{labelWidth}}
							/>
						{{/if}}
						<Ribbons
							@space={{line.space}}
							@values={{line.values}}
							@lit={{line.lit}}
							@animated={{this.state.animated}}
							@onPick={{this.pick}}
						/>
					{{/each}}
				</CanonRows>
			</:main>
		</CanonSplit>
	</template>
}
