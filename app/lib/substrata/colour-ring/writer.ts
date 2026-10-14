import { tracked } from '@glimmer/tracking';
import {
	getColour,
	setAlpha,
	setHex,
} from 'delphitools-v2/lib/substrata/colour-store';
import {
	beginTransient,
	commitTransient,
	rollbackTransient,
} from 'delphitools-v2/lib/substrata/doc-store';
import type { RingTarget } from 'delphitools-v2/lib/substrata/editor-ui';
import { colourFromHex, hexOf, shelf, type RingColour } from './model';

/**
 * iOS ColourSink for the ring and the tray: the working colour through
 * colour-store (whose sink recolours the selection), or a colour well's
 * target while one is set. A run of previews ends in one undo step.
 */
export class ColourWriter {
	@tracked targetColour: RingColour | null = null;
	target: RingTarget | null = null;
	#previewing = false;

	begin(target: RingTarget | null): void {
		this.target = target;
		this.targetColour = target
			? colourFromHex(target.hex, target.alpha)
			: null;
	}

	end(): void {
		if (this.#previewing) {
			commitTransient();
			this.#previewing = false;
		}
		this.target = null;
		this.targetColour = null;
	}

	get current(): RingColour {
		if (this.targetColour) return this.targetColour;
		const { rgb, alpha } = getColour();
		return {
			r: rgb.r / 255,
			g: rgb.g / 255,
			b: rgb.b / 255,
			alpha,
		};
	}

	/** `final` is false while a slider moves or the keypad types; a final colour joins the recent ones */
	set(colour: RingColour, final: boolean): void {
		if (this.target) {
			this.targetColour = colour;
			this.target.send(
				hexOf(colour, false),
				colour.alpha,
				final,
			);
		} else {
			if (!final && !this.#previewing) {
				beginTransient();
				this.#previewing = true;
			}
			this.#write(colour);
			if (final && this.#previewing) {
				commitTransient();
				this.#previewing = false;
			}
		}
		if (final) shelf.remember(hexOf(colour));
	}

	/** ends a run of previews that came back to `colour` without an undo step */
	revert(colour: RingColour): void {
		if (this.target) {
			this.targetColour = colour;
			this.target.send(
				hexOf(colour, false),
				colour.alpha,
				true,
			);
			return;
		}
		if (this.#previewing) {
			rollbackTransient();
			this.#previewing = false;
		}
		this.#write(colour);
	}

	/** `hex` at the current opacity, for a swatch or typed digits that carry none */
	atCurrentOpacity(hex: string): RingColour | null {
		const parsed = colourFromHex(hex);
		return parsed && { ...parsed, alpha: this.current.alpha };
	}

	#write(colour: RingColour): void {
		setHex(hexOf(colour, false));
		if (getColour().alpha !== colour.alpha) setAlpha(colour.alpha);
	}
}
