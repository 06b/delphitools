import { tracked } from '@glimmer/tracking';
import { matchesAccept } from 'delphitools-v2/modifiers/file-paste';

/** Drop anywhere in a tool: the first accepted file loads, `over` lights the slot. */
export default class Drop {
	@tracked over = false;

	#accept: string;
	#load: (file: File) => void;

	constructor(accept: string, load: (file: File) => void) {
		this.#accept = accept;
		this.#load = load;
	}

	enter = (event: DragEvent) => {
		if (!event.dataTransfer?.types.includes('Files')) return;
		event.preventDefault();
		this.over = true;
	};

	leave = (event: DragEvent) => {
		const root = event.currentTarget as Element;
		if (!root.contains(event.relatedTarget as Node | null))
			this.over = false;
	};

	drop = (event: DragEvent) => {
		this.over = false;
		const file = [...(event.dataTransfer?.files ?? [])].find((f) =>
			matchesAccept(f, this.#accept),
		);
		if (!file) return;
		event.preventDefault();
		this.#load(file);
	};
}
