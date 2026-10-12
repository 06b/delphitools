import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import { parseHex, takesBlackInk } from 'delphicanon/lib/colour';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { getColourName } from 'delphitools-v2/lib/colour-names';
import type { CuratedPalette } from 'delphitools-v2/lib/palette-collection';

interface DeckSignature {
	Args: {
		palette?: CuratedPalette;
		/** Under the name on the cover: the category and the count. */
		detail?: string;
		/** The cover's title when there is no palette. */
		emptyTitle: string;
	};
}

/** The cover lies this far below horizontal, degrees clockwise from upright. */
const cover = 97;
const maxSpread = 80;
const maxStep = 16;

/**
 * PaletteDeck: a palette as a paint fan deck held at its rivet, the cover
 * with the palette's name lying nearly flat along the top, one chip per
 * colour hanging down and out beneath it. A new palette fans the chips out
 * again. A press on a chip copies its hex.
 */
export default class Deck extends Component<DeckSignature> {
	@service('canon-toast') declare toast: CanonToastService;

	get key() {
		return this.args.palette?.id ?? '';
	}

	get chips() {
		const colours = this.args.palette?.colors ?? [];
		const step = Math.min(
			maxSpread / Math.max(colours.length, 1),
			maxStep,
		);
		return colours.map((code, i) => {
			const black = takesBlackInk(parseHex(code)!);
			return {
				// keyed by palette, so a new palette fans out again
				key: `${this.key}-${i}`,
				hex: code.toUpperCase(),
				label: `${getColourName(code)} ${code.toUpperCase()}`,
				style: htmlSafe(
					`--pc-angle: ${cover + step * (i + 1)}deg; --pc-delay: ${i * 35}ms; z-index: ${colours.length - i}; background: ${code}; color: ${black ? 'black' : 'white'}`,
				),
			};
		});
	}

	get coverStyle() {
		return htmlSafe(
			`--pc-angle: ${cover}deg; z-index: ${this.chips.length + 1}`,
		);
	}

	copy = (hex: string) => void this.toast.copy(hex);

	<template>
		<div class="pc-deck">
			<div class="pc-deck-fan">
				{{#each this.chips key="key" as |chip|}}
					<button
						type="button"
						class="pc-chip"
						style={{chip.style}}
						aria-label={{chip.label}}
						data-hex={{chip.hex}}
						{{on
							"click"
							(fn this.copy chip.hex)
						}}
					><span
							class="pc-chip-hex"
						>{{chip.hex}}</span></button>
				{{/each}}
				<div
					class="pc-chip pc-chip--cover"
					style={{this.coverStyle}}
				>
					<span class="pc-cover-text">
						{{#if @palette}}
							<span
								class="pc-cover-title"
							>{{@palette.name}}</span>
							<span
								class="pc-cover-detail"
							>{{@detail}}</span>
						{{else}}
							<span
								class="pc-cover-title"
							>{{@emptyTitle}}</span>
						{{/if}}
					</span>
				</div>
				<span
					class="pc-rivet"
					aria-hidden="true"
				></span>
			</div>
		</div>
	</template>
}
