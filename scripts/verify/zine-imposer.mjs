// npm start first; BASE_URL=http://localhost:<port> for another server

import { mkdtempSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PDFDocument } from 'pdf-lib';
import { launch, visit, check, finish, sleep } from './harness.mjs';

const downloads = mkdtempSync(join(tmpdir(), 'dt-zine-dl-'));

async function waitForDownload(match, timeout = 30000) {
	const until = Date.now() + timeout;
	while (Date.now() < until) {
		const name = readdirSync(downloads).find(
			(n) => match.test(n) && !n.endsWith('.crdownload'),
		);
		if (name && statSync(join(downloads, name)).size > 0)
			return { name, bytes: readFileSync(join(downloads, name)) };
		await sleep(250);
	}
	return null;
}

const twoPages = await PDFDocument.create();
twoPages.addPage([300, 400]);
twoPages.addPage([300, 400]);
const pdfBase64 = Buffer.from(await twoPages.save()).toString('base64');

// drawn pngs and the pdf, built in the page, handed to a target
const rig = `
window.__zi = {
	async png(n) {
		const c = document.createElement('canvas');
		c.width = 120; c.height = 160;
		const x = c.getContext('2d');
		x.fillStyle = 'hsl(' + n * 40 + ' 60% 50%)';
		x.fillRect(0, 0, 120, 160);
		const blob = await new Promise((r) => c.toBlob(r, 'image/png'));
		return new File([blob], 'img-' + n + '.png', { type: 'image/png' });
	},
	pdf(b64) {
		const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
		return new File([bytes], 'two.pdf', { type: 'application/pdf' });
	},
	transfer(files) {
		const t = new DataTransfer();
		for (const f of files) t.items.add(f);
		return t;
	},
	async upload(selector, files) {
		const input = document.querySelector(selector);
		input.files = this.transfer(files).files;
		input.dispatchEvent(new Event('change', { bubbles: true }));
	},
};`;

const state = (page) =>
	page.evaluate(() => ({
		count: document.querySelector('.zi-count .canon-row-title')?.textContent?.trim(),
		strip: document.querySelectorAll('.zi-strip .canon-page-strip-cell').length,
		stripPictures: document.querySelectorAll('.zi-strip .canon-page-strip-picture').length,
		cells: document.querySelectorAll('.zi-face:not(.zi-face--back) .zi-cell').length,
		pictures: document.querySelectorAll('.zi-face .zi-picture').length,
		numbers: document.querySelectorAll('.zi-number').length,
		creases: document.querySelectorAll('.zi-face:not(.zi-face--back) .zi-crease').length,
		cuts: document.querySelectorAll('.zi-face:not(.zi-face--back) .zi-cut').length,
		exportOff: document.querySelector('.media-job-run')?.disabled,
		lit: document.querySelector('.zi-page .canon-row-title')?.textContent?.trim(),
		tiles: [...document.querySelectorAll('.canon-tiles-value')].map((t) => t.textContent.trim()),
	}));

const { browser, page } = await launch();
const client = await page.createCDPSession();
await client.send('Browser.setDownloadBehavior', {
	behavior: 'allow',
	downloadPath: downloads,
});
await page.evaluateOnNewDocument(rig);

await visit(page, '/tools/zine-imposer');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.zine-imposer').getBoundingClientRect().height,
	),
);

let s = await state(page);
check(
	'empty: eight blank strip pages and a blank sheet with creases and the cut',
	s.strip === 8 && s.stripPictures === 0 && s.cells === 8 && s.pictures === 0 && s.numbers === 0 && s.creases === 4 && s.cuts === 1,
	JSON.stringify(s),
);
check(
	'empty: Pages heading, drop row, 0/8 filled, Export off, tiles set',
	s.count === '0/8 filled' &&
		s.exportOff === true &&
		s.tiles[0] === '297 × 210 mm' &&
		(await page.$('.zi-slot')) !== null,
	`${s.count}, export off ${s.exportOff}, ${s.tiles.join(' / ')}`,
);

const sheetBefore = await page.evaluate(() => document.querySelector('.zi-sheet').getBoundingClientRect().height);

await page.evaluate(async () => {
	const files = await Promise.all([1, 2, 3].map((n) => window.__zi.png(n)));
	await window.__zi.upload('.zi-bulk', files);
});
await sleep(800);
s = await state(page);
check(
	'bulk input fills the first empty slots, Export on',
	s.count === '3/8 filled' && s.pictures === 3 && s.stripPictures === 3 && s.exportOff === false,
	JSON.stringify(s),
);
check(
	'empty slots show their page number once a picture is in',
	s.numbers === 5,
	`${s.numbers} numbers`,
);
check(
	'the sheet keeps its height when pictures load',
	sheetBefore === (await page.evaluate(() => document.querySelector('.zi-sheet').getBoundingClientRect().height)),
);

await page.evaluate(async (b64) => {
	await window.__zi.upload('.zi-bulk', [window.__zi.pdf(b64)]);
}, pdfBase64);
await sleep(2500);
s = await state(page);
check('a PDF places one page per slot', s.count === '5/8 filled', s.count);

// drop on page 8 of the sheet (bottom row, third column)
await page.evaluate(async () => {
	const paper = document.querySelector('.zi-face .zi-paper');
	const box = paper.getBoundingClientRect();
	const transfer = window.__zi.transfer([await window.__zi.png(8)]);
	const at = { clientX: box.left + box.width * 0.6, clientY: box.top + box.height * 0.75, bubbles: true, cancelable: true, dataTransfer: transfer };
	const face = paper.closest('.zi-face');
	face.dispatchEvent(new DragEvent('dragover', at));
	face.dispatchEvent(new DragEvent('drop', at));
});
await sleep(800);
s = await state(page);
const eighth = await page.evaluate(() =>
	document.querySelectorAll('.zi-strip .canon-page-strip-cell')[7]?.querySelector('img') !== null,
);
check('a drop on a sheet panel places the file on that page and lights it', eighth && s.count === '6/8 filled' && s.lit === 'Page 8', `${s.count}, ${s.lit}`);

// paste fills from the lit page, wrapping
await page.evaluate(async () => {
	const transfer = window.__zi.transfer([await window.__zi.png(9)]);
	document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true, cancelable: true }));
});
await sleep(800);
s = await state(page);
check('paste fills an empty slot', s.count === '7/8 filled', s.count);

// select, fit, remove
await page.click('.zi-strip .canon-page-strip-cell:nth-child(2) .canon-page-strip-page');
await sleep(200);
s = await state(page);
check('a strip page lights and gets the page row', s.lit === 'Page 2', s.lit);
const fills = () =>
	page.evaluate(() => {
		const cell = [...document.querySelectorAll('.zi-face .zi-cell')].find((c) => c.querySelector('.zi-tag')?.textContent.trim() === '2');
		return cell?.querySelector('.zi-picture')?.classList.contains('zi-picture--fills');
	});
const before = await fills();
await page.click('.zi-page-fit');
await sleep(200);
check('Fit and Fill switch the panel', before === true && (await fills()) === false);
await page.click('.zi-page-remove');
await sleep(200);
s = await state(page);
check('Remove empties the page', s.count === '6/8 filled', s.count);

// keyboard reorder moves page 1 to 2
const firstSrc = () =>
	page.evaluate((i) => document.querySelectorAll('.zi-strip .canon-page-strip-cell')[i]?.querySelector('img')?.src ?? null, 0);
const src1 = await firstSrc();
await page.focus('.zi-strip .canon-page-strip-cell:nth-child(1) .canon-page-strip-page');
await page.keyboard.down('Alt');
await page.keyboard.press('ArrowRight');
await page.keyboard.up('Alt');
await sleep(300);
const moved = await page.evaluate(() => document.querySelectorAll('.zi-strip .canon-page-strip-cell')[1]?.querySelector('img')?.src ?? null);
check('Alt+ArrowRight moves a page along the strip', src1 !== null && moved === src1);

// export
await page.click('.media-job-run');
await page.waitForSelector('.media-job-save', { timeout: 30000 }).catch(() => null);
await page.click('.media-job-save');
const plain = await waitForDownload(/^zine-mini-8-a4\.pdf$/);
check('Export PDF writes the zine', !!plain, plain?.name ?? 'no file');
if (plain) {
	const doc = await PDFDocument.load(plain.bytes);
	const size = doc.getPage(0).getSize();
	check('one A4 landscape side', doc.getPageCount() === 1 && Math.round(size.width) === 842 && Math.round(size.height) === 595, `${doc.getPageCount()} pages, ${size.width} x ${size.height}`);
}
await page.click('#zine-bleed');
await sleep(200);
check('a setting change drops the result', (await page.$('.media-job-save')) === null);

// accordion, double-sided
await page.evaluate(() => [...document.querySelectorAll('.zi-folds button')].find((b) => b.textContent.includes('Accordion'))?.click());
await sleep(200);
await page.evaluate(() => [...document.querySelectorAll('.zi-panels button')].find((b) => b.textContent.trim() === '4')?.click());
await sleep(200);
await page.click('#zine-double-sided');
await sleep(300);
s = await state(page);
check('accordion 4 panels, double-sided: 8 slots over two sides', s.strip === 8 && s.cells === 4 && (await page.$$('.zi-face')).length === 2, JSON.stringify(s));
const turner = 'button.zi-turner';
check('the duplex sheet is a button', (await page.$(turner)) !== null);
await page.click(turner);
await sleep(100);
check('a press turns it to the back', await page.$eval(turner, (b) => b.classList.contains('zi-turner--back')));
check('the legend names the side', (await page.$eval('.zi-legend', (e) => e.textContent.trim())) === 'Back');

await page.click('.media-job-run');
await page.waitForSelector('.media-job-save', { timeout: 30000 }).catch(() => null);
await page.click('.media-job-save');
const duplex = await waitForDownload(/^zine-accordion-a4-duplex-bleed\.pdf$/);
check('a duplex bleed zine has two sides grown by 3mm', !!duplex, duplex?.name ?? 'no file');
if (duplex) {
	const doc = await PDFDocument.load(duplex.bytes);
	const size = doc.getPage(0).getSize();
	check('two pages, 6mm larger', doc.getPageCount() === 2 && Math.abs(size.width - (841.89 + 17.008)) < 1, `${doc.getPageCount()} pages, ${size.width.toFixed(1)}`);
}

// paper
await page.select('.zi-paper-menu select', await page.$eval('.zi-paper-menu select', (sel) => [...sel.options].find((o) => o.textContent.startsWith('A3'))?.value));
await sleep(200);
s = await state(page);
check('a paper pick changes the sheet tile', s.tiles[0] === '420 × 297 mm', s.tiles[0]);

// phone
await page.setViewport({ width: 390, height: 844 });
await sleep(400);
check(
	'390 wide: no horizontal scroll',
	await page.evaluate(() => {
		const main = document.querySelector('.dt-main');
		return main.scrollWidth <= main.clientWidth && document.documentElement.scrollWidth <= 390;
	}),
);

await finish(browser);
