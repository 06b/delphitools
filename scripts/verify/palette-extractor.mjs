// the canon palette-extractor: picture, source, strategy, count, palette, export, paste, drop

import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BASE, launch, visit, check, finish, sleep } from './harness.mjs';

const dir = mkdtempSync(join(tmpdir(), 'pe-'));
const { browser, page } = await launch();
await page
	.browserContext()
	.overridePermissions(BASE, [
		'clipboard-read',
		'clipboard-write',
		'clipboard-sanitized-write',
	]);
const clipboard = () => page.evaluate(() => navigator.clipboard.readText());

const state = () =>
	page.evaluate(() => {
		const all = (sel) => [...document.querySelectorAll(sel)];
		const text = (el) => el?.textContent.replace(/\s+/g, ' ').trim() ?? '';
		return {
			detail: text(document.querySelector('.pe-source .canon-row-detail')),
			rows: all('.pe-row').length,
			values: all('.pe-row-value').map(text),
			names: all('.pe-row-name').map(text),
			figures: all('.pe-row-share .canon-figure-said').map((el) =>
				parseFloat(el.textContent),
			),
			segments: all('.pe-band-segment').length,
			strip: all('.pe-strip-swatch').length,
			description: text(document.querySelector('.pe-detail')),
			count: document.querySelector('.pe-count input')?.value,
			compare: document.querySelector('.pe-compare')?.getAttribute('role'),
			after: !!document.querySelector('.canon-image-compare-after img'),
			open: document.querySelector('.pe-open')?.getAttribute('href') ?? '',
			shades: all('.pe-row-shades').map((a) => a.getAttribute('href')),
		};
	});

await page.evaluateOnNewDocument(() =>
	localStorage.setItem('colour-notation', 'hex'),
);
await visit(page, '/tools/palette-extractor');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document
				.querySelector('.palette-extractor')
				.getBoundingClientRect().height,
	),
);
const empty = await page.evaluate(() => ({
	slot: document.querySelector('.canon-split-sidebar .pe-slot')?.textContent.replace(/\s+/g, ' ').trim(),
	tag: document.querySelector('.pe-slot')?.tagName,
	drop: !!document.querySelector('.canon-split-main .canon-drop-zone'),
	controls: !!document.querySelector('.pe-controls'),
}));
check(
	'empty: the picture is a drop target button',
	empty.slot === 'Drop an image here' && empty.tag === 'BUTTON',
	empty.slot,
);
check('empty: the drop zone in the settings, no controls', empty.drop && !empty.controls);

const make = (width, height) =>
	page.evaluate(
		({ width, height }) => {
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext('2d');
			['#e11d48', '#2563eb', '#16a34a', '#facc15'].forEach((c, i) => {
				context.fillStyle = c;
				context.fillRect((i * width) / 4, 0, width / 4, height);
			});
			return canvas.toDataURL('image/png').split(',')[1];
		},
		{ width, height },
	);
const bands = join(dir, 'bands.png');
writeFileSync(bands, Buffer.from(await make(400, 200), 'base64'));
const [chooser] = await Promise.all([
	page.waitForFileChooser({ timeout: 3000 }),
	page.click('.pe-slot'),
]);
check('the slot opens the file picker', !!chooser);
await chooser.accept([bands]);
await page.waitForSelector('.pe-row', { timeout: 5000 });
await sleep(800);
let s = await state();
check('the source row reads the size', s.detail === '400 × 200', s.detail);
check('five colours by default: rows, band, strip', s.rows === 5 && s.segments === 5 && s.strip === 5, `${s.rows} ${s.segments} ${s.strip}`);
check('values are hex in the HEX notation', s.values.every((v) => /^#[\da-f]{6}$/i.test(v)), s.values.join(' '));
check('every row is named', s.names.every((n) => n.length > 0));
check(
	'shares cover the image',
	Math.abs(s.figures.reduce((a, b) => a + b, 0) - 100) < 1,
	s.figures.join(' '),
);
check('the four bands are found', s.figures.filter((f) => f > 20).length === 4, s.figures.join(' '));
check('the compare is a slider with the palettised picture', s.compare === 'slider' && s.after);
check('the open link carries the colours', s.open.includes('/tools/palette-genny') && s.open.includes(s.values[0].slice(1)), s.open);
check('each row links to Tailwind shades', s.shades.length === 5 && s.shades.every((h) => h.includes('tailwind-shades')));
check('the strategy description shows', s.description.startsWith('The most prominent colours'), s.description);

const aspect = await page.evaluate(() => {
	const box = document.querySelector('.pe-compare').getBoundingClientRect();
	return box.width / box.height;
});
check('the compare keeps the image aspect', Math.abs(aspect - 2) < 0.03, aspect.toFixed(3));

await page.click('.pe-count button:last-of-type');
await sleep(500);
s = await state();
check('plus adds a colour', s.count === '6' && s.rows === 6, `${s.count} ${s.rows}`);

await page.evaluate(() =>
	[...document.querySelectorAll('.pe-strategies button')]
		.find((b) => b.textContent.trim() === 'Light')
		.click(),
);
await sleep(400);
s = await state();
check('a strategy changes the description', s.description.startsWith('The brightest colours'), s.description);

await page.click('.pe-row-copy');
await sleep(300);
check('a row copies its value', (await clipboard()) === s.values[0], await clipboard());
check('and the toast confirms', !!(await page.$('.canon-toast')));

await page.evaluate(() => localStorage.setItem('colour-notation', 'oklch'));
await page.click('.dt-notation-trigger');
await sleep(250);
await page.evaluate(() =>
	[...document.querySelectorAll('.dt-notation-option')]
		.find((el) => el.textContent.trim() === 'OKLCH')
		.click(),
);
await sleep(400);
s = await state();
check('values follow the header notation', s.values.every((v) => v.startsWith('oklch(')), s.values[0]);
await page.click('.pe-copy-all');
await sleep(300);
check('Copy All copies in the notation', (await clipboard()).split(', ').length === s.rows && (await clipboard()).startsWith('oklch('));
await page.click('.pe-css');
await sleep(300);
check('CSS Variables copies custom properties', /^:root \{\n {2}--palette-1: oklch\(/.test(await clipboard()), (await clipboard()).slice(0, 40));
await page.click('.pe-band-segment');
await sleep(300);
check('a band segment copies its value', (await clipboard()).startsWith('oklch('));

// a new run re-keys the rows, so a marked row is replaced
const mark = () =>
	page.evaluate(() => {
		document.activeElement?.blur();
		document.querySelector('.pe-row').dataset.seen = '1';
	});
const replaced = () =>
	page.evaluate(() => !document.querySelector('.pe-row[data-seen]'));
await mark();
await page.keyboard.press('Space');
await sleep(600);
check('Space re-extracts', await replaced());
await mark();
await page.click('.pe-shuffle');
await sleep(600);
check('Shuffle re-extracts', (await replaced()) && (await state()).rows > 0);

// paste anywhere replaces the source
await page.evaluate(async () => {
	const canvas = document.createElement('canvas');
	canvas.width = 50;
	canvas.height = 100;
	canvas.getContext('2d').fillRect(0, 0, 50, 100);
	const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
	const data = new DataTransfer();
	data.items.add(new File([blob], 'tall.png', { type: 'image/png' }));
	document.body.dispatchEvent(
		new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
	);
});
await sleep(800);
check('a paste anywhere replaces the source', (await state()).detail === '50 × 100', (await state()).detail);

await page.evaluate(async () => {
	const data = new DataTransfer();
	data.items.add(new File(['x'], 'note.txt', { type: 'text/plain' }));
	document.querySelector('.canon-split-main').dispatchEvent(
		new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }),
	);
});
await sleep(300);
check('a dropped non-image is ignored', (await state()).detail === '50 × 100');
await page.evaluate(async () => {
	const canvas = document.createElement('canvas');
	canvas.width = 30;
	canvas.height = 20;
	const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
	const data = new DataTransfer();
	data.items.add(new File([blob], 'dropped.png', { type: 'image/png' }));
	document.querySelector('.canon-split-sidebar').dispatchEvent(
		new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }),
	);
});
await sleep(800);
check('a drop anywhere replaces the source', (await state()).detail === '30 × 20');

// launch flags
await visit(page, '/tools/palette-extractor?extractSample&extractCount=8&extractStrategy=1');
await page.waitForSelector('.pe-row', { timeout: 5000 });
await sleep(800);
s = await state();
check('?extractCount and ?extractStrategy set up the state', s.count === '8' && s.rows === 8 && s.description.startsWith('The most saturated'), `${s.count} ${s.rows}`);

// phone: the picture collapses, nothing scrolls sideways
await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/palette-extractor?extractSample');
await page.waitForSelector('.pe-row', { timeout: 5000 });
await sleep(600);
const phone = await page.evaluate(async () => {
	const canvas = () =>
		document.querySelector('.palette-extractor .canon-canvas').getBoundingClientRect().height;
	const before = canvas();
	document.querySelector('.palette-extractor .canon-split-body').scrollTop = 400;
	await new Promise((r) => setTimeout(r, 400));
	return {
		before,
		after: canvas(),
		sideways: document.documentElement.scrollWidth > window.innerWidth ||
			document.querySelector('.dt-main').scrollWidth > document.querySelector('.dt-main').clientWidth,
	};
});
check('phone: the picture collapses on scroll', phone.after < phone.before, `${phone.before} -> ${phone.after}`);
check('phone: no sideways scroll', !phone.sideways);

await finish(browser);
