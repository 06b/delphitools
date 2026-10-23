import type { TOC } from '@ember/component/template-only';
import CanonButton from 'delphicanon/components/canon-button';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonTooltip from 'delphicanon/components/canon-tooltip';
import type { CanonPlacement } from 'delphicanon/lib/popover';
import { IconSvg } from 'delphitools-v2/components/icon';

// iOS FloatingCells: cells under hairlines in a 2 px frame, floating with
// the CanonSplit footer shadow; a group per element
export const Cells: TOC<{
	Args: { axis?: 'row' | 'column'; small?: boolean };
	Blocks: { default: [] };
	Element: HTMLDivElement;
}> = <template>
	<div
		class="sub-cells
			{{if (eqRow @axis) 'is-row'}}
			{{if @small 'is-small'}}"
		...attributes
	>{{yield}}</div>
</template>;

function eqRow(axis?: string) {
	return axis === 'row';
}

// iOS CanonButton.editorCell: an icon cell, filled while selected
export const Cell: TOC<{
	Args: {
		label: string;
		icon?: string;
		text?: string;
		selected?: boolean;
		disabled?: boolean;
		onClick?: () => void;
		/** the label as a kit tooltip on this side, in place of title */
		tip?: CanonPlacement;
	};
	Element: HTMLButtonElement;
}> = <template>
	{{#if @tip}}
		<CanonTooltip @text={{@label}} @placement={{@tip}} as |t|>
			<CanonButton
				class="sub-cell"
				@kind="segment"
				@text={{@text}}
				@icon={{if
					@icon
					(component IconSvg name=@icon)
				}}
				@label={{@label}}
				@selected={{@selected}}
				@disabled={{@disabled}}
				@onClick={{@onClick}}
				{{t.trigger}}
				...attributes
			/>
		</CanonTooltip>
	{{else}}
		<CanonButton
			class="sub-cell"
			@kind="segment"
			@text={{@text}}
			@icon={{if @icon (component IconSvg name=@icon)}}
			@label={{@label}}
			@selected={{@selected}}
			@disabled={{@disabled}}
			@onClick={{@onClick}}
			title={{@label}}
			...attributes
		/>
	{{/if}}
</template>;

// iOS PanelHeader: the title, any extra cells, then a close cell
export const PanelHeader: TOC<{
	Args: { title: string; onClose: () => void };
	Blocks: { default: [] };
}> = <template>
	<div class="sub-panel-header">
		<CanonHeading @text={{@title}} class="sub-panel-title" />
		{{yield}}
		<Cell @label="Close" @icon="x" @onClick={{@onClose}} />
	</div>
</template>;

// iOS RailPanel: header over its body in the floating frame; the body
// scrolls when the rail cuts it short
export const RailPanel: TOC<{
	Args: { id: string; title: string; onClose: () => void };
	Blocks: { header: []; default: [] };
	Element: HTMLElement;
}> = <template>
	<section
		class="sub-rail-panel"
		data-panel={{@id}}
		aria-label={{@title}}
		...attributes
	>
		<PanelHeader @title={{@title}} @onClose={{@onClose}}>
			{{yield to="header"}}
		</PanelHeader>
		<div class="sub-rail-body">{{yield}}</div>
	</section>
</template>;
