import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { htmlSafe } from '@ember/template';
import { ANCHORS, type Anchor } from 'delphitools-v2/lib/pdf-stamp';
import {
	minFontSize,
	watermarkSize,
	type FontFamily,
	type StampOptions,
} from 'delphitools-v2/components/tools/pdf-page-numberer/stamp';
import { ANCHOR_NAMES } from 'delphitools-v2/components/tools/pdf-page-numberer/anchors';

export interface Size {
	width: number;
	height: number;
}

export interface PictureSignature {
	Args: {
		/** PDF points; none draws a blank A4 page. */
		size?: Size;
		/** The page drawn without stamps. */
		picture?: string;
		number: string | null;
		stamp: string | null;
		options: StampOptions;
		/** Presses on a third of the page move the number there. */
		zones: boolean;
		onAnchor: (anchor: Anchor) => void;
	};
}

const A4 = { width: 595.28, height: 841.89 };

// export's base-14 fonts
const FONT_CSS: Record<FontFamily, string> = {
	sans: 'Helvetica, Arial, sans-serif',
	serif: '"Times New Roman", Times, serif',
	mono: '"Courier New", Courier, monospace',
};

const share = (points: number, page: Size) =>
	`${(points / page.width) * 100}cqi`;

function placed(o: StampOptions, anchor: Anchor, page: Size) {
	const margin = share(o.margin, page);
	const [v, h] = anchor.split('-');
	const parts = [
		`font-family: ${FONT_CSS[o.font]}`,
		`font-size: ${share(Math.max(minFontSize, o.fontSize), page)}`,
	];
	let x = '0';
	let y = '0';
	if (h === 'left') parts.push(`left: ${margin}`);
	else if (h === 'right') parts.push(`right: ${margin}`);
	else {
		parts.push('left: 50%');
		x = '-50%';
	}
	if (v === 'top') parts.push(`top: ${margin}`);
	else if (v === 'bottom') parts.push(`bottom: ${margin}`);
	else {
		parts.push('top: 50%');
		y = '-50%';
	}
	parts.push(`translate: ${x} ${y}`);
	return htmlSafe(parts.join('; '));
}

function watermark(o: StampOptions, text: string, page: Size) {
	const size = watermarkSize(page.width, page.height, text.trim().length);
	return htmlSafe(
		[
			`font-family: ${FONT_CSS[o.font]}`,
			`font-size: ${share(size, page)}`,
			`opacity: ${o.opacity}`,
			'left: 50%',
			'top: 50%',
			// export 0.175em, line 0.35em
			'transform: translate(-50%, -50%) rotate(-45deg) translateY(-0.17em)',
		].join('; '),
	);
}

/**
 * The lit page with its number and stamp, redrawn on every change. A press
 * on a third of the page moves the number there; marks show the other
 * anchors. The port of iOS PageNumberPreview.
 */
export default class Picture extends Component<PictureSignature> {
	get page() {
		return this.args.size ?? A4;
	}

	get boxStyle() {
		const { width, height } = this.page;
		return htmlSafe(`--ppn-aspect: ${width} / ${height}`);
	}

	get numberStyle() {
		return placed(
			this.args.options,
			this.args.options.numberAnchor,
			this.page,
		);
	}

	get stampStyle() {
		const { options, stamp } = this.args;
		return options.stampMode === 'watermark'
			? watermark(options, stamp ?? '', this.page)
			: placed(options, options.stampAnchor, this.page);
	}

	get zones() {
		const current = this.args.options.numberAnchor;
		return ANCHORS.map((id, index) => ({
			id,
			name: ANCHOR_NAMES[index],
			row: Math.floor(index / 3),
			column: index % 3,
			current: id === current,
		}));
	}

	<template>
		<div class="ppn-picture">
			<div class="ppn-area">
				<div
					class="ppn-page
						{{unless
							@size
							'ppn-page--blank'
						}}"
					style={{this.boxStyle}}
				>
					{{#if @size}}
						<figure
							class="ppn-paper"
							aria-label="Preview"
						>
							{{#if @picture}}
								<img
									class="ppn-render"
									src={{@picture}}
									alt=""
									draggable="false"
								/>
							{{/if}}
							{{#if @number}}
								<span
									class="ppn-mark ppn-mark--number"
									style={{this.numberStyle}}
								>{{@number}}</span>
							{{/if}}
							{{#if @stamp}}
								<span
									class="ppn-mark ppn-mark--stamp
										{{if
											(eqMode
												@options.stampMode
											)
											'ppn-mark--watermark'
										}}"
									style={{this.stampStyle}}
								>{{@stamp}}</span>
							{{/if}}
						</figure>
						{{#if @zones}}
							<div class="ppn-zones">
								{{#each
									this.zones
									as |zone|
								}}
									<button
										type="button"
										tabindex="-1"
										class="ppn-zone ppn-zone--row{{zone.row}}
											ppn-zone--column{{zone.column}}
											{{if
												zone.current
												'ppn-zone--current'
											}}"
										aria-label={{zone.name}}
										{{on
											"click"
											(fn
												@onAnchor
												zone.id
											)
										}}
									><span
											class="ppn-dot"
										></span></button>
								{{/each}}
							</div>
						{{/if}}
					{{/if}}
				</div>
			</div>
		</div>
	</template>
}

function eqMode(mode: string) {
	return mode === 'watermark';
}
