import {
	PDFDict,
	PDFHexString,
	PDFName,
	PDFObjectCopier,
	PDFRef,
	degrees,
	rgb,
	type PDFDocument,
	type PDFFont,
	type PDFPage,
} from 'pdf-lib';
import {
	contentBox,
	contentPlacement,
	displayedToUnrotated,
	displayedToUser,
	newId,
	totalRotation,
	unrotatedSize,
	unrotatedToDisplayed,
	type ErrataDoc,
	type ErrataPage,
	type FieldObject,
	type Rotation,
} from './doc-model';
import { encodable } from './export';

export type FieldDraft = Pick<
	FieldObject,
	'field' | 'name' | 'options' | 'required' | 'value'
>;

let draft: FieldDraft = {
	field: 'text',
	name: '',
	options: [],
	required: false,
	value: '',
};
let selected: string | null = null;
const listeners = new Set<() => void>();

function emit(): void {
	for (const l of listeners) l();
}

export function getFieldDraft(): FieldDraft {
	return draft;
}

export function setFieldDraft(patch: Partial<FieldDraft>): void {
	draft = { ...draft, ...patch };
	emit();
}

export function getSelectedField(): string | null {
	return selected;
}

export function setSelectedField(id: string | null): void {
	if (id === selected) return;
	selected = id;
	emit();
}

export function subscribeFields(listener: () => void): () => void {
	listeners.add(listener);
	return () => {
		listeners.delete(listener);
	};
}

export function parseOptions(text: string): string[] {
	return [
		...new Set(
			text
				.split(',')
				.map((s) => s.trim())
				.filter(Boolean),
		),
	];
}

// dots mean hierarchy
export function uniqueName(base: string, taken: ReadonlySet<string>): string {
	const clean = base.trim().replace(/\./g, '-') || 'field';
	if (!taken.has(clean)) return clean;
	for (let n = 2; ; n++)
		if (!taken.has(`${clean}-${n}`)) return `${clean}-${n}`;
}

export function newField(
	d: FieldDraft,
	rect: { x: number; y: number; width: number; height: number },
	taken: ReadonlySet<string>,
): FieldObject | null {
	if (rect.width < 4 || rect.height < 4) return null;
	return {
		id: newId(),
		kind: 'field',
		cx: rect.x + rect.width / 2,
		cy: rect.y + rect.height / 2,
		w: rect.width,
		h: rect.height,
		scaleX: 1,
		scaleY: 1,
		angle: 0,
		...d,
		name: uniqueName(d.name || d.field, taken),
	};
}

export function radioLayout(w: number, h: number, count: number) {
	const n = Math.max(1, count);
	const row = h / n;
	const size = Math.min(row, w) * 0.8;
	return {
		size,
		label: size * 0.8,
		rows: Array.from(
			{ length: n },
			(_, i) => i * row + (row - size) / 2,
		),
	};
}

export function radioChoices(o: FieldObject): string[] {
	return o.options.length ? o.options : ['on'];
}

export interface UserRect {
	x: number;
	y: number;
	width: number;
	height: number;
}

// before the crop offset
export function localToUser(
	page: ErrataPage,
	o: FieldObject,
	lx: number,
	ly: number,
): { x: number; y: number } {
	const a = (o.angle * Math.PI) / 180;
	const px = (lx - o.w / 2) * o.scaleX;
	const py = (ly - o.h / 2) * o.scaleY;
	const u = unrotatedSize(page);
	return displayedToUser(
		o.cx + px * Math.cos(a) - py * Math.sin(a),
		o.cy + px * Math.sin(a) + py * Math.cos(a),
		totalRotation(page),
		u.width,
		u.height,
	);
}

export function fieldRectToUser(
	page: ErrataPage,
	o: FieldObject,
	local: UserRect = { x: 0, y: 0, width: o.w, height: o.h },
): UserRect {
	const pts = [
		[local.x, local.y],
		[local.x + local.width, local.y],
		[local.x, local.y + local.height],
		[local.x + local.width, local.y + local.height],
	].map(([x, y]) => localToUser(page, o, x!, y!));
	const xs = pts.map((p) => p.x);
	const ys = pts.map((p) => p.y);
	const x = Math.min(...xs);
	const y = Math.min(...ys);
	return {
		x,
		y,
		width: Math.max(...xs) - x,
		height: Math.max(...ys) - y,
	};
}

// widget /MK /R
export function fieldRotation(page: ErrataPage, o: FieldObject): Rotation {
	const r = Math.round((totalRotation(page) - o.angle) / 90) * 90;
	return (((r % 360) + 360) % 360) as Rotation;
}

// undo pdf-lib border, pivot
export function widgetBox(rect: UserRect, rotate: Rotation, border: number) {
	const b = border / 2;
	const { x, y, width: W, height: H } = rect;
	const turned = rotate === 90 || rotate === 270;
	return {
		x: rotate === 90 || rotate === 180 ? x + W - b : x + b,
		y: rotate === 180 || rotate === 270 ? y + H - b : y + b,
		width: (turned ? H : W) - border,
		height: (turned ? W : H) - border,
	};
}

// resized pages drop widgets
export function sourceRectToDisplayed(
	page: ErrataPage,
	rect: [number, number, number, number],
): UserRect | null {
	if (page.resize) return null;
	const c = contentBox(page);
	const p = contentPlacement(page);
	const u = unrotatedSize(page);
	const pts = [
		[rect[0], rect[1]],
		[rect[2], rect[3]],
	].map(([dx, dy]) => {
		const s = displayedToUnrotated(
			dx!,
			dy!,
			page.baseRotation,
			page.baseWidth,
			page.baseHeight,
		);
		return unrotatedToDisplayed(
			p.x + (s.x - c.x) * p.scale,
			p.y + (s.y - c.y) * p.scale,
			totalRotation(page),
			u.width,
			u.height,
		);
	});
	const x = Math.min(pts[0]!.x, pts[1]!.x);
	const y = Math.min(pts[0]!.y, pts[1]!.y);
	return {
		x,
		y,
		width: Math.abs(pts[0]!.x - pts[1]!.x),
		height: Math.abs(pts[0]!.y - pts[1]!.y),
	};
}

// copyPages drops /AcroForm
export function carryAcroForm(
	source: PDFDocument,
	out: PDFDocument,
	pages: PDFPage[],
): void {
	const acro = source.catalog.lookupMaybe(
		PDFName.of('AcroForm'),
		PDFDict,
	);
	if (!acro) return;
	const roots = new Set<PDFRef>();
	for (const page of pages) {
		const annots = page.node.Annots();
		for (let i = 0; i < (annots?.size() ?? 0); i++) {
			const ref = annots!.get(i);
			const dict = out.context.lookup(ref);
			if (
				!(ref instanceof PDFRef) ||
				!(dict instanceof PDFDict) ||
				dict.get(PDFName.of('Subtype')) !==
					PDFName.of('Widget')
			)
				continue;
			// copier detached /P
			dict.set(PDFName.of('P'), page.ref);
			let root = ref;
			let parent = dict.get(PDFName.of('Parent'));
			while (parent instanceof PDFRef) {
				root = parent;
				parent = out.context
					.lookup(parent, PDFDict)
					.get(PDFName.of('Parent'));
			}
			roots.add(root);
		}
	}
	if (roots.size === 0) return;
	const copier = PDFObjectCopier.for(source.context, out.context);
	const form = out.context.obj({ Fields: [...roots] });
	for (const key of ['DA', 'DR', 'Q', 'NeedAppearances']) {
		const value = acro.get(PDFName.of(key));
		if (value) form.set(PDFName.of(key), copier.copy(value));
	}
	out.catalog.set(PDFName.of('AcroForm'), out.context.register(form));
}

const BORDER = 1;

// pages align by index
export function addFormFields(
	out: PDFDocument,
	doc: ErrataDoc,
	font: PDFFont,
): void {
	const placed = doc.pages.flatMap((page, i) =>
		page.objects.flatMap((o) =>
			o.kind === 'field'
				? [{ page, o, pdfPage: out.getPage(i) }]
				: [],
		),
	);
	if (placed.length === 0) return;
	const form = out.getForm();
	const taken = new Set(form.getFields().map((f) => f.getName()));
	for (const { page, o, pdfPage } of placed) {
		const name = uniqueName(o.name || o.field, taken);
		taken.add(name);
		const crop = pdfPage.getCropBox();
		const rotate = fieldRotation(page, o);
		const userRect = (local?: UserRect) => {
			const r = fieldRectToUser(page, o, local);
			return { ...r, x: r.x + crop.x, y: r.y + crop.y };
		};
		const at = (local?: UserRect) => ({
			...widgetBox(userRect(local), rotate, BORDER),
			borderWidth: BORDER,
			rotate: degrees(rotate),
			font,
		});
		let field;
		switch (o.field) {
			case 'text':
				field = form.createTextField(name);
				if (o.value)
					field.setText(encodable(font, o.value));
				field.addToPage(pdfPage, at());
				break;
			case 'checkbox':
				field = form.createCheckBox(name);
				field.addToPage(pdfPage, at());
				if (o.value) field.check();
				break;
			case 'dropdown':
				field = form.createDropdown(name);
				field.addOptions(
					o.options.map((c) =>
						encodable(font, c),
					),
				);
				if (o.options.includes(o.value))
					field.select(encodable(font, o.value));
				field.addToPage(pdfPage, at());
				break;
			case 'radio': {
				const group = form.createRadioGroup(name);
				field = group;
				const choices = radioChoices(o);
				const lay = radioLayout(
					o.w,
					o.h,
					choices.length,
				);
				const theta = totalRotation(page) - o.angle;
				choices.forEach((choice, i) => {
					const y = lay.rows[i]!;
					group.addOptionToPage(
						choice,
						pdfPage,
						at({
							x: 0,
							y,
							width: lay.size,
							height: lay.size,
						}),
					);
					// labels are page content
					const p = localToUser(
						page,
						o,
						lay.size * 1.4,
						y +
							lay.size / 2 +
							lay.label * 0.35,
					);
					pdfPage.drawText(
						encodable(font, choice),
						{
							x: p.x + crop.x,
							y: p.y + crop.y,
							size: lay.label,
							font,
							color: rgb(0, 0, 0),
							rotate: degrees(theta),
						},
					);
				});
				if (choices.includes(o.value))
					group.select(o.value);
				break;
			}
			case 'signature':
				addSignature(
					out,
					pdfPage,
					name,
					userRect(),
					rotate,
					o.required,
				);
				continue;
		}
		if (o.required) field.enableRequired();
	}
	form.updateFieldAppearances(font);
}

// pdf-lib cannot create signatures
function addSignature(
	out: PDFDocument,
	pdfPage: PDFPage,
	name: string,
	r: UserRect,
	rotate: Rotation,
	required: boolean,
): void {
	const ref = out.context.register(
		out.context.obj({
			Type: 'Annot',
			Subtype: 'Widget',
			FT: 'Sig',
			T: PDFHexString.fromText(name),
			Rect: [r.x, r.y, r.x + r.width, r.y + r.height],
			F: 4,
			P: pdfPage.ref,
			MK: { R: rotate },
			...(required ? { Ff: 2 } : {}),
		}),
	);
	pdfPage.node.addAnnot(ref);
	out.getForm().acroForm.addField(ref);
}
