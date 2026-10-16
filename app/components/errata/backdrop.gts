import type { TOC } from '@ember/component/template-only';
import { modifier } from 'ember-modifier';

// one tile, two lockups half a tile apart: a diamond lattice;
// mask-size and the scroll distance in errata.css match
const W = 240;
const H = 160;
const FONT = '"Open Sans Condensed"';
const NAME = `700 32px ${FONT}`;
const KIND = `600 11px ${FONT}`;

let tile: Promise<string> | undefined;

// a CSS mask image cannot use the page's web fonts, so draw it here
async function drawTile(): Promise<string> {
	await Promise.all([
		document.fonts.load(NAME),
		document.fonts.load(KIND),
	]);
	const scale = 2;
	const canvas = document.createElement('canvas');
	canvas.width = W * scale;
	canvas.height = H * scale;
	const ctx = canvas.getContext('2d')!;
	ctx.scale(scale, scale);
	ctx.textAlign = 'center';
	for (const [x, y] of [
		[W / 4, H / 4],
		[(3 * W) / 4, (3 * H) / 4],
	] as const) {
		ctx.font = NAME;
		ctx.letterSpacing = '0px';
		ctx.fillText('Errata', x, y + 4);
		ctx.font = KIND;
		ctx.letterSpacing = '2px';
		ctx.fillText('PDF EDITOR', x + 1, y + 20);
	}
	return canvas.toDataURL();
}

const paint = modifier((element: HTMLElement) => {
	let live = true;
	void (tile ??= drawTile()).then((url) => {
		if (!live) return;
		element.style.setProperty('--err-tile', `url(${url})`);
		element.classList.add('is-ready');
	});
	return () => {
		live = false;
	};
});

const Backdrop: TOC<object> = <template>
	<div class="err-backdrop" aria-hidden="true" {{paint}}></div>
</template>;

export default Backdrop;
