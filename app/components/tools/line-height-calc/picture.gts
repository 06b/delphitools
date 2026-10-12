import type { TOC } from '@ember/component/template-only';
import { htmlSafe } from '@ember/template';
import { modifier } from 'ember-modifier';
import CanonFigure from 'delphicanon/components/canon-figure';
import { reducedMotion } from 'delphicanon/lib/motion';
import {
	comparisons,
	pictureScale,
	settleEased,
	settleMs,
} from 'delphitools-v2/components/tools/line-height-calc/line-height';

export interface PictureSignature {
	Args: {
		size: number;
		lineHeight: number;
		multiplier: number;
		/** The line height as the figure shows it, without the unit. */
		figure: string;
		text: string;
	};
	Element: HTMLDivElement;
}

interface Pose {
	size: number;
	lineHeight: number;
}

const shown = new WeakMap<HTMLElement, Pose>();

function paint(element: HTMLElement, pose: Pose, room: number) {
	shown.set(element, pose);
	const scale = pictureScale(pose.lineHeight, room);
	element.style.setProperty(
		'--line-height-calc-font',
		`${Math.max(1, pose.size * scale)}px`,
	);
	element.style.setProperty(
		'--line-height-calc-box',
		`${pose.lineHeight * scale}px`,
	);
}

/** Size and line height spring to a new value over 0.6 s. */
const settle = modifier(
	(element: HTMLElement, [size, lineHeight]: [number, number]) => {
		const padding =
			parseFloat(
				getComputedStyle(element).getPropertyValue(
					'--canon-panel-padding',
				),
			) || 16;
		const room = element.clientHeight - 2 * padding;
		const target = { size, lineHeight };
		const from = shown.get(element);
		if (!from || reducedMotion()) {
			paint(element, target, room);
			return;
		}
		const started = performance.now();
		const step = (now: number) => {
			const progress = Math.min(
				1,
				Math.max(0, (now - started) / settleMs),
			);
			const eased = settleEased(progress);
			paint(
				element,
				{
					size: Math.max(
						1,
						from.size +
							(target.size -
								from.size) *
								eased,
					),
					lineHeight: Math.max(
						1,
						from.lineHeight +
							(target.lineHeight -
								from.lineHeight) *
								eased,
					),
				},
				room,
			);
			if (progress < 1) frame = requestAnimationFrame(step);
		};
		let frame = requestAnimationFrame(step);
		return () => cancelAnimationFrame(frame);
	},
);

function others(multiplier: number) {
	return comparisons(multiplier).map((other) => ({
		...other,
		style: htmlSafe(`--line-height-calc-ratio: ${other.ratio}`),
	}));
}

// ponytail: shrinks past seven characters instead of measuring the text
function figureSize(text: string) {
	const length = text.length + 2;
	return length <= 7 ? 34 : Math.max(18, Math.floor((34 * 7) / length));
}

/**
 * Text in line boxes of the chosen height, as CSS lays them out, the content
 * area shaded and a bracket over the first box; other presets beside it.
 */
const Picture: TOC<PictureSignature> = <template>
	<div
		class="line-height-calc-picture"
		{{settle @size @lineHeight}}
		...attributes
	>
		<div class="line-height-calc-rules" aria-hidden="true"></div>
		<div class="line-height-calc-lit" aria-hidden="true">
			<p>{{@text}}</p>
		</div>
		<span
			class="line-height-calc-bracket"
			aria-hidden="true"
		></span>
		<div class="line-height-calc-others" aria-hidden="true">
			{{#each (others @multiplier) key="ratio" as |other|}}
				<div
					class="line-height-calc-other"
					style={{other.style}}
				>
					<span
						class="line-height-calc-caption"
					>{{other.label}}</span>
					<p>{{@text}}</p>
				</div>
			{{/each}}
		</div>
		<output
			class="line-height-calc-figure"
			aria-label="Line Height"
		>
			<CanonFigure
				@text={{@figure}}
				@unit="px"
				@size={{figureSize @figure}}
				@halo="var(--canon-card)"
			/>
		</output>
	</div>
</template>;

export default Picture;
