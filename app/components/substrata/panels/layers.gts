import {
	RailPanel,
	Cell,
} from 'delphitools-v2/components/substrata/editor/cells';
import { LayersBody } from 'delphitools-v2/components/substrata/modules/layers-panel';
import { editorUi } from 'delphitools-v2/lib/substrata/editor-ui';

const close = () => editorUi.close('layers');

<template>
	<RailPanel @id="layers" @title="Layers" @onClose={{close}}>
		<:header>
			<Cell
				@label="Pin"
				@icon="pin"
				@selected={{editorUi.layersPinned}}
				@onClick={{editorUi.toggleLayersPin}}
			/>
		</:header>
		<:default><LayersBody /></:default>
	</RailPanel>
</template>
