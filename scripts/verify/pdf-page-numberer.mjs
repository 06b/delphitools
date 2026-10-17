// npm start, node scripts/verify/pdf-page-numberer.mjs

import {
	mkdtempSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { launch, visit, check, finish, sleep } from './harness.mjs';

const A4 = [595.28, 841.89];

async function makePdf(pages) {
	const doc = await PDFDocument.create();
	const font = await doc.embedFont(StandardFonts.Helvetica);
	for (let n = 1; n <= pages; n++) {
		const page = doc.addPage(A4);
		page.drawText(`Body ${n}`, { x: 72, y: A4[1] - 72, font });
	}
	const path = join(mkdtempSync(join(tmpdir(), 'dt-ppn-')), 'src.pdf');
	writeFileSync(path, await doc.save());
	return path;
}

const src = await makePdf(3);
const srcSize = statSync(src).size;
const downloads = mkdtempSync(join(tmpdir(), 'dt-ppn-dl-'));

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

const { browser, page } = await launch();
const client = await page.createCDPSession();
await client.send('Browser.setDownloadBehavior', {
	behavior: 'allow',
	downloadPath: downloads,
});

const text = (selector) =>
	page.evaluate((s) => document.querySelector(s)?.textContent.trim() ?? null, selector);
const radio = (group, name) =>
	page.evaluate(
		(group, name) =>
			[...document.querySelectorAll(`.${group} [role="radio"]`)].find(
				(b) => (b.getAttribute('aria-label') ?? b.textContent.trim()) === name,
			),
		group,
		name,
	);
const pick = (group, name) =>
	page.evaluate(
		(group, name) =>
			[...document.querySelectorAll(`.${group} [role="radio"]`)]
				.find((b) => (b.getAttribute('aria-label') ?? b.textContent.trim()) === name)
				.click(),
		group,
		name,
	);
const checked = (group) =>
	page.evaluate((group) => {
		const on = [...document.querySelectorAll(`.${group} [role="radio"]`)].find(
			(b) => b.getAttribute('aria-checked') === 'true',
		);
		return on ? (on.getAttribute('aria-label') ?? on.textContent.trim()) : null;
	}, group);
const names = () =>
	page.$$eval('.ppn-strip .canon-page-strip-page', (els) =>
		els.map((el) => el.getAttribute('aria-label')),
	);
const typeInto = async (selector, value) => {
	await page.focus(selector);
	await page.$eval(selector, (el) => el.select());
	await page.keyboard.press('Backspace');
	await page.type(selector, value);
};
const layout = () =>
	page.evaluate(() => ({
		banner: Math.round(
			document.querySelector('.pdf-page-numberer .canon-split-banner')?.getBoundingClientRect().height ?? -1,
		),
		sections: [...document.querySelectorAll('.pdf-page-numberer .canon-heading')].map((h) =>
			h.textContent.trim(),
		),
	}));

await visit(page, '/tools/pdf-page-numberer');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.pdf-page-numberer').getBoundingClientRect().height,
	),
);
const empty = await page.evaluate(() => ({
	slot: document.querySelector('.ppn-slot')?.textContent.trim(),
	files: !!document.querySelector('.media-slot-files'),
	sheets: document.querySelectorAll('.ppn-blank-sheet').length,
	blank: !!document.querySelector('.ppn-page--blank'),
	blankText: document.querySelector('.ppn-page--blank')?.textContent.trim(),
	run: document.querySelector('.media-job-run')?.disabled,
	add: document.querySelector('.ppn-add')?.disabled,
	from: document.querySelector('.ppn-from input')?.disabled,
	start: document.querySelector('.ppn-start input')?.disabled,
	pager: document.querySelector('.ppn-pager-text')?.textContent.trim(),
	back: document.querySelector('.ppn-back')?.disabled,
	next: document.querySelector('.ppn-forward')?.disabled,
}));
check(
	'empty: the Source row is the slot with a Files cell; blank sheets and a blank page, no text',
	empty.slot === 'Drop PDF here' &&
		empty.files &&
		empty.sheets > 0 &&
		empty.blank &&
		empty.blankText === '',
	JSON.stringify(empty),
);
check(
	'empty: Export, Add section, From page and the pager are off; Start at stays on; the pager reads a dash',
	empty.run === true &&
		empty.add === true &&
		empty.from === true &&
		empty.start === false &&
		empty.back === true &&
		empty.next === true &&
		empty.pager === '—',
	JSON.stringify(empty),
);
const before = await layout();

await pick('ppn-styles', 'i, ii, iii');

const [chooser] = await Promise.all([
	page.waitForFileChooser({ timeout: 5000 }),
	page.click('.ppn-slot'),
]);
await chooser.accept([src]);
await page.waitForFunction(
	() => document.querySelectorAll('.ppn-strip .canon-page-strip-picture[src^="blob:"]').length === 3,
	{ timeout: 30000 },
).catch(() => {});
const after = await layout();
check(
	'the layout does not jump: same banner height, same section order',
	before.banner === after.banner && before.sections.join() === after.sections.join(),
	`${JSON.stringify(before)} -> ${JSON.stringify(after)}`,
);
check(
	'the row names the file with size and pages',
	(await text('.ppn-source .canon-row-title')) === 'src.pdf' &&
		/ · 3 pages$/.test((await text('.ppn-source .canon-row-detail')) ?? ''),
);
check(
	'the strip shows three pages named by their numerals, the style picked before the file kept',
	JSON.stringify(await names()) === JSON.stringify(['Page 1, i', 'Page 2, ii', 'Page 3, iii']),
	JSON.stringify(await names()),
);
await pick('ppn-styles', '1, 2, 3');
await page.waitForFunction(() => !!document.querySelector('.ppn-render[src^="blob:"]'), { timeout: 15000 }).catch(
	() => {},
);
check('the preview draws the page', !!(await page.$('.ppn-render[src^="blob:"]')));
check('the preview shows the number', (await text('.ppn-mark--number')) === '1 / 3');
check(
	'Export, Add section and From page turn on',
	await page.evaluate(
		() =>
			!document.querySelector('.media-job-run').disabled &&
			!document.querySelector('.ppn-add').disabled &&
			!document.querySelector('.ppn-from input').disabled,
	),
);

await typeInto('.ppn-template', 'Page {n} of {N}');
check('the format is live on every keystroke', (await text('.ppn-mark--number')) === 'Page 1 of 3');

await page.click('.ppn-tip-open');
await sleep(150);
check(
	'the info cell opens the format tip',
	await page.evaluate(() => {
		const panel = document.querySelector('.ppn-tip');
		return panel?.matches(':popover-open') && /stands for the page number/.test(panel.textContent);
	}),
);
await page.keyboard.press('Escape');

await pick('ppn-anchors', 'Top left');
const topLeft = await page.$eval('.ppn-mark--number', (el) => el.style.top !== '' && el.style.left !== '');
await page.click('.ppn-zone--row2.ppn-zone--column1');
check(
	'a press on a third of the page moves the number there; the picker follows',
	topLeft &&
		(await checked('ppn-anchors')) === 'Bottom centre' &&
		(await page.$eval('.ppn-mark--number', (el) => el.style.bottom !== '')),
);
check(
	'the anchor marks skip the current one',
	(await page.$$eval('.ppn-zone .ppn-dot', (els) => els.filter((el) => el.offsetParent).length)) === 8,
);

await page.click('.ppn-forward');
await sleep(100);
check(
	'Next goes to page 2: pager, strip and number follow',
	(await text('.ppn-pager-text')) === '2 / 3' &&
		(await page.$$eval('.ppn-strip .canon-page-strip-page', (els) =>
			els.map((el) => el.getAttribute('aria-current')),
		)).join() === ',true,' &&
		(await text('.ppn-mark--number')) === 'Page 2 of 3',
);

await page.click('.ppn-add');
await sleep(100);
await pick('ppn-styles', 'i, ii, iii');
check(
	'Add section splits at the lit page; its style numbers from there',
	JSON.stringify(await names()) === JSON.stringify(['Page 1, 1', 'Page 2, i', 'Page 3, ii']) &&
		(await page.$eval('.ppn-from input', (el) => el.value)) === '2',
	JSON.stringify(await names()),
);
await page.focus('.ppn-start input');
await page.keyboard.press('ArrowUp');
await sleep(50);
check(
	'Start at takes the arrow keys',
	JSON.stringify(await names()) === JSON.stringify(['Page 1, 1', 'Page 2, ii', 'Page 3, iii']),
	JSON.stringify(await names()),
);
await page.click('.ppn-strip .canon-page-strip-page');
await sleep(100);
check(
	'a page in the first section shows that section',
	(await checked('ppn-styles')) === '1, 2, 3' &&
		(await page.$eval('.ppn-from input', (el) => el.value)) === '1',
);
await page.click('.ppn-strip [data-page-index="2"] .canon-page-strip-page');
await sleep(100);
await page.click('.ppn-remove');
await sleep(100);
check(
	'Remove section drops the lit one; the last cannot go',
	JSON.stringify(await names()) === JSON.stringify(['Page 1, 1', 'Page 2, 2', 'Page 3, 3']) &&
		(await page.$eval('.ppn-remove', (el) => el.disabled)),
	JSON.stringify(await names()),
);

await page.click('.ppn-stamp-on');
await typeInto('.ppn-stamp-field', 'DRAFT');
check('a label stamp shows on the page', (await text('.ppn-mark--stamp')) === 'DRAFT' && !!(await radio('ppn-stamp-anchors', 'Top right')));
await pick('ppn-modes', 'Watermark');
check(
	'Watermark turns the stamp and shows Opacity in place of Position',
	(await page.$eval('.ppn-mark--stamp', (el) => el.style.transform)).includes('rotate(-45deg)') &&
		!!(await page.$('.ppn-opacity')) &&
		!(await page.$('.ppn-stamp-anchors')),
);

const sizeBefore = await page.$eval('.ppn-mark--number', (el) => el.style.fontSize);
await page.focus('.ppn-size .canon-slider');
await page.keyboard.press('ArrowRight');
check(
	'the size slider takes the arrow keys and the preview follows',
	(await page.$eval('.ppn-size .canon-slider', (el) => el.getAttribute('aria-valuenow'))) === '12' &&
		(await page.$eval('.ppn-mark--number', (el) => el.style.fontSize)) !== sizeBefore,
);

await page.click('.media-job-run');
await page.waitForSelector('.media-job-result', { timeout: 30000 });
check('Export PDF makes the result row', /-numbered\.pdf$/.test((await text('.media-job-result .canon-row-title')) ?? ''));
await page.click('.media-job-save');
const out = await waitForDownload(/numbered\.pdf$/);
check('the stamped PDF downloads', !!out, out?.name ?? 'no download');
if (out) {
	const doc = await PDFDocument.load(out.bytes);
	check('output keeps all 3 pages', doc.getPageCount() === 3, `${doc.getPageCount()} pages`);
	check('output grew (numbers + embedded font added)', out.bytes.length > srcSize, `${srcSize} -> ${out.bytes.length}`);
}
await pick('ppn-fonts', 'Serif');
check('a new setting drops the result', !(await page.$('.media-job-result')));

await page.evaluate((base64) => {
	const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
	const data = new DataTransfer();
	data.items.add(new File([bytes], 'pasted.pdf', { type: 'application/pdf' }));
	document
		.querySelector('.pdf-page-numberer .canon-split-main')
		.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
}, readFileSync(src).toString('base64'));
await page.waitForFunction(() => document.querySelector('.ppn-source .canon-row-title')?.textContent.trim() === 'pasted.pdf', {
	timeout: 10000,
}).catch(() => {});
check('a paste anywhere loads the PDF', (await text('.ppn-source .canon-row-title')) === 'pasted.pdf');

await page.evaluate((base64) => {
	const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
	const data = new DataTransfer();
	data.items.add(new File([bytes], 'dropped.pdf', { type: 'application/pdf' }));
	document
		.querySelector('.pdf-page-numberer .canon-split-sidebar')
		.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
}, readFileSync(src).toString('base64'));
await page.waitForFunction(() => document.querySelector('.ppn-source .canon-row-title')?.textContent.trim() === 'dropped.pdf', {
	timeout: 10000,
}).catch(() => {});
check('a drop anywhere loads the PDF', (await text('.ppn-source .canon-row-title')) === 'dropped.pdf');

await page.evaluate(() =>
	[...document.querySelectorAll('.ppn-source button')].find((b) => b.textContent.trim() === 'Clear').click(),
);
await sleep(200);
check('Clear returns to the slot and the blank page', !!(await page.$('.ppn-slot')) && !!(await page.$('.ppn-page--blank')));

await visit(page, '/tools/pdf-page-numberer?ppnSample=4&ppnSections=2:roman-lower,4:arabic:5&ppnStamp=COPY');
await page.waitForFunction(() => document.querySelectorAll('.ppn-strip .canon-page-strip-page').length === 4, {
	timeout: 15000,
}).catch(() => {});
check(
	'?ppnSample ?ppnSections ?ppnStamp set up a state',
	JSON.stringify(await names()) === JSON.stringify(['Page 1', 'Page 2, i', 'Page 3, ii', 'Page 4, 5']) &&
		(await text('.ppn-mark--stamp')) === 'COPY',
	JSON.stringify(await names()),
);

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/pdf-page-numberer');
check(
	'phone: nothing scrolls sideways',
	await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
);

await finish(browser);
