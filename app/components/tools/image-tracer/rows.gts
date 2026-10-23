import type { TOC } from '@ember/component/template-only';
import { fn } from '@ember/helper';
import CanonButton from 'delphicanon/components/canon-button';
import CanonRow from 'delphicanon/components/canon-row';
import CanonSlider from 'delphicanon/components/canon-slider';
import CanonTooltip from 'delphicanon/components/canon-tooltip';
import { IconSvg } from 'delphitools-v2/components/icon';

const Info = <template><IconSvg @name="info" /></template>;

/** The web tool's option hint on an info cell, as qr-genny's Error Correction. */
export const Tip: TOC<{ Args: { label: string; text: string } }> = <template>
	<CanonTooltip @text={{@text}} as |tip|>
		<CanonButton
			{{tip.trigger}}
			class="trace-info"
			@kind="cell"
			@icon={{Info}}
			@label={{@label}}
		/>
	</CanonTooltip>
</template>;

export interface SliderSpec {
	key: string;
	title: string;
	tip: string;
	min: number;
	max: number;
	step: number;
	readout: (value: number) => string;
}

/** A flush row: the title, its hint, and a slider. */
export const SliderRow: TOC<{
	Args: {
		spec: SliderSpec;
		value: number;
		onChange: (key: string, value: number) => void;
	};
}> = <template>
	<CanonRow
		class="trace-row trace-{{@spec.key}}"
		@title={{@spec.title}}
		@form="flush"
		as |titleId|
	>
		<Tip @label={{@spec.title}} @text={{@spec.tip}} />
		<CanonSlider
			@value={{@value}}
			@min={{@spec.min}}
			@max={{@spec.max}}
			@step={{@spec.step}}
			@readout={{@spec.readout}}
			@labelledBy={{titleId}}
			@onChange={{fn @onChange @spec.key}}
		/>
	</CanonRow>
</template>;

/** A title row with its hint, over a control on its own line. */
export const TitleRow: TOC<{
	Args: { title: string; tip: string };
	Element: HTMLDivElement;
}> = <template>
	<CanonRow
		class="trace-row trace-title"
		@title={{@title}}
		@form="flush"
		...attributes
	>
		<Tip @label={{@title}} @text={{@tip}} />
	</CanonRow>
</template>;
