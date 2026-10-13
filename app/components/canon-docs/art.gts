import type { TOC } from '@ember/component/template-only';

/** Stand-in canvas content: a gradient with a centred label. */
const GalleryArt: TOC<{ Args: { label: string } }> = <template>
	<div class="cd-art"><span>{{@label}}</span></div>
</template>;

export default GalleryArt;
