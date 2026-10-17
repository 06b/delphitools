// the canon image-deskewer: board, drag, keys, loupe, aspect, export, paste, drop, flags

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

const dir = mkdtempSync(join(tmpdir(), 'deskew-'));
const { browser, page } = await launch();

// a white page skewed on a dark ground, 200 x 120
const PAGE = [
	[40, 20],
	[170, 30],
	[160, 105],
	[30, 95],
];

await visit(page, '/tools/image-deskewer');
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' });

check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.image-deskewer').getBoundingClientRect()
				.height,
	),
);
const empty = await page.evaluate(() => ({
	slot: document
		.querySelector('.canon-split-sidebar .deskew-slot')
		?.innerText.trim(),
	tag: document.querySelector('.deskew-slot')?.tagName,
	source: !!document.querySelector('.deskew-source'),
	result: !!document.querySelector('.deskew-result'),
	handles: document.querySelectorAll('.deskew-handle').length,
	aspects: [
		...document.querySelectorAll('.deskew-aspects .canon-button'),
	].map((b) => b.textContent.trim()),
	exportOff: document.querySelector('.deskew-export').disabled,
	resetOff: document.querySelector('.deskew-reset').disabled,
	quad: !!document.querySelector('.deskew-outline')?.getAttribute('d'),
}));
check(
	'empty: the picture is the drop target, a button',
	empty.slot === 'Drop an image' && empty.tag === 'BUTTON',
	empty.slot,
);
check(
	'empty: the sample quad shows, no handles, no source, no result',
	empty.quad && !empty.handles && !empty.source && !empty.result,
);
check(
	'every aspect, web order',
	empty.aspects.join() === 'Auto,A4,Letter,1:1,4:3,3:2,16:9',
	empty.aspects.join(),
);
check('empty: export and reset off', empty.exportOff && empty.resetOff);

const fixture = await page.evaluate((corners) => {
	const canvas = document.createElement('canvas');
	canvas.width = 200;
	canvas.height = 120;
	const ctx = canvas.getContext('2d');
	ctx.fillStyle = '#223';
	ctx.fillRect(0, 0, 200, 120);
	ctx.fillStyle = '#fff';
	ctx.beginPath();
	corners.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
	ctx.closePath();
	ctx.fill();
	return canvas.toDataURL('image/png').split(',')[1];
}, PAGE);
const pageFile = join(dir, 'page.png');
writeFileSync(pageFile, Buffer.from(fixture, 'base64'));
const [chooser] = await Promise.all([
	page.waitForFileChooser({ timeout: 3000 }),
	page.click('.deskew-slot'),
]);
check('the slot opens the file picker', !!chooser);
await chooser.accept([pageFile]);
await page.waitForSelector('.deskew-handle', { timeout: 5000 });
await sleep(300);

const state = () =>
	page.evaluate(() => {
		const handles = [...document.querySelectorAll('.deskew-handle')];
		return {
			title: document
				.querySelector('.deskew-source .canon-row-title')
				?.textContent.trim(),
			detail: document
				.querySelector('.deskew-source .canon-row-detail')
				?.textContent.trim(),
			names: handles.map((h) => h.getAttribute('aria-label')),
			roles: handles.map((h) => h.getAttribute('role')),
			values: handles.map((h) => h.getAttribute('aria-valuetext')),
			result: document
				.querySelector('.deskew-result-name')
				?.getAttribute('aria-label'),
			lines: [
				...document.querySelectorAll(
					'.deskew-dimension .canon-figure-said',
				),
			].map((f) => f.textContent.replace(/\s+/g, '')),
			hint: document
				.querySelector('.deskew-hint--shown')
				?.textContent.replace(/\s+/g, ' ')
				.trim(),
			loupe: !!document.querySelector('.deskew-loupe .canon-loupe'),
			crossed: document
				.querySelector('.deskew-crossed')
				?.textContent.trim(),
			board: document.querySelector('.deskew-board').className,
			exportOff: document.querySelector('.deskew-export').disabled,
			aspect: document
				.querySelector('.deskew-aspects [aria-checked="true"]')
				?.textContent.trim(),
		};
	});
const size = (s) => s.result.match(/\d+/g).map(Number);

let s = await state();
check(
	'the source row: stem and size',
	s.title === 'page' && s.detail === '200 × 120',
	`${s.title} ${s.detail}`,
);
check(
	'four named corner sliders',
	s.names.join() === 'Top left,Top right,Bottom right,Bottom left' &&
		s.roles.every((r) => r === 'slider'),
	s.names.join(),
);
check(
	'starts on the inset quad, as the web tool',
	s.values.join('|') === '24, 14|176, 14|176, 106|24, 106',
	s.values.join('|'),
);
check(
	'the result reads the output size',
	s.result === 'Result 152 × 91',
	s.result,
);
check(
	'dimension lines carry the output size',
	s.lines.join() === '152px,91px',
	s.lines.join(),
);
check('the drag hint shows', s.hint === 'Drag the corners', s.hint);
check('export on', !s.exportOff);

const image = () =>
	page.$eval('.deskew-image', (el) => {
		const r = el.getBoundingClientRect();
		return { left: r.left, top: r.top, scale: r.width / 200 };
	});
const screen = async ([x, y]) => {
	const i = await image();
	return { x: i.left + x * i.scale, y: i.top + y * i.scale };
};
const values = async () => (await state()).values;

// drag each corner onto the page
for (let i = 0; i < 4; i++) {
	const v = (await values())[i].split(',').map(Number);
	const from = await screen(v);
	const to = await screen(PAGE[i]);
	await page.mouse.move(from.x, from.y);
	await page.mouse.down();
	await page.mouse.move((from.x + to.x) / 2, (from.y + to.y) / 2, {
		steps: 4,
	});
	if (i === 0) {
		const mid = await state();
		check(
			'a corner drag shows the loupe, hides the hint',
			mid.loupe && !mid.hint,
		);
	}
	await page.mouse.move(to.x, to.y, { steps: 4 });
	await page.mouse.up();
	await sleep(80);
}
await sleep(200);
s = await state();
check('the loupe goes with the drag', !s.loupe);
const [w, h] = size(s);
check(
	'the output measures the page quad',
	w >= 125 && w <= 135 && h >= 70 && h <= 80,
	s.result,
);
const white = await page.$eval('.deskew-sheet-picture canvas', (el) => {
	const { data } = el
		.getContext('2d')
		.getImageData(0, 0, el.width, el.height);
	let bright = 0;
	for (let i = 0; i < data.length; i += 4)
		if (data[i] > 200 && data[i + 2] > 200) bright++;
	return bright / (data.length / 4);
});
check('the corrected preview is the white page', white > 0.9, white.toFixed(3));

// keys
await page.focus('.deskew-handle');
const before = (await values())[0];
await page.keyboard.down('Shift');
await page.keyboard.press('ArrowRight');
await page.keyboard.up('Shift');
let after = (await values())[0];
check(
	'Shift+ArrowRight moves the corner ten pixels',
	Number(after.split(',')[0]) - Number(before.split(',')[0]) === 10,
	`${before} -> ${after}`,
);
const tr = await screen((await values())[1].split(',').map(Number));
await page.mouse.move(tr.x, tr.y);
await page.mouse.down();
await page.mouse.up();
const focused = await page.evaluate(() =>
	document.activeElement.getAttribute('aria-label'),
);
await page.keyboard.press('ArrowDown');
after = (await values())[1];
check(
	'a click on a corner focuses it for the arrows',
	focused === 'Top right' &&
		after === `170, ${Number(PAGE[1][1]) + 1}`,
	`${focused} ${after}`,
);

// edge and whole drags, as iOS
let q = (await values()).map((v) => v.split(',').map(Number));
const topMid = await screen([(q[0][0] + q[1][0]) / 2, (q[0][1] + q[1][1]) / 2]);
await page.mouse.move(topMid.x, topMid.y);
await page.mouse.down();
await page.mouse.move(topMid.x, topMid.y + 20, { steps: 4 });
await page.mouse.up();
let moved = (await values()).map((v) => v.split(',').map(Number));
check(
	'an edge drag moves its two corners',
	moved[0][1] > q[0][1] &&
		moved[1][1] > q[1][1] &&
		moved[2][1] === q[2][1] &&
		moved[3][1] === q[3][1],
	JSON.stringify(moved),
);
q = moved;
const centre = await screen([100, 65]);
await page.mouse.move(centre.x, centre.y);
await page.mouse.down();
await page.mouse.move(centre.x + 6, centre.y, { steps: 3 });
await page.mouse.up();
moved = (await values()).map((v) => v.split(',').map(Number));
check(
	'a drag inside moves the whole quad',
	moved.every((p, i) => p[0] > q[i][0] && p[1] === q[i][1]),
	JSON.stringify(moved),
);

// right button does nothing
q = await values();
const tl = await screen(q[0].split(',').map(Number));
await page.mouse.move(tl.x, tl.y);
await page.mouse.down({ button: 'right' });
await page.mouse.move(tl.x + 40, tl.y + 40, { steps: 3 });
await page.mouse.up({ button: 'right' });
check('a right-button drag moves nothing', (await values()).join() === q.join());

// crossed corners
const br = await screen(q[2].split(',').map(Number));
const far = await screen([195, 115]);
await page.mouse.move(tl.x, tl.y);
await page.mouse.down();
await page.mouse.move(far.x, far.y, { steps: 6 });
await page.mouse.up();
await sleep(100);
s = await state();
check(
	'crossed corners warn in red and stop the export',
	s.crossed === "Don't let the streams cross!" &&
		s.board.includes('deskew-board--crossed') &&
		s.exportOff,
	`${s.crossed} ${s.exportOff}`,
);
void br;
await page.click('.deskew-reset');
await sleep(150);
s = await state();
check(
	'Reset brings back the inset quad',
	s.values.join('|') === '24, 14|176, 14|176, 106|24, 106' && !s.crossed,
	s.values.join('|'),
);

// aspects
const pick = (text) =>
	page.evaluate(
		(text) =>
			[...document.querySelectorAll('.deskew-aspects .canon-button')]
				.find((b) => b.textContent.trim() === text)
				.click(),
		text,
	);
await pick('1:1');
await sleep(150);
s = await state();
let [sw, sh] = size(s);
check('1:1 squares the output on its long edge', sw === sh && sw === 152, s.result);
await pick('A4');
await sleep(150);
s = await state();
[sw, sh] = size(s);
check(
	'A4 keeps landscape at √2',
	Math.abs(sw / sh - Math.SQRT2) < 0.02 && s.aspect === 'A4',
	s.result,
);
check(
	'the result springs at rest',
	await page.evaluate(() => !!document.querySelector('.deskew-result--springs')),
);

// export
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
await page.click('.deskew-export');
await page.waitForFunction(() => window.__result, { timeout: 5000 });
const out = await page.evaluate(async () => {
	const bitmap = await createImageBitmap(window.__result);
	return { type: window.__result.type, w: bitmap.width, h: bitmap.height };
});
check(
	'Download PNG writes the output size',
	out.type === 'image/png' && out.w === sw && out.h === sh,
	JSON.stringify(out),
);
check('the file name', names[0] === 'page-deskewed.png', names[0]);

// paste anywhere, drop anywhere, non-images ignored, broken files warn
const send = (kind, name, type, width, height) =>
	page.evaluate(
		async ({ kind, name, type, width, height }) => {
			let file;
			if (width) {
				const canvas = document.createElement('canvas');
				canvas.width = width;
				canvas.height = height;
				const blob = await new Promise((r) => canvas.toBlob(r, type));
				file = new File([blob], name, { type });
			} else file = new File(['nope'], name, { type });
			const data = new DataTransfer();
			data.items.add(file);
			const event =
				kind === 'paste'
					? new ClipboardEvent('paste', {
							clipboardData: data,
							bubbles: true,
							cancelable: true,
						})
					: new DragEvent('drop', {
							dataTransfer: data,
							bubbles: true,
							cancelable: true,
						});
			(kind === 'paste'
				? document.body
				: document.querySelector('.canon-split-main')
			).dispatchEvent(event);
		},
		{ kind, name, type, width, height },
	);
await send('paste', 'tall.png', 'image/png', 300, 600);
await sleep(400);
s = await state();
check('a paste anywhere replaces the source', s.detail === '300 × 600', s.detail);
await send('drop', 'note.txt', 'text/plain');
await sleep(200);
check('a dropped non-image is ignored', (await state()).title === 'tall');
await send('drop', 'dropped.png', 'image/png', 80, 40);
await sleep(400);
check('a drop anywhere replaces the source', (await state()).title === 'dropped');
await page.evaluate(() => {
	const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="#f00"/></svg>';
	const data = new DataTransfer();
	data.items.add(new File([svg], 'shape.svg', { type: 'image/svg+xml' }));
	document.querySelector('.canon-split-main').dispatchEvent(
		new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }),
	);
});
await sleep(400);
s = await state();
check('a dropped SVG loads', s.title === 'shape' && s.detail === '120 × 60', `${s.title} ${s.detail}`);
await page.click('.deskew-clear');
await sleep(200);
check(
	'Clear brings the slot back',
	!!(await page.$('.deskew-slot')) && !(await page.$('.deskew-source')),
);
await send('paste', 'broken.png', 'image/png');
await sleep(400);
check(
	'an unreadable image shows the iOS message',
	(await page.$eval('.deskew-unreadable', (el) => el.textContent.trim())) ===
		"That file can't be read as an image",
);

// launch flags
await visit(
	page,
	'/tools/image-deskewer?deskewSample&deskewAspect=3&deskewCorners=0.1,0.1;0.9,0.2;0.8,0.9;0.2,0.8&deskewGrab=1',
);
await page.waitForSelector('.deskew-handle', { timeout: 5000 });
await sleep(400);
s = await state();
check(
	'?deskewSample, ?deskewAspect, ?deskewCorners, ?deskewGrab',
	s.detail === '1600 × 1200' &&
		s.aspect === '1:1' &&
		s.values[0] === '160, 120' &&
		s.loupe,
	`${s.detail} ${s.aspect} ${s.values[0]} ${s.loupe}`,
);

// phone: stacked, collapses, nothing scrolls sideways
await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/image-deskewer?deskewSample');
await page.waitForSelector('.deskew-handle', { timeout: 5000 });
await sleep(300);
const phone = await page.evaluate(async () => {
	const body = document.querySelector('.image-deskewer .canon-split-body');
	const canvas = () =>
		document
			.querySelector('.image-deskewer .canon-canvas')
			.getBoundingClientRect().height;
	const full = canvas();
	body.scrollTop = 1200;
	await new Promise((r) => setTimeout(r, 200));
	return {
		full,
		band: canvas(),
		wide:
			document.documentElement.scrollWidth >
			document.documentElement.clientWidth,
	};
});
check(
	'phone: the board collapses to 240 px',
	Math.round(phone.band) === 240 && phone.full > 240,
	`${phone.full} ${phone.band}`,
);
check('phone: no horizontal scroll', !phone.wide);

await finish(browser);
