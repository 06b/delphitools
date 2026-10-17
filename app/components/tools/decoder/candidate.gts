import type { TOC } from '@ember/component/template-only';
import { on } from '@ember/modifier';
import CanonBar from 'delphicanon/components/canon-bar';
import CanonButton from 'delphicanon/components/canon-button';
import { IconSvg } from 'delphitools-v2/components/icon';
import type { Candidate } from 'delphitools-v2/components/tools/decoder/engine';

interface CandidateSignature {
	Args: {
		candidate: Candidate;
		lit: boolean;
		onCopy: () => void;
		/** Opens the candidate in Manual; none when it has no settings. */
		onTweak?: () => void;
	};
}

const TweakIcon = <template><IconSvg @name="sliders-horizontal" /></template>;

const percent = (score: number) => `${Math.round(score * 100)}%`;

/**
 * CipherCandidateRow: the cipher, its detail and score over a score bar and
 * the first lines of the output. Pressing copies the output; the trailing
 * cell opens it in Manual.
 */
const CandidateRow: TOC<CandidateSignature> = <template>
	<div class="dec-candidate {{if @lit 'dec-candidate--lit'}}">
		<button
			type="button"
			class="dec-candidate-cell"
			title="Copy output"
			{{on "click" @onCopy}}
		>
			<span class="dec-candidate-head">
				<span
					class="dec-candidate-name"
				>{{@candidate.cipher}}</span>
				{{#if @candidate.detail}}
					<span
						class="dec-candidate-detail"
					>{{@candidate.detail}}</span>
				{{/if}}
				<span class="dec-candidate-score">{{percent
						@candidate.score
					}}</span>
			</span>
			<CanonBar
				class="dec-candidate-bar"
				@share={{@candidate.score}}
				@fill={{if
					@lit
					"var(--canon-primary)"
					"var(--canon-muted-foreground)"
				}}
			/>
			<span
				class="dec-candidate-text"
			>{{@candidate.output}}</span>
		</button>
		{{#if @onTweak}}
			<CanonButton
				class="dec-tweak"
				@kind="cell"
				@icon={{TweakIcon}}
				@label="Tweak"
				@onClick={{@onTweak}}
			/>
		{{/if}}
	</div>
</template>;

export default CandidateRow;
