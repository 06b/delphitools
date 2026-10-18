import { module, test } from 'qunit';
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import {
	analyseWithPdfLib,
	badges,
	colourIssues,
	formatSize,
	groupByPage,
	imagePlacements,
	type PreflightIssue,
} from 'delphitools-v2/lib/pdf-preflight';

const issue = (
	severity: PreflightIssue['severity'],
	page?: number,
): PreflightIssue => ({ severity, category: 'document', message: '', page });

module('Unit | lib | pdf-preflight', function () {
	test('formatSize', function (assert) {
		assert.strictEqual(formatSize(512), '512 B');
		assert.strictEqual(formatSize(2048), '2.0 KB');
		assert.strictEqual(formatSize(3 * 1024 * 1024), '3.0 MB');
	});

	test('colourIssues', function (assert) {
		assert.deepEqual(colourIssues(['DeviceCMYK'], 1), []);
		const rgbGray = colourIssues(['DeviceRGB', 'DeviceGray'], 2);
		assert.deepEqual(
			rgbGray.map((i) => [i.severity, i.page]),
			[
				['warning', 2],
				['info', 2],
				['warning', 2],
			],
		);
		assert.true(rgbGray[2]!.message.includes('RGB, Grey'));
		assert.strictEqual(
			colourIssues(['Separation'], 1)[0]?.severity,
			'info',
		);
	});

	test('badges', function (assert) {
		assert.deepEqual(badges([]), [
			{ severity: 'pass', label: 'All checks passed' },
		]);
		assert.deepEqual(
			badges([
				issue('info'),
				issue('error'),
				issue('error'),
				issue('info'),
			]).map((b) => b.label),
			['2 errors', '2 info'],
		);
		assert.deepEqual(
			badges([issue('warning')]).map((b) => b.label),
			['1 warning'],
		);
	});

	test('groupByPage', function (assert) {
		const groups = groupByPage(
			[issue('info', 2), issue('error'), issue('warning', 2)],
			3,
		);
		assert.deepEqual(
			groups.map((g) => [g.page, g.issues.length]),
			[[2, 2]],
		);
	});

	test('analyseWithPdfLib', async function (assert) {
		const doc = await PDFDocument.create();
		const a = doc.addPage([400, 600]);
		a.drawText('x', {
			font: await doc.embedFont(StandardFonts.Helvetica),
		});
		const b = doc.addPage([600, 400]);
		b.node.set(
			PDFName.of('TrimBox'),
			doc.context.obj([10, 10, 590, 390]),
		);
		b.node.set(
			PDFName.of('BleedBox'),
			doc.context.obj([5, 5, 595, 395]),
		);
		const bytes = await doc.save();
		const report = await analyseWithPdfLib(
			bytes.slice().buffer,
			'x.pdf',
			bytes.length,
		);
		const messages = (page?: number) =>
			report.issues
				.filter((i) => i.page === page)
				.map((i) => i.message);

		assert.strictEqual(report.pageCount, 2);
		assert.deepEqual(report.fonts, [
			{
				name: 'Helvetica',
				embedded: true,
				type: 'Type1',
				data: undefined,
				extension: undefined,
			},
		]);
		assert.true(messages(1).includes('No BleedBox defined'));
		assert.true(messages(1).includes('No TrimBox defined'));
		assert.true(
			messages(2).includes('Page size differs from page 1'),
		);
		assert.true(
			messages(2).some((m) =>
				m.startsWith('Bleed margin is only 1.8mm'),
			),
		);
		assert.true(
			messages().includes('Mixed page orientations detected'),
		);
	});

	test('imagePlacements follows the ctm', function (assert) {
		const ops = {
			save: 1,
			restore: 2,
			transform: 3,
			paintFormXObjectBegin: 4,
			paintFormXObjectEnd: 5,
			beginAnnotation: 6,
			endAnnotation: 7,
			paintImageXObject: 8,
			paintImageXObjectRepeat: 9,
		};
		const fns = [1, 3, 8, 2, 4, 3, 8, 5, 8, 6, 8, 7, 9];
		const args: unknown[][] = [
			[],
			[100, 0, 0, 50, 10, 20],
			['a'],
			[],
			[
				[2, 0, 0, 2, 0, 0],
				[0, 0, 10, 10],
			],
			[0, 10, -10, 0, 5, 5],
			['b'],
			[],
			['c'],
			[
				'x',
				[0, 0, 1, 1],
				[1, 0, 0, 1, 30, 40],
				[10, 0, 0, 10, 0, 0],
			],
			['d'],
			[],
			['e', 4, 4, [0, 0, 100, 100]],
		];
		const placed = imagePlacements(fns, args, ops);
		assert.deepEqual(placed.get('a'), [
			{ x: 10, y: 20, width: 100, height: 50 },
		]);
		// form matrix then rotation
		assert.deepEqual(placed.get('b'), [
			{ x: -10, y: 10, width: 20, height: 20 },
		]);
		assert.deepEqual(placed.get('c'), [
			{ x: 0, y: 0, width: 1, height: 1 },
		]);
		assert.deepEqual(placed.get('d'), [
			{ x: 30, y: 40, width: 10, height: 10 },
		]);
		assert.deepEqual(placed.get('e'), [
			{ x: 0, y: 0, width: 4, height: 4 },
			{ x: 100, y: 100, width: 4, height: 4 },
		]);
	});
});
