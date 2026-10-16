// the canon image-masker: picture, shapes, svg mask, frame, output, paste, drop, flags

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

const dir = mkdtempSync(join(tmpdir(), 'masker-'));
const notch = join(dir, 'notch.svg');
writeFileSync(
	notch,
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><path d="M0 0H10V10H5V5H0Z"/></svg>',
);
const { browser, page } = await launch();

await visit(page, '/tools/image-masker');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.image-masker').getBoundingClientRect()
				.height,
	),
);

// a share of the preview canvas, as rgba
const pixel = (fx, fy) =>
	page.evaluate(
		(fx, fy) => {
			const canvas = document.querySelector('.masker-canvas');
			const context = canvas.getContext('2d');
			return [
				...context.getImageData(
					Math.floor(canvas.width * fx),
					Math.floor(canvas.height * fy),
					1,
					1,
				).data,
			];
		},
		fx,
		fy,
	);

const state = () =>
	page.evaluate(() => ({
		slot: document
			.querySelector('.canon-split-sidebar .masker-slot')
			?.innerText.trim(),
		slotTag: document.querySelector('.masker-slot')?.tagName,
		source: document
			.querySelector('.masker-source .canon-row-title')
			?.textContent.trim(),
		detail: document
			.querySelector('.masker-source .canon-row-detail')
			?.textContent.trim(),
		tiles: [...document.querySelectorAll('.canon-tiles-value')].map((t) =>
			t.textContent.trim(),
		),
		name: document.querySelector('.masker-canvas')?.getAttribute('aria-label'),
		role: document.querySelector('.masker-canvas')?.getAttribute('role'),
		dimension: document
			.querySelector('.masker-dimension .canon-figure-said')
			?.textContent.replace(/\s+/g, '')
			.trim(),
		families: document.querySelectorAll(
			'.masker-cells--families button.masker-cell',
		).length,
		variants: [
			...document.querySelectorAll('.masker-cells--variants .masker-cell'),
		].map((b) => b.getAttribute('aria-label')),
		chosen: [...document.querySelectorAll('.masker-cell--chosen')].map((b) =>
			b.getAttribute('aria-label'),
		),
		edge: !!document.querySelector('.masker-edge'),
		ghost: !!document.querySelector('.masker-ghost'),
		thumbs: document.querySelectorAll('.masker-cells--variants image').length,
		hint: document
			.querySelector('.masker-hint--shown')
			?.textContent.replace(/\s+/g, ' ')
			.trim(),
		handle: document.querySelector('.masker-handle')?.getAttribute('aria-valuetext'),
		zoom: document
			.querySelector('.masker-zoom .canon-slider')
			?.textContent.trim(),
		reset: document.querySelector('.masker-reset')?.disabled,
		custom: document
			.querySelector('.masker-custom-file .canon-row-title')
			?.textContent.trim(),
		svgRow: !!document.querySelector('.masker-svg'),
		status: document
			.querySelector('.canon-split-main .canon-status')
			?.textContent.trim(),
	}));

let s = await state();
check(
	'empty: the picture is the drop target, a button',
	s.slot === 'Drop an image' && s.slotTag === 'BUTTON',
	s.slot,
);
check('empty: no source row', !s.source);
check(
	'the canvas is a named image with its size',
	s.role === 'img' && s.name === 'Squircle 4, 1024 × 1024 px',
	s.name,
);
check('the dimension line reads the side', s.dimension === '1024px', s.dimension);
check(
	'28 families, 12 variants of the chosen one',
	s.families === 28 &&
		s.variants.length === 12 &&
		s.variants[0] === 'Squircle 1',
	`${s.families} ${s.variants[0]}`,
);
check(
	'the chosen family and variant are marked',
	s.chosen.join() === 'Squircle,Squircle 4',
	s.chosen.join(),
);
check('an outline over a built-in shape', s.edge);
check(
	'tiles: size and shape',
	s.tiles.join('|') === '1024 × 1024 px|Squircle 4',
	s.tiles.join('|'),
);
check('reset is off with no image', s.reset === true);
const centre = await pixel(0.5, 0.5);
const corner = await pixel(0.005, 0.005);
check(
	'empty: the shape is grey, outside is clear',
	centre.join() === '154,154,154,255' && corner[3] === 0,
	`${centre} ${corner}`,
);

// the families: a family keeps the variant number
const click = (selector, label) =>
	page.evaluate(
		({ selector, label }) =>
			[...document.querySelectorAll(selector)]
				.find((b) => b.getAttribute('aria-label') === label)
				.click(),
		{ selector, label },
	);
await click('.masker-cells--families .masker-cell', 'Heart');
await sleep(100);
s = await state();
check(
	'a family keeps the variant',
	s.chosen.join() === 'Heart,Heart 4' && s.variants[0] === 'Heart 1',
	s.chosen.join(),
);
await click('.masker-cells--variants .masker-cell', 'Heart 1');
await sleep(100);
s = await state();
check('a variant picks the shape', s.tiles[1] === 'Heart 1', s.tiles[1]);
const notchTop = await pixel(0.5, 0.06);
check('the heart notch is clear', notchTop[3] === 0, notchTop.join());

// an image from the slot
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
	page.click('.masker-slot'),
]);
check('the slot opens the file picker', !!chooser);
await chooser.accept([wide]);
await page.waitForSelector('.masker-source', { timeout: 5000 });
await sleep(300);
s = await state();
check(
	'the source row: name and size',
	s.source === 'wide.png' && s.detail === '3000 × 2000',
	`${s.source} ${s.detail}`,
);
check(
	'1x output is the short side',
	s.tiles[0] === '2000 × 2000 px' && s.dimension === '2000px',
	`${s.tiles[0]} ${s.dimension}`,
);
check('the image shows faint outside the cut', s.ghost);
check('the image shows through the variant cells', s.thumbs === 12, `${s.thumbs}`);
check('the drag hint shows', s.hint === 'Drag to reposition', s.hint);
const lit = await pixel(0.25, 0.5);
check(
	'the image fills the cut',
	lit[3] === 255 && lit.slice(0, 3).join() !== '154,154,154',
	lit.join(),
);

// keys move the image a hundredth of the side
await page.focus('.masker-handle');
await page.keyboard.press('ArrowRight');
await page.keyboard.down('Shift');
await page.keyboard.press('ArrowDown');
await page.keyboard.up('Shift');
s = await state();
check('arrow keys move the image', s.handle === '1 %, 10 %', s.handle);
check('reset is on once framed', s.reset === false);

// a drag moves the image by the shown distance
const geo = await page.evaluate(() => {
	const box = document.querySelector('.masker-handle').getBoundingClientRect();
	return {
		x: box.left + box.width / 2,
		y: box.top + box.height / 2,
		side: box.width,
	};
});
await page.mouse.move(geo.x, geo.y);
await page.mouse.down();
await page.mouse.move(geo.x - geo.side * 0.1, geo.y, { steps: 4 });
const midDrag = await page.evaluate(
	() => !!document.querySelector('.masker-picture--dragging .masker-hint--shown'),
);
await page.mouse.move(geo.x - geo.side * 0.2, geo.y, { steps: 4 });
await page.mouse.up();
s = await state();
check('a drag moves the image', s.handle === '-19 %, 10 %', s.handle);
check('the hint hides while dragging', !midDrag);

// the wheel zooms; zoom out leaves grey inside the cut
await page.mouse.move(geo.x, geo.y);
await page.mouse.wheel({ deltaY: 300 });
await sleep(150);
s = await state();
check('the wheel zooms out', s.zoom.startsWith('55 %'), s.zoom);
await page.click('.masker-reset');
await sleep(100);
s = await state();
check(
	'Reset centres the image at 100 %',
	s.handle === '0 %, 0 %' && s.zoom.startsWith('100 %') && s.reset === true,
	`${s.handle} ${s.zoom}`,
);

// the zoom slider takes keys
await page.focus('.masker-zoom [role="slider"]');
for (let i = 0; i < 100; i++) await page.keyboard.press('ArrowLeft');
s = await state();
check(
	'the zoom slider takes arrow keys, 1x grows',
	// the slider snaps to 0.01 steps above log2(0.1), so 50 % is 2^-1.0019
	s.zoom.startsWith('50 %') && s.tiles[0] === '4005 × 4005 px',
	`${s.zoom} ${s.tiles[0]}`,
);
const grey = await pixel(0.5, 0.8);
check(
	'zoomed out, grey where the image ends',
	grey.join() === '154,154,154,255',
	grey.join(),
);
await page.click('.masker-reset');
await sleep(100);

// an svg mask: the svg row, then the custom cell
const svgInput = await page.$('.masker-svg input[type="file"]');
await svgInput.uploadFile(notch);
await page.waitForSelector('.masker-custom-file', { timeout: 5000 });
await sleep(200);
s = await state();
check(
	'an svg becomes the cut',
	s.custom === 'notch' && !s.svgRow && s.tiles[1] === 'notch',
	`${s.custom} ${s.tiles[1]}`,
);
check(
	'an svg: no outline, no chosen shape cell',
	!s.edge && s.chosen.join() === 'notch',
	s.chosen.join(),
);
const hole = await pixel(0.2, 0.8);
const fill = await pixel(0.8, 0.2);
check(
	'the svg alpha drives the cut',
	hole[3] === 0 && fill[3] === 255,
	`${hole[3]} ${fill[3]}`,
);

// output: 2x and the download
await page.evaluate(() =>
	[...document.querySelectorAll('.masker-scales .canon-button')]
		.find((b) => b.textContent.trim() === '2×')
		.click(),
);
await sleep(100);
s = await state();
check('2x doubles the side', s.tiles[0] === '4000 × 4000 px', s.tiles[0]);
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
await page.click('.masker-download');
await sleep(1500);
const out = await page.evaluate(async () => {
	const blob = window.__result;
	if (!blob) return null;
	const bitmap = await createImageBitmap(blob);
	const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
	const context = canvas.getContext('2d');
	context.drawImage(bitmap, 0, 0);
	const at = (x, y) => context.getImageData(x, y, 1, 1).data[3];
	return {
		type: blob.type,
		width: bitmap.width,
		height: bitmap.height,
		hole: at(800, 3200),
		fill: at(3200, 800),
	};
});
check(
	'Download PNG writes the chosen side, cut by the svg',
	out?.type === 'image/png' &&
		out.width === 4000 &&
		out.height === 4000 &&
		out.hole === 0 &&
		out.fill === 255,
	JSON.stringify(out),
);
check('the file name: image and mask', names[0] === 'wide-notch.png', names[0]);

// a shape clears the svg
await click('.masker-cells--variants .masker-cell', 'Heart 2');
await sleep(100);
s = await state();
check(
	'a shape replaces the svg',
	!s.custom && s.svgRow && s.chosen.join() === 'Heart,Heart 2' && s.edge,
	s.chosen.join(),
);

// paste anywhere: an image replaces the source, an svg the cut
const paste = (name, type, body) =>
	page.evaluate(
		async ({ name, type, body }) => {
			let file;
			if (type === 'image/png') {
				const canvas = document.createElement('canvas');
				canvas.width = 500;
				canvas.height = 1000;
				const blob = await new Promise((r) => canvas.toBlob(r, type));
				file = new File([blob], name, { type });
			} else file = new File([body], name, { type });
			const data = new DataTransfer();
			data.items.add(file);
			document.body.dispatchEvent(
				new ClipboardEvent('paste', {
					clipboardData: data,
					bubbles: true,
					cancelable: true,
				}),
			);
		},
		{ name, type, body },
	);
await paste('tall.png', 'image/png');
await sleep(400);
s = await state();
check(
	'a paste anywhere replaces the source',
	s.source === 'tall.png' && s.tiles[0] === '1000 × 1000 px',
	`${s.source} ${s.tiles[0]}`,
);
await paste(
	'ring.svg',
	'image/svg+xml',
	'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 4 4"><circle cx="2" cy="2" r="2"/></svg>',
);
await sleep(400);
s = await state();
check('a pasted svg becomes the cut', s.custom === 'ring', s.custom);

// drop on the settings; a non-image is ignored
const dropFile = (name, type) =>
	page.evaluate(
		async ({ name, type }) => {
			let file;
			if (type.startsWith('image/png')) {
				const canvas = document.createElement('canvas');
				canvas.width = 40;
				canvas.height = 40;
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
		{ name, type },
	);
await dropFile('note.txt', 'text/plain');
await sleep(200);
check('a dropped non-image is ignored', (await state()).source === 'tall.png');
await dropFile('dropped.png', 'image/png');
await sleep(400);
check('a drop anywhere replaces the source', (await state()).source === 'dropped.png');

// unreadable files say so
await paste('broken.svg', 'image/svg+xml', 'not svg');
await sleep(400);
s = await state();
check(
	'an unreadable svg says so in the shape section',
	s.status === 'Could not read broken.svg',
	s.status,
);
await page.evaluate(() =>
	[...document.querySelectorAll('.masker-source button')]
		.find((b) => b.textContent.trim() === 'Clear')
		.click(),
);
await sleep(200);
s = await state();
check('Clear brings the slot back', s.slot === 'Drop an image' && !s.source);
await paste('broken.png', 'image/gif', 'nope');
await sleep(400);
s = await state();
check(
	'an unreadable image says so',
	(await page.$eval('.masker-error', (el) => el.textContent.trim())) ===
		'Could not read broken.png',
);

// launch flags
await visit(
	page,
	'/tools/image-masker?maskShape=gear-3&maskScale=3&maskSample&maskZoom=2&maskOffset=0.1,0',
);
await page.waitForSelector('.masker-source', { timeout: 5000 });
await sleep(300);
s = await state();
check(
	'?maskShape ?maskScale ?maskSample ?maskZoom ?maskOffset',
	s.tiles.join('|') === '1800 × 1800 px|Gear 3' &&
		s.handle === '10 %, 0 %' &&
		s.zoom.startsWith('200 %'),
	`${s.tiles.join('|')} ${s.handle} ${s.zoom}`,
);
await visit(page, '/tools/image-masker?maskSVG');
await page.waitForSelector('.masker-custom-file', { timeout: 5000 });
check('?maskSVG loads the notch', (await state()).custom === 'notch');

// the picker goes 14 / 12 wide, 7 / 6 narrow
const columns = () =>
	page.evaluate(() =>
		['families', 'variants'].map(
			(kind) =>
				getComputedStyle(
					document.querySelector(`.masker-cells--${kind}`),
				).gridTemplateColumns.split(' ').length,
		),
	);
check('wide picker: 14 and 12 columns', (await columns()).join() === '14,12', (await columns()).join());
await page.setViewport({ width: 390, height: 844 });
await sleep(400);
check('narrow picker: 7 and 6 columns', (await columns()).join() === '7,6', (await columns()).join());
check(
	'no horizontal scroll at 390',
	await page.evaluate(
		() =>
			document.querySelector('.dt-main').scrollWidth <=
			document.querySelector('.dt-main').clientWidth,
	),
);

const canvasHeight = () =>
	page.evaluate(
		() => document.querySelector('.canon-canvas').getBoundingClientRect().height,
	);
const tall = await canvasHeight();
await page.evaluate(() => {
	document.querySelector('.image-masker .canon-split-body').scrollTop = 1200;
});
await sleep(300);
const short = await canvasHeight();
check(
	'stacked, the picture collapses on scroll down to 240',
	short < tall && short >= 239,
	`${Math.round(tall)} -> ${Math.round(short)}`,
);

await finish(browser);
