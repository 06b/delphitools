import { tracked } from '@glimmer/tracking';

export class TrackedExternal<T> {
	@tracked current: T;

	#read: () => T;
	// reading current mid-render asserts
	#last: T;
	#unsubscribe: () => void;

	constructor(
		subscribe: (listener: () => void) => () => void,
		read: () => T,
	) {
		this.#read = read;
		this.current = this.#last = read();
		this.#unsubscribe = subscribe(() => {
			const next = this.#read();
			if (Object.is(next, this.#last)) return;
			this.current = this.#last = next;
		});
	}

	unsubscribe = () => {
		this.#unsubscribe();
	};
}
