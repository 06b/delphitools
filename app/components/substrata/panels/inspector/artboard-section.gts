import Component from '@glimmer/component';
import CanonButton from 'delphicanon/components/canon-button';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonSwitch from 'delphicanon/components/canon-switch';
import { IconSvg } from 'delphitools-v2/components/icon';
import { setArtboard } from 'delphitools-v2/lib/substrata/artboard-ops';
import type { SubstrataDoc } from 'delphitools-v2/lib/substrata/doc-model';
import {
	update,
	updateTransient,
} from 'delphitools-v2/lib/substrata/doc-store';
import { openModal } from 'delphitools-v2/lib/substrata/modal';
import {
	getPersistenceEnabled,
	subscribePersistence,
} from 'delphitools-v2/lib/substrata/persistence-pref';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';
import ColourWell from './colour-well';
import Fresh, { both } from './fresh';
import NumField from './num-field';

const setWidth = (width: number) => setArtboard({ width });
const setHeight = (height: number) => setArtboard({ height });
const setTransparent = (on: boolean) =>
	setArtboard({ background: on ? null : '#ffffff' });
const openCanvasSize = () => openModal('canvas-size');

const setBackground = (background: string, transient: boolean) => {
	const apply = (doc: SubstrataDoc): SubstrataDoc => ({
		...doc,
		artboard: { ...doc.artboard, background },
		updatedAt: Date.now(),
	});
	if (transient) updateTransient(apply);
	else update(apply);
};

// iOS artboardRows, then the web's canvas readout and its Canvas size modal
export default class ArtboardSection extends Component<{
	Args: { doc: SubstrataDoc };
}> {
	persist = new TrackedExternal(
		subscribePersistence,
		getPersistenceEnabled,
	);

	willDestroy() {
		super.willDestroy();
		this.persist.unsubscribe();
	}

	get artboard() {
		return this.args.doc.artboard;
	}

	get transparent() {
		return this.artboard.background === null;
	}

	get resolution() {
		return `${this.artboard.resolution} ppi`;
	}

	get layerCount() {
		return String(this.args.doc.layers.length);
	}

	get stored() {
		return this.persist.current ? 'Local' : 'Off';
	}

	<template>
		<CanonHeading @text="Artboard" />
		<CanonRow @title="Width" @form="flush" as |titleId|>
			<NumField
				@value={{this.artboard.width}}
				@onCommit={{setWidth}}
				@min={{1}}
				@max={{20000}}
				@unit="px"
				@labelledBy={{titleId}}
			/>
		</CanonRow>
		<CanonRow @title="Height" @form="flush" as |titleId|>
			<NumField
				@value={{this.artboard.height}}
				@onCommit={{setHeight}}
				@min={{1}}
				@max={{20000}}
				@unit="px"
				@labelledBy={{titleId}}
			/>
		</CanonRow>
		<CanonRow @title="Transparent" as |titleId|>
			<Fresh @value={{this.transparent}} as |mine|>
				<CanonSwitch
					@on={{this.transparent}}
					@onChange={{both mine setTransparent}}
					aria-labelledby={{titleId}}
				/>
			</Fresh>
		</CanonRow>
		{{#unless this.transparent}}
			<CanonRow @title="Background" @form="stacked">
				<ColourWell
					@hex={{if
						this.artboard.background
						this.artboard.background
						"#ffffff"
					}}
					@onApply={{setBackground}}
					@label="Background"
				/>
			</CanonRow>
		{{/unless}}
		<CanonRow @title="Resolution">
			<span class="sub-ip-fact">{{this.resolution}}</span>
		</CanonRow>
		<CanonRow @title="Layers">
			<span class="sub-ip-fact">{{this.layerCount}}</span>
		</CanonRow>
		<CanonRow @title="Stored">
			<span class="sub-ip-fact">{{this.stored}}</span>
		</CanonRow>
		<CanonButton
			class="sub-ip-wide"
			@kind="cell"
			@text="Canvas size…"
			@icon={{component IconSvg name="scaling"}}
			@onClick={{openCanvasSize}}
		/>
	</template>
}
