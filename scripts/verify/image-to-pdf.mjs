// usage: npm start, then node scripts/verify/image-to-pdf.mjs
// no fixtures; generated in-run

import {
	mkdtempSync,
	readdirSync,
	readFileSync,
	rmSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import JSZip from 'jszip';
import { launch, visit, check, finish, sleep } from './harness.mjs';

const A4 = [595.28, 841.89];
const MM_TO_PT = 72 / 25.4;

const fixture = join(mkdtempSync(join(tmpdir(), 'dt-i2p-')), 'three.pdf');
{
	const doc = await PDFDocument.create();
	const font = await doc.embedFont(StandardFonts.Helvetica);
	for (const n of [1, 2, 3]) {
		const page = doc.addPage(A4);
		page.drawText(`PAGE ${n}`, { x: 72, y: A4[1] - 72, font });
	}
	writeFileSync(fixture, await doc.save());
}

const downloads = mkdtempSync(join(tmpdir(), 'dt-i2p-dl-'));

// .crdownload intermediate
async function waitForDownload(match, timeout = 30000) {
	const until = Date.now() + timeout;
	while (Date.now() < until) {
		const name = readdirSync(downloads).find(
			(n) => match.test(n) && !n.endsWith('.crdownload'),
		);
		if (name) {
			const path = join(downloads, name);
			if (statSync(path).size > 0)
				return { name, bytes: readFileSync(path) };
		}
		await sleep(250);
	}
	return null;
}

// so wait can't rematch
function clearDownloads() {
	for (const name of readdirSync(downloads)) {
		rmSync(join(downloads, name));
	}
}

const { browser, page } = await launch();
const client = await page.createCDPSession();
await client.send('Browser.setDownloadBehavior', {
	behavior: 'allow',
	downloadPath: downloads,
});

const clickText = (scope, text) =>
	page.evaluate(
		(s, t) => {
			const button = [
				...document.querySelectorAll(`${s} button`),
			].find((b) => b.textContent.trim() === t);
			button?.click();
			return !!button;
		},
		scope,
		text,
	);

const names = () =>
	page.$$eval('.i2p-strip .canon-page-strip-name', (els) =>
		els.map((el) => el.textContent.trim()),
	);

const stripState = () =>
	page.evaluate(() => {
		const strip = document.querySelector('.i2p-strip');
		const paper = strip?.querySelector('.canon-page-strip-paper');
		const box = paper?.getBoundingClientRect();
		return {
			cells: strip?.querySelectorAll('.canon-page-strip-cell').length,
			hidden: strip?.getAttribute('aria-hidden') === 'true',
			aspect: box ? box.width / box.height : 0,
			band: strip?.closest('.canon-canvas')?.getBoundingClientRect()
				.height,
		};
	});

await visit(page, '/tools/image-to-pdf');
check(
	'the split fills the slot',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.image-to-pdf').getBoundingClientRect()
				.height,
	),
);

const empty = await stripState();
check(
	'empty: blank pages across the strip, hidden, portrait A4',
	empty.cells > 1 && empty.hidden && Math.abs(empty.aspect - 0.707) < 0.02,
	JSON.stringify(empty),
);
check(
	'empty: the Images row is the slot with the iOS wording, Export and order off, settings on',
	await page.evaluate(
		() =>
			document
				.querySelector('.i2p-images')
				?.textContent.includes('Drop images here') &&
			document.querySelector('.media-job-run').disabled &&
			document.querySelector('.i2p-sort-up').disabled &&
			document.querySelector('.i2p-clear').disabled &&
			!document.querySelector('.i2p-size select').disabled &&
			[
				...document.querySelectorAll('.i2p-margin button'),
			].every((b) => !b.disabled),
	),
);
await clickText('.i2p-orientation', 'Landscape');
await sleep(200);
check(
	'empty: the blank page follows the orientation',
	(await stripState()).aspect > 1.3,
);
await clickText('.i2p-orientation', 'Auto');

await page.evaluate(async () => {
	const make = (width, height, colour, name) =>
		new Promise((resolve) => {
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext('2d');
			ctx.fillStyle = colour;
			ctx.fillRect(0, 0, width, height);
			canvas.toBlob(
				(blob) =>
					resolve(new File([blob], name, { type: 'image/png' })),
				'image/png',
			);
		});
	const files = await Promise.all([
		make(200, 100, '#c0392b', 'red-wide.png'),
		make(100, 200, '#2b5fc0', 'blue-tall.png'),
	]);
	const dataTransfer = new DataTransfer();
	for (const file of files) dataTransfer.items.add(file);
	document.querySelector('.image-to-pdf .canon-split-main').dispatchEvent(
		new DragEvent('drop', {
			bubbles: true,
			cancelable: true,
			dataTransfer,
		}),
	);
});
const queued = await page
	.waitForFunction(
		() =>
			document.querySelectorAll('.i2p-strip .canon-page-strip-name')
				.length === 2,
		{ timeout: 15000 },
	)
	.then(() => true)
	.catch(() => false);
check('two dropped images queue up in order', queued, (await names()).join('|'));
const loaded = await stripState();
check(
	'loaded: the strip takes pages, the band keeps its height',
	!loaded.hidden && loaded.band === empty.band,
	`${empty.band} → ${loaded.band}`,
);

await page.focus('.i2p-strip [data-page-index="0"] .canon-page-strip-page');
await page.keyboard.down('Alt');
await page.keyboard.press('ArrowRight');
await page.keyboard.up('Alt');
await sleep(300);
check(
	'Alt+ArrowRight moves a page',
	(await names()).join('|') === 'blue-tall.png|red-wide.png',
	(await names()).join('|'),
);

await page.click('.i2p-sort-down');
await sleep(200);
const zToA = (await names()).join('|');
await page.click('.i2p-sort-up');
await sleep(200);
check(
	'Z–A then A–Z sort by name',
	zToA === 'red-wide.png|blue-tall.png' &&
		(await names()).join('|') === 'blue-tall.png|red-wide.png',
);

const menu = await page.evaluate(() => {
	const button = document.querySelector(
		'.i2p-strip [data-page-index="0"] .canon-page-strip-page',
	);
	const box = button.getBoundingClientRect();
	button.dispatchEvent(
		new MouseEvent('contextmenu', {
			bubbles: true,
			cancelable: true,
			clientX: box.left + 10,
			clientY: box.top + 10,
		}),
	);
	return button.getAttribute('aria-label');
});
await sleep(300);
const items = await page.$$eval(
	'.i2p-strip .canon-page-strip-menu [role=menuitem]',
	(els) => els.map((el) => el.textContent.trim()),
);
check(
	'a page is named and its menu moves or removes it',
	menu === 'Page 1, blue-tall.png' &&
		items.join('|') === 'Move to start|Move to end|Remove',
	`${menu}: ${items.join('|')}`,
);
await clickText('.i2p-strip .canon-page-strip-menu', 'Move to end');
await sleep(200);
check(
	'Move to end',
	(await names()).join('|') === 'red-wide.png|blue-tall.png',
);

await page.click('.media-job-run');
await page.waitForSelector('.media-job-save', { timeout: 15000 });
await page.click('.media-job-save');
const built = await waitForDownload(/^images\.pdf$/);
check('Export PDF downloads', !!built, built?.name ?? 'nothing landed');
if (built) {
	const doc = await PDFDocument.load(built.bytes);
	check('one page per image', doc.getPageCount() === 2);
	const [first, second] = doc.getPages().map((p) => p.getSize());
	check(
		'auto orientation: wide image landscape, tall image portrait',
		Math.round(first.width) === Math.round(A4[1]) &&
			Math.round(second.height) === Math.round(A4[1]) &&
			Math.round(second.width) === Math.round(A4[0]),
		`${Math.round(first.width)}×${Math.round(first.height)}, ${Math.round(second.width)}×${Math.round(second.height)}`,
	);
}

clearDownloads();
await page.select('.i2p-size select', '0');
await clickText('.i2p-margin', '10 mm');
await sleep(200);
check(
	'a setting drops the result; match greys orientation and fit',
	await page.evaluate(
		() =>
			!document.querySelector('.media-job-save') &&
			[...document.querySelectorAll('.i2p-orientation button')].every(
				(b) => b.disabled,
			),
	),
);
await page.click('.media-job-run');
await page.waitForSelector('.media-job-save', { timeout: 15000 });
await page.click('.media-job-save');
const matchFile = await waitForDownload(/^images\.pdf$/);
check('match-image build downloads', !!matchFile);
if (matchFile) {
	const doc = await PDFDocument.load(matchFile.bytes);
	const margin = 10 * MM_TO_PT;
	const first = doc.getPage(1).getSize();
	const expected = {
		width: 100 * 0.75 + margin * 2,
		height: 200 * 0.75 + margin * 2,
	};
	check(
		'match sizes the page to the image plus margin',
		Math.abs(first.width - expected.width) < 1 &&
			Math.abs(first.height - expected.height) < 1,
		`${first.width.toFixed(1)}×${first.height.toFixed(1)} vs ${expected.width.toFixed(1)}×${expected.height.toFixed(1)}`,
	);
}

await clickText('.i2p-direction', 'PDF to Image');
await sleep(200);
const pdfEmpty = await stripState();
check(
	'PDF to Image empty: blank A4, the Source slot, Download zip off',
	pdfEmpty.cells > 1 &&
		pdfEmpty.hidden &&
		pdfEmpty.band === empty.band &&
		(await page.evaluate(
			() =>
				document
					.querySelector('.i2p-pdf')
					?.textContent.includes('Drop PDF here') &&
				document.querySelector('.i2p-zip').disabled,
		)),
);
await (await page.$('.media-slot-bar ~ input[type="file"]')).uploadFile(
	fixture,
);
const rendered = await page
	.waitForFunction(
		() =>
			document.querySelectorAll('.i2p-strip img').length === 3 &&
			!document.querySelector('.i2p-strip[aria-hidden]'),
		{ timeout: 30000 },
	)
	.then(() => true)
	.catch(() => false);
check('the PDF shows one page per page', rendered);
check(
	'the source row names the file',
	await page.evaluate(() =>
		document.querySelector('.i2p-source')?.textContent.includes('three.pdf'),
	),
);

clearDownloads();
await page.evaluate(() => {
	const button = document.querySelector(
		'.i2p-strip [data-page-index="0"] .canon-page-strip-page',
	);
	const box = button.getBoundingClientRect();
	button.dispatchEvent(
		new MouseEvent('contextmenu', {
			bubbles: true,
			cancelable: true,
			clientX: box.left + 10,
			clientY: box.top + 10,
		}),
	);
});
await sleep(300);
await clickText('.i2p-strip .canon-page-strip-menu', 'Download');
const png = await waitForDownload(/-page-1\.png$/);
check('a page menu downloads one PNG', !!png, png?.name ?? 'nothing');
if (png) {
	const isPng = png.bytes
		.subarray(0, 4)
		.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]));
	const width = png.bytes.readUInt32BE(16);
	check(
		'the PNG is 144 DPI by default',
		isPng && Math.abs(width - A4[0] * 2) < 3,
		`width ${width}`,
	);
}

clearDownloads();
await clickText('.i2p-scale', '72 DPI');
await page.waitForFunction(
	() => !document.querySelector('.i2p-zip').disabled,
);
await page.click('.i2p-zip');
const zip = await waitForDownload(/-pages\.zip$/);
check('Download zip lands', !!zip, zip?.name ?? 'nothing');
if (zip) {
	const archive = await JSZip.loadAsync(zip.bytes);
	const entries = Object.keys(archive.files).sort();
	const first = await archive.file(entries[0]).async('nodebuffer');
	check(
		'the zip holds one PNG per page at the chosen DPI',
		entries.length === 3 &&
			entries.every((n) => /-page-\d+\.png$/.test(n)) &&
			Math.abs(first.readUInt32BE(16) - A4[0]) < 3,
		entries.join(', '),
	);
}

await page.evaluate(async () => {
	const canvas = document.createElement('canvas');
	canvas.width = canvas.height = 50;
	const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
	const dataTransfer = new DataTransfer();
	dataTransfer.items.add(new File([blob], 'pasted.png', { type: 'image/png' }));
	document.dispatchEvent(
		new ClipboardEvent('paste', {
			bubbles: true,
			cancelable: true,
			clipboardData: dataTransfer,
		}),
	);
});
await sleep(800);
check(
	'a pasted image joins the queue in Image to PDF',
	(await names()).join('|') === 'red-wide.png|blue-tall.png|pasted.png',
	(await names()).join('|'),
);

await finish(browser);
