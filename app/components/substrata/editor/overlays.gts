import { ColourBody } from 'delphitools-v2/components/substrata/modules/colour-panel';
import { RailPanel } from 'delphitools-v2/components/substrata/editor/cells';
import { editorUi } from 'delphitools-v2/lib/substrata/editor-ui';

const closeRing = () => (editorUi.ringOpen = false);

// interim: the old colour panel until the ring lands
<template>
	{{#if editorUi.ringOpen}}
		<RailPanel
			class="sub-ed-ring-interim"
			@id="colour"
			@title="Colour"
			@onClose={{closeRing}}
		>
			<ColourBody />
		</RailPanel>
	{{/if}}
</template>
