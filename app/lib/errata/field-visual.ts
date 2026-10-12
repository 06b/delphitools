import { Circle, FabricText, Group, Rect, type FabricObject } from 'fabric';
import type { FieldObject } from './doc-model';
import { radioLayout } from './fields';

// page raster is white
const ACCENT = '#1f6feb';
export const FONT = 'Helvetica, Arial, sans-serif';

function label(
	text: string,
	size: number,
	maxWidth: number,
	props: Partial<FabricText>,
): FabricText {
	const t = new FabricText(text, {
		fontFamily: FONT,
		fontSize: size,
		fill: ACCENT,
		originY: 'center',
		...props,
	});
	while (t.width > maxWidth && t.text.length > 1)
		t.set({ text: t.text.slice(0, -2) + '…' });
	return t;
}

export function fieldVisual(
	o: FieldObject,
	base: Partial<FabricObject>,
): FabricObject {
	const { w, h } = o;
	const parts: FabricObject[] = [
		new Rect({
			left: 0,
			top: 0,
			width: w,
			height: h,
			fill: 'rgba(31,111,235,0.08)',
			stroke: ACCENT,
			strokeWidth: 1,
			strokeUniform: true,
		}),
	];
	const size = Math.max(4, Math.min(h * 0.6, 11));
	if (o.field === 'radio') {
		const lay = radioLayout(w, h, o.options.length);
		lay.rows.forEach((y, i) => {
			const cy = -h / 2 + y + lay.size / 2;
			parts.push(
				new Circle({
					left: -w / 2 + lay.size / 2,
					top: cy,
					radius: lay.size / 2,
					fill:
						o.value &&
						o.value === o.options[i]
							? ACCENT
							: '#fff',
					stroke: ACCENT,
					strokeWidth: 1,
					strokeUniform: true,
				}),
			);
			const choice = o.options[i];
			if (choice)
				parts.push(
					label(
						choice,
						lay.label,
						w - lay.size * 1.4,
						{
							left:
								-w / 2 +
								lay.size * 1.4,
							top: cy,
							originX: 'left',
						},
					),
				);
		});
	} else if (o.field === 'checkbox') {
		if (o.value)
			parts.push(
				label('✓', Math.min(w, h) * 0.8, w, {
					left: 0,
					top: 0,
					originX: 'center',
				}),
			);
	} else {
		const chevron = o.field === 'dropdown' ? size + 4 : 0;
		parts.push(
			label(o.name, size, w - 6 - chevron, {
				left: -w / 2 + 3,
				top: 0,
				originX: 'left',
			}),
		);
		if (chevron)
			parts.push(
				label('▾', size, chevron, {
					left: w / 2 - 3,
					top: 0,
					originX: 'right',
				}),
			);
	}
	// position after layout
	const g = new Group(parts);
	g.set({ ...base, lockRotation: true });
	g.setControlVisible('mtr', false);
	return g;
}
