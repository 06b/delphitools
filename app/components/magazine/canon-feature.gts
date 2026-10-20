import type { TOC } from '@ember/component/template-only';
import CanonButton from 'delphicanon/components/canon-button';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonLamps from 'delphicanon/components/canon-lamps';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSlider from 'delphicanon/components/canon-slider';
import CanonStepper from 'delphicanon/components/canon-stepper';
import CanonSwitch from 'delphicanon/components/canon-switch';
import { IconSvg } from 'delphitools-v2/components/icon';
import type { PageSignature } from 'delphitools-v2/components/magazine/pages';

// built at runtime so the gap tooling does not read it as a gap
const GAP = String.fromCharCode(0x2211) + 'CG';
const LOREM =
	'lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat'.split(
		' ',
	);

// ponytail: an unfilled gap shows lorem at its word budget, so the layout shows how much text fits
function text(value: string, words: number) {
	if (value !== GAP) return value;
	const out = Array.from(
		{ length: words },
		(_, i) => LOREM[i % LOREM.length]!,
	);
	out[0] = out[0]!.charAt(0).toUpperCase() + out[0]!.slice(1);
	return `${out.join(' ')}.`;
}

const copy = {
	// ∑CG: headline of the delphitools 2.3 and Canon feature, set large on the left page
	//   spec: max 6 words, two lines at 44 px, names Canon or the new design, magazine-feature voice
	//   sample: "Canon and the art of the toolbox"
	headline: '∑CG',

	// ∑CG: standfirst under the feature headline, introduces Emma's interview with Delphi
	//   spec: 30 words, one sentence or two, says this is an interview about delphitools 2.3 and the Canon kit
	//   sample: "Emma Perkins sits down with Delphi to talk about delphitools 2.3, a new design language, and why every tool got rebuilt by hand."
	standfirst: '∑CG',

	// ∑CG: opening paragraph of the feature, Emma's scene-setting before the first question
	//   spec: 62 words, third person, sets up delphitools 2.3 and the Canon kit
	//   sample: "Delphi has spent the year rebuilding a hundred small tools to look and feel like one app."
	intro: '∑CG',

	// ∑CG: Emma's first interview question
	//   spec: 15 words, a question, printed bold
	//   sample: "Where did Canon start?"
	question1: '∑CG',

	// ∑CG: Delphi's first answer
	//   spec: 70 words, first person, Delphi's voice
	//   sample: "With the iOS app. I drew the components there first and brought them back to the web."
	answer1: '∑CG',

	// ∑CG: caption under the live kit components on the left page
	//   spec: 12 words, figure caption, names the components shown (button, segmented control, slider, switch)
	//   sample: "Fig. 1: Real Canon components, drawn by the same code the tools use."
	captionLeft: '∑CG',

	// ∑CG: pull quote at the top of the right page, a line from Delphi's answers
	//   spec: 16 words, quoted speech, set large; should be lifted from an answer below
	//   sample: "Every tool should feel like it came out of the same drawer."
	pullQuote: '∑CG',

	// ∑CG: Emma's second interview question
	//   spec: 15 words, a question, printed bold
	//   sample: "What changed in delphitools 2.3?"
	question2: '∑CG',

	// ∑CG: Delphi's second answer
	//   spec: 75 words, first person
	//   sample: "Everything you touch. Every tool moved onto Canon, and the home page went with it."
	answer2: '∑CG',

	// ∑CG: Emma's third interview question
	//   spec: 15 words, a question, printed bold
	//   sample: "Can other people use the kit?"
	question3: '∑CG',

	// ∑CG: Delphi's third answer
	//   spec: 84 words, first person, mentions the kit is open source
	//   sample: "Yes. It is open source, and the docs live at canon in the sidebar."
	answer3: '∑CG',

	// ∑CG: caption under the live settings panel on the right page
	//   spec: 12 words, figure caption, names the parts shown (rows, heading, stepper, lamps)
	//   sample: "Fig. 2: A settings pane, assembled from Canon rows."
	captionRight: '∑CG',
};

const SEGMENTS = ['Live', 'Source'];
const LIT = ['play'] as const;
const noop = () => {};

const Question: TOC<{ Args: { value: string } }> = <template>
	<p class="dt-mag-q">{{text @value 15}}</p>
</template>;

export const CanonFeatureLeft: TOC<PageSignature> = <template>
	<article class="dt-mag-feature">
		<p class="dt-mag-kicker">Feature</p>
		<h2 class="dt-mag-feature-head">{{text copy.headline 6}}</h2>
		<p class="dt-mag-standfirst">{{text copy.standfirst 30}}</p>
		<p class="dt-mag-byline">By Emma Perkins</p>
		<div class="dt-mag-columns">
			<p>{{text copy.intro 62}}</p>
			<Question @value={{copy.question1}} />
			<p>{{text copy.answer1 70}}</p>
		</div>
		<figure class="dt-mag-specimen" aria-hidden="true" inert>
			<div class="dt-mag-specimen-parts">
				<CanonButton
					@kind="primary"
					@text="Apply"
					@icon={{component IconSvg name="check"}}
					@iconStyle="inline"
				/>
				<CanonSegmented
					aria-label="View"
					@items={{SEGMENTS}}
					@selected={{0}}
					@onChange={{noop}}
				/>
				<CanonSlider @value={{0.62}} @label="Amount" />
				<CanonSwitch @on={{true}} aria-label="On" />
			</div>
			<figcaption>{{text copy.captionLeft 12}}</figcaption>
		</figure>
	</article>
</template>;

export const CanonFeatureRight: TOC<PageSignature> = <template>
	<article class="dt-mag-feature">
		<blockquote class="dt-mag-pull">{{text
				copy.pullQuote
				16
			}}</blockquote>
		<div class="dt-mag-columns">
			<Question @value={{copy.question2}} />
			<p>{{text copy.answer2 75}}</p>
			<Question @value={{copy.question3}} />
			<p>{{text copy.answer3 84}}</p>
		</div>
		<figure class="dt-mag-specimen" aria-hidden="true" inert>
			<CanonRows @framed={{true}}>
				<CanonHeading @text="Paper" />
				<CanonStepper @onStep={{noop}}>
					<span
						class="dt-mag-specimen-value"
					>A4</span>
				</CanonStepper>
			</CanonRows>
			<CanonLamps @lit={{LIT}} />
			<figcaption>{{text copy.captionRight 12}}</figcaption>
		</figure>
		<div class="dt-mag-links">
			{{#each @page.links as |link|}}
				<a
					href={{link.href}}
					class="dt-mag-link"
					data-magazine-link
				>{{link.label}}</a>
			{{/each}}
		</div>
	</article>
</template>;
