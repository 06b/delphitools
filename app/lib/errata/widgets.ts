import { channel } from 'delphitools-v2/lib/channel';
import { getMupdf } from 'delphitools-v2/lib/mupdf';
import { type ErrataDoc, type FieldType, type Stamped } from './doc-model';
import { newField, sourceRectToDisplayed } from './fields';
import { getSourceBytes } from './source';

interface SourceWidget {
	page: number;
	name: string;
	field: FieldType;
	/** mupdf space, y down */
	rect: [number, number, number, number];
	options: string[];
}

const TYPES: Record<string, FieldType> = {
	text: 'text',
	checkbox: 'checkbox',
	radiobutton: 'radio',
	combobox: 'dropdown',
	listbox: 'dropdown',
	signature: 'signature',
};

interface Loaded {
	bytes: Uint8Array;
	widgets: SourceWidget[] | null;
}

const loaded = channel<Loaded | null>(null);

export const subscribeWidgets = loaded.subscribe;

async function read(bytes: Uint8Array): Promise<SourceWidget[]> {
	const mupdf = await getMupdf();
	const doc = new mupdf.PDFDocument(bytes.slice());
	try {
		const out: SourceWidget[] = [];
		for (let i = 0; i < doc.countPages(); i++) {
			const page = doc.loadPage(i);
			for (const w of page.getWidgets()) {
				const field = TYPES[w.getFieldType()];
				if (field)
					out.push({
						page: i,
						name: w.getName(),
						field,
						rect: w.getRect(),
						options: w.getOptions(),
					});
			}
			page.destroy();
		}
		return out;
	} finally {
		doc.destroy();
	}
}

export function getSourceWidgets(): SourceWidget[] | null {
	const state = loaded.get();
	return state?.bytes === getSourceBytes() ? state.widgets : null;
}

export function loadSourceWidgets(): void {
	const bytes = getSourceBytes();
	if (!bytes || loaded.get()?.bytes === bytes) return;
	const current: Loaded = { bytes, widgets: null };
	loaded.set(current);
	read(bytes).then(
		(widgets) => {
			if (loaded.get() === current)
				loaded.set({ bytes, widgets });
		},
		(error) => console.error(error),
	);
}

export function takenNames(doc: ErrataDoc): Set<string> {
	return new Set([
		...doc.pages.flatMap((p) =>
			p.objects.flatMap((o) =>
				o.kind === 'field' ? [o.name] : [],
			),
		),
		...(getSourceWidgets() ?? []).map((w) => w.name),
	]);
}

export function widgetStandIns(
	doc: ErrataDoc,
	widgets: SourceWidget[],
): Stamped[] {
	return doc.pages.flatMap((page, index) =>
		widgets.flatMap((w) => {
			const r =
				w.page === page.sourceIndex
					? sourceRectToDisplayed(page, w.rect)
					: null;
			const object =
				r &&
				newField(
					{
						field: w.field,
						name: w.name,
						options:
							w.field === 'radio'
								? []
								: w.options,
						required: false,
						value: '',
					},
					r,
					new Set(),
				);
			return object ? [{ index, object }] : [];
		}),
	);
}
