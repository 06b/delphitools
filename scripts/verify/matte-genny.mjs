// the canon matte-genny: picture, settings live, export, file input, paste, drop, flow
// usage: bun run start, then node scripts/verify/matte-genny.mjs

import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
	BASE,
	launch,
	visit,
	check,
	finish,
	sleep,
	captureObjectUrl,
} from './harness.mjs';

const SOURCE = join(mkdtempSync(join(tmpdir(), 'matte-')), 'photo.png');

const { browser, page } = await launch();
page.on('dialog', (dialog) => void dialog.accept());
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' });

const label = () =>
	page.$eval('.matte-area', (el) => el.getAttribute('aria-label'));
const sourceRow = () =>
	page.evaluate(() => ({
		title:
			document
				.querySelector('.matte-source .canon-row-title')
				?.textContent.trim() ?? '',
		detail:
			document
				.querySelector('.matte-source .canon-row-detail')
				?.textContent.trim() ?? '',
	}));
const pick = (group, text) =>
	page.evaluate(
		(group, text) =>
			[...document.querySelectorAll(`.${group} [role="radio"]`)]
				.find((b) => b.textContent.trim() === text)
				.click(),
		group,
		text,
	);
const button = (text) =>
	page.evaluate(
		(text) =>
			[...document.querySelectorAll('.matte-genny button')]
				.find((b) => b.textContent.trim() === text)
				.click(),
		text,
	);

await visit(page, '/tools/matte-genny');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.matte-genny').getBoundingClientRect()
				.height,
	),
);
check(
	'the picture is a named image of the output',
	(await label()) === '1080 × 1080',
	await label(),
);
const slot = await page.evaluate(() => {
	const el = document.querySelector('.matte-slot');
	return { tag: el?.querySelector('.media-slot-upload')?.tagName, text: el?.querySelector('.media-slot-prompt')?.textContent.trim() };
});
check(
	'empty: the photo slot is the drop target, a button',
	slot.tag === 'BUTTON' && slot.text === 'Drop an image',
	JSON.stringify(slot),
);
check(
	'empty: Download is off',
	await page.$eval('.matte-download', (el) => el.disabled),
);
check(
	'empty: the tool can expand',
	!!(await page.$('.dt-canon-tool.is-expandable')),
);

// the slot opens the file input
const pngBase64 = await page.evaluate(() => {
	const canvas = document.createElement('canvas');
	canvas.width = 300;
	canvas.height = 200;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#c03030';
	ctx.fillRect(0, 0, 300, 200);
	ctx.fillStyle = '#3050c0';
	ctx.fillRect(150, 0, 150, 200);
	return canvas.toDataURL('image/png').split(',')[1];
});
writeFileSync(SOURCE, Buffer.from(pngBase64, 'base64'));
const [chooser] = await Promise.all([
	page.waitForFileChooser({ timeout: 5000 }),
	page.click('.matte-slot'),
]);
await chooser.accept([SOURCE]);
await page.waitForSelector('.matte-source', { timeout: 10000 });
let row = await sourceRow();
check('the slot loads the file: stem', row.title === 'photo', row.title);
check('and pixels', row.detail === '300 × 200', row.detail);
check(
	'the picture shows the photo',
	!!(await page.$('.matte-photo[src^="blob:"]')) && !(await page.$('.matte-slot')),
);
const tiles = () =>
	page.$$eval('.matte-genny .canon-tiles-value', (els) =>
		els.map((el) => el.textContent.trim()).join('|'),
	);
check(
	'tiles: source, photo, scale',
	(await tiles()) === '300 × 200|1000 × 667|333 %',
	await tiles(),
);

// settings are live
await pick('matte-ratios', '4:5');
check('4:5 keeps portrait', (await label()) === '1080 × 1350', await label());
await button('Swap');
check('Swap turns it landscape', (await label()) === '1080 × 864', await label());
await pick('matte-ratios', '9:16');
check(
	'a preset keeps the orientation',
	(await label()) === '1080 × 608',
	await label(),
);
await pick('matte-ratios', 'Custom');
check(
	'Custom shows the two ratio fields',
	(await page.$$('.matte-genny [aria-label="Ratio width"], .matte-genny [aria-label="Ratio height"]')).length === 2,
);
await pick('matte-ratios', '1:1');
await pick('matte-styles', 'Solid');
check('Solid shows the colour well', !!(await page.$('.matte-genny .canon-colour-well')));
await pick('matte-styles', 'Blur');
check('Blur hides it', !(await page.$('.matte-genny .canon-colour-well')));

await page.focus('.matte-width .canon-stepper-field');
await page.keyboard.press('ArrowUp');
check('the width field takes the arrow keys', (await label()) === '1090 × 1090', await label());
await page.$eval('.matte-width .canon-stepper-field', (el) => el.select());
await page.keyboard.type('1440');
check('typing is live, no wait', (await label()) === '1440 × 1440', await label());
await page.evaluate(() => document.activeElement?.blur());

await page.focus('.matte-padding .canon-slider');
await page.keyboard.press('ArrowRight');
await sleep(200);
check(
	'the padding slider steps by 10 and shows the guides',
	(await page.$eval('.matte-padding .canon-slider', (el) => el.getAttribute('aria-valuenow'))) === '50' &&
		(await page.$$('.matte-guide--shown')).length === 4,
);
await sleep(1700);
check('the guides go after a second', (await page.$$('.matte-guide--shown')).length === 0);

// download: a PNG at the output size, named after the source
await captureObjectUrl(page);
await page.evaluate(() => {
	const anchor = HTMLAnchorElement.prototype.click;
	HTMLAnchorElement.prototype.click = function () {
		window.__name = this.download;
		return anchor.call(this);
	};
});
await page.click('.matte-download');
await page.waitForFunction(() => window.__result, { timeout: 15000 });
const saved = await page.evaluate(async () => {
	const bitmap = await createImageBitmap(window.__result);
	const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
	const context = canvas.getContext('2d');
	context.drawImage(bitmap, 0, 0);
	const centre = [...context.getImageData(bitmap.width / 4 + 30, bitmap.height / 2, 1, 1).data];
	return {
		type: window.__result.type,
		name: window.__name,
		size: `${bitmap.width}x${bitmap.height}`,
		centre,
	};
});
check('Download writes a PNG', saved.type === 'image/png', saved.type);
check('at the output size', saved.size === '1440x1440', saved.size);
check('named after the source', saved.name === 'photo-matte-1440x1440.png', saved.name);
check('with the photo in it', saved.centre[0] > 150 && saved.centre[2] < 90, saved.centre.join(','));

// paste anywhere and drop anywhere replace the photo
const paste = (target, name) =>
	page.evaluate(
		async ({ target, name }) => {
			const canvas = document.createElement('canvas');
			canvas.width = 64;
			canvas.height = 128;
			const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
			const data = new DataTransfer();
			data.items.add(new File([blob], name, { type: 'image/png' }));
			document.querySelector(target).dispatchEvent(
				new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
			);
		},
		{ target, name },
	);
await paste('.matte-genny .canon-split-main', 'pasted.png');
await page.waitForFunction(
	() => document.querySelector('.matte-source .canon-row-title')?.textContent.trim() === 'pasted',
	{ timeout: 5000 },
).catch(() => {});
row = await sourceRow();
check('a paste in the settings loads the image', row.title === 'pasted' && row.detail === '64 × 128', JSON.stringify(row));

const drop = (target, file) =>
	page.evaluate(
		async ({ target, file }) => {
			let part = file.text;
			if (!part) {
				const canvas = document.createElement('canvas');
				canvas.width = 40;
				canvas.height = 40;
				part = await new Promise((r) => canvas.toBlob(r, 'image/png'));
			}
			const data = new DataTransfer();
			data.items.add(new File([part], file.name, { type: 'image/png' }));
			const el = document.querySelector(target);
			el.dispatchEvent(new DragEvent('dragover', { dataTransfer: data, bubbles: true, cancelable: true }));
			el.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
		},
		{ target, file },
	);
await drop('.matte-picture', { name: 'dropped.png' });
await page.waitForFunction(
	() => document.querySelector('.matte-source .canon-row-title')?.textContent.trim() === 'dropped',
	{ timeout: 5000 },
).catch(() => {});
check('a drop on the picture loads the image', (await sourceRow()).title === 'dropped');

await drop('.matte-picture', { name: 'broken.png', text: 'not a png' });
await page.waitForFunction(
	() => !!document.querySelector('.matte-genny .canon-status'),
	{ timeout: 5000 },
).catch(() => {});
check(
	'a broken file shows the web wording',
	await page.evaluate(() =>
		document
			.querySelector('.matte-genny .canon-status')
			?.textContent.includes('Image could not be read. Try another file?'),
	),
);
check('and the slot is back', !!(await page.$('.matte-slot')));

await drop('.matte-slot', { name: 'again.png' });
await page.waitForSelector('.matte-source', { timeout: 5000 });
await button('Clear');
await sleep(200);
check(
	'Clear: the slot is back, Download off',
	!!(await page.$('.matte-slot')) &&
		(await page.$eval('.matte-download', (el) => el.disabled)),
);

// launch flags
await visit(page, '/tools/matte-genny?matteStyle=1&matteRatio=16:9&matteWidth=1200&mattePadding=80&matteColour=%231e6626');
check('?matteRatio and ?matteWidth', (await label()) === '1200 × 675', await label());
check(
	'?matteStyle=1 is Solid with the colour',
	await page.evaluate(
		() =>
			document.querySelector('.matte-styles [aria-checked="true"]')?.textContent.trim() === 'Solid' &&
			getComputedStyle(document.querySelector('.matte-sheet')).backgroundColor === 'rgb(30, 102, 38)',
	),
);
check(
	'?mattePadding',
	(await page.$eval('.matte-padding .canon-slider', (el) => el.getAttribute('aria-valuenow'))) === '80',
);

// reduced motion: no transitions
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await visit(page, '/tools/matte-genny');
check(
	'reduced motion: the sheet does not animate',
	await page.$eval('.matte-sheet', (el) => getComputedStyle(el).transitionProperty === 'none' || getComputedStyle(el).transitionDuration === '0s'),
);
await page.emulateMediaFeatures([]);

// a workflow step: the carried image loads, Download reads Pass along
await page.goto(`${BASE}/w/paste-image.matte-genny`, { waitUntil: 'networkidle2' });
await page.waitForSelector('.dt-pass-go', { timeout: 15000 });
await page.click('.dt-pass-go');
await page.waitForSelector('.dt-flow', { timeout: 15000 });
await sleep(400);
await paste('body', 'carried.png');
await page.waitForSelector('.media-crop-image', { timeout: 10000 });
await page.click('.pi-save');
await page.waitForFunction(() => location.pathname === '/tools/matte-genny', { timeout: 15000 });
await page.waitForSelector('.matte-source', { timeout: 15000 });
check('in a flow the carried image loads', (await sourceRow()).detail === '64 × 128', (await sourceRow()).detail);
check(
	'and Download reads Pass along',
	(await page.$eval('.matte-download', (el) => el.textContent.trim())) === 'Pass along',
);
await page.click('.matte-download');
check(
	'Pass along finishes the flow',
	await page
		.waitForSelector('.dt-flow-next.is-done', { timeout: 10000 })
		.then(() => true)
		.catch(() => false),
);
await page.click('.dt-flow-exit').catch(() => {});
await sleep(300);

// phone: the picture first, it collapses, nothing scrolls sideways
await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/matte-genny');
const phone = await page.evaluate(async () => {
	const body = document.querySelector('.matte-genny .canon-split-body');
	const canvas = () =>
		document.querySelector('.matte-genny .canon-canvas').getBoundingClientRect();
	const full = canvas();
	const first = full.top < document.querySelector('.matte-styles').getBoundingClientRect().top;
	body.scrollTop = 800;
	await new Promise((r) => setTimeout(r, 300));
	return {
		first,
		full: full.height,
		band: canvas().height,
		wide: document.documentElement.scrollWidth > document.documentElement.clientWidth,
	};
});
check('phone: the picture comes first', phone.first);
check(
	'phone: the picture shrinks on scroll, not below 200 px',
	phone.band < phone.full && Math.round(phone.band) >= 200,
	`${phone.full} ${phone.band}`,
);
check('phone: no horizontal scroll', !phone.wide);

await finish(browser);
