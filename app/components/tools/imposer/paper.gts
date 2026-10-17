import Component from '@glimmer/component';
import CanonMenuCell from 'delphicanon/components/canon-menu-cell';
import Fresh, {
	both,
} from 'delphitools-v2/components/substrata/panels/inspector/fresh';
import { paperSizeGroups } from 'delphitools-v2/lib/paper-sizes';

// common repeats sizes from the series groups
const SIZES = paperSizeGroups
	.filter((group) => group.id !== 'common')
	.flatMap((group) => group.sizes);

// errata paper-menu titles
const TITLES = SIZES.map(
	(size) =>
		`${size.label} (${Math.round(size.widthMm)} × ${Math.round(size.heightMm)})`,
);

const IDS = ['infer', ...SIZES.map((size) => size.id), 'custom'];

/** The errata PaperMenu with the web imposer's Infer and Custom choices around the sizes. */
export default class PaperMenu extends Component<{
	Element: HTMLDivElement;
	Args: {
		value: string;
		/** Paper the PDF's first page matched, once a PDF is in. */
		inferred?: string;
		label?: string;
		onChange: (id: string) => void;
	};
}> {
	get items() {
		const { inferred } = this.args;
		return [
			inferred ? `Infer (${inferred})` : 'Infer from PDF',
			...TITLES,
			'Custom…',
		];
	}

	get index(): number | undefined {
		const i = IDS.indexOf(this.args.value);
		return i < 0 ? undefined : i;
	}

	pick = (index: number) => {
		const id = IDS[index];
		if (id) this.args.onChange(id);
	};

	<template>
		<Fresh @value={{this.index}} as |mine|>
			<CanonMenuCell
				@items={{this.items}}
				@selected={{this.index}}
				@label={{@label}}
				@onChange={{both mine this.pick}}
				...attributes
			/>
		</Fresh>
	</template>
}
