import Component from '@glimmer/component';

const NONE = Symbol('none');

export interface FreshSignature {
	Args: { value: unknown };
	Blocks: { default: [mine: (value: unknown) => void] };
}

// kit controls hold a pick until their value arg changes, and read an undo
// back to the held-over value as no change (canon-segmented `picked.over`);
// the block remounts on any value it did not set itself
export default class Fresh extends Component<FreshSignature> {
	#key = 0;
	#last: unknown = this.args.value;
	#mine: unknown = NONE;

	// untracked fields: the getter reruns only when the value arg changes
	/* eslint-disable ember/no-side-effects */
	get keys(): number[] {
		const { value } = this.args;
		if (value !== this.#last) {
			if (value !== this.#mine) this.#key++;
			this.#last = value;
			this.#mine = NONE;
		}
		return [this.#key];
	}
	/* eslint-enable ember/no-side-effects */

	mine = (value: unknown) => {
		this.#mine = value;
	};

	<template>
		{{#each this.keys key="@identity"}}
			{{yield this.mine}}
		{{/each}}
	</template>
}

// a control's change goes to `mine` first, then to the write
export function both<A extends unknown[]>(
	mine: (value: unknown) => void,
	write: (...args: A) => void,
): (...args: A) => void {
	return (...args) => {
		mine(args[0]);
		write(...args);
	};
}
