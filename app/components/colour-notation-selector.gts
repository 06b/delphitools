import Component from '@glimmer/component';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { service } from '@ember/service';
import CanonPopover from 'delphicanon/components/canon-popover';
import Icon from 'delphitools-v2/components/icon';
import { COLOUR_NOTATIONS } from 'delphitools-v2/lib/colour-notation';
import type { ColourNotation } from 'delphitools-v2/lib/colour-notation';
import type ColourNotationService from 'delphitools-v2/services/colour-notation';
import './colour-notation-selector.css';

function focusCurrent(event: ToggleEvent) {
	if (event.newState !== 'open') return;
	(event.target as HTMLElement)
		.querySelector<HTMLElement>('[aria-pressed="true"]')
		?.focus({ preventScroll: true });
}

export default class ColourNotationSelector extends Component {
	@service declare colourNotation: ColourNotationService;

	get notations() {
		return COLOUR_NOTATIONS.map((notation) => ({
			...notation,
			isCurrent: notation.id === this.colourNotation.notation,
		}));
	}

	get currentLabel() {
		return (
			COLOUR_NOTATIONS.find(
				(n) => n.id === this.colourNotation.notation,
			)?.label ?? ''
		);
	}

	choose = (close: () => void, id: ColourNotation) => {
		this.colourNotation.setNotation(id);
		close();
	};

	<template>
		<CanonPopover
			class="dt-notation-popover"
			role="dialog"
			aria-label="Colour Notation"
			@placement="bottom-end"
			{{on "toggle" focusCurrent}}
		>
			<:trigger as |p|>
				<button
					type="button"
					class="dt-notation-trigger"
					aria-label="Colour notation preference"
					{{p.trigger}}
				>
					<Icon @name="pipette" />
					<span
						class="dt-notation-current"
					>{{this.currentLabel}}</span>
				</button>
			</:trigger>
			<:content as |p|>
				<span class="dt-notation-label">Colour Notation</span>
				<div class="dt-notation-grid">
					{{#each
						this.notations key="id"
						as |notation|
					}}
						<button
							type="button"
							class="dt-notation-option
								{{if
									notation.isCurrent
									'is-on'
								}}"
							title={{notation.example}}
							aria-pressed={{if
								notation.isCurrent
								"true"
								"false"
							}}
							{{on
								"click"
								(fn
									this.choose
									p.close
									notation.id
								)
							}}
						>{{notation.label}}</button>
					{{/each}}
				</div>
			</:content>
		</CanonPopover>
	</template>
}
