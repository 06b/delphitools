import { tracked } from '@glimmer/tracking';
import { editorUi } from 'delphitools-v2/lib/substrata/editor-ui';

// the panel's own view state; it outlives the panel so a reopened panel
// keeps its folds, and the layer menu can start a rename in it
class LayersState {
	@tracked collapsed: ReadonlySet<string> = new Set();
	@tracked picking = false;
	@tracked folded: string | null = null;
	@tracked renaming: string | null = null;
	// the row that opened the layer menu; a canvas click anchors at the point
	menuRow: HTMLElement | null = null;

	toggleCollapsed = (id: string): void => {
		const next = new Set(this.collapsed);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		this.collapsed = next;
	};

	setCollapsed = (id: string, on: boolean): void => {
		if (this.collapsed.has(id) !== on) this.toggleCollapsed(id);
	};

	rename = (id: string): void => {
		if (!editorUi.isOpen('layers'))
			editorUi.toggle(
				'layers',
				!!document.querySelector('.sub-ed.is-phone'),
			);
		this.renaming = id;
	};
}

export const layersState = new LayersState();
