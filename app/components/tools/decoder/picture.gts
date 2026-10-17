import Component from '@glimmer/component';
import { eq } from 'ember-truth-helpers';
import CanonFigure from 'delphicanon/components/canon-figure';
import {
	codeOf,
	decoding,
	encoded,
	encoding,
} from 'delphitools-v2/components/tools/decoder/bits';
import type {
	CipherId,
	ManualParams,
} from 'delphitools-v2/components/tools/decoder/engine';
import Fence from 'delphitools-v2/components/tools/decoder/fence';
import Pairs from 'delphitools-v2/components/tools/decoder/pairs';
import Regroup from 'delphitools-v2/components/tools/decoder/regroup';
import {
	pairs,
	pictureOf,
} from 'delphitools-v2/components/tools/decoder/scene';

interface PictureSignature {
	Args: {
		cipher: CipherId;
		encode: boolean;
		params: ManualParams;
		source: string;
		output: string;
		name: string;
		detail: string;
		/** 0 to 1; the auto-decode hero's ranking. */
		score?: number;
	};
}

/**
 * CipherPicture: the cipher's name over the input laid against its output,
 * as symbol pairs, regrouped bits or the rail fence; the hero's score at
 * the trailing edge.
 */
export default class Picture extends Component<PictureSignature> {
	get kind() {
		return pictureOf(this.args.cipher);
	}

	get label() {
		const { name, detail } = this.args;
		return detail ? `${name}, ${detail}` : name;
	}

	get pairs() {
		const { cipher, encode, params, source, output } = this.args;
		return pairs(cipher, encode, params, source, output);
	}

	get reading() {
		const { cipher, encode, source } = this.args;
		const code = codeOf(cipher);
		return encode
			? encoding([...new TextEncoder().encode(source)], code)
			: decoding(encoded(source, cipher), code);
	}

	get fenceText() {
		return this.args.encode ? this.args.source : this.args.output;
	}

	get score() {
		const { score } = this.args;
		return score === undefined
			? undefined
			: String(Math.round(score * 100));
	}

	<template>
		<figure class="dec-picture" aria-label={{this.label}}>
			<figcaption class="dec-caption">
				<span class="dec-caption-name">{{@name}}</span>
				{{#if @detail}}
					<span
						class="dec-caption-detail"
					>{{@detail}}</span>
				{{/if}}
			</figcaption>
			<CanonFigure
				class="dec-score
					{{if this.score 'dec-score--shown'}}"
				@text={{if this.score this.score "0"}}
				@unit="%"
				@size={{20}}
				aria-hidden={{if this.score "false" "true"}}
			/>
			<div class="dec-stage">
				{{#if (eq this.kind "fence")}}
					<Fence
						@text={{this.fenceText}}
						@rails={{@params.rails}}
						@label={{@output}}
					/>
				{{else if (eq this.kind "bits")}}
					<Regroup
						@reading={{this.reading}}
						@label={{@output}}
					/>
				{{else}}
					<Pairs
						@pairs={{this.pairs}}
						@label={{@output}}
					/>
				{{/if}}
			</div>
		</figure>
	</template>
}
