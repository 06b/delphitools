// the canon font-explorer: drop zone, parsed TTF/OTF/WOFF facts, WOFF2 fallback, specimens in the face, clear

import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { BASE, launch, visit, check, finish, sleep } from './harness.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));
const fonts = {
	otf: `${root}public/fonts/fluoWrite-Regular.otf`,
	woff2: `${root}public/fonts/Iosevka-400.woff2`,
	ttf: process.env.TTF_FONT ?? '/System/Library/Fonts/Supplemental/Arial.ttf',
};

// a WOFF 1 wrapped here from the OTF: every table deflated, as a font tool would ship it
function woff(source) {
	const sfnt = readFileSync(source);
	const count = sfnt.readUInt16BE(4);
	const tables = Array.from({ length: count }, (_, i) => {
		const at = 12 + i * 16;
		const offset = sfnt.readUInt32BE(at + 8);
		const length = sfnt.readUInt32BE(at + 12);
		const raw = sfnt.subarray(offset, offset + length);
		const packed = deflateSync(raw);
		return {
			tag: sfnt.subarray(at, at + 4),
			checksum: sfnt.readUInt32BE(at + 4),
			length,
			data: packed.length < length ? packed : raw,
		};
	});
	const pad = (n) => (n + 3) & ~3;
	let offset = 44 + count * 20;
	const parts = [];
	const directory = Buffer.alloc(count * 20);
	tables.forEach((t, i) => {
		t.tag.copy(directory, i * 20);
		directory.writeUInt32BE(offset, i * 20 + 4);
		directory.writeUInt32BE(t.data.length, i * 20 + 8);
		directory.writeUInt32BE(t.length, i * 20 + 12);
		directory.writeUInt32BE(t.checksum, i * 20 + 16);
		const padded = Buffer.alloc(pad(t.data.length));
		t.data.copy(padded);
		parts.push(padded);
		offset += padded.length;
	});
	const header = Buffer.alloc(44);
	header.write('wOFF', 0, 'latin1');
	header.writeUInt32BE(sfnt.readUInt32BE(0), 4);
	header.writeUInt32BE(offset, 8);
	header.writeUInt16BE(count, 12);
	header.writeUInt32BE(sfnt.length, 16);
	const file = join(mkdtempSync(join(tmpdir(), 'fx-')), 'wrapped.woff');
	writeFileSync(file, Buffer.concat([header, directory, ...parts]));
	return file;
}
fonts.woff = woff(fonts.ttf);

const { browser, page } = await launch({ ignore: [/Font load failed/] });
await page
	.browserContext()
	.overridePermissions(BASE, [
		'clipboard-read',
		'clipboard-write',
		'clipboard-sanitized-write',
	]);

const load = async (file) => {
	const input = await page.$('.font-explorer input[type="file"]');
	await input.uploadFile(file);
	await page.waitForSelector('.fx-file', { timeout: 5000 }).catch(() => {});
	await sleep(300);
};
const clear = async () => {
	await page.evaluate(() =>
		document.querySelector('.fx-file button')?.click(),
	);
	await sleep(100);
};
const state = () =>
	page.evaluate(() => ({
		overview: Object.fromEntries(
			[...document.querySelectorAll('.canon-value-line')].map((l) => [
				l.querySelector('.canon-value-line-label')?.textContent.trim(),
				l.querySelector('.canon-value-line-value')?.textContent.trim(),
			]),
		),
		tiles: Object.fromEntries(
			[...document.querySelectorAll('.canon-tiles-tile')].map((t) => [
				t.querySelector('.canon-tiles-label').textContent.trim(),
				t.querySelector('.canon-tiles-value').textContent.trim(),
			]),
		),
		tables: [...document.querySelectorAll('.fx-table-tag')].map((t) => t.textContent),
		figure: document.querySelector('.fx-picture .canon-figure-said')?.textContent.replace(/\s+/g, ''),
		labels: [...document.querySelectorAll('.fx-label')].map((l) => l.textContent.trim()),
		family: document.querySelector('.fx-picture-type')?.getAttribute('font-family'),
		waterfall: document.querySelectorAll('.fx-step').length,
		stepFace: document.querySelector('.fx-step-text') && getComputedStyle(document.querySelector('.fx-step-text')).fontFamily,
		glyphs: document.querySelectorAll('.fx-glyph').length,
		css: document.querySelector('.canon-code-block')?.textContent ?? '',
		error: document.querySelector('.font-explorer .canon-status')?.textContent.trim(),
	}));

await visit(page, '/tools/font-explorer');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.font-explorer').getBoundingClientRect()
				.height,
	),
);
check('empty: the drop zone and the placeholder row', !!(await page.$('.canon-drop-zone')) && !!(await page.$('.canon-empty-row')));
let s = await state();
check('empty: the stand-in specimen with no values', s.labels.length > 0 && s.labels.every((l) => !/\d/.test(l)) && s.figure === '—', `${s.labels} ${s.figure}`);

await load(fonts.ttf);
s = await state();
check('a TTF reads its names', s.overview.Family === 'Arial' && s.overview['PostScript Name'] === 'ArialMT', JSON.stringify(s.overview));
check('and its metrics', s.tiles['Units per Em'] === '2048' && Number(s.tiles['Glyph Count'].replace(/,/g, '')) > 100, JSON.stringify(s.tiles));
check('and its tables', s.tables.includes('cmap') && s.tables.includes('head'), s.tables.join());
check('the picture shows UPM and line values', s.figure === '2048UPM' && s.labels.some((l) => l.startsWith('Ascent') && /\d/.test(l)), `${s.figure} ${s.labels}`);
check('the specimen is set in the loaded face', /^preview-\d+$/.test(s.family) && s.stepFace?.startsWith('preview-'), `${s.family} ${s.stepFace}`);
check('the waterfall reaches 96 px', s.waterfall === 10, String(s.waterfall));
check('the glyph chart lists covered code points', s.glyphs > 150, String(s.glyphs));
check('the CSS names the family', s.css.includes("font-family: 'Arial'") && s.css.includes("format('truetype')"), s.css.slice(0, 80));

await page.evaluate(() => document.querySelector('.fx-glyph[aria-label="U+0041"]').click());
await sleep(300);
const copied = await page.evaluate(() => navigator.clipboard.readText());
check('a glyph cell copies it', copied === 'A', copied);

await page.focus('.fx-preview');
await page.evaluate(() => document.querySelector('.fx-preview').select());
await page.keyboard.type('Hamburgefonstiv');
await sleep(50);
check(
	'the preview text drives the waterfall live',
	await page.$eval('.fx-step-text', (t) => t.textContent === 'Hamburgefonstiv'),
);

await clear();
check('Clear returns to the drop zone', !!(await page.$('.canon-drop-zone')));

await load(fonts.otf);
s = await state();
check('an OTF reads too', s.tiles['Units per Em'] && s.tables.includes('CFF ') && s.css.includes("format('opentype')"), `${s.tiles['Units per Em']} ${s.tables}`);
await clear();

await load(fonts.woff);
s = await state();
check('a WOFF is inflated and read', s.overview.Family === 'Arial' && s.tables.includes('cmap') && s.css.includes("format('woff')"), JSON.stringify(s.overview));
await clear();

await load(fonts.woff2);
s = await state();
check('a WOFF2 previews with file-name facts', s.overview['File Name'] === 'Iosevka-400.woff2' && s.overview['PostScript Name'] === 'Iosevka-400' && s.tables.length === 0 && s.figure === '—', JSON.stringify(s));
check('and still sets the specimen in its face', /^preview-\d+$/.test(s.family));
await clear();

// the drop zone ignores other files, as the kit does; a drop elsewhere in the tool says so
await page.evaluate(() => {
	const data = new DataTransfer();
	data.items.add(new File(['{}'], 'notes.json', { type: 'application/json' }));
	document
		.querySelector('.fx-picture')
		.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
});
await sleep(100);
s = await state();
check('a non-font dropped on the tool says so', s.error === 'Please upload a font file (.ttf, .otf, .woff, .woff2)', s.error);

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/font-explorer');
check(
	'no horizontal scroll on a phone',
	await page.evaluate(
		() =>
			document.documentElement.scrollWidth <=
			document.documentElement.clientWidth,
	),
);

await finish(browser);
