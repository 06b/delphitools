import type { TOC } from '@ember/component/template-only';
import CanonPageStrip, {
	type CanonPage,
} from 'delphicanon/components/canon-page-strip';
import './blank-strip.css';

const A4 = { width: 595, height: 842 };
// ponytail: enough sheets for a 2200 px sheet; the rest are clipped
const count = 24;
const sheets = (size: CanonPage['size'] = A4): CanonPage[] =>
	Array.from({ length: count }, () => ({ size }));
const A4_SHEETS = sheets();

/** The page strip before a file: grey sheets across the whole width, out of reach. */
const BlankStrip: TOC<{
	Args: { size?: CanonPage['size'] };
	Element: HTMLDivElement;
}> = <template>
	<CanonPageStrip
		class="media-blank-strip"
		@pages={{if @size (sheets @size) A4_SHEETS}}
		aria-hidden="true"
		inert
		...attributes
	/>
</template>;

export default BlankStrip;
