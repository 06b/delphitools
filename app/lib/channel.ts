export interface Channel<T> {
	get: () => T;
	set: (next: T) => void;
	subscribe: (listener: () => void) => () => void;
}

/** equal writes skipped */
export function channel<T>(
	initial: T,
	same: (a: T, b: T) => boolean = Object.is,
): Channel<T> {
	let value = initial;
	const listeners = new Set<() => void>();
	return {
		get: () => value,
		set(next) {
			if (same(next, value)) return;
			value = next;
			for (const l of listeners) l();
		},
		subscribe(listener) {
			listeners.add(listener);
			return () => {
				listeners.delete(listener);
			};
		},
	};
}
