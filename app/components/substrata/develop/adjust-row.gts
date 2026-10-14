import Component from '@glimmer/component';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonRow from 'delphicanon/components/canon-row';
import CanonSlider from 'delphicanon/components/canon-slider';
import { IconSvg } from 'delphitools-v2/components/icon';
import { getFilterDef } from 'delphitools-v2/lib/substrata/filters';
import { FX_ICONS } from 'delphitools-v2/lib/substrata/fx-icons';
import type { SliderParam } from 'delphitools-v2/lib/substrata/param-spec';
import { trackOf } from './render';

interface AdjustRowSignature {
	Args: {
		type: string;
		/** the filter's amount, or null without the filter */
		value: number | null;
		onSet: (type: string, value: number) => void;
		/** drops the filter */
		onReset: (type: string) => void;
	};
}

// the longest title, so every track starts at the same place
export const SIZING = 'Temperature';

// template-lint forbids binding dblclick and pointerup on a row
export const listen = modifier(
	(el: HTMLElement, [type, fn]: [string, (event: Event) => void]) => {
		el.addEventListener(type, fn);
		return () => el.removeEventListener(type, fn);
	},
);

/** one adjustment's slider, centred on its origin, with the faint symbol */
export default class AdjustRow extends Component<AdjustRowSignature> {
	get def() {
		return getFilterDef(this.args.type);
	}

	get label() {
		return this.def?.label ?? this.args.type;
	}

	get spec(): SliderParam | undefined {
		return this.def?.params.find(
			(p): p is SliderParam =>
				p.kind === 'slider' && p.key === 'amount',
		);
	}

	get min() {
		return this.spec?.min ?? -100;
	}

	get max() {
		return this.spec?.max ?? 100;
	}

	get origin() {
		return this.min < 0 ? 0 : this.min;
	}

	get value() {
		return this.args.value ?? this.origin;
	}

	get icon() {
		return FX_ICONS[this.args.type];
	}

	readout = (v: number) => {
		const sign = this.min < 0 && v > 0 ? '+' : '';
		return `${sign}${Math.round(v)}${this.spec?.unit ?? ''}`;
	};

	get style() {
		const span = this.max - this.min;
		const origin = span > 0 ? (this.origin - this.min) / span : 0;
		const track = trackOf(this.args.type);
		return htmlSafe(
			[
				`--sub-dev-origin: ${origin}`,
				`--sub-dev-shift: ${this.value > this.origin ? 1 : 0}`,
				track ? `--sub-dev-track: ${track}` : '',
			].join('; '),
		);
	}

	get gradient() {
		return trackOf(this.args.type) !== null;
	}

	// back at the origin the filter goes, once a drag lets go (iOS)
	change = (value: number, dragging: boolean) => {
		if (value === this.origin && !dragging) this.reset();
		else this.args.onSet(this.args.type, value);
	};

	settle = () => {
		if (this.args.value === this.origin) this.reset();
	};

	reset = () => this.args.onReset(this.args.type);

	<template>
		{{#if this.spec}}
			<CanonRow
				class="sub-dev-row"
				@title={{this.label}}
				@form="flush"
				@sizingTitle={{SIZING}}
				data-type={{@type}}
				{{listen "dblclick" this.reset}}
				as |titleId|
			>
				<div
					class="sub-dev-control"
					style={{this.style}}
				>
					{{#if this.icon}}
						<span
							class="sub-dev-mark"
							aria-hidden="true"
						><IconSvg
								@name={{this.icon}}
							/></span>
					{{/if}}
					<CanonSlider
						class="sub-dev-slider
							{{if
								this.gradient
								'is-gradient'
							}}"
						@value={{this.value}}
						@min={{this.min}}
						@max={{this.max}}
						@step={{this.spec.step}}
						@readout={{this.readout}}
						@labelledBy={{titleId}}
						@onChange={{this.change}}
						{{listen
							"pointerup"
							this.settle
						}}
						{{listen
							"pointercancel"
							this.settle
						}}
					/>
				</div>
			</CanonRow>
		{{/if}}
	</template>
}
