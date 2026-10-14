import { RailPanel } from 'delphitools-v2/components/substrata/editor/cells';
import { InspectorBody } from 'delphitools-v2/components/substrata/modules/inspector-panel';
import { editorUi } from 'delphitools-v2/lib/substrata/editor-ui';

const close = () => editorUi.close('inspector');

<template>
	<RailPanel @id="inspector" @title="Inspector" @onClose={{close}}>
		<InspectorBody />
	</RailPanel>
</template>
