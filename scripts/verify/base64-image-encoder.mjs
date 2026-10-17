// the canon base64-image-encoder: list, mosaic banner, copy through the toast

import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BASE, launch, visit, check, finish, sleep } from './harness.mjs';

const dir = mkdtempSync(join(tmpdir(), 'b64-'));
const { browser, page } = await launch();
await page
	.browserContext()
	.overridePermissions(BASE, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);

const png = (colour, width, height) =>
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

await visit(page, '/tools/base64-image-encoder');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.b64-encoder').getBoundingClientRect()
				.height,
	),
);
const empty = await page.evaluate(() => ({
	banner: !!document.querySelector(
		'.b64-encoder .canon-split-banner canvas.b64-mosaic-text',
	),
	drop: !!document.querySelector('.canon-split-sidebar .b64-drop'),
	row: document
		.querySelector('.canon-split-main .canon-empty-row')
		?.textContent.trim(),
	clear: !!document.querySelector('.b64-clear'),
}));
check('empty: the mosaic banner draws', empty.banner);
check('empty: the drop zone opens the sidebar', empty.drop);
check('empty: Encoded shows the empty row', empty.row === 'Data URI', empty.row);
check('empty: no Clear all', !empty.clear);

const red = join(dir, 'red.png');
const blue = join(dir, 'blue.png');
const note = join(dir, 'note.txt');
writeFileSync(red, Buffer.from(await png('#e11d48', 120, 60), 'base64'));
writeFileSync(blue, Buffer.from(await png('#2563eb', 40, 40), 'base64'));
writeFileSync(note, 'not an image');
const input = await page.$('.b64-drop input[type="file"]');
await input.uploadFile(red, blue, note);
await page.waitForFunction(
	() => document.querySelectorAll('.b64-block').length === 2,
	{ timeout: 5000 },
);
await sleep(200);
const blocks = await page.evaluate(() =>
	[...document.querySelectorAll('.b64-block')].map((block) => ({
		name: block.querySelector('.b64-name').textContent.trim(),
		size: block.querySelector('.b64-size').textContent.trim(),
		text: block.querySelector('.b64-text').value,
		font: getComputedStyle(block.querySelector('.b64-text')).fontFamily,
		lit: block.querySelector('.b64-head--lit') !== null,
	})),
);
const names = blocks.map((b) => b.name).sort();
check('two images encoded', names.join() === 'blue.png,red.png', names.join());
check(
	'sizes read file → data URI',
	blocks.every((b) => /^\d+(\.\d)? (B|KB) → \d+(\.\d)? (B|KB)$/.test(b.size)),
	blocks.map((b) => b.size).join(' | '),
);
check(
	'the text is the data URI',
	blocks.every((b) => b.text.startsWith('data:image/png;base64,iVBOR')),
);
check(
	'in the monospaced face',
	blocks.every((b) => /iosevka/i.test(b.font)),
	blocks[0].font,
);
check('one image lit of two', blocks.filter((b) => b.lit).length === 1);
const zone = await page.evaluate(() => {
	const target = document.querySelector('.b64-drop .canon-drop-zone-target').getBoundingClientRect();
	const shown = [...document.querySelectorAll('.b64-drop-shown img')];
	return {
		count: shown.length,
		loaded: shown.every((img) => img.complete && img.naturalWidth > 0),
		inside: shown.every((img) => {
			const box = img.getBoundingClientRect();
			return box.width > 0 && box.top >= target.top && box.bottom <= target.bottom && box.left >= target.left && box.right <= target.right;
		}),
		prompt: getComputedStyle(document.querySelector('.b64-drop .canon-drop-zone-prompt')).visibility,
	};
});
check('the drop zone shows each loaded image', zone.count === 2 && zone.loaded && zone.inside, JSON.stringify(zone));
check('and no longer asks for a drop', zone.prompt === 'hidden', zone.prompt);
const skipped = await page.$$eval('.canon-split-sidebar .canon-status', (els) =>
	els.map((el) => el.textContent.trim()),
);
check(
	'a non-image is skipped with the iOS wording',
	skipped.join() === 'note.txt is not an image',
	skipped.join(),
);

const mosaic = () =>
	page.evaluate(() => {
		const canvas = document.querySelector('canvas.b64-mosaic-text');
		return {
			label: canvas.getAttribute('aria-label'),
			role: canvas.getAttribute('role'),
			figure: document
				.querySelector('.b64-mosaic .canon-figure-said')
				.textContent.trim(),
		};
	});
const lit = blocks.find((b) => b.lit);
let m = await mosaic();
check('the mosaic is a named image of the lit one', m.role === 'img' && m.label === lit.name, m.label);
check('the figure is its data URI size', m.figure === lit.size.split(' → ')[1].replace(' ', ''), m.figure);

// the picture's colour shows through the characters
const tint = async () =>
	page.evaluate(() => {
		const canvas = document.querySelector('canvas.b64-mosaic-text');
		const { data } = canvas
			.getContext('2d')
			.getImageData(0, 0, canvas.width, canvas.height);
		let reds = 0;
		let blues = 0;
		for (let i = 0; i < data.length; i += 4) {
			if (data[i + 3] < 200) continue;
			if (data[i] > 180 && data[i + 2] < 120) reds++;
			if (data[i + 2] > 180 && data[i] < 100) blues++;
		}
		return { reds, blues };
	});
let t = await tint();
const litIsBlue = lit.name === 'blue.png';
check(
	'characters take the lit picture colour',
	litIsBlue ? t.blues > 50 && t.reds === 0 : t.reds > 50 && t.blues === 0,
	JSON.stringify(t),
);

// selecting the other block changes the banner
await page.evaluate(() =>
	[...document.querySelectorAll('.b64-head')]
		.find((el) => !el.classList.contains('b64-head--lit'))
		.click(),
);
await sleep(400);
m = await mosaic();
check('a tap on the other block shows it', m.label !== lit.name, m.label);
t = await tint();
check(
	'in its colour',
	litIsBlue ? t.reds > 50 && t.blues === 0 : t.blues > 50 && t.reds === 0,
	JSON.stringify(t),
);

// copy through the toast
const copy = async (selector) => {
	await page.evaluate((s) => document.querySelector(s).click(), selector);
	await sleep(300);
	return page.evaluate(() => navigator.clipboard.readText());
};
const first = blocks[0];
const uri = await copy('.b64-block .b64-copy-uri');
check('Copy Data URI copies the data URI', uri === first.text);
check(
	'and the toast shows',
	await page.$eval('.canon-toast', (el) => el.style.opacity === '1'),
);
const raw = await copy('.b64-block .b64-copy-raw');
check('Copy Raw Base64 copies the base64 alone', raw === first.text.split(',')[1]);
check(
	'every control is named',
	await page.$$eval('.b64-encoder button', (els) =>
		els.every(
			(el) => el.textContent.trim() || el.getAttribute('aria-label'),
		),
	),
);

// paste anywhere, drop anywhere
await page.evaluate(async () => {
	document.activeElement?.blur();
	const canvas = document.createElement('canvas');
	canvas.width = 16;
	canvas.height = 16;
	const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
	const data = new DataTransfer();
	data.items.add(new File([blob], 'pasted.png', { type: 'image/png' }));
	document.body.dispatchEvent(
		new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
	);
});
await sleep(400);
check(
	'a paste anywhere adds an image, first',
	(await page.$eval('.b64-block .b64-name', (el) => el.textContent.trim())) === 'pasted.png',
);
await page.evaluate(async () => {
	const canvas = document.createElement('canvas');
	canvas.width = 8;
	canvas.height = 8;
	const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
	const data = new DataTransfer();
	data.items.add(new File([blob], 'dropped.png', { type: 'image/png' }));
	data.items.add(new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'huge.png', { type: 'image/png' }));
	document.querySelector('.canon-split-main').dispatchEvent(
		new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }),
	);
});
await sleep(400);
check(
	'a drop on the list adds too',
	(await page.$$('.b64-block')).length === 4,
);
const tooLarge = await page.$$eval('.canon-split-sidebar .canon-status', (els) =>
	els.map((el) => el.textContent.trim()),
);
check(
	'over 5 MB is skipped',
	tooLarge.includes('huge.png is 5.0 MB, over the 5 MB limit'),
	tooLarge.join(' | '),
);

await page.evaluate(() =>
	document.querySelector('.b64-block .b64-remove').click(),
);
await sleep(100);
check('Remove drops one', (await page.$$('.b64-block')).length === 3);
check('and its picture leaves the drop zone', (await page.$$('.b64-drop-shown img')).length === 3);
await page.evaluate(() => document.querySelector('.b64-clear').click());
await sleep(300);
check(
	'Clear all empties the list and the skipped',
	(await page.$$('.b64-block')).length === 0 &&
		(await page.$$('.canon-split-sidebar .canon-status')).length === 0,
);
check(
	'the drop zone asks again',
	!(await page.$('.b64-drop-shown')) &&
		(await page.$eval('.b64-drop .canon-drop-zone-prompt', (el) => getComputedStyle(el).visibility)) === 'visible',
);
check(
	'and the banner idles',
	(await page.$eval('canvas.b64-mosaic-text', (el) => el.getAttribute('role'))) === null,
);

// phone: stacked, nothing scrolls sideways
await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/base64-image-encoder?b64Sample');
await page.waitForSelector('.b64-block', { timeout: 5000 });
check(
	'phone: no horizontal scroll',
	await page.evaluate(
		() =>
			document.documentElement.scrollWidth <=
			document.documentElement.clientWidth,
	),
);

await finish(browser);
