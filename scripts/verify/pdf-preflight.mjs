import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import { launch, visit, check, finish, sleep } from './harness.mjs';

const dir = mkdtempSync(join(tmpdir(), 'dt-pf-'));
const doc = await PDFDocument.create();
const font = await doc.embedFont(StandardFonts.Helvetica);
for (const [n, size] of [
	[595, 842],
	[595, 842],
	[842, 595],
].entries()) {
	const page = doc.addPage(size);
	page.drawText(`Page ${n + 1}`, { x: 40, y: 40, size: 36, font });
	if (n === 0) {
		page.setBleedBox(0, 0, ...size);
		page.setTrimBox(9, 9, size[0] - 18, size[1] - 18);
	}
}
const fixture = join(dir, 'three.pdf');
writeFileSync(fixture, await doc.save());
const text = join(dir, 'notes.txt');
writeFileSync(text, 'not a pdf');

const values = (selector) =>
	page.$$eval(`${selector} .canon-tiles-value`, (els) =>
		els.map((el) => el.textContent.trim()),
	);
const waitLoaded = () =>
	page
		.waitForFunction(
			() =>
				document.querySelectorAll('.pf-strip .canon-page-strip-picture').length === 3 &&
				!document.querySelector('.pf-busy'),
			{ timeout: 30000 },
		)
		.catch(() => {});

const { browser, page } = await launch();
await visit(page, '/tools/pdf-preflight');

check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.pdf-preflight').getBoundingClientRect().height,
	),
);
const empty = await page.evaluate(() => {
	const strip = document.querySelector('.pf-strip--blank');
	return {
		blank: strip?.querySelectorAll('.canon-page-strip-paper').length,
		hidden: strip?.getAttribute('aria-hidden') === 'true',
		pictures: strip?.querySelectorAll('img').length,
		slot: document.querySelector('.pf-slot')?.textContent.trim(),
		files: !!document.querySelector('.media-slot-files'),
	};
});
check(
	'empty: blank hidden pages in the strip, the Source slot with a Files cell',
	empty.blank > 3 && empty.hidden && empty.pictures === 0 && empty.slot === 'Drop PDF here' && empty.files,
	JSON.stringify(empty),
);
const dashes = [
	...(await values('.pf-result')),
	...(await values('.pf-checks')),
	...(await values('.pf-properties')),
];
check(
	'empty: result, checks and properties tiles each read a dash',
	dashes.length === 4 + 6 + 5 && dashes.every((v) => v === '—'),
	dashes.join(' '),
);
const emptyTop = await page.$eval('.pf-checks', (el) => el.getBoundingClientRect().top);

const choose = async (file) => {
	const [chooser] = await Promise.all([
		page.waitForFileChooser({ timeout: 5000 }),
		page.click('.media-slot-files'),
	]);
	await chooser.accept([file]);
};

await choose(text);
await sleep(300);
check(
	'a file that is not a PDF shows the web error and keeps the slot',
	(await page.$eval('.pf-error', (el) => el.textContent.trim()).catch(() => '')) ===
		'Please upload a PDF file.' && !!(await page.$('.pf-slot')),
);

await choose(fixture);
await waitLoaded();
const loaded = await page.evaluate(() => ({
	name: document.querySelector('.pf-source .canon-row-title')?.textContent.trim(),
	detail: document.querySelector('.pf-source .canon-row-detail')?.textContent.trim(),
	error: !!document.querySelector('.pf-error'),
	groups: [...document.querySelectorAll('.pf-group')].map((g) => g.dataset.category),
}));
check(
	'Files loads the PDF; the row names it with pages, size and version',
	loaded.name === 'three.pdf' && /^3 pages · .+ · PDF \d\.\d$/.test(loaded.detail ?? '') && !loaded.error,
	JSON.stringify(loaded),
);
const results = await values('.pf-result');
check('result tiles fill in', results[0] === '✓ Pass' && results.slice(1).every((v) => /^\d+$/.test(v)), results.join(' '));
const checks = await values('.pf-checks');
check('every check has a result', checks.length === 6 && !checks.includes('—'), checks.join(' '));
check(
	'the layout above the issues does not move on load',
	(await page.$eval('.pf-checks', (el) => el.getBoundingClientRect().top)) === emptyTop,
);
check('findings are grouped by category', loaded.groups.includes('geometry'), loaded.groups.join(','));
check(
	'the strip captions pages with warnings',
	(await page.$$eval('.pf-strip .canon-page-strip-name', (els) => els.map((e) => e.textContent.trim()))).some((t) =>
		t.startsWith('!'),
	),
);

const pageTags = () => page.$$eval('.pf-issue-page', (els) => els.map((e) => e.textContent.trim()));
await page.click('.pf-strip [data-page-index="1"] .canon-page-strip-page');
await page.waitForSelector('.pf-picture', { timeout: 10000 }).catch(() => {});
check(
	'a strip page opens the Page section with its preview',
	(await page.$eval('.pf-page-row .canon-row-title', (el) => el.textContent.trim()).catch(() => '')) === 'Page 2' &&
		!!(await page.$('.pf-picture[src^="blob:"]')),
);
check('and filters the findings to that page', (await pageTags()).every((t) => t === 'p.2'), (await pageTags()).join(','));

await page.evaluate(() =>
	[...document.querySelectorAll('.pf-page-row button')].find((b) => b.textContent.trim() === 'All pages').click(),
);
await sleep(200);
check('All pages closes the section', !(await page.$('.pf-page')));

await page.click('.pf-strip [data-page-index="0"] .canon-page-strip-page');
await page.waitForFunction(() => document.querySelectorAll('.pf-box').length > 0, { timeout: 10000 }).catch(() => {});
check(
	'the preview draws the trim and bleed boxes',
	(await page.$$eval('.pf-box', (els) => els.map((e) => e.classList[1]))).join() === 'pf-box--trim,pf-box--bleed',
);
await page.click('.pf-strip [data-page-index="0"] .canon-page-strip-page');
await sleep(200);

const target = await page.$$eval('.pf-issue', (els) => els.findIndex((el) => /p\.3/.test(el.textContent)));
if (target >= 0) {
	await page.$$eval('.pf-issue', (els, i) => els[i].focus(), target);
	await page.keyboard.press('Enter');
	await sleep(200);
}
check(
	'a finding with a page selects it from the keyboard',
	target >= 0 &&
		(await page.$eval('.pf-page-row .canon-row-title', (el) => el.textContent.trim()).catch(() => '')) === 'Page 3',
);

await page.evaluate((base64) => {
	const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
	const data = new DataTransfer();
	data.items.add(new File([bytes], 'pasted.pdf', { type: 'application/pdf' }));
	document
		.querySelector('.pdf-preflight .canon-split-main')
		.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
}, readFileSync(fixture).toString('base64'));
await page
	.waitForFunction(() => document.querySelector('.pf-source .canon-row-title')?.textContent.trim() === 'pasted.pdf', {
		timeout: 10000,
	})
	.catch(() => {});
check(
	'a paste anywhere loads the PDF and resets the page',
	(await page.$eval('.pf-source .canon-row-title', (el) => el.textContent.trim())) === 'pasted.pdf' &&
		!(await page.$('.pf-page')),
);
await waitLoaded();

await page.evaluate(() =>
	[...document.querySelectorAll('.pf-source button')].find((b) => b.textContent.trim() === 'Clear').click(),
);
await sleep(200);
check(
	'Clear returns to the empty state',
	!!(await page.$('.pf-slot')) && !!(await page.$('.pf-strip--blank')) && (await values('.pf-result')).every((v) => v === '—'),
);

await visit(page, '/tools/pdf-preflight?pfSample&pfPage=1');
await waitLoaded();
check(
	'?pfSample&pfPage=1 loads the sample on page 2',
	(await page.$eval('.pf-page-row .canon-row-title', (el) => el.textContent.trim()).catch(() => '')) === 'Page 2',
);

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/pdf-preflight?pfSample');
await waitLoaded();
check(
	'phone: nothing scrolls sideways',
	await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
);

await finish(browser);
