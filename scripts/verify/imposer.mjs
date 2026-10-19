// BASE_URL overrides port

import { mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PDFDocument } from 'pdf-lib';
import { launch, visit, check, finish, sleep, pickPaper } from './harness.mjs';

const source = await PDFDocument.create();
for (let n = 0; n < 4; n++) source.addPage([595.28, 841.89]);
const bytes = await source.save();
const dir = mkdtempSync(join(tmpdir(), 'dt-imposer-'));
const fixture = join(dir, 'four.pdf');
writeFileSync(fixture, bytes);
const downloads = mkdtempSync(join(tmpdir(), 'dt-imposer-dl-'));

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

const { browser, page } = await launch();
const client = await page.createCDPSession();
await client.send('Browser.setDownloadBehavior', {
	behavior: 'allow',
	downloadPath: downloads,
});

const state = () =>
	page.evaluate(() => ({
		legend: document.querySelector('.imp-legend')?.textContent.trim(),
		detail: document.querySelector('.imp-detail')?.textContent.trim(),
		sides: document.querySelectorAll('.imp-strip .canon-page-strip-page').length,
		lit: [...document.querySelectorAll('.imp-strip .canon-page-strip-page')].findIndex(
			(el) => el.getAttribute('aria-current') === 'true',
		),
		back: !!document.querySelector('.imp-faces--back'),
		axis: document.querySelector('.imp-faces')?.classList.contains('imp-faces--x') ? 'x' : 'y',
		pager: document.querySelector('.media-pager-text')?.textContent.trim(),
		block: document.querySelector('.imp-block')?.getAttribute('aria-label') ?? null,
		litSignature: document.querySelector('.imp-block-signature--lit')?.getAttribute('aria-label') ?? null,
		glued: !!document.querySelector('.imp-block-glue'),
		signaturePages: document.querySelector('.imp-signature-pages input')?.value ?? null,
		tiles: document.querySelector('.imp-tiles')?.textContent.replace(/\s+/g, ' ').trim(),
		run: document.querySelector('.media-job-run')?.disabled,
		slot: document.querySelector('.imp-slot')?.textContent.trim() ?? null,
		source: document.querySelector('.imp-source .canon-row-title')?.textContent.trim() ?? null,
		pages: document.querySelector('.imp-pages input')?.value,
	}));

const pick = (selector, text) =>
	page.evaluate(
		(s, t) => {
			const cell = [...document.querySelectorAll(`${s} [role="radio"]`)].find(
				(el) => el.textContent.trim() === t,
			);
			cell?.click();
			return !!cell;
		},
		selector,
		text,
	);

// strip redraw: 0.12 s debounce
const settle = () => sleep(400);

await visit(page, '/tools/imposer');
await settle();

check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.imposer').getBoundingClientRect().height,
	),
);

let s = await state();
check(
	'empty: the Source row is the slot, 12 blank pages, export off',
	s.slot === 'Drop PDF here' && !!(await page.$('.media-slot-files')) && s.pages === '12' && s.run === true,
	JSON.stringify(s),
);
check(
	'empty: the sheet and strip draw the 12-page saddle stitch',
	s.legend === 'Sheet 1 — Front' && s.detail === '12 pages' && s.sides === 6 && s.lit === 0 && s.block === '1–12',
	JSON.stringify(s),
);
check(
	'empty: tiles give sheet and cell sizes',
	s.tiles === 'Sheet 297 × 210 mm Cell 142.5 × 200 mm',
	s.tiles,
);

await page.click('.imp-pages .canon-stepper-plus');
await settle();
s = await state();
check('Pages + takes 16 pages, 8 sides', s.pages === '16' && s.sides === 8 && s.pager === '1 / 4', JSON.stringify(s));

await page.click('.imp-paper-press');
await sleep(100);
s = await state();
check('a click on the sheet turns it over', s.back && s.legend === 'Sheet 1 — Back' && s.lit === 1, JSON.stringify(s));

await page.evaluate(() => document.activeElement?.blur());
await page.keyboard.press('ArrowRight');
await sleep(100);
s = await state();
check('ArrowRight goes to the next sheet, front up', s.legend === 'Sheet 2 — Front' && s.pager === '2 / 4', JSON.stringify(s));
await page.keyboard.press('Space');
await sleep(100);
check('Space turns it', (await state()).legend === 'Sheet 2 — Back');

await page.click('.imp-strip .canon-page-strip-page:nth-of-type(1)');
const strip = await page.$$('.imp-strip .canon-page-strip-page');
await strip[5].click();
await sleep(100);
s = await state();
check('a strip side shows that sheet and side', s.legend === 'Sheet 3 — Back' && s.lit === 5, JSON.stringify(s));

await page.click('.media-pager-back');
await sleep(100);
check('the pager steps back to the front of the sheet before', (await state()).legend === 'Sheet 2 — Front');

const focusedSlider = await page.$('.imp-margin [role="slider"]');
await focusedSlider.focus();
await page.keyboard.press('ArrowRight');
await settle();
s = await state();
check(
	'arrow keys on a slider move the slider, not the sheet',
	s.legend === 'Sheet 2 — Front' && (await page.$eval('.imp-margin', (el) => el.textContent.includes('6 mm'))),
	JSON.stringify(s),
);

check('saddle stitch has creep', !!(await page.$('.imp-creep [role="slider"]')));
check('saddle stitch: no pages per signature, no glue', (await state()).signaturePages === null && !(await state()).glued);

await pick('.imp-layouts', '2-up Perfect Bind');
await settle();
s = await state();
check(
	'perfect bind: 16 pages per signature, one glued signature of 4 sheets, creep',
	s.signaturePages === '16' && s.block === '1–16' && s.glued && s.sides === 8 && !!(await page.$('.imp-creep')) && !!(await page.$('.imp-duplex')),
	JSON.stringify(s),
);
await page.click('.imp-signature-pages .canon-stepper-minus');
await settle();
s = await state();
check(
	'12 pages per signature: blanks fill the second signature',
	s.signaturePages === '12' && s.block === '1–12, 13–24' && s.detail === '16 pages · 8 blanks added' && s.sides === 12,
	JSON.stringify(s),
);
await page.click('.imp-signature-pages .canon-stepper-minus');
await settle();
s = await state();
check('8 pages per signature: two signatures of two sheets', s.block === '1–8, 9–16' && s.sides === 8 && s.litSignature === '1–8', JSON.stringify(s));
await page.click('.imp-block-signature:nth-of-type(2)');
await sleep(100);
s = await state();
check('a signature click goes to its first sheet', s.legend === 'Sheet 3 — Front' && s.litSignature === '9–16', JSON.stringify(s));
check('perfect bind long edge on landscape turns top over bottom', s.axis === 'x', JSON.stringify(s));
await pick('.imp-duplex', 'Short edge');
await sleep(100);
check('short edge on landscape turns like a book page', (await state()).axis === 'y');
await pick('.imp-duplex', 'Long edge');
await pick('.imp-layouts', '2-up Saddle Stitch');
await settle();
await pick('.imp-layouts', '4-up Booklet');
await settle();
s = await state();
check(
	'4-up booklet: 2 sheets of 8, duplex shown, no signature block, no creep',
	s.sides === 4 && s.block === null && !!(await page.$('.imp-duplex')) && !(await page.$('.imp-creep')),
	JSON.stringify(s),
);
check('4-up long edge on landscape turns top over bottom', (await state()).axis === 'x');
await pick('.imp-duplex', 'Short edge');
await page.click('.imp-paper-press');
await sleep(100);
check('4-up short edge on landscape turns like a book page', (await state()).axis === 'y');
await pick('.imp-orientation', 'Portrait');
await sleep(100);
check('4-up short edge on portrait turns top over bottom', (await state()).axis === 'x');
await pick('.imp-orientation', 'Landscape');

await pick('.imp-layouts', 'N-up Gang Run');
await settle();
check('gang run shows copies per sheet', !!(await page.$('.imp-copies')) && !(await page.$('.imp-duplex')));
await pick('.imp-copies', '9');
await settle();
check('9 copies: one sheet per page', (await state()).sides === 32);

await pick('.imp-layouts', 'Custom N-up');
await settle();
check('custom n-up shows rows and columns', !!(await page.$('.imp-rows')) && !!(await page.$('.imp-columns')));
await page.click('.imp-rows .canon-stepper-plus');
await settle();
check('3 × 2 grid: 16 pages on 2 sheets', (await state()).sides === 4);

await pick('.imp-layouts', '2-up Saddle Stitch');
await pick('.imp-orientation', 'Portrait');
await settle();
check('portrait sheet', (await state()).tiles.startsWith('Sheet 210 × 297 mm'));

await page.click('.imp-paper-menu');
await sleep(300);
const popover = await page.evaluate(() => {
	const trigger = document.querySelector('.imp-paper-menu');
	const panel = document.querySelector('.paper-popover');
	return {
		open: panel.matches(':popover-open'),
		role: panel.getAttribute('role'),
		name: panel.getAttribute('aria-label'),
		expanded: trigger.getAttribute('aria-expanded'),
		haspopup: trigger.getAttribute('aria-haspopup'),
		findFocused: document.activeElement?.classList.contains('paper-find'),
		ticked: [...panel.querySelectorAll('.paper-popover-list .paper-cell[aria-current="true"] .paper-cell-name')].map((el) => el.textContent.trim()),
		custom: [...panel.querySelectorAll('.paper-popover-custom input')].map((el) => el.value),
	};
});
check(
	'the paper cell opens a named dialog popover, find focused, A4 ticked, custom starts at A4',
	popover.open && popover.role === 'dialog' && popover.name === 'Paper' && popover.expanded === 'true' && popover.haspopup === 'dialog' && popover.findFocused && popover.ticked.join() === 'A4' && popover.custom.join() === '210,297',
	JSON.stringify(popover),
);
await page.keyboard.type('a3');
await sleep(200);
check(
	'find narrows the sizes by name',
	await page.evaluate(() => [...document.querySelectorAll('.paper-popover-list .paper-cell-name')].some((el) => el.textContent.trim() === 'A3') && !document.querySelector('.paper-popover-list .paper-cell-name')?.textContent.startsWith('B')),
);
await page.keyboard.press('Escape');
await sleep(200);
check(
	'Escape closes it and focus goes back to the paper cell',
	await page.evaluate(() => !document.querySelector('.paper-popover:popover-open') && document.activeElement?.classList.contains('imp-paper-menu')),
);
await page.click('.imp-paper-menu');
await sleep(300);
const setField = async (selector, value) => {
	await page.$eval(selector, (el) => {
		el.focus();
		el.select();
	});
	await page.keyboard.type(value);
	await page.keyboard.press('Enter');
};
await setField('.paper-popover-width input', '320');
await setField('.paper-popover-height input', '450');
await page.click('.paper-popover-use');
await settle();
check(
	'Custom: width and height in mm, Use closes the popover',
	!(await page.$('.paper-popover:popover-open')) &&
		(await state()).tiles.startsWith('Sheet 320 × 450 mm') &&
		(await page.$eval('.imp-paper-menu .canon-menu-cell-title', (el) => el.textContent.trim())) === 'Custom · 320 × 450 mm',
	(await state()).tiles,
);
check('A3 paper', (await pickPaper(page, '.imp-paper-menu', 'A3')) && (await state()).tiles.startsWith('Sheet 297 × 420 mm'));
check(
	'scaling reads Fit, Fill, Actual size',
	(await page.$$eval('.imp-scaling [role="radio"]', (els) => els.map((el) => el.textContent.trim()).join())) === 'Fit,Fill,Actual size',
);

await page.click('.imp-guide-toggle');
check(
	'the print guide lists one step per sheet',
	(await page.$$('.imp-guide-steps li')).length === 4 &&
		(await page.$eval('.imp-guide-toggle', (el) => el.getAttribute('aria-expanded'))) === 'true',
);

await page.evaluate(async (data) => {
	const file = new File([new Uint8Array(data)], 'dropped.pdf', { type: 'application/pdf' });
	const transfer = new DataTransfer();
	transfer.items.add(file);
	const target = document.querySelector('.imp-sheet');
	target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: transfer }));
	target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
}, [...bytes]);
await page.waitForFunction(() => document.querySelector('.imp-source')?.textContent.includes('dropped.pdf') && document.querySelector('.imp-pages input')?.value === '4', { timeout: 15000 }).catch(() => {});
s = await state();
check('a drop anywhere loads the PDF', s.source === 'dropped.pdf' && s.pages === '4' && s.run === false, JSON.stringify(s));

await page.click('.imp-source button');
await sleep(200);
check('Clear brings the slot back with the blank pages', (await state()).slot === 'Drop PDF here');

await page.evaluate(async (data) => {
	const file = new File([new Uint8Array(data)], 'pasted.pdf', { type: 'application/pdf' });
	const transfer = new DataTransfer();
	transfer.items.add(file);
	document.querySelector('.imposer').dispatchEvent(
		new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }),
	);
}, [...bytes]);
await page.waitForFunction(() => document.querySelector('.imp-source')?.textContent.includes('pasted.pdf'), { timeout: 15000 }).catch(() => {});
check('a paste loads the PDF', (await state()).source === 'pasted.pdf');
await page.click('.imp-source button');
await sleep(200);

const [chooser] = await Promise.all([
	page.waitForFileChooser({ timeout: 5000 }),
	page.click('.media-slot-files'),
]);
await chooser.accept([fixture]);
await page.waitForFunction(() => !!document.querySelector('.imp-source'), { timeout: 15000 }).catch(() => {});
await sleep(1500);
s = await state();
check('the Files cell opens the picker; 4 pages on one sheet', s.source === 'four.pdf' && s.sides === 2 && s.detail === '4 pages', JSON.stringify(s));
await page.click('.imp-paper-menu');
await sleep(300);
check(
	'the paper popover offers the size the PDF was set on',
	await page.$eval('.paper-popover-extra', (el) => el.textContent.trim() === 'Infer (A4 (210 × 297 mm))'),
);
await page.keyboard.press('Escape');
await sleep(200);

await page.click('.media-job-run');
await page.waitForSelector('.media-job-save', { timeout: 30000 }).catch(() => {});
const detail = await page.$eval('.media-job-result', (el) => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');
check('Export PDF makes the imposed file', /imposed-saddle-stitch-a3\.pdf 2 pages · /.test(detail), detail);
await page.click('.media-job-save');
const saved = await waitForDownload(/^imposed-saddle-stitch-a3\.pdf$/);
let pages = 0;
if (saved) pages = (await PDFDocument.load(saved.bytes)).getPageCount();
check('Download saves it: front and back of one A3 sheet', pages === 2, saved?.name ?? 'no download');

await page.click('.imp-marks [role="switch"]');
await sleep(100);
check('a setting change drops the export', !(await page.$('.media-job-result')));

await pick('.imp-layouts', '2-up Perfect Bind');
await settle();
check('perfect bind, 4 pages, 8 per signature: one signature, blanks added', (await state()).block === '1–8' && (await state()).detail === '4 pages · 4 blanks added');
await page.click('.media-job-run');
await page.waitForSelector('.media-job-save', { timeout: 30000 }).catch(() => {});
const bound = await page.$eval('.media-job-result', (el) => el.textContent.replace(/\s+/g, ' ').trim()).catch(() => '');
check('perfect bind exports both sheets of the signature', /imposed-perfect-bind-a3\.pdf 4 pages · /.test(bound), bound);

await visit(page, '/tools/imposer?impLayout=1&impSignature=8&impPages=38');
await settle();
s = await state();
check(
	'?impSignature=8 with 38 pages: five signatures',
	s.signaturePages === '8' && s.block === '1–8, 9–16, 17–24, 25–32, 33–40' && s.detail === '38 pages · 2 blanks added',
	JSON.stringify(s),
);

await page.setViewport({ width: 390, height: 844 });
await sleep(500);
check(
	'390 px: no sideways scroll',
	await page.evaluate(() => document.querySelector('.dt-main').scrollWidth <= document.querySelector('.dt-main').clientWidth),
);
await page.$eval('.imp-paper-menu', (el) => el.scrollIntoView({ block: 'center' }));
await page.click('.imp-paper-menu');
await sleep(300);
check(
	'390 px: the paper popover fits the width',
	await page.$eval('.paper-popover', (el) => {
		const box = el.getBoundingClientRect();
		return el.matches(':popover-open') && box.left >= 0 && box.right <= innerWidth && box.top >= 0 && box.bottom <= innerHeight;
	}),
);
await page.keyboard.press('Escape');
check(
	'390 px: the sheet comes before the settings',
	await page.evaluate(
		() =>
			document.querySelector('.imp-sheet').getBoundingClientRect().top <
			document.querySelector('.imp-layouts').getBoundingClientRect().top,
	),
);

await finish(browser);
