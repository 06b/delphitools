import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import type { TOC } from '@ember/component/template-only';
import press from 'delphicanon/modifiers/canon-press';
import { reducedMotion, springEasing } from 'delphicanon/lib/motion';
import type { PaperSize } from 'delphitools-v2/components/tools/paper-sizes/data';
import './cell.css';

const badgeSpring = springEasing(0.6);

/** The badge pops when a cell takes a slot. */
const pop = modifier((badge: HTMLElement, [mark]: [number | undefined]) => {
	const before = badge.dataset['mark'];
	badge.dataset['mark'] = String(mark ?? '');
	if (
		before === undefined ||
		!mark ||
		before === String(mark) ||
		reducedMotion()
	)
		return;
	badge.animate([{ transform: 'scale(0.3)' }, { transform: 'none' }], {
		duration: 400,
		easing: badgeSpring,
	});
});

interface CellSignature {
	Args: {
		size: PaperSize;
		text: string;
		mark?: number;
		/** The badge shows a tick, not the slot number (iOS PaperSizeList.ticks). */
		tick?: boolean;
		detail?: string;
		onPick: () => void;
	};
}

/** The sheet's long side fills a 40 px box. */
function glyph(size: PaperSize) {
	const long = Math.max(size.widthMM, size.heightMM, 1);
	return htmlSafe(
		`inline-size: ${Math.round((40 * size.widthMM) / long)}px; block-size: ${Math.round((40 * size.heightMM) / long)}px`,
	);
}

function concat(...parts: unknown[]) {
	return parts.join('');
}

/** The iOS PaperSizeCell: a sheet glyph, the name and the dimensions. */
const Cell: TOC<CellSignature> = <template>
	<button
		type="button"
		class="paper-cell {{if @mark (concat 'paper-slot-' @mark)}}"
		aria-current={{if @mark "true"}}
		{{press}}
		{{on "click" @onPick}}
	>
		<span class="paper-cell-box"><span
				class="paper-cell-sheet"
				style={{glyph @size}}
			></span></span>
		<span class="paper-cell-name">{{@size.name}}</span>
		<span class="paper-cell-dimensions">{{@text}}</span>
		{{#if @detail}}
			<span class="paper-cell-detail">{{@detail}}</span>
		{{/if}}
		<span class="paper-cell-badge" {{pop @mark}}>{{if
				@tick
				"✓"
				@mark
			}}</span>
	</button>
</template>;

export default Cell;
