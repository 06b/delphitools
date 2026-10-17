// the canon image-stitcher: picture, plus buttons, shared menu, drags, tile
// settings, batch strip, empty state, drop, paste

import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { launch, visit, check, finish, sleep } from './harness.mjs';

const dir = mkdtempSync(join(tmpdir(), 'stitcher-'));
const { browser, page } = await launch();

await visit(page, '/tools/image-stitcher');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.image-stitcher').getBoundingClientRect()
				.height,
	),
);

const state = () =>
	page.evaluate(() => {
		const text = (sel) => document.querySelector(sel)?.textContent.trim();
		return {
			slot: text('.stitch-slot'),
			base: text('.stitch-base .canon-row-title'),
			baseDetail: text('.stitch-base .canon-row-detail'),
			tiles: [...document.querySelectorAll('button.stitch-tile')].map(
				(t) => t.getAttribute('aria-label'),
			),
			batchTiles: document.querySelectorAll('span.stitch-tile').length,
			lit: text('.stitch-tile--lit') ?? '',
			litName: document
				.querySelector('.stitch-tile--lit')
				?.getAttribute('aria-label'),
			pins: document.querySelectorAll('.stitch-plate--pin').length,
			gutters: document.querySelectorAll('.stitch-add--gutter').length,
			seams: document.querySelectorAll('.stitch-add--seam').length,
			adders: document.querySelectorAll('.stitch-add--filled').length,
			readout: [...document.querySelectorAll('.canon-tiles-value')].map(
				(t) => t.textContent.trim(),
			),
			tileRow: text('.stitch-tile-row .canon-row-title'),
			noTile: text('.stitch-no-tile'),
			fit: text('.stitch-fit [aria-checked="true"]'),
			copyOff: document.querySelector('.stitch-copy')?.disabled,
			downloadOff: document.querySelector('.stitch-download')?.disabled,
			download: text('.stitch-download'),
			reading: text('.stitch-reading'),
			strip: document.querySelectorAll(
				'.stitch-strip .canon-page-strip-cell',
			).length,
			stripNames: [
				...document.querySelectorAll('.stitch-strip .canon-page-strip-name'),
			].map((n) => n.textContent.trim()),
		};
	});

// empty: the loaded layout in blank
let s = await state();
check('empty: the picture is the dashed slot', s.slot === 'Drop images here', s.slot);
check(
	'empty: base row blank, Tile says Tap a tile',
	s.base === '—' && s.noTile === 'Tap a tile',
	`${s.base} ${s.noTile}`,
);
check(
	'empty: readout dashes, Copy and Download off',
	s.readout.join('|') === '—|—' && s.copyOff && s.downloadOff,
	s.readout.join('|'),
);
check(
	'empty: the formats stay pickable',
	await page.evaluate(
		() =>
			[...document.querySelectorAll('.stitch-formats button')].filter(
				(b) => !b.disabled,
			).length >= 3,
	),
);

const make = (width, height, colour) =>
	page.evaluate(
		({ width, height, colour }) => {
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext('2d');
			context.fillStyle = colour;
			context.fillRect(0, 0, width, height);
			return canvas.toDataURL('image/png').split(',')[1];
		},
		{ width, height, colour },
	);
const files = {};
for (const [name, w, h, c] of [
	['a', 800, 600, '#c00'],
	['b', 600, 600, '#0c0'],
	['c', 400, 800, '#00c'],
]) {
	files[name] = join(dir, `${name}.png`);
	writeFileSync(files[name], Buffer.from(await make(w, h, c), 'base64'));
}

const [chooser] = await Promise.all([
	page.waitForFileChooser({ timeout: 3000 }),
	page.click('.stitch-slot'),
]);
check('the slot opens a multi-file picker', chooser.isMultiple());
await chooser.accept([files.a, files.b]);
await page.waitForSelector('button.stitch-tile', { timeout: 5000 });
await sleep(700);

s = await state();
check('two files become two tiles in a row', s.tiles.join() === 'a,b', s.tiles.join());
check(
	'the base row names the first, with its size',
	s.base === 'a' && s.baseDetail === 'Base · 800 × 600 px',
	`${s.base} / ${s.baseDetail}`,
);
check('the base tile wears the pin', s.pins === 1, s.pins);
check(
	'four gutters and one seam button',
	s.gutters === 4 && s.seams === 1,
	`${s.gutters} ${s.seams}`,
);
check(
	'readout: size and tiles; export on',
	s.readout.join('|') === '1400 × 600 px|2' && !s.downloadOff,
	s.readout.join('|'),
);
check('the size reads out for assistive tech', s.reading === '1400 × 600 px', s.reading);

// the shared menu: one panel for every plus button
check(
	'one menu panel for all plus buttons',
	await page.evaluate(
		() => document.querySelectorAll('.stitch-picture .canon-menu').length,
	) === 1,
);
const gutter = await page.evaluate(() => {
	const r = document
		.querySelector('.stitch-add--gutter[aria-label="Add bottom"]')
		.getBoundingClientRect();
	return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
});
await page.mouse.click(gutter.x, gutter.y);
await sleep(200);
const menu = await page.evaluate(() => {
	const panel = document.querySelector('.canon-menu:popover-open');
	const r = panel?.getBoundingClientRect();
	return (
		r && {
			x: r.x,
			y: r.y,
			items: [...panel.querySelectorAll('.canon-menu-item')].map((i) =>
				i.textContent.trim(),
			),
		}
	);
});
check(
	'a plus opens Files and Paste at the pointer',
	menu &&
		menu.items.join() === 'Files,Paste' &&
		Math.abs(menu.x - gutter.x) < 2 &&
		Math.abs(menu.y - gutter.y) < 2,
	JSON.stringify(menu),
);
const [bottom] = await Promise.all([
	page.waitForFileChooser({ timeout: 3000 }),
	page.evaluate(() =>
		[...document.querySelectorAll('.canon-menu-item')]
			.find((i) => i.checkVisibility() && i.textContent.trim() === 'Files')
			.click(),
	),
]);
await bottom.accept([files.c]);
await sleep(800);
s = await state();
check('Files under Add bottom adds a third tile', s.tiles.length === 3, s.tiles.join());
const below = await page.evaluate(() => {
	const [a, , c] = [...document.querySelectorAll('button.stitch-tile')].map(
		(t) => t.getBoundingClientRect(),
	);
	return c.top >= a.bottom - 1;
});
check('and it sits below the row', below);

// select: Tile settings, adders, fit, base, Escape
await page.click('button.stitch-tile[aria-label="b"]');
await sleep(200);
s = await state();
check(
	'a click lights the tile; the Tile section names it',
	s.litName === 'b' && s.tileRow === 'b' && s.fit === 'Cheese',
	`${s.litName} ${s.tileRow} ${s.fit}`,
);
check(
	'the lit tile has four adders; gutters and seams hide',
	s.adders === 4 && s.gutters === 0 && s.seams === 0,
	`${s.adders} ${s.gutters} ${s.seams}`,
);
check(
	'the tile is a pressed toggle',
	await page.evaluate(
		() =>
			document
				.querySelector('button.stitch-tile[aria-label="b"]')
				.getAttribute('aria-pressed') === 'true',
	),
);
await page.evaluate(() =>
	[...document.querySelectorAll('.stitch-fit button')]
		.find((b) => b.textContent.trim() === 'Match')
		.click(),
);
await sleep(200);
s = await state();
check('Fit Match changes the tile and the size', s.fit === 'Match', s.readout.join('|'));
await page.click('.stitch-make-base');
await sleep(200);
s = await state();
check(
	'Make base moves the base',
	s.base === 'b' &&
		(await page.evaluate(
			() =>
				document.querySelector('.stitch-make-base').textContent.trim() ===
					'Base' && document.querySelector('.stitch-make-base').disabled,
		)),
	s.base,
);
await page.keyboard.press('Escape');
await sleep(150);
s = await state();
check('Escape lets go of the tile', !s.litName && s.noTile === 'Tap a tile');

// drags: middle swaps, edge places
const centre = (name) =>
	page.evaluate((name) => {
		const r = document
			.querySelector(`button.stitch-tile[aria-label="${name}"]`)
			.getBoundingClientRect();
		return {
			x: r.x + r.width / 2,
			y: r.y + r.height / 2,
			r: { x: r.x, y: r.y, width: r.width, height: r.height },
		};
	}, name);
const order = () =>
	page.evaluate(() =>
		[...document.querySelectorAll('button.stitch-tile')]
			.map((t) => {
				const r = t.getBoundingClientRect();
				return { name: t.getAttribute('aria-label'), x: r.x, y: r.y };
			})
			.sort((p, q) => p.y - q.y || p.x - q.x)
			.map((t) => t.name)
			.join(),
	);
const before = await order();
let from = await centre('a');
let to = await centre('b');
await page.mouse.move(from.x, from.y);
await page.mouse.down();
await page.mouse.move(from.x + 20, from.y, { steps: 4 });
await page.mouse.move(to.x, to.y, { steps: 8 });
const mid = await page.evaluate(() => ({
	ghost: !!document.querySelector('.stitch-ghost'),
	mark: !!document.querySelector('.stitch-mark'),
}));
check('a drag shows the ghost and the swap mark', mid.ghost && mid.mark);
await page.mouse.up();
await sleep(600);
const swapped = await order();
check(
	'dropped in the middle, two tiles trade places',
	before === 'a,b,c' && swapped === 'b,a,c',
	`${before} -> ${swapped}`,
);
s = await state();
check('the drag does not light a tile', !s.litName);

from = await centre('c');
to = await centre('b');
await page.mouse.move(from.x, from.y);
await page.mouse.down();
await page.mouse.move(from.x, from.y - 20, { steps: 4 });
await page.mouse.move(to.r.x + 4, to.y, { steps: 8 });
await page.mouse.up();
await sleep(600);
const placed = await order();
check('dropped on an edge band, the tile moves beside it', placed === 'c,b,a', placed);

// seam insert from the clipboard
await browser
	.defaultBrowserContext()
	.overridePermissions(new URL(page.url()).origin, [
		'clipboard-read',
		'clipboard-write',
		'clipboard-sanitized-write',
	]);
await page.evaluate(async () => {
	const canvas = document.createElement('canvas');
	canvas.width = 300;
	canvas.height = 300;
	const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
	await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
});
await page.focus('.stitch-add--seam');
await page.keyboard.press('Enter');
await sleep(200);
await page.evaluate(() =>
	[...document.querySelectorAll('.canon-menu-item')]
		.find((i) => i.checkVisibility() && i.textContent.trim() === 'Paste')
		.click(),
);
await sleep(800);
s = await state();
check('Paste from a seam inserts a fourth tile', s.tiles.length === 4, s.tiles.join());

// paste anywhere adds beside the composite
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
await sleep(600);
s = await state();
check('a paste anywhere adds a tile', s.tiles.includes('tiny'), s.tiles.join());

// a file dropped on a tile's edge lands there
const dropOn = (selector, x, y, name) =>
	page.evaluate(
		async ({ selector, x, y, name }) => {
			const canvas = document.createElement('canvas');
			canvas.width = 200;
			canvas.height = 200;
			const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
			const data = new DataTransfer();
			data.items.add(new File([blob], name, { type: 'image/png' }));
			const target = document.querySelector(selector);
			for (const type of ['dragover', 'drop'])
				target.dispatchEvent(
					new DragEvent(type, {
						dataTransfer: data,
						bubbles: true,
						cancelable: true,
						clientX: x,
						clientY: y,
					}),
				);
		},
		{ selector, x, y, name },
	);
const cTile = await centre('c');
await dropOn('.stitch-picture', cTile.r.x + 3, cTile.y, 'edge.png');
await sleep(700);
const leftOfC = await page.evaluate(() => {
	const r = (n) =>
		document
			.querySelector(`button.stitch-tile[aria-label="${n}"]`)
			.getBoundingClientRect();
	return r('edge').right <= r('c').left + 1;
});
check('a file dropped on a left edge lands left of that tile', leftOfC);

// Remove and Clear
await page.click('button.stitch-tile[aria-label="tiny"]');
await sleep(150);
await page.click('.stitch-remove');
await sleep(300);
s = await state();
check('Remove takes the lit tile out', !s.tiles.includes('tiny'), s.tiles.join());
await page.evaluate(() =>
	[...document.querySelectorAll('.stitch-base button')]
		.find((b) => b.textContent.trim() === 'Clear')
		.click(),
);
await sleep(300);
s = await state();
check('Clear brings the slot back', !!s.slot && s.tiles.length === 0);

// batch: the strip, its menu, the order cells
await visit(page, '/tools/image-stitcher?stitchSample&stitchMode=batch');
await page.waitForSelector('span.stitch-tile', { timeout: 5000 });
await sleep(400);
s = await state();
check(
	'batch: four numbered cells and a strip of four',
	s.batchTiles === 4 &&
		s.strip === 4 &&
		(await page.$$('.stitch-plate')).length === 4,
	`${s.batchTiles} ${s.strip}`,
);
check(
	'batch readout: size, grid, cell',
	s.readout.join('|') === '3200 × 2400 px|2 × 2|1600 × 1200 px',
	s.readout.join('|'),
);
await page.click('.stitch-sort-up');
await sleep(200);
s = await state();
check('A–Z sorts the strip', s.stripNames.join() === 'coast,dusk,field,sand', s.stripNames.join());
await page.focus('.stitch-strip [data-page-index="0"] .canon-page-strip-page');
await page.keyboard.down('Alt');
await page.keyboard.press('ArrowRight');
await page.keyboard.up('Alt');
await sleep(200);
s = await state();
check('Alt+Arrow moves a page', s.stripNames.join() === 'dusk,coast,field,sand', s.stripNames.join());
await page.click('.stitch-clear');
await sleep(200);
s = await state();
check(
	'batch Clear: blank strip, dashes, export off',
	s.strip === 1 && s.readout.join('|') === '—|—|—' && s.downloadOff,
	`${s.strip} ${s.readout.join('|')}`,
);

// phone: stacked, no sideways scroll
await visit(page, '/tools/image-stitcher?stitchSample');
await page.setViewport({ width: 390, height: 844 });
await page.waitForSelector('button.stitch-tile', { timeout: 5000 });
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
		const area = document.querySelector('.stitch-picture').getBoundingClientRect();
		return [...document.querySelectorAll('.stitch-tile')].every((t) => {
			const r = t.getBoundingClientRect();
			return r.left >= area.left - 0.5 && r.right <= area.right + 0.5;
		});
	}),
);

await finish(browser);
