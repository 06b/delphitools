// the canon image-clipper: picture, trim, tiles, copy, export, paste, drop, flags

import { mkdtempSync, writeFileSync } from 'node:fs';
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

const dir = mkdtempSync(join(tmpdir(), 'clip-'));
const { browser, page } = await launch();
await browser
	.defaultBrowserContext()
	.overridePermissions(BASE, [
		'clipboard-read',
		'clipboard-write',
		'clipboard-sanitized-write',
	]);

await visit(page, '/tools/image-clipper');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.image-clipper').getBoundingClientRect()
				.height,
	),
);

const state = () =>
	page.evaluate(() => ({
		slot: document.querySelector('.clip-slot .media-slot-prompt')?.innerText.trim(),
		slotTag: document.querySelector('.clip-slot .media-slot-upload')?.tagName,
		title: document
			.querySelector('.clip-source .canon-row-title')
			?.textContent.trim(),
		detail: document
			.querySelector('.clip-source .canon-row-detail')
			?.textContent.trim(),
		tiles: [...document.querySelectorAll('.canon-tiles-tile')].map(
			(t) =>
				`${t.querySelector('.canon-tiles-label').textContent.trim()}=${t.querySelector('.canon-tiles-value').textContent.trim()}`,
		),
		note: document.querySelector('.clip-note')?.textContent.trim(),
		nothing: document.querySelector('.clip-nothing.canon-status--warn')?.textContent.trim(),
		remover: [...document.querySelectorAll('.clip-elsewhere a')].map((a) => `${a.textContent.trim()}>${a.getAttribute('href')}`),
		failure: document.querySelector('.clip-failure')?.textContent.trim(),
		copy: document.querySelector('.clip-copy').disabled,
		download: document.querySelector('.clip-download').disabled,
		name: document
			.querySelector('.clip-name[role="img"]')
			?.getAttribute('aria-label'),
		margins: [...document.querySelectorAll('.clip-margin--shown')].map(
			(m) => m.textContent.trim(),
		),
		figures: [
			...document.querySelectorAll(
				'.clip-dimension .canon-figure-said',
			),
		].map((f) => f.textContent.trim()),
		blank: document.querySelectorAll('.canon-dimension-line--blank')
			.length,
		box: !!document.querySelector('.clip-box'),
	}));

let s = await state();
check(
	'empty: the picture is the drop target, a button',
	s.slot === 'Drop a PNG here or click to upload' && s.slotTag === 'BUTTON',
	s.slot,
);
check(
	'empty: the blank sheet, dashed box and blank lines',
	s.box && s.blank === 2,
	`${s.box} ${s.blank}`,
);
check('empty: no source row', !s.title);
check(
	'empty: tiles in iOS order, dashed',
	s.tiles.join() ===
		'Original=—,Clipped=—,Area=—,Top=—,Right=—,Bottom=—,Left=—',
	s.tiles.join(),
);
check('empty: copy and download off', s.copy && s.download);

// a PNG kept at 500, 250, 600 x 400 of 1400 x 1000
const make = (width, height, rect, type = 'image/png') =>
	page.evaluate(
		({ width, height, rect, type }) => {
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext('2d');
			context.fillStyle = '#1d3b8f';
			if (rect) context.fillRect(...rect);
			return canvas.toDataURL(type).split(',')[1];
		},
		{ width, height, rect, type },
	);
const logo = join(dir, 'logo.png');
writeFileSync(
	logo,
	Buffer.from(await make(1400, 1000, [500, 250, 600, 400]), 'base64'),
);
const [chooser] = await Promise.all([
	page.waitForFileChooser({ timeout: 3000 }),
	page.click('.clip-slot'),
]);
check(
	'the slot opens the PNG picker',
	!!chooser &&
		(await page.$eval(
			'.image-clipper input[type="file"]',
			(i) => i.accept,
		)) === 'image/png',
);
await chooser.accept([logo]);
await page.waitForSelector('.clip-source', { timeout: 5000 });
await sleep(100);
check(
	'a new source springs the box in',
	await page.evaluate(() => !!document.querySelector('.clip-picture--springs')),
);
await sleep(800);
s = await state();
check(
	'the source row: name and size',
	s.title === 'logo.png' && s.detail === '1400 × 1000',
	`${s.title} ${s.detail}`,
);
check(
	'tiles: sizes, area saved, margins',
	s.tiles.join() ===
		'Original=1400 × 1000 px,Clipped=600 × 400 px,Area=−83 %,Top=250 px,Right=300 px,Bottom=350 px,Left=500 px',
	s.tiles.join(),
);
check(
	'the area tile carries a level',
	!!(await page.$('.canon-tiles-level')),
);
check('the picture is named by the kept size', s.name === '600 × 400 px', s.name);
check(
	'margins inside the bands, dimension lines on the kept box',
	s.margins.join() === '250 px,300 px,350 px,500 px' &&
		s.figures.join() === '600px,400px' &&
		s.blank === 0,
	`${s.margins.join()} | ${s.figures.join()}`,
);
const geometry = await page.evaluate(() => {
	const image = document.querySelector('.clip-image').getBoundingClientRect();
	const box = document.querySelector('.clip-box').getBoundingClientRect();
	const scale = image.width / 1400;
	return {
		x: (box.left - image.left) / scale,
		y: (box.top - image.top) / scale,
		width: box.width / scale,
		height: box.height / scale,
	};
});
check(
	'the box sits on the kept pixels',
	Math.abs(geometry.x - 500) < 2 &&
		Math.abs(geometry.y - 250) < 2 &&
		Math.abs(geometry.width - 600) < 2 &&
		Math.abs(geometry.height - 400) < 2,
	JSON.stringify(geometry),
);
check('copy and download on, no note', !s.copy && !s.download && !s.note);

// download: the kept pixels, named stem-clipped.png
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
await page.click('.clip-download');
await sleep(500);
const out = await page.evaluate(async () => {
	const blob = window.__result;
	if (!blob) return null;
	const bitmap = await createImageBitmap(blob);
	const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
	const context = canvas.getContext('2d');
	context.drawImage(bitmap, 0, 0);
	const corner = context.getImageData(0, 0, 1, 1).data[3];
	return {
		type: blob.type,
		width: bitmap.width,
		height: bitmap.height,
		corner,
	};
});
check(
	'Download PNG writes the kept pixels',
	out?.type === 'image/png' &&
		out.width === 600 &&
		out.height === 400 &&
		out.corner === 255,
	JSON.stringify(out),
);
check('the file name: stem-clipped.png', names[0] === 'logo-clipped.png', names[0]);

// copy: a PNG on the clipboard, the toast confirms
await page.click('.clip-copy');
await sleep(400);
const copied = await page.evaluate(async () => {
	const [item] = await navigator.clipboard.read();
	return item?.types.includes('image/png');
});
check('Copy puts the PNG on the clipboard', copied);
check(
	'and the toast shows',
	await page.$eval('.canon-toast', (el) => el.style.opacity === '1'),
);

// paste anywhere: an opaque PNG has nothing to trim
const paste = (data64, name, type = 'image/png') =>
	page.evaluate(
		({ data64, name, type }) => {
			const bytes = Uint8Array.from(atob(data64), (c) => c.charCodeAt(0));
			const data = new DataTransfer();
			data.items.add(new File([bytes], name, { type }));
			document.body.dispatchEvent(
				new ClipboardEvent('paste', {
					clipboardData: data,
					bubbles: true,
					cancelable: true,
				}),
			);
		},
		{ data64, name, type },
	);
await paste(await make(300, 200, [0, 0, 300, 200]), 'opaque.png');
await sleep(900);
s = await state();
check(
	'a paste anywhere replaces the source',
	s.title === 'opaque.png' && s.detail === '300 × 200',
	`${s.title} ${s.detail}`,
);
check(
	'nothing to trim: the warning, 0 %',
	s.nothing === 'Nothing was clipped. Is this a transparent PNG?' &&
		!s.note &&
		s.tiles[2] === 'Area=0 %' &&
		s.margins.length === 0 &&
		!s.download,
	`${s.nothing} ${s.tiles[2]}`,
);
check(
	'and one link, to the Background Remover',
	s.remover.join() === 'Background Remover>/tools/background-remover',
	s.remover.join(),
);

// drop anywhere: fully transparent, a JPEG, a text file
const dropFile = (data64, name, type) =>
	page.evaluate(
		({ data64, name, type }) => {
			const bytes = Uint8Array.from(atob(data64), (c) => c.charCodeAt(0));
			const data = new DataTransfer();
			data.items.add(new File([bytes], name, { type }));
			document.querySelector('.canon-split-main').dispatchEvent(
				new DragEvent('drop', {
					dataTransfer: data,
					bubbles: true,
					cancelable: true,
				}),
			);
		},
		{ data64, name, type },
	);
await dropFile(await make(80, 60), 'clear.png', 'image/png');
await sleep(400);
s = await state();
check(
	'fully transparent: the iOS note, nothing to export',
	s.title === 'clear.png' &&
		s.note === 'Fully transparent' &&
		s.name === 'Fully transparent' &&
		s.tiles[1] === 'Clipped=—' &&
		s.copy &&
		s.download &&
		!s.box,
	`${s.note} ${s.tiles[1]}`,
);
await dropFile(btoa('x'), 'note.txt', 'text/plain');
await sleep(200);
s = await state();
check('a dropped non-image is ignored', s.title === 'clear.png' && !s.failure);
await dropFile(await make(40, 40, [0, 0, 20, 20], 'image/jpeg'), 'photo.jpg', 'image/jpeg');
await sleep(300);
s = await state();
check(
	'a JPEG shows the web message, the source stays',
	s.failure === 'Only PNG files are supported.' && s.title === 'clear.png',
	s.failure,
);
await paste(btoa('nope'), 'broken.png');
await sleep(400);
s = await state();
check(
	'an unreadable PNG names the file, the source stays',
	s.failure === 'Could not read broken.png' && s.title === 'clear.png',
	s.failure,
);
await dropFile(await make(50, 50, [10, 10, 5, 5]), 'dot.png', 'image/png');
await sleep(900);
s = await state();
check(
	'a good file clears the failure',
	!s.failure && s.tiles[1] === 'Clipped=5 × 5 px',
	s.tiles[1],
);

check(
	'every control is named',
	await page.$$eval('.image-clipper button', (els) =>
		els.every(
			(el) => el.textContent.trim() || el.getAttribute('aria-label'),
		),
	),
);

await page.evaluate(() =>
	[...document.querySelectorAll('.clip-source button')]
		.find((b) => b.textContent.trim() === 'Clear')
		.click(),
);
await sleep(200);
s = await state();
check('Clear brings the slot back', !!s.slot && !s.title && s.tiles[0] === 'Original=—');

// launch flag
await visit(page, '/tools/image-clipper?clipSample');
await page.waitForSelector('.clip-source', { timeout: 5000 });
await sleep(900);
s = await state();
check(
	'?clipSample: the iOS -clipSample',
	s.detail === '1400 × 1000' && s.tiles[1] === 'Clipped=600 × 400 px',
	`${s.detail} ${s.tiles[1]}`,
);

// wide: halves
const wide = await page.evaluate(() => {
	const side = document
		.querySelector('.image-clipper .canon-split-sidebar')
		.getBoundingClientRect();
	const main = document
		.querySelector('.image-clipper .canon-split-main')
		.getBoundingClientRect();
	return { side: side.width, main: main.width, top: side.top === main.top };
});
check(
	'1400: the panes side by side, halves',
	wide.top && Math.abs(wide.side - wide.main) < 2,
	JSON.stringify(wide),
);

// reduced motion: no spring
await page.emulateMediaFeatures([
	{ name: 'prefers-reduced-motion', value: 'reduce' },
]);
await visit(page, '/tools/image-clipper?clipSample');
await page.waitForSelector('.clip-source', { timeout: 5000 });
await sleep(50);
check(
	'reduced motion: the box lands without the spring',
	await page.evaluate(() => !document.querySelector('.clip-picture--springs')),
);
await page.emulateMediaFeatures([
	{ name: 'prefers-reduced-motion', value: 'no-preference' },
]);

// phone: the picture collapses on a short screen, nothing scrolls sideways
for (const height of [844, 600]) {
await page.setViewport({ width: 390, height });
await visit(page, '/tools/image-clipper?clipSample');
await page.waitForSelector('.clip-source', { timeout: 5000 });
const phone = await page.evaluate(async () => {
	const body = document.querySelector('.image-clipper .canon-split-body');
	const canvas = () =>
		document
			.querySelector('.image-clipper .canon-canvas')
			.getBoundingClientRect().height;
	const full = canvas();
	const scrolls = body.scrollHeight > body.clientHeight;
	body.scrollTop = 800;
	await new Promise((r) => setTimeout(r, 200));
	return {
		full,
		scrolls,
		band: canvas(),
		wide:
			document.documentElement.scrollWidth >
			document.documentElement.clientWidth,
	};
});
check(`390 x ${height}: the picture is first and large`, phone.full > 250, String(phone.full));
check(
	`390 x ${height}: everything fits unscrolled, or the picture collapses to 240`,
	phone.scrolls
		? Math.abs(phone.band - 240) < 2
		: phone.band === phone.full,
	`${phone.scrolls} ${phone.band}`,
);
check(`390 x ${height}: no horizontal scroll`, !phone.wide);
}

// the link hands the image to the Background Remover
await page.setViewport({ width: 1400, height: 1000 });
await visit(page, '/tools/image-clipper');
await paste(await make(300, 200, [0, 0, 300, 200]), 'opaque.png');
await page.waitForSelector('.clip-elsewhere a', { timeout: 5000 });
await page.click('.clip-elsewhere a');
await page.waitForFunction(() => location.pathname === '/tools/background-remover', { timeout: 10000 });
const handed = await page
	.waitForFunction(
		() => document.querySelector('.bg-source .canon-row-title')?.textContent.trim(),
		{ timeout: 10000 },
	)
	.then((h) => h.jsonValue())
	.catch(() => null);
check('the Background Remover opens with the image', handed === 'opaque.png', String(handed));

await finish(browser);
