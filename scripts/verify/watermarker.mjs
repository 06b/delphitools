// the canon watermarker: picture, live text, positions, tiling, stamp, paste, drop, download

import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { launch, visit, check, finish, sleep } from './harness.mjs';

const dir = mkdtempSync(join(tmpdir(), 'wm-'));
const { browser, page } = await launch();
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', {
	behavior: 'allow',
	downloadPath: dir,
});

await visit(page, '/tools/watermarker');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.watermarker').getBoundingClientRect()
				.height,
	),
);
const empty = await page.evaluate(() => ({
	slot: document
		.querySelector('.canon-split-sidebar .wm-slot')
		?.textContent.trim(),
	tag: document.querySelector('.wm-slot')?.tagName,
	source: !!document.querySelector('.wm-source'),
	download: document.querySelector('.wm-download')?.disabled,
}));
check(
	'empty: the picture is the drop target, a button',
	empty.slot === 'Drop an image to watermark' && empty.tag === 'BUTTON',
	empty.slot,
);
check('empty: no source, Download off', !empty.source && empty.download);

const make = (colour, width, height) =>
	page.evaluate(
		({ colour, width, height }) => {
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext('2d');
			context.fillStyle = colour;
			context.fillRect(0, 0, width, height);
			return canvas.toDataURL('image/png').split(',')[1];
		},
		{ colour, width, height },
	);
const wide = join(dir, 'wide.png');
writeFileSync(wide, Buffer.from(await make('#1d3b8f', 400, 200), 'base64'));
const [chooser] = await Promise.all([
	page.waitForFileChooser({ timeout: 3000 }),
	page.click('.wm-slot'),
]);
check('the slot opens the file picker', !!chooser);
await chooser.accept([wide]);
await page.waitForSelector('.wm-source', { timeout: 5000 });
await sleep(200);
const loaded = await page.evaluate(() => {
	const canvas = document.querySelector('.wm-canvas');
	const rect = canvas.getBoundingClientRect();
	return {
		title: document.querySelector('.wm-source .canon-row-title').textContent.trim(),
		detail: document.querySelector('.wm-source .canon-row-detail').textContent.trim(),
		role: canvas.getAttribute('role'),
		label: canvas.getAttribute('aria-label'),
		aspect: rect.width / rect.height,
		pixels: `${canvas.width}x${canvas.height}`,
		download: document.querySelector('.wm-download').disabled,
	};
});
check('the source row: name and size', loaded.title === 'wide' && loaded.detail === '400 × 200', `${loaded.title} ${loaded.detail}`);
check('the picture is a named image', loaded.role === 'img' && loaded.label === 'Preview');
check('at the source aspect and pixels', Math.abs(loaded.aspect - 2) < 0.02 && loaded.pixels === '400x200', `${loaded.aspect.toFixed(3)} ${loaded.pixels}`);
check('Download is ready with the text watermark', loaded.download === false);

const picture = () =>
	page.$eval('.wm-canvas', (canvas) => canvas.toDataURL());
const checked = (selector) =>
	page.$$eval(`${selector} [role=radio]`, (cells) =>
		cells.findIndex((cell) => cell.getAttribute('aria-checked') === 'true'),
	);

// live on every keystroke: no wait between the key and the read
await page.click('.wm-text');
await page.$eval('.wm-text', (el) => el.select());
await page.keyboard.type('A');
const one = await picture();
await page.keyboard.type('B');
const two = await picture();
check('the text draws on every keystroke', one !== two);
check(
	'the field holds the typed text',
	(await page.$eval('.wm-text', (el) => el.value)) === 'AB',
);

check('Bottom right is the default', (await checked('.wm-zones-picker')) === 8);
const before = await picture();
await page.click('.wm-zone[aria-label="Top left"]');
await sleep(50);
check('a press on the picture places the watermark', (await checked('.wm-zones-picker')) === 0);
check('and the picture redraws', before !== (await picture()));
check(
	'marks show the other eight anchors',
	(await page.$$eval('.wm-mark', (marks) =>
		marks.filter((mark) => getComputedStyle(mark).display !== 'none').length,
	)) === 8,
);
await page.click('.wm-zones-picker [aria-label="Centre"]');
check('the position grid picks', (await checked('.wm-zones-picker')) === 4);

await page.click('.wm-random');
check(
	'Random picks no anchor and lights Random',
	(await checked('.wm-zones-picker')) === -1 &&
		(await page.$eval(
			'.wm-random',
			(el) =>
				el.getAttribute('aria-pressed') === 'true' &&
				el.classList.contains('canon-button--filled'),
		)),
);

// sliders take the arrow keys
await page.focus('.wm-opacity [role=slider]');
await page.keyboard.press('ArrowRight');
check(
	'Opacity takes the arrow keys',
	(await page.$eval('.wm-opacity', (el) => el.textContent.trim())).endsWith('35%'),
);

await page.click('.wm-tile .canon-switch');
await sleep(50);
const tiled = await page.evaluate(() => ({
	zones: !!document.querySelector('.wm-zones'),
	grid: [...document.querySelectorAll('.wm-zones-picker [role=radio]')].every((b) => b.disabled),
	random: document.querySelector('.wm-random').disabled,
}));
check('tiling: no picture zones, the position controls off', !tiled.zones && tiled.grid && tiled.random);
await page.click('.wm-tile .canon-switch');

// the image watermark
await page.evaluate(() =>
	[...document.querySelectorAll('.wm-kinds [role=radio]')]
		.find((b) => b.textContent.trim() === 'Image')
		.click(),
);
await sleep(50);
check(
	'Image: the stamp drop zone, Download off',
	!!(await page.$('.wm-stamp-drop')) &&
		(await page.$eval('.wm-download', (el) => el.disabled)),
);
const dropOn = (selector, name, width, height, type = 'image/png') =>
	page.evaluate(
		async ({ selector, name, width, height, type }) => {
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
			const data = new DataTransfer();
			data.items.add(new File([type === 'image/png' ? blob : 'x'], name, { type }));
			const target = document.querySelector(selector);
			for (const kind of ['dragenter', 'dragover', 'drop'])
				target.dispatchEvent(new DragEvent(kind, { dataTransfer: data, bubbles: true, cancelable: true }));
		},
		{ selector, name, width, height, type },
	);
await dropOn('.wm-stamp-drop .canon-drop-zone-target', 'logo.png', 64, 32);
await page.waitForSelector('.wm-stamp', { timeout: 3000 }).catch(() => {});
const stamped = await page.evaluate(() => ({
	stamp: document.querySelector('.wm-stamp .canon-row-detail')?.textContent.trim(),
	name: document.querySelector('.wm-stamp .canon-row-title')?.textContent.trim(),
	source: document.querySelector('.wm-source .canon-row-detail').textContent.trim(),
	download: document.querySelector('.wm-download').disabled,
}));
check('a drop on the stamp zone loads the stamp', stamped.stamp === '64 × 32' && stamped.name === 'logo', `${stamped.name} ${stamped.stamp}`);
check('and leaves the source alone', stamped.source === '400 × 200', stamped.source);
check('Download is ready with a stamp', stamped.download === false);

const paste = (name, width, height, bytes) =>
	page.evaluate(
		async ({ name, width, height, bytes }) => {
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const blob = bytes
				? new Blob([bytes])
				: await new Promise((r) => canvas.toBlob(r, 'image/png'));
			const data = new DataTransfer();
			data.items.add(new File([blob], name, { type: 'image/png' }));
			document.body.dispatchEvent(
				new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
			);
		},
		{ name, width, height, bytes },
	);
await paste('second.png', 20, 40);
await sleep(300);
check(
	'a paste anywhere with Image replaces the stamp',
	(await page.$eval('.wm-stamp .canon-row-detail', (el) => el.textContent.trim())) === '20 × 40',
);

// download the full-size PNG
await page.click('.wm-download');
const saved = join(dir, 'wide-watermarked.png');
for (let i = 0; i < 40 && !existsSync(saved); i++) await sleep(100);
const png = existsSync(saved) ? readFileSync(saved) : undefined;
check(
	'Download writes <stem>-watermarked.png at full size',
	!!png && png.readUInt32BE(16) === 400 && png.readUInt32BE(20) === 200,
	png ? `${png.readUInt32BE(16)}x${png.readUInt32BE(20)}` : 'no file',
);

// a drop anywhere replaces the source; a non-image is ignored
await dropOn('.canon-split-main', 'note.txt', 1, 1, 'text/plain');
await sleep(200);
check('a dropped non-image is ignored', (await page.$eval('.wm-source .canon-row-title', (el) => el.textContent.trim())) === 'wide');
await dropOn('.canon-split-main .wm-padding', 'dropped.png', 30, 30);
await sleep(300);
check('a drop anywhere replaces the source', (await page.$eval('.wm-source .canon-row-title', (el) => el.textContent.trim())) === 'dropped');

await paste('broken.png', 1, 1, 'not a png');
await sleep(300);
check(
	'a file that does not decode says so',
	/could not be read/.test((await page.$eval('.wm-error', (el) => el.textContent)) ?? ''),
);

await page.evaluate(() =>
	[...document.querySelectorAll('.wm-source button')]
		.find((b) => b.textContent.trim() === 'Clear')
		.click(),
);
await sleep(200);
check('Clear brings the slot back', !!(await page.$('.wm-slot')) && !(await page.$('.wm-source')));

// launch flags
await visit(page, '/tools/watermarker?wmSample&wmTile&wmTap=2');
await page.waitForSelector('.wm-source', { timeout: 5000 });
check(
	'?wmSample ?wmTile ?wmTap set the state',
	(await page.$eval('.wm-tile .canon-switch', (el) => el.checked)) &&
		(await checked('.wm-zones-picker')) === 2,
);

// phone: the picture collapses, nothing scrolls sideways
await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/watermarker?wmSample');
await page.waitForSelector('.wm-source', { timeout: 5000 });
const phone = await page.evaluate(async () => {
	const body = document.querySelector('.watermarker .canon-split-body');
	const canvas = () =>
		document.querySelector('.watermarker .canon-canvas').getBoundingClientRect().height;
	const full = canvas();
	body.scrollTop = 800;
	await new Promise((r) => setTimeout(r, 200));
	return {
		full,
		band: canvas(),
		wide: document.documentElement.scrollWidth > document.documentElement.clientWidth,
	};
});
check('phone: the picture is first and large', phone.full > 280, String(phone.full));
check('phone: the picture collapses on scroll', phone.band < phone.full && phone.band >= 199, `${phone.full} → ${phone.band}`);
check('phone: no horizontal scroll', !phone.wide);

await finish(browser);
