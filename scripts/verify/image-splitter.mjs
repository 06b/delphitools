// the canon image-splitter: picture, grid fields, tiles, menus, paste, drop, export

import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { launch, visit, check, finish, sleep } from './harness.mjs';

const dir = mkdtempSync(join(tmpdir(), 'split-'));
const { browser, page } = await launch();

await visit(page, '/tools/image-splitter');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.image-splitter').getBoundingClientRect()
				.height,
	),
);

const state = () =>
	page.evaluate(() => ({
		slot: document
			.querySelector('.canon-split-sidebar .split-slot')
			?.innerText.trim(),
		slotTag: document.querySelector('.split-slot')?.tagName,
		source: !!document.querySelector('.split-source'),
		title: document
			.querySelector('.split-source .canon-row-title')
			?.textContent.trim(),
		detail: document
			.querySelector('.split-source .canon-row-detail')
			?.textContent.trim(),
		tiles: [...document.querySelectorAll('.canon-tiles-value')].map((t) =>
			t.textContent.trim(),
		),
		cells: [...document.querySelectorAll('.split-tile')].map((t) =>
			t.getAttribute('aria-label'),
		),
		labels: document.querySelectorAll('.split-tile-label').length,
		disabled: document.querySelector('.split-download').disabled,
		cols: document.querySelector('.split-cols input')?.value,
		rows: document.querySelector('.split-rows input')?.value,
	}));

let s = await state();
check(
	'empty: the picture is the drop slot, a button',
	s.slot === 'Drop an image here' && s.slotTag === 'BUTTON',
	s.slot,
);
check('empty: no source row, no tiles', !s.source && s.cells.length === 0);
check(
	'empty: tiles count, dashes, export off',
	s.tiles.join('|') === '9|—|—' && s.disabled,
	s.tiles.join('|'),
);
check(
	'fields are named spinbuttons',
	await page.evaluate(() =>
		['.split-cols', '.split-rows'].every((sel) => {
			const input = document.querySelector(`${sel} input`);
			const name = document.getElementById(
				input.getAttribute('aria-labelledby'),
			)?.textContent.trim();
			return input.getAttribute('role') === 'spinbutton' && !!name;
		}),
	),
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
			context.fillRect(0, 0, width / 2, height / 2);
			return canvas.toDataURL('image/png').split(',')[1];
		},
		{ width, height },
	);
const photo = join(dir, 'photo.png');
writeFileSync(photo, Buffer.from(await make(1000, 601), 'base64'));
const [chooser] = await Promise.all([
	page.waitForFileChooser({ timeout: 3000 }),
	page.click('.split-slot'),
]);
check('the slot opens the file picker', !!chooser);
await chooser.accept([photo]);
await page.waitForSelector('.split-source', { timeout: 5000 });
await sleep(900);

s = await state();
check(
	'the source row: stem and size',
	s.title === 'photo' && s.detail === '1000 × 601',
	`${s.title} ${s.detail}`,
);
check(
	'nine tiles, labelled row-column',
	s.cells.join() === '1-1,1-2,1-3,2-1,2-2,2-3,3-1,3-2,3-3' &&
		s.labels === 9,
	s.cells.join(),
);
check(
	'readout: count, tile size, trimmed',
	s.tiles.join('|') === '9|333 × 200 px|1 × 1 px',
	s.tiles.join('|'),
);
check('export is on', !s.disabled);

const seams = await page.evaluate(() => {
	const [a, b] = [...document.querySelectorAll('.split-tile')].map((t) =>
		t.getBoundingClientRect(),
	);
	return b.left - a.right;
});
check('the tiles sit apart at the seams', seams > 2, seams);

// arrows step the field; typing is live
await page.focus('.split-cols input');
await page.keyboard.press('ArrowUp');
await sleep(50);
s = await state();
check(
	'ArrowUp adds a column, the picture follows',
	s.cols === '4' && s.cells.length === 12 && s.tiles[0] === '12',
	`${s.cols} ${s.cells.length}`,
);
check(
	'a new cut closes the seams, then springs them open',
	await page.evaluate(
		() =>
			new Promise((resolve) =>
				requestAnimationFrame(() =>
					requestAnimationFrame(() =>
						resolve(
							!!document.querySelector('.split-picture--springs'),
						),
					),
				),
			),
	),
);
await page.$eval('.split-rows input', (input) => (input.focus(), input.select()));
await page.keyboard.type('2');
await sleep(50);
s = await state();
check(
	'typing a row count is live',
	s.rows === '2' && s.cells.length === 8 && s.tiles[1] === '250 × 300 px',
	`${s.rows} ${s.tiles.join('|')}`,
);
await page.$eval('.split-rows input', (input) => (input.focus(), input.select()));
await page.keyboard.type('25');
await page.keyboard.press('Tab');
await sleep(50);
s = await state();
check('past 20 is not taken', s.rows === '2', s.rows);

// a tile menu: Download and Copy
const names = [];
const blobs = [];
await page.exposeFunction('__named', (name, size) => {
	names.push(name);
	blobs.push(size);
});
await page.evaluate(() => {
	const click = HTMLAnchorElement.prototype.click;
	HTMLAnchorElement.prototype.click = function () {
		if (this.download)
			return void fetch(this.href)
				.then((r) => r.blob())
				.then(createImageBitmap)
				.then((b) =>
					window.__named(this.download, `${b.width}x${b.height}`),
				);
		return click.call(this);
	};
});
const at = await page.evaluate(() => {
	const r = document
		.querySelector('.split-tile[aria-label="2-3"]')
		.getBoundingClientRect();
	return { x: r.x + r.width * 0.7, y: r.y + r.height * 0.6 };
});
await page.mouse.click(at.x, at.y);
await sleep(200);
const opened = await page.evaluate(() => {
	const r = document
		.querySelector('.canon-menu:popover-open')
		?.getBoundingClientRect();
	return r && { x: r.x, y: r.y };
});
check(
	'the menu opens at the pointer',
	opened &&
		Math.abs(opened.x - at.x) < 2 &&
		Math.abs(opened.y - at.y) < 2,
	JSON.stringify({ at, opened }),
);
const items = await page.evaluate(() =>
	[...document.querySelectorAll('.canon-menu-item')]
		.filter((item) => item.checkVisibility())
		.map((item) => item.textContent.trim()),
);
check('a tile opens its menu', items.join() === 'Download,Copy', items.join());
await page.evaluate(() =>
	[...document.querySelectorAll('.canon-menu-item')]
		.find((item) => item.checkVisibility() && item.textContent.trim() === 'Download')
		.click(),
);
await sleep(500);
check(
	'Download writes that tile, named stem-row-column',
	names[0] === 'photo-2-3.png' && blobs[0] === '250x300',
	`${names[0]} ${blobs[0]}`,
);

await browser
	.defaultBrowserContext()
	.overridePermissions(new URL(page.url()).origin, [
		'clipboard-read',
		'clipboard-write',
		'clipboard-sanitized-write',
	]);
await page.focus('.split-tile[aria-label="1-1"]');
await page.keyboard.press('Enter');
await sleep(200);
const below = await page.evaluate(() => {
	const tile = document
		.querySelector('.split-tile[aria-label="1-1"]')
		.getBoundingClientRect();
	const menu = document
		.querySelector('.canon-menu:popover-open')
		?.getBoundingClientRect();
	return (
		!!menu &&
		Math.abs(menu.x - tile.left) < 2 &&
		Math.abs(menu.y - tile.bottom) < 2
	);
});
check('Enter opens the menu below the tile', below);
await page.evaluate(() =>
	[...document.querySelectorAll('.canon-menu-item')]
		.find((item) => item.checkVisibility() && item.textContent.trim() === 'Copy')
		.click(),
);
await sleep(500);
const copied = await page.evaluate(async () => {
	try {
		const [item] = await navigator.clipboard.read();
		const bitmap = await createImageBitmap(await item.getType('image/png'));
		return `${bitmap.width}x${bitmap.height}`;
	} catch (error) {
		return String(error);
	}
});
check('Copy puts the tile on the clipboard', copied === '250x300', copied);
check(
	'Copy confirms through the toast',
	await page.evaluate(() => !!document.querySelector('.canon-toast')),
);

// Download All: every tile, in order
names.length = 0;
blobs.length = 0;
await page.click('.split-download');
await sleep(80);
check(
	'the busy row shows while downloading',
	await page.evaluate(
		() =>
			document.querySelector('.split-busy')?.textContent.trim() ===
			'Processing…',
	),
);
await sleep(1500);
check(
	'Download All writes all eight',
	names.join() ===
		'photo-1-1.png,photo-1-2.png,photo-1-3.png,photo-1-4.png,photo-2-1.png,photo-2-2.png,photo-2-3.png,photo-2-4.png',
	names.join(),
);
check('the busy row goes', !(await page.$('.split-busy')));

// paste anywhere replaces the source
await page.evaluate(async () => {
	const canvas = document.createElement('canvas');
	canvas.width = 10;
	canvas.height = 10;
	const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
	const data = new DataTransfer();
	data.items.add(new File([blob], 'tiny.png', { type: 'image/png' }));
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
check('a paste anywhere replaces the source', s.title === 'tiny', s.title);
await page.$eval('.split-cols input', (input) => (input.focus(), input.select()));
await page.keyboard.type('20');
await sleep(50);
s = await state();
check(
	'tiles thinner than a pixel: export off',
	s.tiles[1] === '0 × 5 px' && s.disabled,
	s.tiles.join('|'),
);
check('small tiles drop their labels', s.labels === 0, s.labels);

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
			document.querySelector('.canon-split-main').dispatchEvent(
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
check('a dropped non-image is ignored', (await state()).title === 'tiny');
await dropFile('dropped.png', 'image/png', 400);
await sleep(400);
check('a drop anywhere replaces the source', (await state()).title === 'dropped');

await page.evaluate(() =>
	[...document.querySelectorAll('.split-source button')]
		.find((b) => b.textContent.trim() === 'Clear')
		.click(),
);
await sleep(200);
s = await state();
check('Clear brings the slot back', !!s.slot && !s.source && s.cells.length === 0);

// launch flags
await visit(page, '/tools/image-splitter?splitGrid=4x2&splitSample');
await page.waitForSelector('.split-source', { timeout: 5000 });
await sleep(300);
s = await state();
check(
	'?splitGrid, ?splitSample',
	s.cols === '4' && s.rows === '2' && s.detail === '1600 × 1200' &&
		s.tiles.join('|') === '8|400 × 600 px|0 px',
	`${s.cols}x${s.rows} ${s.detail} ${s.tiles.join('|')}`,
);

// phone: stacked, no sideways scroll
await page.setViewport({ width: 390, height: 844 });
await sleep(400);
check(
	'390 px: no horizontal scroll',
	await page.evaluate(
		() =>
			document.documentElement.scrollWidth <=
			document.documentElement.clientWidth,
	),
);
check(
	'390 px: the tiles stay inside the picture',
	await page.evaluate(() => {
		const area = document.querySelector('.split-picture').getBoundingClientRect();
		return [...document.querySelectorAll('.split-tile')].every((t) => {
			const r = t.getBoundingClientRect();
			return r.left >= area.left - 0.5 && r.right <= area.right + 0.5;
		});
	}),
);

await finish(browser);
