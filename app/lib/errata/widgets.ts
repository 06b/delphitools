import { rawImport } from 'delphitools-v2/lib/raw-import';
import { type ErrataDoc, type FieldType, type Stamped } from './doc-model';
import { newField, sourceRectToDisplayed } from './fields';
import { getSourceBytes } from './source';

interface MupdfWidget {
	getFieldType(): string;
	getName(): string;
	getRect(): [number, number, number, number];
	getOptions(): string[];
}

interface MupdfModule {
	PDFDocument: new (data: Uint8Array) => {
		countPages(): number;
		loadPage(index: number): {
			getWidgets(): MupdfWidget[];
			destroy(): void;
		};
		destroy(): void;
	};
}

export interface SourceWidget {
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

let state: Loaded | null = null;
const listeners = new Set<() => void>();

async function read(bytes: Uint8Array): Promise<SourceWidget[]> {
	// self-hosted, outside bundling
	const mupdf = await rawImport<MupdfModule>('/mupdf/mupdf.js');
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
	return state?.bytes === getSourceBytes() ? state.widgets : null;
}

export function loadSourceWidgets(): void {
	const bytes = getSourceBytes();
	if (!bytes || state?.bytes === bytes) return;
	const current: Loaded = { bytes, widgets: null };
	state = current;
	read(bytes).then(
		(widgets) => {
			if (state !== current) return;
			current.widgets = widgets;
			for (const l of listeners) l();
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

export function subscribeWidgets(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
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
