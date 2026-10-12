// the canon artwork-enhancer: picture compare, detail, live noise, export

import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
	launch,
	visit,
	check,
	finish,
	sleep,
	captureObjectUrl,
} from './harness.mjs';

const dir = mkdtempSync(join(tmpdir(), 'art-'));
const { browser, page } = await launch();
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' });

await visit(page, '/tools/artwork-enhancer');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document
				.querySelector('.artwork-enhancer')
				.getBoundingClientRect().height,
	),
);
const empty = await page.evaluate(() => ({
	slot: document
		.querySelector('.canon-split-sidebar .artwork-slot')
		?.textContent.trim()
		.replace(/\s+/g, ' '),
	tag: document.querySelector('.artwork-slot')?.tagName,
	settings: !!document.querySelector('.artwork-opacity .canon-slider'),
	regenerate: document.querySelector('.artwork-regenerate')?.disabled,
	download: document.querySelector('.artwork-download')?.disabled,
}));
check(
	'empty: the picture is the drop target, a button',
	empty.slot === 'Drop your artwork here' && empty.tag === 'BUTTON',
	empty.slot,
);
check('empty: the settings are ready', empty.settings);
check('empty: Regenerate and Download are off', empty.regenerate && empty.download);

const pngBase64 = await page.evaluate(() => {
	const canvas = document.createElement('canvas');
	canvas.width = 300;
	canvas.height = 200;
	const context = canvas.getContext('2d');
	context.fillStyle = '#808080';
	context.fillRect(0, 0, 300, 200);
	return canvas.toDataURL('image/png').split(',')[1];
});
const grey = join(dir, 'grey.png');
writeFileSync(grey, Buffer.from(pngBase64, 'base64'));
const [chooser] = await Promise.all([
	page.waitForFileChooser({ timeout: 3000 }),
	page.click('.artwork-slot'),
]);
await chooser.accept([grey]);
const ready = () =>
	page.waitForFunction(
		() =>
			document.querySelectorAll(
				'.artwork-enhancer .canon-image-compare--comparing',
			).length === 2,
		{ timeout: 10000 },
	);
await ready();

// the result's spread of grey levels: noise at a higher opacity spreads further
const spread = () =>
	page.evaluate(async () => {
		const img = document.querySelector(
			'.canon-split-sidebar .canon-image-compare-after img',
		);
		const bitmap = await createImageBitmap(
			await (await fetch(img.src)).blob(),
		);
		const canvas = document.createElement('canvas');
		canvas.width = bitmap.width;
		canvas.height = bitmap.height;
		const context = canvas.getContext('2d');
		context.drawImage(bitmap, 0, 0);
		const { data } = context.getImageData(0, 0, bitmap.width, bitmap.height);
		let min = 255;
		let max = 0;
		for (let i = 0; i < data.length; i += 4) {
			min = Math.min(min, data[i]);
			max = Math.max(max, data[i]);
		}
		return { src: img.src, width: bitmap.width, spread: max - min };
	});
const loaded = await page.evaluate(() => ({
	title: document.querySelector('.artwork-source .canon-row-title').textContent.trim(),
	detail: document.querySelector('.artwork-source .canon-row-detail').textContent.trim(),
	caption: document.querySelector('.artwork-caption').textContent.trim(),
	download: document.querySelector('.artwork-download').disabled,
}));
check('the source row: name and size', loaded.title === 'grey' && loaded.detail === '300 × 200', `${loaded.title} ${loaded.detail}`);
check('the detail captions its crop', loaded.caption === '64×64 px · 8×', loaded.caption);
check('Download is on', loaded.download === false);
const two = await spread();
check('the result is full size', two.width === 300, String(two.width));
check('2 % noise moves the grey a little', two.spread > 0 && two.spread < 20, String(two.spread));

// the slider takes the arrow keys; End is 20 %
await page.focus('.artwork-opacity .canon-slider');
await page.keyboard.press('End');
await page.waitForFunction(
	(src) =>
		document.querySelector('.canon-split-sidebar .canon-image-compare-after img')
			?.src !== src,
	{ timeout: 5000 },
	two.src,
);
const twenty = await spread();
check(
	'End: 20 %',
	(await page.$eval('.artwork-opacity .canon-slider', (el) => el.getAttribute('aria-valuenow'))) === '20',
);
check('and the noise spreads further', twenty.spread > two.spread, `${two.spread} → ${twenty.spread}`);

// scale: 4× makes 4 px blocks
await page.evaluate(() =>
	[...document.querySelectorAll('.artwork-scales [role="radio"], .artwork-scales button')]
		.find((el) => el.textContent.trim() === '4×')
		.click(),
);
await page.waitForFunction(
	(src) =>
		document.querySelector('.canon-split-sidebar .canon-image-compare-after img')
			?.src !== src,
	{ timeout: 5000 },
	twenty.src,
);
const blocky = await page.evaluate(async () => {
	const img = document.querySelector('.canon-split-sidebar .canon-image-compare-after img');
	const bitmap = await createImageBitmap(await (await fetch(img.src)).blob());
	const canvas = document.createElement('canvas');
	canvas.width = bitmap.width;
	canvas.height = bitmap.height;
	const context = canvas.getContext('2d');
	context.drawImage(bitmap, 0, 0);
	const px = (x, y) => [...context.getImageData(x, y, 1, 1).data].join();
	return px(0, 0) === px(3, 3) && px(4, 0) === px(7, 3) && px(0, 0) !== px(4, 0);
});
check('4×: the noise comes in 4 px blocks', blocky);

// Regenerate draws new noise at the same settings
const before = await spread();
await page.click('.artwork-regenerate');
await page.waitForFunction(
	(src) =>
		document.querySelector('.canon-split-sidebar .canon-image-compare-after img')
			?.src !== src,
	{ timeout: 5000 },
	before.src,
);
check('Regenerate redraws', (await spread()).src !== before.src);

// export: a PNG named after the source
await captureObjectUrl(page);
await page.click('.artwork-download');
await page.waitForFunction(() => window.__result, { timeout: 5000 });
check(
	'Download writes a PNG',
	await page.evaluate(() => window.__result.type === 'image/png'),
);

// paste anywhere replaces; Clear brings the slot back
await page.evaluate(async () => {
	const canvas = document.createElement('canvas');
	canvas.width = 40;
	canvas.height = 90;
	const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
	const data = new DataTransfer();
	data.items.add(new File([blob], 'tall.png', { type: 'image/png' }));
	document.body.dispatchEvent(
		new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
	);
});
await sleep(500);
check(
	'a paste anywhere replaces the source',
	(await page.$eval('.artwork-source .canon-row-detail', (el) => el.textContent.trim())) === '40 × 90',
);
check(
	'a small image crops its whole short side',
	(await page.$eval('.artwork-caption', (el) => el.textContent.trim())) === '40×40 px · 8×',
);
await page.evaluate(() =>
	[...document.querySelectorAll('.artwork-source button')]
		.find((b) => b.textContent.trim() === 'Clear')
		.click(),
);
await sleep(200);
check('Clear brings the slot back', !!(await page.$('.artwork-slot')) && !(await page.$('.artwork-grain')));

// phone: stacked, collapses, nothing scrolls sideways
await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/artwork-enhancer?artSample');
await ready();
const phone = await page.evaluate(async () => {
	const body = document.querySelector('.artwork-enhancer .canon-split-body');
	const canvas = () =>
		document.querySelector('.artwork-enhancer .canon-canvas').getBoundingClientRect().height;
	const full = canvas();
	body.scrollTop = 1200;
	await new Promise((r) => setTimeout(r, 200));
	return {
		full,
		band: canvas(),
		wide: document.documentElement.scrollWidth > document.documentElement.clientWidth,
	};
});
check('phone: the picture collapses to 240 px', Math.round(phone.band) === 240 && phone.full > 240, `${phone.full} ${phone.band}`);
check('phone: no horizontal scroll', !phone.wide);

await finish(browser);
