import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import type { TOC } from '@ember/component/template-only';
import Icon from 'delphitools-v2/components/icon';
import {
	ColourSwatchCell,
	DeferredHexInput,
} from 'delphitools-v2/components/colour-field';

// the old Substrata top bar's and omnibar's small parts, which Errata
// still builds on; their styles stay in app/styles/substrata

export const Bloom: TOC<{
	Args: {
		edge: 'top' | 'bottom' | 'left' | 'right';
		cross: 'center' | 'end';
	};
	Blocks: { default: [] };
}> = <template>
	<div class="sub-omni-bloom is-{{@edge}} is-cross-{{@cross}}">
		<div class="sub-omni-bloom-inner">{{yield}}</div>
	</div>
</template>;

export const Row: TOC<{
	Element: HTMLDivElement;
	Args: { label: string };
	Blocks: { default: [] };
}> = <template>
	<div class="sub-tool-row" ...attributes>
		<span class="sub-tool-row-label">{{@label}}</span>
		{{yield}}
	</div>
</template>;

export const ColourCell: TOC<{
	Args: {
		colour: string;
		onChange: (hex: string) => void;
		aria: string;
	};
}> = <template>
	<span class="sub-tool-colour">
		<ColourSwatchCell
			class="sub-tool-colour-swatch"
			@colour={{@colour}}
			@onChange={{@onChange}}
			@label={{@aria}}
		/>
		<DeferredHexInput
			class="sub-tool-colour-hex"
			@value={{@colour}}
			@onChange={{@onChange}}
			@label={{@aria}}
		/>
	</span>
</template>;

interface BoxSignature {
	Element: HTMLDivElement;
	Blocks: { default: [] };
}

export const Box: TOC<BoxSignature> = <template>
	<div class="sub-topbar-box shadow-lg" ...attributes>{{yield}}</div>
</template>;

interface ItemSignature {
	Element: HTMLButtonElement;
	Args: {
		label: string;
		hint?: string;
		onClick?: () => void;
		disabled?: boolean;
	};
}

function fireOptional(onClick: (() => void) | undefined): void {
	onClick?.();
}

export const Item: TOC<ItemSignature> = <template>
	<button
		type="button"
		disabled={{@disabled}}
		class="sub-topbar-item {{if @disabled 'is-disabled'}}"
		...attributes
		{{on "click" (fn fireOptional @onClick)}}
	>
		<span class="sub-topbar-item-label">{{@label}}</span>
		{{#if @hint}}
			<span class="sub-topbar-item-hint">{{@hint}}</span>
		{{/if}}
	</button>
</template>;

export const Sep: TOC<{ Element: HTMLDivElement }> = <template>
	<div class="sub-topbar-sep"></div>
</template>;

interface UrButtonSignature {
	Element: HTMLButtonElement;
	Args: {
		icon: string;
		label: string;
		hint: string;
		disabled?: boolean;
		onClick: () => void;
	};
}

export const UrButton: TOC<UrButtonSignature> = <template>
	<button
		type="button"
		class="sub-topbar-ur-btn"
		disabled={{@disabled}}
		...attributes
		{{on "click" @onClick}}
	>
		<Icon @name={{@icon}} />
		{{@label}}
		<span class="sub-topbar-ur-hint">{{@hint}}</span>
	</button>
</template>;

interface AbSignature {
	Element: HTMLButtonElement;
	Args: {
		icon: string;
		label: string;
		hint?: string;
		onClick?: () => void;
		disabled?: boolean;
	};
}

export const Ab: TOC<AbSignature> = <template>
	<button
		type="button"
		class="sub-topbar-ab"
		disabled={{@disabled}}
		{{on "click" (fn fireOptional @onClick)}}
	>
		<Icon @name={{@icon}} />
		<span class="sub-topbar-ab-label">
			{{@label}}
			{{#if @hint}}
				<span
					class="sub-topbar-ab-hint"
				>{{@hint}}</span>
			{{/if}}
		</span>
	</button>
</template>;
