// the canon background-remover without the model: picture, source, paste, drop
// the model run itself is bg-removal.mjs (downloads ~44 MB)

import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { launch, visit, check, finish, sleep } from './harness.mjs';

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
		.querySelector('.canon-split-sidebar .cutout-slot')
		?.textContent.trim(),
	tag: document.querySelector('.cutout-slot')?.tagName,
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

await finish(browser);
