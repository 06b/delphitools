// page sizes prove merge order
// npm start, node scripts/verify/pdf-organiser.mjs

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
const LETTER = [612, 792];

async function makePdf(name, label, size, pages) {
	const doc = await PDFDocument.create();
	const font = await doc.embedFont(StandardFonts.Helvetica);
	for (let n = 1; n <= pages; n++) {
		const page = doc.addPage(size);
		page.drawText(`${label} ${n}`, { x: 72, y: size[1] - 72, font });
	}
	const path = join(mkdtempSync(join(tmpdir(), 'dt-porg-')), name);
	writeFileSync(path, await doc.save());
	return path;
}

const alpha = await makePdf('alpha.pdf', 'ALPHA', A4, 3);
const beta = await makePdf('beta.pdf', 'BETA', LETTER, 2);
const betaB64 = readFileSync(beta).toString('base64');

const downloads = mkdtempSync(join(tmpdir(), 'dt-porg-dl-'));

// wait past .crdownload
async function waitForDownload(match, timeout = 30000) {
	const until = Date.now() + timeout;
	while (Date.now() < until) {
		const name = readdirSync(downloads).find(
			(n) => match.test(n) && !n.endsWith('.crdownload'),
		);
		if (name) {
			const path = join(downloads, name);
			if (statSync(path).size > 0) {
				const bytes = readFileSync(path);
				rmSync(path);
				return { name, bytes };
			}
		}
		await sleep(250);
	}
	return null;
}

const { browser, page } = await launch();
const client = await page.createCDPSession();
await client.send('Browser.setDownloadBehavior', {
	behavior: 'allow',
	downloadPath: downloads,
});

const count = () =>
	page.$$eval('.porg-strip .canon-page-strip-cell', (els) => els.length);
const waitCount = (n) =>
	page
		.waitForFunction(
			(n) =>
				document.querySelectorAll(
					'.porg-strip .canon-page-strip-cell',
				).length === n,
			{ timeout: 30000 },
			n,
		)
		.then(() => true)
		.catch(() => false);
const names = () =>
	page.$$eval('.porg-strip .canon-page-strip-name', (els) =>
		els.map((el) => el.textContent.trim()).join('|'),
	);
const bannerHeight = () =>
	page.$eval(
		'.pdf-organiser .canon-split-banner .canon-canvas',
		(el) => el.getBoundingClientRect().height,
	);
const headings = () =>
	page.$$eval('.pdf-organiser .canon-heading', (els) =>
		els.map((el) => el.textContent.trim()).join('|'),
	);
const menuPick = async (index, title) => {
	await page.click(
		`.porg-strip [data-page-index="${index}"] .canon-page-strip-page`,
	);
	await page.waitForSelector('.canon-page-strip-menu:popover-open', {
		timeout: 3000,
	});
	return page.evaluate((title) => {
		const item = [
			...document.querySelectorAll(
				'.canon-page-strip-menu [role=menuitem]',
			),
		].find((el) => el.textContent.trim() === title);
		item?.click();
		return !!item;
	}, title);
};

await visit(page, '/tools/pdf-organiser');

check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.pdf-organiser').getBoundingClientRect()
				.height,
	),
);

const empty = await page.evaluate(() => ({
	blanks: document.querySelectorAll('.porg-blank .canon-page-strip-cell')
		.length,
	blankText: document.querySelector('.porg-blank')?.innerText.trim(),
	hidden: document
		.querySelector('.porg-blank')
		?.getAttribute('aria-hidden'),
	slot: document.querySelector('.porg-slot')?.textContent.trim(),
	files: !!document.querySelector('.media-slot-files'),
	merge: document.querySelector('.media-job-run')?.disabled,
	split: document.querySelector('.porg-split')?.disabled,
	modes: [...document.querySelectorAll('.porg-modes button')].every(
		(b) => !b.disabled,
	),
	ranges: !document.querySelector('.porg-ranges input')?.disabled,
	parts: document
		.querySelector('.porg-parts .canon-page-strip-empty')
		?.textContent.trim(),
}));
check(
	'empty: blank A4 sheets with no text, the Files slot row, actions off, settings on',
	empty.blanks > 0 &&
		empty.blankText === '' &&
		empty.hidden === 'true' &&
		empty.slot === 'Drop PDFs here' &&
		empty.files &&
		empty.merge === true &&
		empty.split === true &&
		empty.modes &&
		empty.ranges &&
		empty.parts === 'Parts',
	JSON.stringify(empty),
);
const emptyHeight = await bannerHeight();
const emptyHeadings = await headings();

await (await page.$('.media-slot-bar:has(.porg-slot) ~ input[type="file"]')).uploadFile(
	alpha,
	beta,
);
check('two picked PDFs fill a 5-page strip', await waitCount(5));
check(
	'pages are named by file, in picked order',
	(await names()) ===
		'alpha p. 1|alpha p. 2|alpha p. 3|beta p. 1|beta p. 2',
	await names(),
);
const rows = await page.$$eval('.porg-file', (els) =>
	els.map((el) => el.textContent.replace(/\s+/g, ' ').trim()),
);
check(
	'a row per file with its page count',
	rows.length === 2 &&
		/alpha\.pdf.*3 pages/.test(rows[0]) &&
		/beta\.pdf.*2 pages/.test(rows[1]),
	rows.join(' / '),
);
check(
	'the layout does not jump when files load',
	(await bannerHeight()) === emptyHeight &&
		(await headings()) === emptyHeadings,
	`${emptyHeight} → ${await bannerHeight()}; ${await headings()}`,
);
check(
	'Export Merged turns on',
	await page.$eval('.media-job-run', (el) => !el.disabled),
);

const ratio = (index) =>
	page.$eval(
		`.porg-strip [data-page-index="${index}"]`,
		(el) => +el.style.getPropertyValue('--canon-page-ratio'),
	);
const before = await ratio(0);
check('a press on a page opens its menu; Rotate', await menuPick(0, 'Rotate'));
await sleep(200);
const after = await ratio(0);
check(
	'rotate turns the page sideways',
	before < 1 && after > 1,
	`${before.toFixed(3)} → ${after.toFixed(3)}`,
);

const turn = async (row, side) => {
	await page.click(
		`.porg-rotate-${row} button[aria-label="Rotate ${side}"]`,
	);
	await sleep(150);
};
const picked = () =>
	page.$$eval('.porg-strip [data-picked]', (els) =>
		els.map((el) => el.dataset.pageIndex).join(','),
	);
check('the pressed page is the selection', (await picked()) === '0', await picked());
await turn('picked', 'right');
const half = await ratio(0);
await turn('picked', 'left');
check(
	'Rotate right and Rotate left turn the selected page',
	half < 1 && (await ratio(0)) > 1 && (await ratio(1)) < 1,
	`${half.toFixed(3)}, ${(await ratio(0)).toFixed(3)}`,
);
await page.keyboard.down('Shift');
await page.click('.porg-strip [data-page-index="1"] .canon-page-strip-page');
await page.keyboard.up('Shift');
await sleep(150);
check(
	'Shift-click adds a page without opening the menu',
	(await picked()) === '0,1' &&
		!(await page.$('.canon-page-strip-menu:popover-open')),
	await picked(),
);
await turn('picked', 'right');
const both = [await ratio(0), await ratio(1), await ratio(2)];
await turn('picked', 'left');
check(
	'the selection turns together, the rest stays',
	both[0] < 1 && both[1] > 1 && both[2] < 1 &&
		(await ratio(0)) > 1 && (await ratio(1)) < 1,
	both.map((r) => r.toFixed(3)).join(','),
);
await turn('all', 'right');
const all = [await ratio(0), await ratio(2), await ratio(4)];
await turn('all', 'left');
check(
	'All pages turns every page',
	all[0] < 1 && all[1] > 1 && all[2] > 1 && (await ratio(4)) < 1,
	all.map((r) => r.toFixed(3)).join(','),
);

await page.focus('.porg-strip [data-page-index="4"] .canon-page-strip-page');
await page.keyboard.press('Delete');
check('Delete on a focused page removes it', await waitCount(4));
await sleep(100);
check(
	'focus stays in the strip',
	await page.evaluate(() =>
		document.activeElement?.matches('.canon-page-strip-page'),
	),
);

await page.focus('.porg-strip [data-page-index="0"] .canon-page-strip-page');
await page.keyboard.down('Alt');
await page.keyboard.press('ArrowRight');
await page.keyboard.up('Alt');
await sleep(200);
check(
	'Alt+ArrowRight moves a page',
	(await names()) === 'alpha p. 2|alpha p. 1|alpha p. 3|beta p. 1',
	await names(),
);

// kit places by clientX
await page.evaluate(() => {
	const list = document.querySelector('.porg-strip ol');
	const cells = [...list.querySelectorAll('[data-page-index]')];
	const box = cells[2].getBoundingClientRect();
	const dataTransfer = new DataTransfer();
	const init = {
		bubbles: true,
		cancelable: true,
		dataTransfer,
		clientX: box.right - 2,
		clientY: box.top + 10,
	};
	cells[0].dispatchEvent(new DragEvent('dragstart', init));
	list.dispatchEvent(new DragEvent('dragover', init));
	list.dispatchEvent(new DragEvent('drop', init));
	cells[0].dispatchEvent(new DragEvent('dragend', init));
});
await sleep(300);
check(
	'drag reorders the strip',
	(await names()) === 'alpha p. 1|alpha p. 3|alpha p. 2|beta p. 1',
	await names(),
);

await menuPick(3, 'Duplicate');
check('Duplicate adds a copy', await waitCount(5));
await menuPick(4, 'Remove');
check('Remove drops it', await waitCount(4));
await menuPick(3, 'Move to start');
await sleep(200);
await menuPick(0, 'Move to end');
await sleep(200);
check(
	'Move to start and Move to end',
	(await names()) === 'alpha p. 1|alpha p. 3|alpha p. 2|beta p. 1',
	await names(),
);

await page.click('.media-job-run');
await page.waitForSelector('.media-job-save', { timeout: 15000 });
const result = await page.$eval('.media-job-result', (el) =>
	el.textContent.replace(/\s+/g, ' ').trim(),
);
check(
	'merge shows the result row',
	/alpha-merged\.pdf.*4 pages/.test(result),
	result,
);
await page.click('.media-job-save');
const merged = await waitForDownload(/-merged\.pdf$/);
check('merged PDF downloads', !!merged, merged?.name ?? 'nothing landed');
if (merged) {
	const doc = await PDFDocument.load(merged.bytes);
	check('merged PDF has 4 pages', doc.getPageCount() === 4);
	const sizes = doc.getPages().map((p) => Math.round(p.getSize().width));
	// 595=a4, 612=letter
	check(
		'merged order follows the strip',
		sizes.join(',') === '595,595,595,612',
		sizes.join(','),
	);
	check(
		'the rotated page kept its 90°',
		doc.getPage(0).getRotation().angle === 90,
		`page 1 rotation ${doc.getPage(0).getRotation().angle}`,
	);
}

await page.type('.porg-ranges input', '1-2');
await sleep(200);
const partState = await page.evaluate(() => ({
	label: document.querySelector('.porg-split')?.textContent.trim(),
	parts: [
		...document.querySelectorAll('.porg-parts .canon-page-strip-number'),
	].map((el) => el.textContent.trim()),
	names: [
		...document.querySelectorAll('.porg-parts .canon-page-strip-name'),
	].map((el) => el.textContent.trim()),
	stacked: document.querySelectorAll(
		'.porg-parts .canon-page-strip-sheet',
	).length,
	merged: !!document.querySelector('.media-job-result'),
}));
check(
	'a range shows one stacked part, live',
	partState.label === 'Download part' &&
		partState.names.join() === '1–2' &&
		partState.stacked === 1,
	JSON.stringify(partState),
);
await page.click('.porg-split');
const part = await waitForDownload(/-part-1\.pdf$/);
check('a single range downloads one PDF', !!part, part?.name ?? 'nothing');
if (part) {
	const doc = await PDFDocument.load(part.bytes);
	check('the range part has 2 pages', doc.getPageCount() === 2);
}

await page.evaluate(() =>
	[...document.querySelectorAll('.porg-modes button')]
		.find((b) => b.textContent.trim() === 'Every page')
		.click(),
);
await sleep(200);
check(
	'Every page hides the ranges row and counts the parts',
	!(await page.$('.porg-ranges')) &&
		(await page.$eval('.porg-split', (el) => el.textContent.trim())) ===
			'Download 4 parts',
);
await page.click('.porg-split');
const zip = await waitForDownload(/-split\.zip$/);
check('every-page split downloads a zip', !!zip, zip?.name ?? 'nothing');
if (zip) {
	const archive = await JSZip.loadAsync(zip.bytes);
	const files = Object.keys(archive.files).sort();
	check(
		'the zip holds one PDF per page',
		files.length === 4 && files.every((n) => /-page-\d+\.pdf$/.test(n)),
		files.join(', '),
	);
}

await page.evaluate(() =>
	[...document.querySelectorAll('.porg-modes button')]
		.find((b) => b.textContent.trim() === 'By ranges')
		.click(),
);
await page.waitForSelector('.porg-ranges input', { timeout: 5000 });
await page.$eval('.porg-ranges input', (el) => {
	el.focus();
	el.select();
});
await page.keyboard.type('8-9');
await sleep(200);
const rangeState = await page.evaluate(() => ({
	error: document.querySelector('.porg-range-error')?.textContent ?? '',
	disabled: document.querySelector('.porg-split')?.disabled,
}));
check(
	'an out-of-document range reports and disables',
	/out of range/.test(rangeState.error) && rangeState.disabled,
	rangeState.error.trim(),
);

await page.evaluate((b64) => {
	const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
	const dataTransfer = new DataTransfer();
	dataTransfer.items.add(
		new File([bytes], 'dropped.pdf', { type: 'application/pdf' }),
	);
	const target = document.querySelector('.porg-parts');
	const init = { bubbles: true, cancelable: true, dataTransfer };
	target.dispatchEvent(new DragEvent('dragover', init));
	target.dispatchEvent(new DragEvent('drop', init));
}, betaB64);
check('a PDF dropped on the tool adds its pages', await waitCount(6));
check(
	'dropped pages land at the end',
	(await names()).endsWith('dropped p. 1|dropped p. 2'),
	await names(),
);

await page.evaluate((b64) => {
	const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
	const clipboardData = new DataTransfer();
	clipboardData.items.add(
		new File([bytes], 'pasted.pdf', { type: 'application/pdf' }),
	);
	document.dispatchEvent(
		new ClipboardEvent('paste', {
			bubbles: true,
			cancelable: true,
			clipboardData,
		}),
	);
}, betaB64);
check('a pasted PDF adds its pages', await waitCount(8));

await page.evaluate(() =>
	[...document.querySelectorAll('.porg-file')]
		.find((row) => row.textContent.includes('alpha.pdf'))
		.querySelector('button')
		.click(),
);
check("Clear on a file row removes that file's pages", await waitCount(5));

await page.evaluate(() =>
	document
		.querySelectorAll('.porg-file button')
		.forEach((button) => button.click()),
);
await sleep(300);
check(
	'clearing every file returns to the blank strip',
	!!(await page.$('.porg-blank')) && (await count()) === 0,
);

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/pdf-organiser?orgMode=1');
check(
	'390 px: no horizontal scroll',
	await page.evaluate(
		() =>
			document.documentElement.scrollWidth <=
			document.documentElement.clientWidth,
	),
);
check(
	'?orgMode=1 picks Every page',
	await page.evaluate(() =>
		[...document.querySelectorAll('.porg-modes button')]
			.find((b) => b.textContent.trim() === 'Every page')
			?.getAttribute('aria-checked') === 'true' ||
		!document.querySelector('.porg-ranges'),
	),
);

await finish(browser);
