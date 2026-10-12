// the canon favicon-genny: sizes, crop, scene, ico and png exports
// buildIco writes binary format; browser download unprovable by unit test

import { mkdtempSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { launch, visit, check, sleep, finish } from './harness.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const SOURCE = join(root, 'public/delphi.png');
const SIZES = [16, 32, 48, 64, 128, 180, 192, 512];
const ICO_SIZES = [16, 32, 48, 64];

const downloads = mkdtempSync(join(tmpdir(), 'dt-favicon-'));
const { browser, page } = await launch();

const client = await page.createCDPSession();
await client.send('Browser.setDownloadBehavior', {
	behavior: 'allow',
	downloadPath: downloads,
});

await visit(page, '/tools/favicon-genny');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.favicon-genny').getBoundingClientRect()
				.height,
	),
);
check('empty: the drop zone opens the source', await page.$('.canon-split-sidebar .favicon-drop'));
check(
	'empty: the size rows wait, their downloads off',
	await page.$$eval('.favicon-row .favicon-save', (els) =>
		els.length === 8 && els.every((el) => el.disabled),
	),
);
check('empty: the scene draws', await page.$('.canon-split-banner .favicon-browser'));

const input = await page.$('.favicon-drop input[type="file"]');
await input.uploadFile(SOURCE);
await page.waitForSelector('.favicon-source', { timeout: 10000 });
await sleep(200);

const rows = await page.$$eval('.favicon-row', (els) =>
	els.map((el) => ({
		size: el.querySelector('.favicon-pixels')?.textContent.trim(),
		role: el.querySelector('.favicon-role')?.textContent.trim() ?? '',
		font: getComputedStyle(el.querySelector('.favicon-pixels')).fontFamily,
		label: el.querySelector('.favicon-save').getAttribute('aria-label'),
	})),
);
check('one row per size', rows.length === SIZES.length, `${rows.length} rows`);
check(
	'rows are labelled by dimension, in mono',
	rows.every((r, i) => r.size === `${SIZES[i]} × ${SIZES[i]}`) && /iosevka/i.test(rows[0].font),
	rows.map((r) => r.size).join(' '),
);
check(
	'the sizes are named by role',
	rows.map((r) => r.role).join() === 'ICO,ICO,ICO,ICO,,Apple Touch,Android,PWA',
	rows.map((r) => r.role).join(),
);
check('each download cell is named', rows.every((r) => r.label === 'Download PNG'));

const decoded = () =>
	page.evaluate(() =>
		Promise.all(
			[...document.querySelectorAll('.favicon-well img')].map(
				(img) =>
					new Promise((resolve) => {
						const probe = new Image();
						probe.onload = () => resolve([probe.naturalWidth, probe.naturalHeight]);
						probe.src = img.src;
					}),
			),
		),
	);
const sizes = await decoded();
check(
	'each PNG is square at its stated size',
	sizes.every(([w, h], i) => w === h && w === SIZES[i]),
	sizes.map(([w, h]) => `${w}x${h}`).join(' '),
);
const source = await page.evaluate(() => ({
	title: document.querySelector('.favicon-source .canon-row-title').textContent.trim(),
	detail: document.querySelector('.favicon-source .canon-row-detail').textContent.trim(),
	tab: document.querySelector('.favicon-tab--front img')?.src.startsWith('data:image/png'),
	name: document.querySelector('.favicon-tab-title').textContent.trim(),
}));
check('the file name becomes the title', source.title === 'delphi', source.title);
const [, w, h, side] = source.detail.match(/^(\d+) × (\d+) → (\d+) × \3$/) ?? [];
check('the detail reads source → crop, centred largest square', side && Number(side) === Math.min(w, h), source.detail);
check('the scene shows the 32 px icon in the tab, named', source.tab && source.name === 'delphi');

// crop: the arrow keys resize it, and the icons follow
const first = (await page.$eval('.favicon-well img', (el) => el.src));
await page.focus('.favicon-crop');
await page.keyboard.press('ArrowDown');
await sleep(200);
const crop = await page.$eval('.favicon-crop', (el) => ({
	role: el.getAttribute('role'),
	label: el.getAttribute('aria-label'),
	value: Number(el.getAttribute('aria-valuenow')),
	text: el.getAttribute('aria-valuetext'),
}));
check('the crop is a named slider', crop.role === 'slider' && crop.label === 'Crop', crop.text);
check('ArrowDown shrinks the square by a tenth', crop.value === Math.round(Number(side) / 1.1), `${side} → ${crop.value}`);
check('the icons follow the crop', (await page.$eval('.favicon-well img', (el) => el.src)) !== first);

// drag inside the square moves it; the handle resizes it
const geometry = () =>
	page.$eval('.favicon-crop-square', (el) => {
		const r = el.getBoundingClientRect();
		return { x: r.x, y: r.y, width: r.width };
	});
let g = await geometry();
await page.mouse.move(g.x + g.width / 2, g.y + g.width / 2);
await page.mouse.down();
await page.mouse.move(g.x + g.width / 2 - 20, g.y + g.width / 2, { steps: 4 });
await page.mouse.up();
await sleep(200);
let after = await geometry();
check('a drag inside moves the square', after.x < g.x && Math.abs(after.width - g.width) < 1, `${g.x} → ${after.x}`);
g = after;
await page.mouse.move(g.x + g.width, g.y + g.width);
await page.mouse.down();
await page.mouse.move(g.x + g.width - 30, g.y + g.width - 30, { steps: 4 });
await page.mouse.up();
await sleep(200);
after = await geometry();
check('the corner handle resizes it', after.width < g.width - 10, `${g.width} → ${after.width}`);

const ico = join(downloads, 'favicon.ico');
await page.click('.favicon-ico');
for (let i = 0; i < 40 && !existsSync(ico); i++) await sleep(100);
if (!existsSync(ico)) {
	check('favicon.ico downloads', false, `nothing at ${ico}`);
} else {
	const buf = readFileSync(ico);
	const count = buf.readUInt16LE(4);
	check('favicon.ico downloads', true, `${buf.length} bytes`);
	check('ICONDIR is reserved 0, type 1', buf.readUInt16LE(0) === 0 && buf.readUInt16LE(2) === 1);
	check('holds the four small sizes', count === ICO_SIZES.length, `${count}`);
	const widths = [];
	let bytesAccountedFor = 6 + count * 16;
	for (let i = 0; i < count; i++) {
		const entry = 6 + i * 16;
		widths.push(buf.readUInt8(entry));
		const length = buf.readUInt32LE(entry + 8);
		const offset = buf.readUInt32LE(entry + 12);
		bytesAccountedFor += length;
		const magic = buf.subarray(offset, offset + 8).toString('hex');
		check(`entry ${i} points at a PNG`, magic === '89504e470d0a1a0a', magic);
	}
	check('entries are ordered smallest first', widths.join() === ICO_SIZES.join(), widths.join(' '));
	check('no stray bytes', bytesAccountedFor === buf.length, `${bytesAccountedFor} vs ${buf.length}`);
}

const one = join(downloads, 'favicon-180x180.png');
await page.evaluate(() => document.querySelectorAll('.favicon-save')[5].click());
for (let i = 0; i < 40 && !existsSync(one); i++) await sleep(100);
check('a row downloads its PNG', existsSync(one));
const zip = join(downloads, 'favicons.zip');
await page.click('.favicon-all');
for (let i = 0; i < 60 && !existsSync(zip); i++) await sleep(100);
check('Download All writes favicons.zip', existsSync(zip) && readFileSync(zip).subarray(0, 2).toString() === 'PK');

await page.evaluate(() =>
	[...document.querySelectorAll('.favicon-source button')]
		.find((b) => b.textContent.trim() === 'Clear')
		.click(),
);
await sleep(300);
check('clear restores the drop zone', await page.$('.favicon-drop'));
check('clear empties the icons', !(await page.$('.favicon-well img')));

// undecodable-but-accepted file hung on "generating" in the next app
const broken = join(downloads, 'broken.png');
writeFileSync(broken, Buffer.from('not a png at all'));
await (await page.$('.favicon-drop input[type="file"]')).uploadFile(broken);
await sleep(600);
check('an undecodable file surfaces an error', await page.$('.favicon-error'));
check('and returns to the drop zone', await page.$('.favicon-drop'));

// paste anywhere, drop anywhere
await page.evaluate(async () => {
	const canvas = document.createElement('canvas');
	canvas.width = 300;
	canvas.height = 100;
	const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
	const data = new DataTransfer();
	data.items.add(new File([blob], 'wide.png', { type: 'image/png' }));
	document.body.dispatchEvent(
		new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
	);
});
await sleep(500);
check(
	'a paste anywhere loads',
	(await page.$eval('.favicon-source .canon-row-detail', (el) => el.textContent.trim())) === '300 × 100 → 100 × 100',
);
await page.evaluate(async () => {
	const canvas = document.createElement('canvas');
	canvas.width = 64;
	canvas.height = 64;
	const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
	const data = new DataTransfer();
	data.items.add(new File([blob], 'dropped.png', { type: 'image/png' }));
	document.querySelector('.canon-split-main').dispatchEvent(
		new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }),
	);
});
await sleep(500);
check(
	'a drop on the sizes replaces it',
	(await page.$eval('.favicon-source .canon-row-title', (el) => el.textContent.trim())) === 'dropped',
);

// phone: nothing scrolls sideways
await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/favicon-genny?faviconSample');
await page.waitForSelector('.favicon-crop', { timeout: 5000 });
check(
	'phone: no horizontal scroll',
	await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
);

await finish(browser);
