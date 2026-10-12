import { modifier } from 'ember-modifier';
import {
	getPageIndex,
	setPageIndex,
	store,
} from 'delphitools-v2/lib/errata/store';
import { TOOL_ORDER, activeTool } from 'delphitools-v2/lib/errata/tool';
import {
	boxMode,
	closeMode,
	deleteSelection,
	modal,
	modeKey,
	pickImageFile,
	setMode,
	toolbox,
} from 'delphitools-v2/lib/errata/ui';
import { viewport } from 'delphitools-v2/lib/substrata/viewport';

export default modifier(() => {
	const onKey = (e: KeyboardEvent) => {
		const target = e.target as HTMLElement | null;
		if (
			target &&
			(target.isContentEditable ||
				target.tagName === 'INPUT' ||
				target.tagName === 'TEXTAREA' ||
				target.tagName === 'SELECT')
		)
			return;
		if (modeKey(e)) {
			e.preventDefault();
			return;
		}

		const mod = e.metaKey || e.ctrlKey;
		if (!mod && !e.altKey) {
			if (e.key === 'Backspace' || e.key === 'Delete') {
				e.preventDefault();
				deleteSelection();
				return;
			}
			if (e.key === 'Escape') {
				if (toolbox.get()) toolbox.set(false);
				else if (boxMode.get()) closeMode();
				else activeTool.set('select');
				return;
			}
			// mode bar blocks tools
			if (boxMode.get() && /^[a-z]$/i.test(e.key)) return;
			if (e.key.toLowerCase() === 'c') {
				toolbox.set(false);
				setMode('crop');
				return;
			}
			if (e.key === 'PageDown' || e.key === ']') {
				setPageIndex(getPageIndex() + 1);
				return;
			}
			if (e.key === 'PageUp' || e.key === '[') {
				setPageIndex(getPageIndex() - 1);
				return;
			}
			const key = e.key.toLowerCase();
			const tool = TOOL_ORDER.find(
				(t) => t.key.toLowerCase() === key,
			);
			if (tool) {
				if (tool.id === 'signature')
					modal.set('signature');
				else if (tool.id === 'image') pickImageFile();
				else activeTool.set(tool.id);
				return;
			}
		}
		if (!mod) return;
		const key = e.key.toLowerCase();
		if (key === 'z') {
			e.preventDefault();
			if (e.shiftKey) store.redo();
			else store.undo();
		} else if (key === '=' || key === '+') {
			e.preventDefault();
			viewport.zoomIn();
		} else if (key === '-') {
			e.preventDefault();
			viewport.zoomOut();
		} else if (key === '0') {
			e.preventDefault();
			viewport.fit();
		}
	};
	window.addEventListener('keydown', onKey);
	return () => window.removeEventListener('keydown', onKey);
});
