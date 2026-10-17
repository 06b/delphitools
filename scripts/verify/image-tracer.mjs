// the canon image-tracer: picture, source, presets, retrace, worker, tiles, copy, download, optimise, paste, drop, flags

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

const dir = mkdtempSync(join(tmpdir(), 'trace-'));
const { browser, page } = await launch();
await browser
	.defaultBrowserContext()
	.overridePermissions(BASE, [
		'clipboard-read',
		'clipboard-write',
		'clipboard-sanitized-write',
	]);
// count workers: the trace runs off the main thread
await page.evaluateOnNewDocument(() => {
	const Original = window.Worker;
	window.__workers = 0;
	window.Worker = class extends Original {
		constructor(...args) {
			super(...args);
			window.__workers += 1;
		}
	};
});

await visit(page, '/tools/image-tracer');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.image-tracer').getBoundingClientRect()
				.height,
	),
);

const state = () =>
	page.evaluate(() => {
		const q = (s) => document.querySelector(s);
		return {
			slot: q('.trace-slot .media-slot-prompt')?.innerText.trim(),
			slotTag: q('.trace-slot .media-slot-upload')?.tagName,
			drop: !!q('.trace-drop'),
			dropCells: [...document.querySelectorAll('.trace-drop .canon-button')]
				.map((b) => b.textContent.trim())
				.join(),
			title: q('.trace-source .canon-row-title')?.textContent.trim(),
			detail: q('.trace-source .canon-row-detail')?.textContent.trim(),
			tiles: [...document.querySelectorAll('.canon-tiles-tile')].map(
				(t) =>
					`${t.querySelector('.canon-tiles-label').textContent.trim()}=${t.querySelector('.canon-tiles-value').textContent.trim()}`,
			),
			code: q('.trace-code pre')?.textContent ?? '',
			before: q('.canon-image-compare-before')?.src,
			after: q('.canon-image-compare-after img')?.src,
			strip: document.querySelectorAll('.trace-strip .canon-swatch, .trace-strip > * > *').length,
			busy: !!q('.trace-busy-row'),
			failure: q('.trace-failure')?.textContent.trim(),
			preset: q('.trace-preset .canon-menu-cell-title')?.textContent.trim(),
			colours: q('.trace-colours input')?.value,
			ltres: q('.trace-ltres .canon-slider-readout')?.textContent.trim(),
			qtres: q('.trace-qtres .canon-slider-readout')?.textContent.trim(),
			scale: q('.trace-scales [aria-checked="true"]')?.textContent.trim(),
			retrace: !q('.trace-retrace'),
			copy: q('.trace-copy').disabled,
			optimise: q('.trace-optimise').disabled,
			download: q('.trace-download').disabled,
			disabledSettings: document.querySelectorAll(
				'.image-tracer [role="slider"][aria-disabled="true"], .image-tracer input:disabled, .image-tracer select:disabled',
			).length,
			workers: window.__workers,
			overflow:
				document.documentElement.scrollWidth >
				document.documentElement.clientWidth,
		};
	});

const traced = () =>
	page.waitForFunction(
		() =>
			!document.querySelector('.trace-busy-row') &&
			document.querySelector('.trace-code pre')?.textContent.startsWith('<svg'),
		{ timeout: 60000 },
	);

let s = await state();
check(
	'empty: the picture is the dashed slot, a button',
	s.slot === 'Drop an image here' && s.slotTag === 'BUTTON',
	s.slot,
);
check(
	'empty: Source is a drop zone with Files and Paste',
	s.drop && s.dropCells === 'Files,Paste',
	s.dropCells,
);
check(
	'empty: tiles in iOS order, dashed',
	s.tiles.join() ===
		'Colours=—,Paths=—,Lines=—,Curves=—,Size=—,File Size=—',
	s.tiles.join(),
);
check(
	'empty: no Retrace; copy, optimise and download off',
	s.retrace && s.copy && s.optimise && s.download,
);
check('empty: settings stay on', s.disabledSettings === 0, `${s.disabledSettings}`);
check('empty: preset Default, 16 colours', s.preset === 'Default' && s.colours === '16');

// an image of flat shapes
const make = (width, height, type = 'image/png') =>
	page.evaluate(
		({ width, height, type }) => {
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const c = canvas.getContext('2d');
			c.fillStyle = '#f6d58e';
			c.fillRect(0, 0, width, height);
			c.fillStyle = '#1d3b8f';
			c.fillRect(width * 0.1, height * 0.2, width * 0.4, height * 0.5);
			c.fillStyle = '#e07a3f';
			c.beginPath();
			c.arc(width * 0.7, height * 0.5, height * 0.3, 0, 7);
			c.fill();
			return canvas.toDataURL(type).split(',')[1];
		},
		{ width, height, type },
	);

const shapes = join(dir, 'shapes.png');
writeFileSync(shapes, Buffer.from(await make(240, 160), 'base64'));
const input = await page.$('.trace-drop input[type="file"]');
await input.uploadFile(shapes);
await traced();
s = await state();
check('a file from the drop zone loads', s.title === 'shapes.png', s.title);
check('the source row reads its size', s.detail?.startsWith('240 × 160 · '), s.detail);
check('traced in a worker', s.workers >= 1, `${s.workers}`);
check('the compare shows both', !!s.before && !!s.after);
check('the palette strip shows', s.strip > 0, `${s.strip}`);
check(
	'tiles read the trace',
	/^Colours=\d+$/.test(s.tiles[0]) &&
		s.tiles[4] === 'Size=240 × 160' &&
		/^File Size=\d/.test(s.tiles[5]),
	s.tiles.join(),
);
check('the code outlines the SVG, a line per tag', s.code.split('\n')[1]?.startsWith('  <path '));
check('copy, optimise, download on', !s.copy && !s.optimise && !s.download);
check('no Retrace until a setting changes', s.retrace);

// a setting change waits for Retrace, as the web tool did
const code = s.code;
await page.$eval('.trace-colours input', (i) => { i.focus(); i.select(); });
await page.keyboard.type('2');
await sleep(300);
s = await state();
check('an edit makes the preset Custom', s.preset === 'Custom', s.preset);
check('an edit does not retrace by itself', s.code === code && !s.busy);
check('Retrace shows', !s.retrace);
const floating = await page.evaluate(() => {
	const button = document.querySelector('.trace-retrace');
	const box = document.querySelector('.trace-box').getBoundingClientRect();
	const r = button.getBoundingClientRect();
	return {
		inPicture: !!button.closest('.canon-split-sidebar .trace-box'),
		floats: getComputedStyle(button).position === 'absolute',
		within: r.left >= box.left && r.right <= box.right && r.bottom <= box.bottom && r.top >= box.top,
		inSettings: !!document.querySelector('.canon-split-main .trace-retrace'),
	};
});
check('Retrace floats on the picture, not in the settings', floating.inPicture && floating.floats && floating.within && !floating.inSettings, JSON.stringify(floating));
await page.click('.trace-retrace');
await traced();
s = await state();
check('Retrace traces with the edit', s.tiles[0] === 'Colours=2', s.tiles[0]);
check('Retrace hides again after the trace', s.retrace);

// presets: scale kept, values shown, Custom again after an edit
await page.evaluate(() =>
	[...document.querySelectorAll('.trace-scales button')]
		.find((b) => b.textContent.trim() === '2×')
		.click(),
);
const pick = (index) =>
	page.evaluate((i) => {
		const select = document.querySelector('.trace-preset select');
		select.value = String(i);
		select.dispatchEvent(new Event('change', { bubbles: true }));
	}, index);
await pick(5);
await sleep(400);
s = await state();
check('Kiki shows', s.preset === 'Kiki', s.preset);
check('Kiki: curve smoothing 0.01', s.qtres?.endsWith('0.01'), s.qtres);
check('a preset keeps the scale', s.scale === '2×', s.scale);
check('a preset resets colours', s.colours === '16', s.colours);
await page.focus('.trace-pathomit [role="slider"]');
await page.keyboard.press('ArrowRight');
await sleep(200);
s = await state();
check('arrow keys move a slider, and the preset reads Custom', s.preset === 'Custom', s.preset);
await pick(5);
await sleep(400);
await page.focus('.trace-pathomit [role="slider"]');
await page.keyboard.press('ArrowRight');
await sleep(200);
s = await state();
check('the same preset again, then an edit: Custom, not a stale Kiki', s.preset === 'Custom', s.preset);
await page.click('.trace-retrace');
await traced();
s = await state();
check('the SVG doubles with the 2× scale', s.tiles[4] === 'Size=480 × 320', s.tiles[4]);

// outlines
const filled = s.after;
await page.click('.trace-outlines input');
await sleep(300);
s = await state();
check('Outlines swaps the drawn trace', s.after && s.after !== filled);

// hints
const hint = await page.evaluate(() => {
	const cell = document.querySelector('.trace-colours .trace-info');
	const tip = document.getElementById(cell.getAttribute('aria-describedby'));
	return { name: cell.getAttribute('aria-label'), text: tip?.textContent.trim() };
});
check(
	'each setting has its web hint on a named info cell',
	hint.name === 'Colours' && hint.text?.startsWith('Number of colours'),
	JSON.stringify(hint),
);

// copy, download
await page.click('.trace-copy');
await sleep(300);
const copied = await page.evaluate(() => navigator.clipboard.readText());
check('Copy copies the whole SVG, not the outline', copied.startsWith('<svg') && !copied.includes('\n') && copied.length > s.code.length / 4);
await captureObjectUrl(page);
await page.click('.trace-download');
await sleep(300);
const saved = await page.evaluate(async () => ({
	type: window.__result?.type,
	text: await window.__result?.text(),
}));
check('Download saves the SVG', saved.type === 'image/svg+xml' && saved.text === copied, saved.type);

// paste anywhere, drop anywhere
const paste = (data64, name) =>
	page.evaluate(
		({ data64, name }) => {
			const bytes = Uint8Array.from(atob(data64), (c) => c.charCodeAt(0));
			const data = new DataTransfer();
			data.items.add(new File([bytes], name, { type: 'image/png' }));
			document.querySelector('.trace-code pre').dispatchEvent(
				new ClipboardEvent('paste', { clipboardData: data, bubbles: true }),
			);
		},
		{ data64, name },
	);
await paste(await make(120, 90), 'pasted-in.png');
await page.waitForFunction(
	() => document.querySelector('.trace-source .canon-row-title')?.textContent.trim() === 'pasted-in.png',
	{ timeout: 10000 },
);
await traced();
s = await state();
check('a paste anywhere replaces the source', s.title === 'pasted-in.png' && s.detail?.startsWith('120 × 90'), s.detail);
const drop = (data64, name, type) =>
	page.evaluate(
		({ data64, name, type }) => {
			const bytes = Uint8Array.from(atob(data64), (c) => c.charCodeAt(0));
			const data = new DataTransfer();
			data.items.add(new File([bytes], name, { type }));
			document.querySelector('.trace-picture').dispatchEvent(
				new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }),
			);
		},
		{ data64, name, type },
	);
await drop(btoa('x'), 'note.txt', 'text/plain');
await sleep(300);
s = await state();
check('a dropped non-image is ignored', s.title === 'pasted-in.png', s.title);
await drop(await make(100, 100), 'dropped.png', 'image/png');
await page.waitForFunction(
	() => document.querySelector('.trace-source .canon-row-title')?.textContent.trim() === 'dropped.png',
	{ timeout: 10000 },
);
await traced();
check('a drop on the picture replaces the source', true);

// a broken image
await paste(btoa('nope'), 'broken.png');
await page.waitForSelector('.trace-failure', { timeout: 10000 });
s = await state();
check('an unreadable image says so', s.failure === 'This image could not be traced', s.failure);

// clear
await drop(await make(100, 100), 'again.png', 'image/png');
await traced();
await page.click('.trace-source .canon-button');
await sleep(300);
s = await state();
check(
	'Clear returns the empty layout',
	s.slot === 'Drop an image here' && s.drop && s.tiles[0] === 'Colours=—' && s.download,
);

// optimise hands the SVG to svg-optimiser
await drop(await make(100, 100), 'hand.png', 'image/png');
await traced();
await page.click('.trace-optimise');
await page.waitForFunction(() => location.pathname === '/tools/svg-optimiser', { timeout: 10000 });
await sleep(800);
const optimiser = await page.evaluate(() => ({
	file: document.querySelector('.so-file .canon-row-title')?.textContent.trim(),
	code: !!document.querySelector('.so-code'),
}));
check('Optimise opens svg-optimiser with the trace', optimiser.file === 'traced.svg' && optimiser.code, JSON.stringify(optimiser));

// flags, and the phone width
await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/image-tracer?traceSample&tracePreset=5&traceOutlines');
await traced();
s = await state();
check('?tracePreset picks the preset', s.preset === 'Kiki', s.preset);
check('?traceSample loads the drawn sample', s.title === 'sample.png', s.title);
check(
	'?traceOutlines turns Outlines on',
	await page.$eval('.trace-outlines input', (i) => i.checked),
);
check('no horizontal scroll at 390', !s.overflow);
const rows = await page.evaluate(() =>
	[...document.querySelectorAll('.image-tracer .trace-row .canon-row-title')].filter(
		(t) => t.scrollWidth > t.clientWidth + 1 || t.getBoundingClientRect().right > t.closest('.canon-row-label').getBoundingClientRect().right + 1,
	).length,
);
check('no setting title clipped at 390', rows === 0, `${rows}`);

await finish(browser);
