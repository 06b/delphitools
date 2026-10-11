import { module, test } from 'qunit';
import { PDFDocument, PDFName, StandardFonts } from 'pdf-lib';
import {
	analyseWithPdfLib,
	badges,
	colourIssues,
	formatSize,
	groupByPage,
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
		assert.true(rgbGray[2]!.message.includes('RGB, Gray'));
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
});
