import { RailPanel } from 'delphitools-v2/components/substrata/editor/cells';
import { FxBody } from 'delphitools-v2/components/substrata/modules/fx-panel';
import { editorUi } from 'delphitools-v2/lib/substrata/editor-ui';

const close = () => editorUi.close('fx');

<template>
	<RailPanel @id="fx" @title="FX" @onClose={{close}}>
		<FxBody />
	</RailPanel>
</template>
