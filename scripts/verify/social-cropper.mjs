// the canon social-cropper: picture, presets, drag, keys, paste, drop, export

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

const dir = mkdtempSync(join(tmpdir(), 'crop-'));
const { browser, page } = await launch();

await visit(page, '/tools/social-cropper');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.social-cropper').getBoundingClientRect()
				.height,
	),
);
const empty = await page.evaluate(() => ({
	slot: document
		.querySelector('.canon-split-sidebar .social-slot')
		?.innerText.trim(),
	tag: document.querySelector('.social-slot')?.tagName,
	source: !!document.querySelector('.social-source'),
	platforms: [
		...document.querySelectorAll('.social-platforms .canon-button'),
	].map((b) => b.textContent.trim()),
	ratios: [...document.querySelectorAll('.social-ratios .canon-button')].map(
		(b) => b.textContent.trim(),
	),
	ghosts: document.querySelectorAll('.social-ghost').length,
	label: document.querySelector('.social-tag')?.textContent.trim(),
	tiles: [...document.querySelectorAll('.canon-tiles-value')].map((t) =>
		t.textContent.trim(),
	),
	disabled: document.querySelector('.social-download').disabled,
	slider: !!document.querySelector('.social-crop[role="slider"]'),
}));
check(
	'empty: the picture is the drop target, a button',
	empty.slot === 'Drop an image to crop' && empty.tag === 'BUTTON',
	empty.slot,
);
check('empty: no source row, no slider', !empty.source && !empty.slider);
check(
	'every platform, iOS order',
	empty.platforms.join() ===
		'Bluesky,Facebook,Instagram,LinkedIn,Mastodon,Pinterest,Threads,TikTok,YouTube',
	empty.platforms.join(),
);
check(
	'Instagram ratios with names',
	empty.ratios.join() ===
		'Square 1:1,Portrait 3:4,Classic 4:5,Landscape 1.91:1,Reels 9:16',
	empty.ratios.join(),
);
check(
	'empty: the crop previews with the other ratios',
	empty.label === '1:1' && empty.ghosts === 4,
	`${empty.label} ${empty.ghosts}`,
);
check(
	'empty: tiles dashed, export off',
	empty.tiles.every((t) => t === '—') && empty.disabled,
	empty.tiles.join(),
);

const make = (width, height) =>
	page.evaluate(
		({ width, height }) => {
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext('2d');
			context.fillStyle = '#1d3b8f';
			context.fillRect(0, 0, width, height);
			context.fillStyle = '#e07a3f';
			context.fillRect(0, 0, width / 2, height);
			return canvas.toDataURL('image/png').split(',')[1];
		},
		{ width, height },
	);
const wide = join(dir, 'wide.png');
writeFileSync(wide, Buffer.from(await make(3000, 2000), 'base64'));
const [chooser] = await Promise.all([
	page.waitForFileChooser({ timeout: 3000 }),
	page.click('.social-slot'),
]);
check('the slot opens the file picker', !!chooser);
await chooser.accept([wide]);
await page.waitForSelector('.social-source', { timeout: 5000 });
await sleep(200);

const state = () =>
	page.evaluate(() => {
		const crop = document.querySelector('.social-crop');
		return {
			title: document
				.querySelector('.social-source .canon-row-title')
				?.textContent.trim(),
			detail: document
				.querySelector('.social-source .canon-row-detail')
				?.textContent.trim(),
			tiles: [...document.querySelectorAll('.canon-tiles-value')].map(
				(t) => t.textContent.trim(),
			),
			value: crop?.getAttribute('aria-valuetext'),
			role: crop?.getAttribute('role'),
			name: crop?.getAttribute('aria-label'),
			tab: crop?.tabIndex,
			label: document.querySelector('.social-tag')?.textContent.trim(),
			hint: document
				.querySelector('.social-hint--shown')
				?.textContent.replace(/\s+/g, ' ')
				.trim(),
			ghosts: document.querySelectorAll('.social-ghost').length,
			disabled: document.querySelector('.social-download').disabled,
		};
	});
let s = await state();
check(
	'the source row: stem and size',
	s.title === 'wide' && s.detail === '3000 × 2000',
	`${s.title} ${s.detail}`,
);
check(
	'starts centred, as iOS',
	s.tiles.join('|') === '2000 × 2000 px|500, 0|3000 × 2000 px',
	s.tiles.join('|'),
);
check(
	'the crop is a named, focusable slider reading the offset',
	s.role === 'slider' && s.name === 'Crop' && s.tab === 0 && s.value === '500, 0',
	`${s.role} ${s.name} ${s.value}`,
);
check('the drag hint shows', s.hint === 'Drag to reposition', s.hint);
check('export is on', !s.disabled);

// keys: a hundredth of the image a press, a tenth with Shift
await page.focus('.social-crop');
await page.keyboard.press('ArrowRight');
s = await state();
check('ArrowRight moves 30 px', s.value === '530, 0', s.value);
await page.keyboard.down('Shift');
await page.keyboard.press('ArrowLeft');
await page.keyboard.up('Shift');
s = await state();
check('Shift+ArrowLeft moves 300 px', s.value === '230, 0', s.value);
await page.keyboard.press('ArrowUp');
s = await state();
check('ArrowUp is clamped (no room up)', s.value === '230, 0', s.value);

// pointer drag: right by a fifth of the shown width
const geo = await page.evaluate(() => {
	const crop = document.querySelector('.social-crop').getBoundingClientRect();
	const image = document.querySelector('.social-image').getBoundingClientRect();
	return {
		x: crop.left + crop.width / 2,
		y: crop.top + crop.height / 2,
		scale: 3000 / image.width,
		width: image.width,
	};
});
await page.mouse.move(geo.x, geo.y);
await page.mouse.down();
await page.mouse.move(geo.x + 40, geo.y, { steps: 4 });
const midDrag = await page.evaluate(
	() => !!document.querySelector('.social-picture--dragging .social-hint--shown'),
);
await page.mouse.move(geo.x + 80, geo.y, { steps: 4 });
await page.mouse.up();
s = await state();
const expected = Math.min(1000, Math.round(230 + 80 * geo.scale));
const [dragX] = s.value.split(',').map(Number);
check(
	'a drag moves the crop by the shown distance',
	Math.abs(dragX - expected) <= 2,
	`${s.value} want ~${expected}`,
);
check('the hint hides while dragging', !midDrag);
await page.mouse.move(geo.x + 80, geo.y);
await page.mouse.down();
await page.mouse.move(geo.x + geo.width, geo.y, { steps: 6 });
await page.mouse.up();
s = await state();
check('a drag stops at the edge', s.value === '1000, 0', s.value);

// a press outside the crop does not move it
const outside = await page.evaluate(() => {
	const image = document.querySelector('.social-image').getBoundingClientRect();
	return { x: image.left + 10, y: image.top + 10 };
});
await page.mouse.move(outside.x, outside.y);
await page.mouse.down();
await page.mouse.move(outside.x + 60, outside.y + 20, { steps: 4 });
await page.mouse.up();
s = await state();
check('a drag outside the crop does nothing', s.value === '1000, 0', s.value);

// ratio keeps the centre; platform keeps the same name
const pick = (group, text) =>
	page.evaluate(
		({ group, text }) =>
			[...document.querySelectorAll(`.${group} .canon-button`)]
				.find((b) => b.textContent.trim() === text)
				.click(),
		{ group, text },
	);
await pick('social-ratios', 'Portrait 3:4');
await sleep(100);
s = await state();
check(
	'a ratio keeps the centre, clamped',
	s.tiles[0] === '1500 × 2000 px' && s.value === '1250, 0' && s.label === '3:4',
	`${s.tiles[0]} ${s.value}`,
);
check(
	'the outlines spring after a ratio change',
	await page.evaluate(() => !!document.querySelector('.social-picture--springs')),
);
await pick('social-platforms', 'Bluesky');
await sleep(100);
s = await state();
const blueskyRatio = await page.$eval(
	'.social-ratios [aria-checked="true"]',
	(b) => b.textContent.trim(),
);
check(
	'a platform keeps the same-named ratio',
	blueskyRatio === 'Portrait 3:4' && s.ghosts === 3,
	blueskyRatio,
);
await pick('social-platforms', 'Mastodon');
await sleep(100);
check(
	'a platform without the name takes its first',
	(await page.$eval('.social-ratios [aria-checked="true"]', (b) =>
		b.textContent.trim(),
	)) === 'Preview 16:9',
);
check(
	'one ratio: no outlines',
	(await page.$$('.social-ghost')).length === 0,
);

// export: a PNG at the crop's pixels, named as the web tool did
await pick('social-platforms', 'Instagram');
await pick('social-ratios', 'Portrait 3:4');
await sleep(100);
await captureObjectUrl(page);
const names = [];
await page.exposeFunction('__named', (name) => names.push(name));
await page.evaluate(() => {
	const click = HTMLAnchorElement.prototype.click;
	HTMLAnchorElement.prototype.click = function () {
		if (this.download) return window.__named(this.download);
		return click.call(this);
	};
});
await page.click('.social-download');
await sleep(600);
const out = await page.evaluate(async () => {
	const blob = window.__result;
	if (!blob) return null;
	const bitmap = await createImageBitmap(blob);
	return { type: blob.type, width: bitmap.width, height: bitmap.height };
});
check(
	'Download PNG writes the crop',
	out?.type === 'image/png' && out.width === 1500 && out.height === 2000,
	JSON.stringify(out),
);
check(
	'the file name: stem, platform, ratio',
	names[0] === 'wide-instagram-3:4.png',
	names[0],
);

// paste anywhere replaces the source
await page.evaluate(async () => {
	const canvas = document.createElement('canvas');
	canvas.width = 500;
	canvas.height = 1000;
	const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
	const data = new DataTransfer();
	data.items.add(new File([blob], 'tall.png', { type: 'image/png' }));
	document.body.dispatchEvent(
		new ClipboardEvent('paste', {
			clipboardData: data,
			bubbles: true,
			cancelable: true,
		}),
	);
});
await sleep(400);
s = await state();
check(
	'a paste anywhere replaces the source, centred again',
	s.detail === '500 × 1000' && s.value === '0, 167',
	`${s.detail} ${s.value}`,
);

// drop on the settings; a non-image is ignored
const dropFile = (name, type, size) =>
	page.evaluate(
		async ({ name, type, size }) => {
			let file;
			if (type.startsWith('image/')) {
				const canvas = document.createElement('canvas');
				canvas.width = size;
				canvas.height = size;
				const blob = await new Promise((r) => canvas.toBlob(r, type));
				file = new File([blob], name, { type });
			} else file = new File(['x'], name, { type });
			const data = new DataTransfer();
			data.items.add(file);
			document
				.querySelector('.canon-split-main')
				.dispatchEvent(
					new DragEvent('drop', {
						dataTransfer: data,
						bubbles: true,
						cancelable: true,
					}),
				);
		},
		{ name, type, size },
	);
await dropFile('note.txt', 'text/plain');
await sleep(200);
check(
	'a dropped non-image is ignored',
	(await state()).title === 'tall',
);
await dropFile('dropped.png', 'image/png', 40);
await sleep(400);
check('a drop anywhere replaces the source', (await state()).title === 'dropped');
await pick('social-ratios', 'Square 1:1');
await sleep(100);
s = await state();
check(
	'an image the crop fills: no hint, no drag',
	!s.hint && s.tiles[0] === '40 × 40 px',
	`${s.hint} ${s.tiles[0]}`,
);

// a broken file shows the web message
await page.evaluate(() => {
	const data = new DataTransfer();
	data.items.add(new File(['nope'], 'broken.png', { type: 'image/png' }));
	document.body.dispatchEvent(
		new ClipboardEvent('paste', {
			clipboardData: data,
			bubbles: true,
			cancelable: true,
		}),
	);
});
await sleep(400);
check(
	'an unreadable image shows the web message',
	(await page.$eval('.canon-split-main .canon-status', (el) =>
		el.textContent.trim(),
	)) === 'Image could not be read. Try another file?',
);

await dropFile('again.png', 'image/png', 60);
await sleep(300);
await page.evaluate(() =>
	[...document.querySelectorAll('.social-source button')]
		.find((b) => b.textContent.trim() === 'Clear')
		.click(),
);
await sleep(200);
check(
	'Clear brings the slot back',
	!!(await page.$('.social-slot')) && !(await page.$('.social-source')),
);

// launch flags
await visit(page, '/tools/social-cropper?cropPlatform=youtube&cropRatio=1&cropSample&cropMove=100');
await page.waitForSelector('.social-source', { timeout: 5000 });
await sleep(300);
s = await state();
check(
	'?cropPlatform, ?cropRatio, ?cropSample, ?cropMove',
	(await page.$eval('.social-ratios [aria-checked="true"]', (b) =>
		b.textContent.trim(),
	)) === 'Shorts 9:16' && s.detail === '1600 × 1200' && s.value === '563, 0',
	`${s.detail} ${s.value}`,
);

// wide: halves, the picture fills its pane
const wideLayout = await page.evaluate(() => {
	const side = document
		.querySelector('.social-cropper .canon-split-sidebar')
		.getBoundingClientRect();
	const main = document
		.querySelector('.social-cropper .canon-split-main')
		.getBoundingClientRect();
	return { side: side.width, main: main.width, top: side.top === main.top };
});
check(
	'1400: the panes side by side, halves',
	wideLayout.top && Math.abs(wideLayout.side - wideLayout.main) < 2,
	JSON.stringify(wideLayout),
);

// phone: the picture collapses, nothing scrolls sideways
await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/social-cropper?cropSample');
await page.waitForSelector('.social-source', { timeout: 5000 });
const phone = await page.evaluate(async () => {
	const body = document.querySelector('.social-cropper .canon-split-body');
	const canvas = () =>
		document
			.querySelector('.social-cropper .canon-canvas')
			.getBoundingClientRect().height;
	const full = canvas();
	body.scrollTop = 800;
	await new Promise((r) => setTimeout(r, 200));
	return {
		full,
		band: canvas(),
		wide:
			document.documentElement.scrollWidth >
			document.documentElement.clientWidth,
	};
});
check('phone: the picture is first and large', phone.full > 250, String(phone.full));
check(
	'phone: the picture collapses to 240',
	Math.abs(phone.band - 240) < 2,
	String(phone.band),
);
check('phone: no horizontal scroll', !phone.wide);

await finish(browser);
