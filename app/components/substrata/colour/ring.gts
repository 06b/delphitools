import { ColourBody } from 'delphitools-v2/components/substrata/modules/colour-panel';
import { RailPanel } from 'delphitools-v2/components/substrata/editor/cells';
import { editorUi } from 'delphitools-v2/lib/substrata/editor-ui';

import type { TOC } from '@ember/component/template-only';

// interim: the old colour panel until the ring lands; @phone is the
// phone's colour tray
const ColourRing: TOC<{ Args: { phone: boolean } }> = <template>
	{{#if editorUi.ringOpen}}
		<RailPanel
			class="sub-ed-ring-interim"
			@id="colour"
			@title="Colour"
			@onClose={{editorUi.closeRing}}
		>
			<ColourBody />
		</RailPanel>
	{{/if}}
</template>;

export default ColourRing;
