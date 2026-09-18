import { module, test } from 'qunit';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import {
	groupLines,
	readPageContent,
	type Box,
	type PageContent,
	type TextRun,
} from 'delphitools-v2/lib/errata/content/interpret';
import type { FontInfo } from 'delphitools-v2/lib/errata/content/fonts';
import { applyPageEdits } from 'delphitools-v2/lib/errata/content';
import type { ContentEdit } from 'delphitools-v2/lib/errata/doc-model';
import { tokenise, writeOps } from 'delphitools-v2/lib/errata/content/tokens';

const PNG_1X1 =
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

function corners(b: Box): number[] {
	return [b.x0, b.y0, b.x1, b.y1];
}

function near(assert: Assert, actual: number, expected: number): void {
	assert.true(
		Math.abs(actual - expected) < 1e-6,
		`${actual} ~ ${expected}`,
	);
}

async function sample() {
	const doc = await PDFDocument.create();
	const font = await doc.embedFont(StandardFonts.Helvetica);
	const page = doc.addPage([400, 300]);
	page.drawText('Hello world', {
		x: 50,
		y: 200,
		size: 12,
		font,
		color: rgb(1, 0, 0),
	});
	page.drawRectangle({
		x: 20,
		y: 20,
		width: 100,
		height: 40,
		color: rgb(0, 0, 1),
	});
	const png = await doc.embedPng(PNG_1X1);
	page.drawImage(png, { x: 200, y: 100, width: 80, height: 60 });
	const bytes = await doc.save();
	const loaded = await PDFDocument.load(bytes);
	return { page: loaded.getPage(0), font };
}

module('Unit | errata | content', function () {
	test('tokeniser round-trips strings, names, arrays and inline images', function (assert) {
		const src = new TextEncoder().encode(
			'BT /F1 12 Tf [(A\\)B) -20 <4142>] TJ ET /N#20ame gs BI /W 1 /H 1 /CS /G /BPC 8 ID \x00 EI q 1 0 0 1 2 3 cm Q',
		);
		const ops = tokenise(src);
		assert.deepEqual(
			ops.map((o) => o.op),
			['BT', 'Tf', 'TJ', 'ET', 'gs', 'BI', 'q', 'cm', 'Q'],
		);
		const tj = ops[2]!.args[0] as {
			t: 'arr';
			v: { v: Uint8Array }[];
		};
		assert.strictEqual(tj.t, 'arr');
		assert.deepEqual(Array.from(tj.v[0]!.v), [0x41, 0x29, 0x42]);
		assert.deepEqual(Array.from(tj.v[2]!.v), [0x41, 0x42]);
		assert.strictEqual(
			(ops[4]!.args[0] as { v: string }).v,
			'N ame',
		);
		assert.deepEqual(Array.from(ops[5]!.data!), [0]);
		const again = tokenise(writeOps(ops));
		assert.deepEqual(
			again.map((o) => o.op),
			ops.map((o) => o.op),
		);
		assert.deepEqual(again[2]!.args, ops[2]!.args);
	});

	test('text run gets its font, text, colour and box', async function (assert) {
		const { page, font } = await sample();
		const c = readPageContent(page);
		const text = c.items.filter((i) => i.kind === 'text');
		assert.strictEqual(text.length, 1);
		const run = text[0] as TextRun;
		assert.strictEqual(run.text, 'Hello world');
		assert.strictEqual(run.size, 12);
		assert.deepEqual(run.fill, [1, 0, 0]);
		assert.ok(Math.abs(run.bbox.x0 - 50) < 0.01, 'starts at x');
		const width = font.widthOfTextAtSize('Hello world', 12);
		assert.ok(
			Math.abs(run.bbox.x1 - 50 - width) < 0.5,
			`width ${run.bbox.x1 - 50} ~ ${width}`,
		);
		assert.true(run.bbox.y0 < 200, 'descent below baseline');
		assert.true(run.bbox.y1 > 200, 'ascent above baseline');
		assert.strictEqual(run.font.encode('H'), 0x48);
		assert.strictEqual(run.font.encode('→'), null);
	});

	test('rectangle and image boxes', async function (assert) {
		const { page } = await sample();
		const c = readPageContent(page);
		const path = c.items.find((i) => i.kind === 'path')!;
		assert.deepEqual(corners(path.bbox), [20, 20, 120, 60]);
		const image = c.items.find((i) => i.kind === 'image')!;
		assert.deepEqual(corners(image.bbox), [200, 100, 280, 160]);
		assert.deepEqual(c.warnings, []);
	});

	test('runs on one baseline group into a line, columns stay apart', function (assert) {
		const font: FontInfo = {
			subtype: 'Type1',
			baseFont: 'X',
			codeBytes: 1,
			ascent: 0.9,
			descent: -0.2,
			fontMatrix: null,
			decode: (b: Uint8Array) =>
				Array.from(b, (code) => ({
					code,
					text: String.fromCharCode(code),
					width: 500,
					isSpace: code === 32,
				})),
			encode: () => null,
		};
		const mk = (x: number, text: string, bt: number): TextRun => ({
			kind: 'text',
			stream: '',
			from: 0,
			to: 0,
			bt,
			fontRes: 'F1',
			font,
			size: 10,
			fontSize: 10,
			trm: [10, 0, 0, 10, x, 100],
			ctm: [1, 0, 0, 1, 0, 0],
			tm: [10, 0, 0, 10, x, 100],
			tlm: [10, 0, 0, 10, x, 100],
			hscale: 1,
			glyphs: [],
			text,
			advance: text.length * 0.5,
			fill: null,
			bbox: {
				x0: x,
				y0: 98,
				x1: x + text.length * 5,
				y1: 109,
			},
		});
		const lines = groupLines([
			mk(10, 'ab', 0),
			mk(20, 'cd', 1),
			mk(33, 'ef', 1),
			mk(200, 'far', 1),
		]);
		assert.deepEqual(
			lines.map((l) => l.text),
			['abcd ef', 'far'],
		);
	});
});

module('Unit | errata | content rewrite', function () {
	async function docWith(plan: (before: PageContent) => ContentEdit[]) {
		const doc = await PDFDocument.create();
		const font = await doc.embedFont(StandardFonts.Helvetica);
		const page = doc.addPage([400, 300]);
		page.drawText('Hello', { x: 50, y: 200, size: 12, font });
		page.drawText('World', { x: 150, y: 200, size: 12, font });
		page.drawRectangle({ x: 20, y: 20, width: 100, height: 40 });
		const loaded = await PDFDocument.load(await doc.save());
		const src = loaded.getPage(0);
		const before = readPageContent(src);
		const content = applyPageEdits(src, plan(before)).content;
		return { before, after: content };
	}

	test('moving a text run shifts it and leaves the next run in place', async function (assert) {
		const { before, after } = await docWith((b) => {
			const first = b.items.find((i) => i.kind === 'text')!;
			return [
				{
					kind: 'move',
					stream: '',
					from: first.from,
					to: first.to,
					dx: 30,
					dy: -10,
				},
			];
		});
		const [h0, w0] = before.items.filter((i) => i.kind === 'text');
		const [h1, w1] = after.items.filter((i) => i.kind === 'text');
		near(assert, h1!.bbox.x0 - h0!.bbox.x0, 30);
		near(assert, h1!.bbox.y0 - h0!.bbox.y0, -10);
		corners(w1!.bbox).forEach((v, k) =>
			near(assert, v, corners(w0!.bbox)[k]!),
		);
		assert.deepEqual(after.warnings, []);
	});

	test("replacing a run's text keeps the next run where it was", async function (assert) {
		const { before, after } = await docWith((b) => {
			const first = b.items.find(
				(i) => i.kind === 'text',
			) as TextRun;
			const codes = [...'Hi!'].map((ch) =>
				first.font.encode(ch)!,
			);
			return [
				{
					kind: 'text',
					stream: '',
					from: first.from,
					to: first.to,
					text: 'Hi!',
					codes,
				},
			];
		});
		const [, w0] = before.items.filter((i) => i.kind === 'text');
		const [h1, w1] = after.items.filter((i) => i.kind === 'text');
		assert.strictEqual(h1!.text, 'Hi!');
		near(assert, h1!.bbox.x0, 50);
		corners(w1!.bbox).forEach((v, k) =>
			near(assert, v, corners(w0!.bbox)[k]!),
		);
	});

	test('a substitute-font edit writes Helvetica and restores the run font', async function (assert) {
		const { after } = await docWith((b) => {
			const first = b.items.find((i) => i.kind === 'text')!;
			return [
				{
					kind: 'text',
					stream: '',
					from: first.from,
					to: first.to,
					text: 'Zed',
					codes: [0x5a, 0x65, 0x64],
					font: 'Helvetica',
				},
			];
		});
		const [h1, w1] = after.items.filter((i) => i.kind === 'text');
		assert.strictEqual(h1!.text, 'Zed');
		assert.strictEqual(h1!.fontRes, 'ErrHelv');
		assert.strictEqual(h1!.font.baseFont, 'Helvetica');
		assert.strictEqual(w1!.text, 'World');
		assert.notStrictEqual(w1!.fontRes, 'ErrHelv');
		assert.deepEqual(after.warnings, []);
	});

	test('deleting a rectangle removes only that path', async function (assert) {
		const { after } = await docWith((b) => {
			const rect = b.items.find((i) => i.kind === 'path')!;
			return [
				{
					kind: 'delete',
					stream: '',
					from: rect.from,
					to: rect.to,
				},
			];
		});
		assert.strictEqual(
			after.items.filter((i) => i.kind === 'path').length,
			0,
		);
		assert.strictEqual(
			after.items.filter((i) => i.kind === 'text').length,
			2,
		);
	});

	test('moving a rectangle wraps it in a translated q/Q', async function (assert) {
		const { after } = await docWith((b) => {
			const rect = b.items.find((i) => i.kind === 'path')!;
			return [
				{
					kind: 'move',
					stream: '',
					from: rect.from,
					to: rect.to,
					dx: 5,
					dy: 7,
				},
			];
		});
		const moved = after.items.find((i) => i.kind === 'path')!;
		corners(moved.bbox).forEach((v, k) =>
			near(assert, v, [25, 27, 125, 67][k]!),
		);
	});
});
