import { LinkTo } from '@ember/routing';
import { htmlSafe } from '@ember/template';
import type { TOC } from '@ember/component/template-only';
import Icon from 'delphitools-v2/components/icon';
import { icons } from 'delphitools-v2/lib/icons';
import type { Suite } from 'delphitools-v2/lib/tools';

// two copies of the run; the track loops at -50%
const RUN = [0, 1, 2, 3, 4, 5];
const COPIES = [0, 1];

// staggered rows; css masks it, so the stroke colour is irrelevant
function patternStyle(name: string) {
	const inner =
		/<svg[^>]*>([\s\S]*)<\/svg>/.exec(icons[name] ?? '')?.[1] ?? '';
	const icon = (x: number, y: number) =>
		`<svg x="${x}" y="${y}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
	const tile = `<svg xmlns="http://www.w3.org/2000/svg" width="56" height="48">${icon(4, 2)}${icon(32, 26)}</svg>`;
	return htmlSafe(
		`--suite-pattern: url("data:image/svg+xml,${encodeURIComponent(tile)}")`,
	);
}

const SuiteBox: TOC<{ Args: { suite: Suite } }> = <template>
	<LinkTo @route={{@suite.route}} class="dt-suite is-{{@suite.tool.id}}">
		<span class="dt-suite-band" aria-hidden="true">
			<span class="dt-suite-track">
				{{#each COPIES}}
					{{#each RUN}}
						<span>{{@suite.tagline}}</span>
						<Icon @name="sparkle" />
					{{/each}}
				{{/each}}
			</span>
		</span>

		<span class="dt-suite-face">
			<span
				class="dt-suite-pattern"
				style={{patternStyle @suite.tool.icon}}
				aria-hidden="true"
			></span>
			<span
				class="dt-suite-word"
				aria-hidden="true"
			>{{@suite.word}}</span>

			<span class="dt-suite-name">{{@suite.tool.name}}</span>
			<span
				class="dt-suite-desc"
			>{{@suite.tool.description}}</span>

			<span class="dt-suite-chips">
				{{#each @suite.features as |feature|}}
					<span
						class="dt-suite-chip"
					>{{feature}}</span>
				{{/each}}
			</span>
		</span>
	</LinkTo>
</template>;

export default SuiteBox;
