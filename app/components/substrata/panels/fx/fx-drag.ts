import { modifier } from 'ember-modifier';
import { capture } from 'delphicanon/lib/motion';

export interface Drag {
	// x: a sideways drag only, so a vertical one still scrolls the panel
	axis: 'x' | 'any';
	start?: (event: PointerEvent) => void;
	move: (event: PointerEvent, first: boolean) => void;
	// dragged false is a tap; the event is null when the pointer was cancelled
	end: (dragged: boolean, event: PointerEvent | null) => void;
}

// pass a stable object: a new one reinstalls the listeners
export default modifier((element: HTMLElement, [drag]: [Drag]) => {
	let pointer: number | undefined;
	let start = { x: 0, y: 0 };
	let dragging = false;

	const down = (event: PointerEvent) => {
		if (event.button !== 0) return;
		pointer = event.pointerId;
		start = { x: event.clientX, y: event.clientY };
		dragging = false;
		capture(element, pointer);
		drag.start?.(event);
	};
	const move = (event: PointerEvent) => {
		if (event.pointerId !== pointer) return;
		if (!dragging) {
			const dx = Math.abs(event.clientX - start.x);
			const dy = Math.abs(event.clientY - start.y);
			const away =
				drag.axis === 'any'
					? Math.hypot(dx, dy) > 4
					: dx > 4 && dx > dy;
			if (!away) return;
			dragging = true;
			drag.move(event, true);
			return;
		}
		drag.move(event, false);
	};
	const end = (event: PointerEvent) => {
		if (event.pointerId !== pointer) return;
		pointer = undefined;
		drag.end(dragging, event.type === 'pointerup' ? event : null);
		dragging = false;
	};

	element.addEventListener('pointerdown', down);
	element.addEventListener('pointermove', move);
	element.addEventListener('pointerup', end);
	element.addEventListener('pointercancel', end);
	return () => {
		element.removeEventListener('pointerdown', down);
		element.removeEventListener('pointermove', move);
		element.removeEventListener('pointerup', end);
		element.removeEventListener('pointercancel', end);
	};
});
