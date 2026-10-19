import Component from '@glimmer/component';
import CanonButton from 'delphicanon/components/canon-button';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonTextArea from 'delphicanon/components/canon-text-area';
import { IconSvg } from 'delphitools-v2/components/icon';
import './text-tool.css';

interface SourceSignature {
	Args: {
		heading: string;
		text: string;
		/** Accessible name of the field; default Input. */
		label?: string;
		onChange: (text: string) => void;
	};
	/** More buttons after Paste and Clear. */
	Blocks: { default: [] };
}

const PasteIcon = <template><IconSvg @name="clipboard" /></template>;
const ClearIcon = <template><IconSvg @name="trash-2" /></template>;

/**
 * CanonTextInput without its 0.4 s typing pause: the web tools answered on
 * every keystroke. Goes inside a CanonRows.
 */
export default class Source extends Component<SourceSignature> {
	paste = async () => {
		const text = await navigator.clipboard
			.readText()
			.catch(() => '');
		if (text && !this.isDestroying) this.args.onChange(text);
	};

	clear = () => this.args.onChange('');

	<template>
		<CanonHeading @text={{@heading}} />
		<CanonTextArea
			class="tt-source"
			@value={{@text}}
			@placeholder="Type or paste"
			@onChange={{@onChange}}
			aria-label={{if @label @label "Input"}}
		/>
		<CanonGrid>
			<CanonButton
				@text="Paste"
				@icon={{PasteIcon}}
				@onClick={{this.paste}}
			/>
			<CanonButton
				@text="Clear"
				@icon={{ClearIcon}}
				@disabled={{if @text false true}}
				@onClick={{this.clear}}
			/>
			{{yield}}
		</CanonGrid>
	</template>
}
