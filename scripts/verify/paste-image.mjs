// the canon paste-image: paste anywhere, drop, the clipboard button, crop drag and keys, reset, copy, download

import { launch, visit, check, finish, sleep, captureObjectUrl, BASE } from './harness.mjs';

const { browser, page } = await launch();
await browser
	.defaultBrowserContext()
	.overridePermissions(new URL(BASE).origin, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);

await visit(page, '/tools/paste-image');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.paste-image').getBoundingClientRect().height,
	),
);

const state = () =>
	page.evaluate(() => {
		const crop = document.querySelector('.media-crop-rect');
		return {
			slot: document.querySelector('.canon-split-sidebar .pi-slot')?.innerText.trim(),
			slotTag: document.querySelector('.pi-slot')?.tagName,
			title: document.querySelector('.pi-file .canon-row-title')?.textContent.trim(),
			detail: document.querySelector('.pi-file .canon-row-detail')?.textContent.trim(),
			tiles: [...document.querySelectorAll('.canon-tiles-value')].map((t) => t.textContent.trim()),
			value: crop?.getAttribute('aria-valuetext'),
			role: crop?.getAttribute('role'),
			name: crop?.getAttribute('aria-label'),
			tab: crop?.tabIndex,
			figure: document.querySelector('.pi-figure')?.getAttribute('aria-label') ?? document.querySelector('.pi-figure')?.textContent.replace(/\s+/g, ''),
			reset: document.querySelector('.pi-reset').disabled,
			copy: document.querySelector('.pi-copy').disabled,
			save: document.querySelector('.pi-save').disabled,
			saveText: document.querySelector('.pi-save').textContent.trim(),
		};
	});

let s = await state();
check(
	'empty: the picture is the web prompt, a button',
	s.slot === 'Press Ctrl/Cmd + V to paste' && s.slotTag === 'BUTTON',
	s.slot,
);
check(
	'empty: no file row, no crop, tiles dashed, output off',
	!s.title && !s.role && s.tiles.join() === '—,—' && s.reset && s.copy && s.save,
	JSON.stringify(s),
);
check('Download reads Download outside a flow', s.saveText === 'Download', s.saveText);

await page.waitForSelector('.canon-split-end .dt-sticker-caption', { timeout: 5000 });
const credit = await page.evaluate(() => {
	const end = document.querySelector('.canon-split-end');
	const box = (el) => el.getBoundingClientRect();
	const caption = box(end.querySelector('.dt-sticker-caption'));
	const p = end.querySelector('.pi-credit');
	const line = box(p);
	const range = document.createRange();
	range.selectNodeContents(p);
	const text = range.getBoundingClientRect();
	return {
		inEnd: !!p,
		below: line.top >= caption.bottom,
		centred: Math.abs(text.left + text.width / 2 - (caption.left + caption.width / 2)) < 2,
		align: getComputedStyle(p).textAlign,
	};
});
check(
	'the credit sits under the sticker caption, centred',
	credit.inEnd && credit.below && credit.centred && credit.align === 'center',
	JSON.stringify(credit),
);

const makeImage = (width, height, type = 'image/png') =>
	page.evaluate(
		async ({ width, height, type }) => {
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext('2d');
			context.fillStyle = '#1d3b8f';
			context.fillRect(0, 0, width, height);
			context.fillStyle = '#e07a3f';
			context.fillRect(0, 0, width / 2, height / 2);
			window.__made = await new Promise((r) => canvas.toBlob(r, type));
		},
		{ width, height, type },
	);

const pasteAt = (selector, name) =>
	page.evaluate(
		({ selector, name }) => {
			const data = new DataTransfer();
			data.items.add(new File([window.__made], name, { type: window.__made.type }));
			document.querySelector(selector).dispatchEvent(
				new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
			);
		},
		{ selector, name },
	);

// paste on the settings pane, not the picture
await makeImage(1000, 500);
await pasteAt('.pi-credit', 'shot.png');
await page.waitForSelector('.media-crop-image', { timeout: 5000 });
await sleep(300);
s = await state();
check(
	'a paste anywhere loads: kind and pixels',
	s.title === 'PNG' && s.detail === '1000 × 500 px',
	`${s.title} ${s.detail}`,
);
check('the crop starts whole', s.tiles.join('|') === '1000 × 500 px|0, 0', s.tiles.join('|'));
check(
	'the crop is a named, focusable slider',
	s.role === 'slider' && s.name === 'Crop' && s.tab === 0 && s.value === '1000 × 500 px, 0, 0',
	`${s.role} ${s.name} ${s.value}`,
);
check('whole: Reset off, Copy and Download on', s.reset && !s.copy && !s.save);
check(
	'the size figure reads under the image',
	await page.evaluate(() => {
		const figure = document.querySelector('.pi-figure').getBoundingClientRect();
		const image = document.querySelector('.media-crop-image').getBoundingClientRect();
		return figure.top >= image.bottom && /1000×500/.test(document.querySelector('.pi-figure').textContent.replace(/\s+/g, ''));
	}),
);

// a press inside the whole crop does not grab (the page keeps scrolling)
const geo = await page.evaluate(() => {
	const image = document.querySelector('.media-crop-image').getBoundingClientRect();
	return { left: image.left, top: image.top, right: image.right, bottom: image.bottom, scale: 1000 / image.width };
});
await page.mouse.move((geo.left + geo.right) / 2, (geo.top + geo.bottom) / 2);
await page.mouse.down();
await page.mouse.move((geo.left + geo.right) / 2 + 40, (geo.top + geo.bottom) / 2 + 20, { steps: 4 });
await page.mouse.up();
s = await state();
check('a drag inside a whole crop does nothing', s.tiles[1] === '0, 0', s.tiles[1]);

// drag the bottom-right corner in by a quarter
const dx = (geo.right - geo.left) / 2;
const dy = (geo.bottom - geo.top) / 2;
await page.mouse.move(geo.right, geo.bottom);
await page.mouse.down();
await page.mouse.move(geo.right - dx / 2, geo.bottom - dy / 2, { steps: 3 });
const mid = await state();
await page.mouse.move(geo.right - dx, geo.bottom - dy, { steps: 3 });
await page.mouse.up();
await sleep(100);
s = await state();
const [cw, ch] = s.tiles[0].match(/\d+/g).map(Number);
check(
	'the corner drag resizes to the pointer',
	Math.abs(cw - 500) <= 2 && Math.abs(ch - 250) <= 2 && s.tiles[1] === '0, 0',
	s.tiles.join('|'),
);
check('the tiles follow the drag live', mid.tiles[0] !== '1000 × 500 px', mid.tiles[0]);
check('cropped: Reset on', !s.reset);

// inside drag moves
const crop = await page.evaluate(() => {
	const box = document.querySelector('.media-crop-rect').getBoundingClientRect();
	return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
});
await page.mouse.move(crop.x, crop.y);
await page.mouse.down();
await page.mouse.move(crop.x + 2000, crop.y + 2000, { steps: 5 });
await page.mouse.up();
await sleep(100);
s = await state();
check('an inside drag moves the crop, kept inside', s.tiles[1] === `${1000 - cw}, ${500 - ch}`, s.tiles[1]);

// keys: arrows move a hundredth, Shift a tenth, Alt resizes
await page.evaluate(() =>
	[...document.querySelectorAll('.pi-reset')].forEach((b) => b.click()),
);
await sleep(100);
s = await state();
check('Reset returns the whole image', s.tiles.join('|') === '1000 × 500 px|0, 0' && s.reset, s.tiles.join('|'));
await page.focus('.media-crop-rect');
await page.keyboard.down('Alt');
await page.keyboard.press('ArrowLeft');
await page.keyboard.up('Alt');
s = await state();
check('Alt+ArrowLeft narrows by a hundredth', s.tiles[0] === '990 × 500 px', s.tiles[0]);
await page.keyboard.down('Shift');
await page.keyboard.down('Alt');
await page.keyboard.press('ArrowUp');
await page.keyboard.up('Alt');
await page.keyboard.up('Shift');
await page.keyboard.press('ArrowRight');
await page.keyboard.press('ArrowDown');
s = await state();
check(
	'Shift+Alt+ArrowUp shortens a tenth; arrows move',
	s.tiles.join('|') === '990 × 450 px|10, 5',
	s.tiles.join('|'),
);

// download: a crop saves as PNG at the crop's pixels
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
const result = () =>
	page.evaluate(async () => {
		const blob = window.__result;
		if (!blob) return null;
		const bitmap = await createImageBitmap(blob);
		return { type: blob.type, width: bitmap.width, height: bitmap.height };
	});
await page.click('.pi-save');
await sleep(600);
let out = await result();
const today = new Date().toLocaleDateString('en-CA');
check(
	'Download writes the crop as PNG',
	out?.type === 'image/png' && out.width === 990 && out.height === 450 && names[0] === `delphitools-paste-image-${today}.png`,
	JSON.stringify({ out, name: names[0] }),
);

// copy: a PNG of the crop on the clipboard, confirmed by the toast
await page.click('.pi-copy');
await sleep(600);
const copied = await page.evaluate(async () => {
	const [item] = await navigator.clipboard.read();
	const blob = await item.getType('image/png');
	const bitmap = await createImageBitmap(blob);
	return {
		size: `${bitmap.width}x${bitmap.height}`,
		toast: !!document.querySelector('.canon-toast'),
	};
});
check('Copy puts the crop on the clipboard', copied.size === '990x450', copied.size);
check('Copy confirms through the toast', copied.toast);

// a JPEG pasted whole saves as itself
await makeImage(300, 200, 'image/jpeg');
await pasteAt('.canon-split-sidebar', 'photo.jpg');
await sleep(400);
s = await state();
check('a new paste replaces the image, whole again', s.title === 'JPG' && s.tiles[1] === '0, 0', `${s.title} ${s.tiles}`);
await page.evaluate(() => (window.__result = undefined));
await page.click('.pi-save');
await sleep(400);
out = await result();
check(
	'the whole image downloads as pasted',
	out?.type === 'image/jpeg' && names.at(-1) === `delphitools-paste-image-${today}.jpg`,
	JSON.stringify({ out, name: names.at(-1) }),
);

// the Paste button reads the clipboard (the PNG from Copy above)
await page.evaluate(async () => {
	const canvas = document.createElement('canvas');
	canvas.width = 64;
	canvas.height = 48;
	const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
	await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
});
await page.click('.pi-paste');
await sleep(400);
s = await state();
check('Paste reads an image off the clipboard', s.detail === '64 × 48 px', s.detail);

// drop anywhere; a non-image is ignored
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
				.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
		},
		{ name, type, size },
	);
await dropFile('note.txt', 'text/plain');
await sleep(200);
check('a dropped non-image is ignored', (await state()).detail === '64 × 48 px');
await dropFile('dropped.png', 'image/png', 40);
await sleep(400);
check('a drop anywhere loads', (await state()).detail === '40 × 40 px');

await page.evaluate(() =>
	[...document.querySelectorAll('.pi-file button')].find((b) => b.textContent.trim() === 'Clear').click(),
);
await sleep(200);
s = await state();
check('Clear brings the slot back', !!s.slot && !s.title && s.save);

// launch flags
await visit(page, '/tools/paste-image?pasteSample&pasteCrop=100,50,400,300');
await page.waitForSelector('.media-crop-image', { timeout: 5000 });
await sleep(300);
s = await state();
check(
	'?pasteSample ?pasteCrop',
	s.detail === '1600 × 1200 px' && s.tiles.join('|') === '400 × 300 px|100, 50',
	`${s.detail} ${s.tiles}`,
);

const wide = await page.evaluate(() => {
	const side = document.querySelector('.paste-image .canon-split-sidebar').getBoundingClientRect();
	const main = document.querySelector('.paste-image .canon-split-main').getBoundingClientRect();
	return { side: side.width, main: main.width, top: side.top === main.top };
});
check('1400: halves side by side', wide.top && Math.abs(wide.side - wide.main) < 2, JSON.stringify(wide));

// phone: picture first, collapses, no sideways scroll
await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/paste-image?pasteSample');
await page.waitForSelector('.media-crop-image', { timeout: 5000 });
const phone = await page.evaluate(async () => {
	const body = document.querySelector('.paste-image .canon-split-body');
	const canvas = () => document.querySelector('.paste-image .canon-canvas').getBoundingClientRect().height;
	const full = canvas();
	body.scrollTop = 800;
	await new Promise((r) => setTimeout(r, 200));
	return {
		full,
		top: body.scrollTop,
		band: canvas(),
		wide: document.documentElement.scrollWidth > document.documentElement.clientWidth,
	};
});
check('phone: the picture is first and large', phone.full > 250, String(phone.full));
// the settings are short, so the picture collapses only as far as the pane scrolls
check(
	"phone: the picture collapses with the scroll, to 240 at most",
	Math.abs(phone.band - Math.max(240, phone.full - phone.top)) < 2,
	`${phone.band} after ${phone.top}`,
);
check('phone: no horizontal scroll', !phone.wide);

await finish(browser);
