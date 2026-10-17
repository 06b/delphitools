// the canon pdf-rotate-crop: blank layout, paste and drop, rotate, the crop
// rect by drag and keys, margins, paper, all pages, the pager, the export
// crop tolerance ±2pt

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
import { launch, visit, check, finish, sleep } from './harness.mjs';

const A4 = [595.28, 841.89];
const MM = 72 / 25.4;
const near = (a, b, tolerance = 2) => Math.abs(a - b) < tolerance;

const fixture = join(mkdtempSync(join(tmpdir(), 'dt-prc-')), 'three.pdf');
{
	const doc = await PDFDocument.create();
	const font = await doc.embedFont(StandardFonts.Helvetica);
	for (const n of [1, 2, 3]) {
		const page = doc.addPage(A4);
		page.drawText(`PAGE ${n}`, { x: 72, y: A4[1] - 72, font });
	}
	writeFileSync(fixture, await doc.save());
}
const fixtureBase64 = readFileSync(fixture).toString('base64');

const downloads = mkdtempSync(join(tmpdir(), 'dt-prc-dl-'));

// wait past .crdownload
async function waitForDownload(match, timeout = 30000) {
	const until = Date.now() + timeout;
	while (Date.now() < until) {
		const name = readdirSync(downloads).find(
			(n) => match.test(n) && !n.endsWith('.crdownload'),
		);
		if (name) {
			const file = join(downloads, name);
			if (statSync(file).size > 0)
				return { name, bytes: readFileSync(file) };
		}
		await sleep(250);
	}
	return null;
}

function clearDownloads() {
	for (const name of readdirSync(downloads)) rmSync(join(downloads, name));
}

const { browser, page } = await launch();
const client = await page.createCDPSession();
await client.send('Browser.setDownloadBehavior', {
	behavior: 'allow',
	downloadPath: downloads,
});

await visit(page, '/tools/pdf-rotate-crop');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.pdf-rotate-crop').getBoundingClientRect()
				.height,
	),
);

const state = () =>
	page.evaluate(() => {
		const q = (s) => document.querySelector(s);
		const crop = q('.prc-crop');
		return {
			strip: document.querySelectorAll('.canon-page-strip-cell').length,
			blankStrip: !!q('.prc-blank-strip-page'),
			blank: !!q('.prc-blank'),
			slot: q('.prc-slot')?.innerText.trim(),
			files: !!q('.media-slot-files'),
			title: q('.prc-source .canon-row-title')?.textContent.trim(),
			detail: q('.prc-source .canon-row-detail')?.textContent.trim(),
			rotateOff: [...document.querySelectorAll('.prc-rotate button')].every(
				(b) => b.disabled,
			),
			marginsOff: [...document.querySelectorAll('.prc-margin input')].every(
				(i) => i.disabled,
			),
			margins: [...document.querySelectorAll('.prc-margin input')].map(
				(i) => i.value,
			),
			paperOff: q('.prc-paper-menu select')?.disabled,
			paper: q('.prc-paper-menu .canon-menu-cell-title')?.textContent.trim(),
			allOff: q('.prc-crop-all').disabled,
			clearOff: q('.prc-crop-clear').disabled,
			exportOff: q('.media-job-run').disabled,
			pager: q('.prc-pager-text').textContent.trim(),
			backOff: q('.prc-pager-back').disabled,
			forwardOff: q('.prc-pager-forward').disabled,
			names: [...document.querySelectorAll('.canon-page-strip-page')].map(
				(b) => b.getAttribute('aria-label'),
			),
			value: crop?.getAttribute('aria-valuetext'),
			role: crop?.getAttribute('role'),
			cropName: crop?.getAttribute('aria-label'),
		};
	});

const layout = () =>
	page.evaluate(() => {
		const box = (s) => {
			const b = document.querySelector(s).getBoundingClientRect();
			return [Math.round(b.top), Math.round(b.height)];
		};
		return {
			band: box('.canon-split-banner .canon-canvas'),
			canvas: box('.prc-canvas'),
			rotate: box('.prc-rotate'),
		};
	});

let s = await state();
check(
	'empty: blank strip page and blank A4 picture, no text in them',
	s.blankStrip && s.blank && s.strip === 0,
	JSON.stringify({ blankStrip: s.blankStrip, blank: s.blank }),
);
check(
	'empty: Source holds the drop slot row with Files',
	s.slot === 'Drop PDF here' && s.files && !s.title,
	s.slot,
);
check(
	'empty: rotate, margins, paper, crop actions, Export and pager are off',
	s.rotateOff &&
		s.marginsOff &&
		s.paperOff &&
		s.allOff &&
		s.clearOff &&
		s.exportOff &&
		s.backOff &&
		s.forwardOff,
	JSON.stringify(s),
);
check(
	'empty: the pager reads a dash, margins 0, paper None',
	s.pager === '—' && s.margins.join() === '0,0,0,0' && s.paper === 'None',
	`${s.pager} ${s.margins} ${s.paper}`,
);
const before = await layout();

// paste on the settings pane loads
await page.evaluate(
	(b64, name) => {
		const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
		const data = new DataTransfer();
		data.items.add(new File([bytes], name, { type: 'application/pdf' }));
		document.querySelector('.prc-margins').dispatchEvent(
			new ClipboardEvent('paste', {
				clipboardData: data,
				bubbles: true,
				cancelable: true,
			}),
		);
	},
	fixtureBase64,
	'pasted.pdf',
);
const loaded = await page
	.waitForFunction(
		() =>
			document.querySelectorAll('.canon-page-strip-cell').length === 3 &&
			document.querySelector('.prc-image'),
		{ timeout: 30000 },
	)
	.then(() => true)
	.catch(() => false);
check('a paste anywhere loads three pages and the picture', loaded);
s = await state();
check(
	'the Source row names the file, counts pages and bytes',
	s.title === 'pasted.pdf' && /^3 pages · /.test(s.detail),
	`${s.title} ${s.detail}`,
);
const after = await layout();
check(
	'nothing moves when the file loads',
	JSON.stringify(before) === JSON.stringify(after),
	`${JSON.stringify(before)} → ${JSON.stringify(after)}`,
);
check(
	'loaded: pager 1 / 3, back off, forward on, Export on',
	s.pager === '1 / 3' && s.backOff && !s.forwardOff && !s.exportOff,
	s.pager,
);
check(
	'the crop is a named, focusable slider',
	s.role === 'slider' && s.cropName === 'Crop' && s.value === '210 × 297 mm, 0, 0',
	`${s.role} ${s.cropName} ${s.value}`,
);
check('whole page: Clear is off', s.clearOff);

// drop on the picture replaces the file
await page.evaluate((b64) => {
	const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
	const data = new DataTransfer();
	data.items.add(new File([bytes], 'three.pdf', { type: 'application/pdf' }));
	document.querySelector('.prc-picture').dispatchEvent(
		new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }),
	);
}, fixtureBase64);
const dropped = await page
	.waitForFunction(
		() =>
			document
				.querySelector('.prc-source .canon-row-title')
				?.textContent.trim() === 'three.pdf' &&
			document.querySelector('.prc-image'),
		{ timeout: 30000 },
	)
	.then(() => true)
	.catch(() => false);
check('a drop on the tool loads a file', dropped);
await sleep(300);

const rotateButton = (row, index) =>
	page.$$eval(
		`${row} button`,
		(els, i) => els[i].click(),
		index,
	);
const turns = () =>
	page.$$eval('.canon-page-strip-picture', (els) =>
		els.map((e) => /rotate\((\d+)deg\)/.exec(e.style.transform)?.[1]),
	);
await page.waitForFunction(
	() => document.querySelectorAll('.canon-page-strip-picture').length === 3,
	{ timeout: 15000 },
);
await rotateButton('.prc-rotate-page', 1);
await rotateButton('.prc-rotate-all', 0);
await sleep(300);
let t = await turns();
check(
	'This page turns page 1, All pages turns every page',
	t.join() === '0,270,270',
	t.join(),
);
const rotatedName = await page.$eval('.prc-rotate-page button', (b) =>
	b.getAttribute('aria-label'),
);
check('icon cells are named', rotatedName === 'Rotate left', rotatedName);

// drag the top-left corner in a quarter, then the bottom-right
await page.waitForSelector('.prc-image', { timeout: 10000 });
await sleep(400);
const frame = await page.$eval('.prc-image', (e) => {
	const b = e.getBoundingClientRect();
	return { x: b.left, y: b.top, w: b.width, h: b.height };
});
const dragFrom = async (fx, fy, tx, ty) => {
	await page.mouse.move(frame.x + frame.w * fx, frame.y + frame.h * fy);
	await page.mouse.down();
	await page.mouse.move(frame.x + frame.w * tx, frame.y + frame.h * ty, {
		steps: 8,
	});
	await page.mouse.up();
	await sleep(250);
};
await dragFrom(0, 0, 0.25, 0.25);
await dragFrom(1, 1, 0.75, 0.75);
s = await state();
check(
	'corner drags crop the page to the middle half',
	/^105 × 149 mm, 5[23], 74$/.test(s.value),
	s.value,
);
check(
	'the margins read the dragged crop',
	near(Number(s.margins[0]), 52.5, 0.3) && near(Number(s.margins[1]), 74.2, 0.3),
	s.margins.join(),
);
check(
	'the strip names page 1 Cropped, Clear turns on',
	s.names[0] === 'Page 1, Cropped' && s.names[1] === 'Page 2' && !s.clearOff,
	s.names.join('|'),
);

// a press inside a crop moves it
await dragFrom(0.5, 0.5, 0.55, 0.5);
s = await state();
const moved = /, (\d+), 74$/.exec(s.value)?.[1];
check('a drag inside moves the crop', Number(moved) > 60, s.value);

// keys: arrows move, Alt+arrow resizes
await page.focus('.prc-crop');
const keyed = s.value;
await page.keyboard.press('ArrowLeft');
await sleep(150);
const left = (await state()).value;
await page.keyboard.down('Alt');
await page.keyboard.press('ArrowDown');
await page.keyboard.up('Alt');
await sleep(150);
const taller = (await state()).value;
check(
	'ArrowLeft moves and Alt+ArrowDown grows the crop',
	left !== keyed &&
		/^105 × 149/.test(left) &&
		/^105 × 15[12]/.test(taller),
	`${keyed} → ${left} → ${taller}`,
);

// typed margins
const setMargin = async (edge, text) => {
	const input = await page.$(`.prc-margin--${edge} input`);
	await input.evaluate((e) => {
		e.focus();
		e.select();
	});
	await input.type(text);
	await page.keyboard.press('Enter');
	await sleep(250);
};
await setMargin('left', '20');
s = await state();
check(
	'a typed Left margin moves the left edge',
	s.margins[0] === '20' && /, 20, /.test(s.value),
	`${s.margins} ${s.value}`,
);
await setMargin('left', '300');
s = await state();
check(
	'an impossible margin is refused, the field shows the crop',
	s.margins[0] === '20',
	s.margins.join(),
);

// the pager and paper on page 2 (A4 turned 270: landscape)
await page.click('.prc-pager-forward');
await sleep(400);
s = await state();
check(
	'Next page moves the pager and the lit page',
	s.pager === '2 / 3' &&
		!s.backOff &&
		(await page.$eval('.canon-page-strip-cell--lit', (e) => e.dataset.pageIndex)) === '1',
	s.pager,
);
const a5 = await page.$eval('.prc-paper-menu select', (select) =>
	[...select.options].find((o) => o.textContent.trim().startsWith('A5 ')).value,
);
await page.select('.prc-paper-menu select', a5);
await sleep(300);
s = await state();
check(
	'A5 crops the landscape page to A5 turned, centred',
	s.paper.startsWith('A5') && s.value === '210 × 148 mm, 44, 31',
	`${s.paper} ${s.value}`,
);
await page.click('.prc-crop-all');
await sleep(300);
s = await state();
check(
	'All pages carries the paper to every page',
	s.names.every((n) => /Cropped$/.test(n)),
	s.names.join('|'),
);
await setMargin('top', '40');
s = await state();
check('a margin edit drops the paper', s.paper === 'None', s.paper);

await page.click('.prc-pager-back');
await sleep(300);
await page.click('.prc-crop-clear');
await sleep(300);
s = await state();
check(
	'Clear drops the crop from the current page only',
	s.names[0] === 'Page 1' && /Cropped$/.test(s.names[1]),
	s.names.join('|'),
);

// export
clearDownloads();
await page.click('.media-job-run');
await page.waitForSelector('.media-job-save', { timeout: 15000 });
const resultName = await page.$eval('.media-job-result .canon-row-title', (e) =>
	e.textContent.trim(),
);
check('Export shows the result row', resultName === 'three-rotate-crop.pdf', resultName);
await page.click('.media-job-save');
const out = await waitForDownload(/-rotate-crop\.pdf$/);
check('Download saves the PDF', !!out, out?.name ?? 'nothing landed');
if (out) {
	const doc = await PDFDocument.load(out.bytes);
	const pages = doc.getPages();
	const angles = pages.map((p) => p.getRotation().angle);
	check('rotations land', angles.join() === '0,270,270', angles.join());
	const box1 = pages[0].getCropBox();
	check(
		'page 1 stays whole',
		near(box1.width, A4[0]) && near(box1.height, A4[1]),
		`${box1.width}×${box1.height}`,
	);
	// page 2 at 270: the top margin is the page's right in page space
	const box2 = pages[1].getCropBox();
	check(
		'page 2 keeps the paper crop with a 40 mm top in page space',
		near(box2.height, 210 * MM) &&
			near(A4[0] - box2.x - box2.width, 40 * MM),
		`${box2.x.toFixed(1)},${box2.y.toFixed(1)} ${box2.width.toFixed(1)}×${box2.height.toFixed(1)}`,
	);
	const box3 = pages[2].getCropBox();
	check(
		'page 3 is cropped to A5 turned',
		near(box3.width, 148 * MM) && near(box3.height, 210 * MM),
		`${box3.width.toFixed(1)}×${box3.height.toFixed(1)}`,
	);
}

// an edit drops the result
await rotateButton('.prc-rotate-page', 1);
await sleep(200);
check('an edit drops the export result', !(await page.$('.media-job-save')));

// Clear empties the tool
await page.click('.prc-source button');
await sleep(300);
s = await state();
check(
	'Clear returns to the blank layout',
	s.blankStrip && s.blank && s.slot === 'Drop PDF here' && s.exportOff,
);

// launch flags
await visit(page, '/tools/pdf-rotate-crop?rcSample&rcPaper=a5&rcNudge=yes');
await page.waitForSelector('.prc-image', { timeout: 15000 });
await sleep(300);
s = await state();
check(
	'?rcSample loads, ?rcNudge adds a mm to Left and drops the paper',
	s.title === 'sample.pdf' && s.paper === 'None' && s.names[0] === 'Page 1, Cropped',
	`${s.title} ${s.paper} ${s.margins}`,
);

await finish(browser);
