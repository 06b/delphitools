// the canon background-remover without the model: picture, source, paste, drop, refine brush
// the model run itself is bg-removal.mjs (downloads ~44 MB); ?bgMask stands in for it here

import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { launch, visit, check, finish, sleep, captureObjectUrl } from './harness.mjs';

const dir = mkdtempSync(join(tmpdir(), 'bg-'));
const { browser, page } = await launch();

await visit(page, '/tools/background-remover');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document
				.querySelector('.background-remover')
				.getBoundingClientRect().height,
	),
);
const empty = await page.evaluate(() => ({
	slot: document
		.querySelector('.canon-split-sidebar .cutout-slot .media-slot-prompt')
		?.textContent.trim(),
	tag: document.querySelector('.cutout-slot .media-slot-upload')?.tagName,
	source: !!document.querySelector('.bg-source'),
	run: !!document.querySelector('.bg-run'),
	note: document
		.querySelector('.canon-split-main .canon-status')
		?.textContent.trim(),
}));
check(
	'empty: the picture is the drop target, a button',
	empty.slot === 'Drop an image here' && empty.tag === 'BUTTON',
	empty.slot,
);
check('empty: no source, no run', !empty.source && !empty.run);
check('the web note stays', /entirely in your browser/.test(empty.note ?? ''));

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
writeFileSync(wide, Buffer.from(await make('#e11d48', 200, 100), 'base64'));
const [chooser] = await Promise.all([
	page.waitForFileChooser({ timeout: 3000 }),
	page.click('.cutout-slot'),
]);
check('the slot opens the file picker', !!chooser);
await chooser.accept([wide]);
await page.waitForSelector('.bg-source', { timeout: 5000 });
const loaded = await page.evaluate(() => {
	const box = document.querySelector('.cutout-name');
	const rect = document.querySelector('.cutout-box').getBoundingClientRect();
	return {
		title: document.querySelector('.bg-source .canon-row-title').textContent.trim(),
		detail: document.querySelector('.bg-source .canon-row-detail').textContent.trim(),
		role: box.getAttribute('role'),
		label: box.getAttribute('aria-label'),
		aspect: rect.width / rect.height,
		run: document.querySelector('.bg-run')?.textContent.trim(),
		disabled: document.querySelector('.bg-run')?.disabled,
	};
});
check('the source row: name and size', loaded.title === 'wide.png' && loaded.detail === '200 × 100', `${loaded.title} ${loaded.detail}`);
check('the picture is a named image', loaded.role === 'img' && loaded.label === 'Preview');
check('at the source aspect', Math.abs(loaded.aspect - 2) < 0.02, loaded.aspect.toFixed(3));
check('Remove Background is ready', loaded.run === 'Remove Background' && loaded.disabled === false, loaded.run);
check('no result block before a run', !(await page.$('.bg-download')));

// paste anywhere replaces the source
await page.evaluate(async () => {
	const canvas = document.createElement('canvas');
	canvas.width = 50;
	canvas.height = 100;
	const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
	const data = new DataTransfer();
	data.items.add(new File([blob], 'tall.png', { type: 'image/png' }));
	document.body.dispatchEvent(
		new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
	);
});
await sleep(400);
check(
	'a paste anywhere replaces the source',
	(await page.$eval('.bg-source .canon-row-detail', (el) => el.textContent.trim())) === '50 × 100',
);

// drop on the settings, a non-image is ignored
await page.evaluate(async () => {
	const data = new DataTransfer();
	data.items.add(new File(['x'], 'note.txt', { type: 'text/plain' }));
	document.querySelector('.canon-split-main').dispatchEvent(
		new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }),
	);
});
await sleep(200);
check(
	'a dropped non-image is ignored',
	(await page.$eval('.bg-source .canon-row-title', (el) => el.textContent.trim())) === 'tall.png',
);
await page.evaluate(async () => {
	const canvas = document.createElement('canvas');
	canvas.width = 30;
	canvas.height = 30;
	const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
	const data = new DataTransfer();
	data.items.add(new File([blob], 'dropped.png', { type: 'image/png' }));
	document.querySelector('.canon-split-main').dispatchEvent(
		new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }),
	);
});
await sleep(400);
check(
	'a drop anywhere replaces the source',
	(await page.$eval('.bg-source .canon-row-title', (el) => el.textContent.trim())) === 'dropped.png',
);

await page.evaluate(() =>
	[...document.querySelectorAll('.bg-source button')]
		.find((b) => b.textContent.trim() === 'Clear')
		.click(),
);
await sleep(200);
check(
	'Clear brings the slot back',
	!!(await page.$('.cutout-slot')) && !(await page.$('.bg-source')),
);

// phone: the picture collapses, nothing scrolls sideways
await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/background-remover?bgSample');
await page.waitForSelector('.bg-source', { timeout: 5000 });
const phone = await page.evaluate(async () => {
	const body = document.querySelector('.background-remover .canon-split-body');
	const canvas = () =>
		document.querySelector('.background-remover .canon-canvas').getBoundingClientRect().height;
	const full = canvas();
	body.scrollTop = 800;
	await new Promise((r) => setTimeout(r, 200));
	return {
		full,
		band: canvas(),
		wide: document.documentElement.scrollWidth > document.documentElement.clientWidth,
	};
});
check('phone: the picture is first and large', phone.full > 300, String(phone.full));
check('phone: no horizontal scroll', !phone.wide);

// refine: a drawn ellipse mask (30 % radii) stands in for the model
await page.setViewport({ width: 1400, height: 1000, hasTouch: true });
await visit(page, '/tools/background-remover?bgSample&bgMask');
await page.waitForSelector('.bg-run', { timeout: 5000 });
await page.click('.bg-run');
await page.waitForSelector('.bg-refine', { timeout: 5000 });
await sleep(800);

const kept = () => page.$eval('.background-remover .canon-tiles-value', (el) => el.textContent.trim());
const alphaAt = (sx, sy) =>
	page.$eval(
		'.cutout-cut',
		(canvas, sx, sy) =>
			canvas.getContext('2d').getImageData(Math.floor(sx * canvas.width), Math.floor(sy * canvas.height), 1, 1)
				.data[3],
		sx,
		sy,
	);
const at = (sx, sy) =>
	page.$eval(
		'.cutout-cut',
		(canvas, sx, sy) => {
			const box = canvas.getBoundingClientRect();
			return { x: box.left + sx * box.width, y: box.top + sy * box.height };
		},
		sx,
		sy,
	);
const stroke = async (from, to) => {
	const a = await at(...from);
	const b = await at(...to);
	await page.mouse.move(a.x, a.y);
	await page.mouse.down();
	await page.mouse.move(b.x, b.y, { steps: 5 });
	await page.mouse.up();
	await sleep(150);
};
const pickBrush = (name) =>
	page.evaluate(
		(name) =>
			[...document.querySelectorAll('.bg-brush-modes [role="radio"], .bg-brush-modes button')]
				.find((el) => el.textContent.trim() === name)
				.click(),
		name,
	);
const off = (sel) => page.$eval(sel, (el) => el.disabled);

const refine = await page.evaluate(() => ({
	heading: document.querySelector('.bg-refine .canon-heading')?.textContent.trim(),
	modes: [...document.querySelectorAll('.bg-brush-modes [role="radio"], .bg-brush-modes button')].map((el) =>
		el.textContent.trim(),
	),
	brush: !!document.querySelector('.bg-brush .canon-slider'),
	loaders: document.querySelectorAll('.background-remover .canon-loader').length,
}));
check('refine: a Refine block with Add and Remove', refine.heading === 'Refine' && refine.modes.join() === 'Add,Remove', refine.modes.join());
check('refine: a brush size slider', refine.brush);
check('refine: Undo and Reset start off', (await off('.bg-undo')) && (await off('.bg-reset')));
check('refine: no loader once the cut is done', refine.loaders === 0, String(refine.loaders));
const keptBefore = await kept();
check('the stand-in mask keeps 28 %', keptBefore === '28 %', keptBefore);
check('outside the mask is clear, inside opaque', (await alphaAt(0.1, 0.1)) === 0 && (await alphaAt(0.5, 0.5)) === 255);

await stroke([0.08, 0.1], [0.2, 0.1]);
check('Add paints the subject back', (await alphaAt(0.14, 0.1)) === 255, String(await alphaAt(0.14, 0.1)));
check('Kept grows with it', (await kept()) !== keptBefore, await kept());
check('Undo and Reset turn on', !(await off('.bg-undo')) && !(await off('.bg-reset')));

await pickBrush('Remove');
await stroke([0.45, 0.5], [0.55, 0.5]);
check('Remove clears the subject', (await alphaAt(0.5, 0.5)) === 0, String(await alphaAt(0.5, 0.5)));
await page.click('.bg-undo');
await sleep(150);
check('Undo restores the last stroke', (await alphaAt(0.5, 0.5)) === 255);
check('and one stroke back only', await off('.bg-undo'));
check('earlier strokes stay', (await alphaAt(0.14, 0.1)) === 255);

// touch: a finger paints too
await pickBrush('Add');
const t0 = await at(0.85, 0.9);
const t1 = await at(0.95, 0.9);
await page.touchscreen.touchStart(t0.x, t0.y);
await page.touchscreen.touchMove((t0.x + t1.x) / 2, t0.y);
await page.touchscreen.touchMove(t1.x, t1.y);
await page.touchscreen.touchEnd();
await sleep(200);
check('a touch stroke paints', (await alphaAt(0.9, 0.9)) === 255, String(await alphaAt(0.9, 0.9)));

// brush size takes the arrow keys
await page.focus('.bg-brush .canon-slider');
await page.keyboard.press('End');
await sleep(100);
check(
	'the brush slider: End is 120 px',
	(await page.$eval('.bg-brush .canon-slider', (el) => el.getAttribute('aria-valuenow'))) === '120',
);

// the export carries the refinements
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' });
await captureObjectUrl(page);
await page.click('.bg-download');
await page.waitForFunction(() => window.__result, { timeout: 5000 });
const exported = await page.evaluate(async () => {
	const bitmap = await createImageBitmap(window.__result);
	const canvas = document.createElement('canvas');
	canvas.width = bitmap.width;
	canvas.height = bitmap.height;
	const context = canvas.getContext('2d');
	context.drawImage(bitmap, 0, 0);
	const a = (sx, sy) => context.getImageData(Math.floor(sx * bitmap.width), Math.floor(sy * bitmap.height), 1, 1).data[3];
	return { type: window.__result.type, added: a(0.14, 0.1), touched: a(0.9, 0.9), clear: a(0.05, 0.95), centre: a(0.5, 0.5) };
});
check(
	'the PNG export has the painted mask',
	exported.type === 'image/png' &&
		exported.added === 255 &&
		exported.touched === 255 &&
		exported.clear === 0 &&
		exported.centre === 255,
	JSON.stringify(exported),
);

await page.click('.bg-reset');
await sleep(150);
check('Reset returns to the model mask', (await alphaAt(0.14, 0.1)) === 0 && (await alphaAt(0.9, 0.9)) === 0);
check('Reset turns itself and Undo off', (await off('.bg-reset')) && (await off('.bg-undo')));
check('Kept returns too', (await kept()) === keptBefore, await kept());

await finish(browser);
