import Component from '@glimmer/component';
import { htmlSafe } from '@ember/template';
import type { Cue } from 'delphitools-v2/lib/subtitles';

export interface TimelineSignature {
	Args: {
		source: Cue[];
		result: Cue[];
		sourceFormat?: string;
		resultFormat: string;
		/** The picture's accessible name. */
		label: string;
	};
}

/** Each cue as a share of the span, in percent of the lane. */
export function blocks(cues: Cue[], span: number) {
	return cues.map((cue) =>
		htmlSafe(
			`inset-inline-start: ${(Math.max(0, cue.start) / span) * 100}%; inline-size: ${((cue.end - cue.start) / span) * 100}%`,
		),
	);
}

/**
 * Two lanes on one time axis (iOS SubtitleTimeline): the cues as they came
 * in, dim, over the cues as they go out, lit.
 */
export default class Timeline extends Component<TimelineSignature> {
	get span() {
		let end = 1;
		for (const cue of this.args.source)
			end = Math.max(end, cue.end);
		for (const cue of this.args.result)
			end = Math.max(end, cue.end);
		return end;
	}

	// ponytail: one span per cue; a canvas if files of many thousand cues lag
	get sourceBlocks() {
		return blocks(this.args.source, this.span);
	}

	get resultBlocks() {
		return blocks(this.args.result, this.span);
	}

	<template>
		<div class="sc-timeline" role="img" aria-label={{@label}}>
			<span class="sc-lane-label">{{@sourceFormat}}</span>
			<span class="sc-lane">
				{{#each this.sourceBlocks as |style|}}
					<span
						class="sc-cue"
						style={{style}}
					></span>
				{{/each}}
			</span>
			<span
				class="sc-lane-label sc-lane-label--result"
			>{{@resultFormat}}</span>
			<span class="sc-lane sc-lane--result">
				{{#each this.resultBlocks as |style|}}
					<span
						class="sc-cue"
						style={{style}}
					></span>
				{{/each}}
			</span>
		</div>
	</template>
}
