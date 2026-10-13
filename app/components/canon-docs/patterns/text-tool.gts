import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import Source from 'delphitools-v2/components/tools/text-tool/source';
import Result from 'delphitools-v2/components/tools/text-tool/result';

const cases = ['Upper', 'Lower', 'Title'];
const title = (text: string) =>
	text
		.toLowerCase()
		.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
const convert = [
	(text: string) => text.toUpperCase(),
	(text: string) => text.toLowerCase(),
	title,
];

export default class TextToolPattern extends Component {
	@tracked text = 'delphitools';
	@tracked mode = 0;

	get result() {
		return convert[this.mode]!(this.text);
	}

	setText = (text: string) => (this.text = text);
	setMode = (index: number) => (this.mode = index);

	<template>
		<CanonSplit @halves={{true}}>
			<:sidebar>
				<CanonRows @framed={{true}}>
					<Source
						@heading="Source"
						@text={{this.text}}
						@onChange={{this.setText}}
					/>
					<CanonHeading @text="Case" />
					<CanonSegmented
						aria-label="Case"
						@items={{cases}}
						@selected={{this.mode}}
						@onChange={{this.setMode}}
					/>
				</CanonRows>
			</:sidebar>
			<:main>
				<Result
					@heading="Result"
					@text={{this.result}}
					@fileName="text.txt"
				/>
			</:main>
		</CanonSplit>
	</template>
}
