// the canon artwork-enhancer: picture compare, detail loupe, live noise, Intelligent mode, export

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
		.querySelector('.canon-split-sidebar .artwork-slot .media-slot-prompt')
		?.textContent.trim()
		.replace(/\s+/g, ' '),
	tag: document.querySelector('.artwork-slot .media-slot-upload')?.tagName,
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
	// the red channel stays flat for the spread checks
	context.fillStyle = '#80ff80';
	context.fillRect(0, 0, 40, 40);
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

// red spread of the result inside a rect
const spreadIn = (x, y, w, h) =>
	page.evaluate(
		async ({ x, y, w, h }) => {
			const img = document.querySelector('.canon-split-sidebar .canon-image-compare-after img');
			const bitmap = await createImageBitmap(await (await fetch(img.src)).blob());
			const canvas = document.createElement('canvas');
			canvas.width = bitmap.width;
			canvas.height = bitmap.height;
			const context = canvas.getContext('2d');
			context.drawImage(bitmap, 0, 0);
			const { data } = context.getImageData(x, y, w, h);
			let min = 255;
			let max = 0;
			for (let i = 0; i < data.length; i += 4) {
				min = Math.min(min, data[i]);
				max = Math.max(max, data[i]);
			}
			return { src: img.src, spread: max - min };
		},
		{ x, y, w, h },
	);
const pickMode = (name) =>
	page.evaluate(
		(name) =>
			[...document.querySelectorAll('.artwork-modes [role="radio"], .artwork-modes button')]
				.find((el) => el.textContent.trim() === name)
				.click(),
		name,
	);
const changed = (src) =>
	page.waitForFunction(
		(src) => document.querySelector('.canon-split-sidebar .canon-image-compare-after img')?.src !== src,
		{ timeout: 5000 },
		src,
	);

// Intelligent: noise only where the picture is busy (the square's edges), none on flat grey
const classicFlat = await spreadIn(200, 120, 100, 80);
check('Classic: noise everywhere, flat grey too', classicFlat.spread > 0, String(classicFlat.spread));
await pickMode('Intelligent');
await changed(classicFlat.src);
const smartFlat = await spreadIn(200, 120, 100, 80);
const smartEdge = await spreadIn(36, 0, 8, 40);
check('Intelligent: flat grey keeps no noise', smartFlat.spread === 0, String(smartFlat.spread));
check('Intelligent: the square edge gets noise', smartEdge.spread > 0, String(smartEdge.spread));
await pickMode('Classic');
await changed(smartFlat.src);
check('Classic again: noise on flat grey', (await spreadIn(200, 120, 100, 80)).spread > 0);

// the loupe: a slider on the picture, arrow keys and drag move the detail
const loupe = () =>
	page.evaluate(() => {
		const el = document.querySelector('.artwork-loupe');
		const box = el?.getBoundingClientRect();
		return {
			role: el?.getAttribute('role'),
			label: el?.getAttribute('aria-label'),
			text: el?.getAttribute('aria-valuetext'),
			x: box && box.x + box.width / 2,
			y: box && box.y + box.height / 2,
			grain: document.querySelector('.artwork-grain .canon-image-compare-before')?.src,
		};
	});
// the loupe's hit box (at least 64 px) against the main compare grip
const clearOfGrip = () =>
	page.evaluate(() => {
		const loupe = document.querySelector('.artwork-loupe').getBoundingClientRect();
		const grip = document
			.querySelector('.canon-split-sidebar .canon-image-compare-grip')
			.getBoundingClientRect();
		const half = Math.max(loupe.width + 24, 64) / 2;
		const cx = loupe.x + loupe.width / 2;
		const cy = loupe.y + loupe.height / 2;
		return cx + half <= grip.left || cx - half >= grip.right || cy + half <= grip.top || cy - half >= grip.bottom;
	});
const centred = await loupe();
check('the loupe is a named slider on the picture', centred.role === 'slider' && centred.label === 'Detail');
check('the loupe starts a quarter across, mid height', centred.text === '75, 100', centred.text);
check('the default loupe is clear of the compare grip', await clearOfGrip());
await page.focus('.artwork-loupe');
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowDown');
await sleep(300);
const nudged = await loupe();
check('arrows move the loupe a quarter of its side', nudged.text === '91, 116', nudged.text);
check('and redraw the detail', nudged.grain && nudged.grain !== centred.grain);
for (let i = 0; i < 20; i++) await page.keyboard.press('ArrowRight');
await sleep(200);
const edge = await loupe();
check('the loupe stays inside the image', edge.text === '268, 116', edge.text);
// top-left: the detail shows the green square
await page.mouse.move(edge.x, edge.y);
await page.mouse.down();
await page.mouse.move(edge.x - 900, edge.y - 600, { steps: 6 });
await page.mouse.up();
await sleep(400);
const dragged = await loupe();
check('a drag moves the loupe to the corner', dragged.text === '32, 32', dragged.text);
const green = await page.evaluate(async () => {
	const img = document.querySelector('.artwork-grain .canon-image-compare-before');
	const bitmap = await createImageBitmap(await (await fetch(img.src)).blob());
	const canvas = document.createElement('canvas');
	canvas.width = bitmap.width;
	canvas.height = bitmap.height;
	const context = canvas.getContext('2d');
	context.drawImage(bitmap, 0, 0);
	return [...context.getImageData(8, 8, 1, 1).data].slice(0, 3).join();
});
check('the detail shows the region under the loupe', green === '128,255,128', green);

// the loupe dragged onto the grip: the grip wins inside its square, the loupe outside it
const gripBox = await page.$eval('.canon-split-sidebar .canon-image-compare-grip', (el) => {
	const b = el.getBoundingClientRect();
	return { x: b.x + b.width / 2, y: b.y + b.height / 2, right: b.right };
});
const corner = await loupe();
await page.mouse.move(corner.x, corner.y);
await page.mouse.down();
await page.mouse.move(gripBox.x, gripBox.y, { steps: 8 });
await page.mouse.up();
await sleep(300);
const onGrip = await loupe();
check('the loupe can sit on the grip', Math.abs(onGrip.x - gripBox.x) < 4 && Math.abs(onGrip.y - gripBox.y) < 4, `${onGrip.x},${onGrip.y} vs ${gripBox.x},${gripBox.y}`);
const hits = await page.evaluate(
	(g) => ({
		centre: !!document.elementFromPoint(g.x, g.y)?.closest('.canon-image-compare'),
		ring: document.elementFromPoint(g.right + 6, g.y)?.classList.contains('artwork-loupe'),
	}),
	gripBox,
);
check('on top of each other the grip takes its own square', hits.centre);
check('and the loupe takes its ring past the grip', hits.ring);
const split = () =>
	page.$eval('.canon-split-sidebar .canon-image-compare', (el) => Number(el.getAttribute('aria-valuenow')));
const splitBefore = await split();
await page.mouse.move(gripBox.x, gripBox.y);
await page.mouse.down();
await page.mouse.move(gripBox.x - 80, gripBox.y, { steps: 6 });
await page.mouse.up();
await sleep(300);
check('a drag from the grip still moves the divider', (await split()) < splitBefore, `${splitBefore} → ${await split()}`);
check('and leaves the loupe', (await loupe()).text === onGrip.text, (await loupe()).text);
await page.mouse.move(gripBox.right + 6, gripBox.y);
await page.mouse.down();
await page.mouse.move(gripBox.right + 66, gripBox.y + 40, { steps: 6 });
await page.mouse.up();
await sleep(300);
check('a drag from the loupe ring still moves the loupe', (await loupe()).text !== onGrip.text, (await loupe()).text);

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
await page.evaluate(() => {
	document.querySelector('.artwork-enhancer .canon-split-body').scrollTop = 0;
});
await sleep(300);
check('phone: the default loupe is clear of the compare grip', await clearOfGrip());

await finish(browser);
