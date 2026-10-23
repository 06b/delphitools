import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { service } from '@ember/service';
import CanonButton from 'delphicanon/components/canon-button';
import CanonFigure from 'delphicanon/components/canon-figure';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonMenuCell from 'delphicanon/components/canon-menu-cell';
import CanonPage from 'delphicanon/components/canon-page';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSlider from 'delphicanon/components/canon-slider';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonStepper from 'delphicanon/components/canon-stepper';
import CanonSwitch from 'delphicanon/components/canon-switch';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';

const themes = ['Light', 'Dark', 'Auto'];
const notations = ['Hex', 'RGB', 'HSL', 'OKLCH'];
const units = ['px', 'rem', 'pt'];
const Trash = <template><IconSvg @name="trash-2" /></template>;
const Undo = <template><IconSvg @name="rotate-ccw" /></template>;
const px = (value: number) => `${Math.round(value)} px`;

export default class SettingsScreen extends Component {
	@service('canon-toast') declare toast: CanonToastService;

	@tracked theme = 2;
	@tracked text = 15;
	@tracked motion = true;
	@tracked sounds = false;
	@tracked notation = 0;
	@tracked unit = 0;
	@tracked history = 24;
	@tracked stored = 3.2;

	get storedText() {
		return this.stored.toFixed(1);
	}

	setTheme = (index: number) => (this.theme = index);
	setText = (value: number) => (this.text = value);
	setMotion = (on: boolean) => (this.motion = on);
	setSounds = (on: boolean) => (this.sounds = on);
	setNotation = (index: number) => (this.notation = index);
	setUnit = (index: number) => (this.unit = index);
	stepHistory = (direction: -1 | 1) =>
		(this.history = Math.min(
			99,
			Math.max(0, this.history + direction),
		));

	empty = () => {
		this.stored = 0;
		this.toast.show('Cleared');
	};

	reset = () => {
		this.theme = 2;
		this.text = 15;
		this.motion = true;
		this.sounds = false;
		this.notation = 0;
		this.unit = 0;
		this.history = 24;
		this.toast.show('Reset');
	};

	<template>
		<CanonPage @maxWidth={{600}}>
			<CanonRows @framed={{true}}>
				<CanonHeading @text="Appearance" />
				<CanonRow
					@title="Theme"
					@form="stacked"
					as |titleId|
				>
					<CanonSegmented
						aria-labelledby={{titleId}}
						@items={{themes}}
						@selected={{this.theme}}
						@onChange={{this.setTheme}}
					/>
				</CanonRow>
				<CanonRow
					@title="Text size"
					@form="stacked"
					as |titleId|
				>
					<CanonSlider
						@value={{this.text}}
						@min={{12}}
						@max={{22}}
						@step={{1}}
						@readout={{px}}
						@labelledBy={{titleId}}
						@onChange={{this.setText}}
					/>
				</CanonRow>
				<CanonRow @title="Motion" as |titleId|>
					<CanonSwitch
						@on={{this.motion}}
						@onChange={{this.setMotion}}
						aria-labelledby={{titleId}}
					/>
				</CanonRow>
				<CanonRow @title="Sounds" as |titleId|>
					<CanonSwitch
						@on={{this.sounds}}
						@onChange={{this.setSounds}}
						aria-labelledby={{titleId}}
					/>
				</CanonRow>
			</CanonRows>
			<CanonRows @framed={{true}}>
				<CanonHeading @text="Defaults" />
				<CanonRow
					@title="Notation"
					@form="flush"
					as |titleId|
				>
					<CanonMenuCell
						@items={{notations}}
						@selected={{this.notation}}
						@labelledBy={{titleId}}
						@onChange={{this.setNotation}}
					/>
				</CanonRow>
				<CanonRow
					@title="Units"
					@form="flush"
					as |titleId|
				>
					<CanonMenuCell
						@items={{units}}
						@selected={{this.unit}}
						@labelledBy={{titleId}}
						@onChange={{this.setUnit}}
					/>
				</CanonRow>
				<CanonRow @title="History" @detail="Entries">
					<CanonStepper
						@onStep={{this.stepHistory}}
					>
						<span
							class="canon-stepper-value"
						>{{this.history}}</span>
					</CanonStepper>
				</CanonRow>
			</CanonRows>
			<CanonRows @framed={{true}}>
				<CanonHeading @text="Storage" />
				<CanonRow @title="Saved files">
					<CanonFigure
						@text={{this.storedText}}
						@unit="MB"
						@size={{24}}
					/>
				</CanonRow>
				<CanonRow @title="Offline">
					<CanonStatus @text="Ready" @tone="ok" />
				</CanonRow>
				<CanonGrid>
					<CanonButton
						@text="Empty"
						@icon={{Trash}}
						@onClick={{this.empty}}
					/>
					<CanonButton
						@text="Reset"
						@icon={{Undo}}
						@onClick={{this.reset}}
					/>
				</CanonGrid>
			</CanonRows>
		</CanonPage>
	</template>
}
