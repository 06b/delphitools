// the canon image-converter: picture, live conversion, every format, resize, batch, zip, paste, drop, flags

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

const dir = mkdtempSync(join(tmpdir(), 'conv-'));
const { browser, page } = await launch();

await visit(page, '/tools/image-converter');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.image-converter').getBoundingClientRect()
				.height,
	),
);

const state = () =>
	page.evaluate(() => {
		const text = (selector) =>
			document.querySelector(selector)?.textContent.trim();
		const checked = (selector) =>
			[
				...document.querySelectorAll(
					`${selector} [role="radio"]`,
				),
			]
				.find((cell) => cell.getAttribute('aria-checked') === 'true')
				?.textContent.trim();
		return {
			slot: text('.conv-slot'),
			slotTag: document.querySelector('.conv-slot')?.tagName,
			drop: !!document.querySelector('.conv-drop'),
			files: [...document.querySelectorAll('.conv-file')].map(
				(row) =>
					`${row.querySelector('.canon-row-title').textContent.trim()}|${row.querySelector('.canon-row-detail').textContent.trim()}`,
			),
			format: checked('.conv-formats'),
			resize: checked('.conv-resize'),
			preset: checked('.conv-presets') ?? 'none',
			resultTitle: text('.conv-result-file .canon-row-title'),
			resultDetail: text('.conv-result-file .canon-row-detail'),
			download: document.querySelector('.conv-download').disabled,
			zip: !!document.querySelector('.conv-zip'),
			figure: text('.conv-bytes .canon-figure-said'),
			lines: [
				...document.querySelectorAll(
					'.conv-dimension .canon-figure-said',
				),
			].map((f) => f.textContent.trim()),
			blank: document.querySelectorAll('.canon-dimension-line--blank')
				.length,
			lamps: [...document.querySelectorAll('.conv-lamp')]
				.map((l) =>
					l.classList.contains('conv-lamp--on') ? 'on' : 'off',
				)
				.join(','),
			name: document
				.querySelector('.conv-name[role="img"]')
				?.getAttribute('aria-label'),
			outline: text('.conv-source-tag'),
			image: document
				.querySelector('.conv-image')
				?.classList.contains('conv-image--source')
				? 'source'
				: 'result',
			working: !!document.querySelector('.conv-loader'),
			failure: text('.conv-failure'),
			loadError: text('.conv-load-error'),
			width: document.querySelector('.conv-width input')?.value,
			height: document.querySelector('.conv-height input')?.value,
			fieldsDisabled: document.querySelector('.conv-width input')
				?.disabled,
		};
	});

const settle = () =>
	page.waitForFunction(
		() =>
			!document.querySelector('.conv-loader') &&
			!!document.querySelector('.conv-result-file'),
		{ timeout: 20000 },
	);
const pick = async (selector, label) => {
	await page.evaluate(
		(selector, label) =>
			[...document.querySelectorAll(`${selector} [role="radio"]`)]
				.find((cell) => cell.textContent.trim() === label)
				.click(),
		selector,
		label,
	);
	await sleep(80);
	await settle();
};
const type = async (selector, value) => {
	await page.focus(selector);
	await page.$eval(selector, (input) => input.select());
	await page.keyboard.type(String(value));
	await page.keyboard.press('Enter');
	await sleep(80);
	await settle();
};

let s = await state();
check(
	'empty: the picture is the drop target, a button',
	s.slot === 'Drop images here' && s.slotTag === 'BUTTON',
	s.slot,
);
check('empty: the source drop zone with Files and Paste', s.drop);
check(
	'empty: Files and Paste cells',
	(await page.$$eval('.conv-drop button', (b) =>
		b.map((x) => x.textContent.trim()).join(),
	)) === 'Files,Paste',
);
check('empty: blank dimension lines, figure a dash', s.blank === 2 && s.figure === '—', `${s.blank} ${s.figure}`);
check(
	'empty: result row dashed, download off',
	s.resultTitle === '—' && s.resultDetail === '—' && s.download,
	`${s.resultTitle} ${s.resultDetail} ${s.download}`,
);
check('empty: WebP picked, settings enabled', s.format === 'WebP' && !(await page.$('.conv-formats [role="radio"][disabled]')));
check('empty: lamps Alpha off, Lossy on, 256 off', s.lamps === 'off,on,off', s.lamps);
await pick('.conv-resize', 'Custom');
s = await state();
check('empty: width and height wait for a file', s.fieldsDisabled === true);
await pick('.conv-resize', 'Original');

// a 1400 x 1000 PNG with a transparent band and a 600 x 600 JPEG
const make = (width, height, type, clear) =>
	page.evaluate(
		({ width, height, type, clear }) => {
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const context = canvas.getContext('2d');
			context.fillStyle = '#1d3b8f';
			context.fillRect(0, 0, width, height);
			context.fillStyle = '#e07a3f';
			context.fillRect(width / 4, height / 4, width / 2, height / 2);
			if (clear) context.clearRect(0, 0, width, 40);
			return canvas.toDataURL(type).split(',')[1];
		},
		{ width, height, type, clear },
	);
const logo = join(dir, 'logo.png');
const photo = join(dir, 'photo.jpg');
writeFileSync(logo, Buffer.from(await make(1400, 1000, 'image/png', true), 'base64'));
writeFileSync(photo, Buffer.from(await make(600, 600, 'image/jpeg', false), 'base64'));
const [chooser] = await Promise.all([
	page.waitForFileChooser({ timeout: 3000 }),
	page.click('.conv-slot'),
]);
check('the slot opens a multiple picker', chooser.isMultiple());
await chooser.accept([logo, photo]);
await page.waitForSelector('.conv-file', { timeout: 5000 });
await settle();
s = await state();
check(
	'batch: both files listed with size and bytes',
	s.files.length === 2 &&
		s.files[0].startsWith('logo.png|1400 × 1000 · ') &&
		s.files[1].startsWith('photo.jpg|600 × 600 · '),
	s.files.join(' / '),
);
check('batch: the drop zone gives way to Files, Paste, Clear all', !s.drop &&
	(await page.$$eval('.conv-add button', (b) => b.map((x) => x.textContent.trim()).join())) === 'Files,Paste,Clear all');
check(
	'live: the first file converts to WebP at once',
	s.resultTitle === 'logo.webp' && /^1400 × 1000 · [\d.]+ (B|KB|MB)$/.test(s.resultDetail),
	`${s.resultTitle} ${s.resultDetail}`,
);
check('the picture: dimension lines and name', s.lines.join() === '1400px,1000px' && s.name === '1400 × 1000', `${s.lines} ${s.name}`);
check('the picture shows the result over checks', s.image === 'result' && !!(await page.$('.conv-checks')));
check('the figure reads the bytes with a unit', /^[\d.]+(B|KB|MB)$/.test(s.figure), s.figure);
check('lamps: alpha kept, lossy, not 256', s.lamps === 'on,on,off', s.lamps);
check('download on, zip offered for two', !s.download && s.zip);
check('the shown file is pressed', (await page.$$eval('.conv-show', (b) => b.map((x) => x.getAttribute('aria-pressed')).join())) === 'true,false');

await captureObjectUrl(page);
const magic = async () => {
	await page.click('.conv-download');
	await sleep(150);
	return page.evaluate(async () => {
		const bytes = new Uint8Array(await window.__result.arrayBuffer());
		return {
			head: [...bytes.slice(0, 4)].map((b) => b.toString(16).padStart(2, '0')).join(''),
			type: window.__result.type,
		};
	});
};
const heads = {
	PNG: '89504e47',
	JPEG: 'ffd8ffe0',
	WebP: '52494646',
	GIF: '47494638',
	BMP: '424d',
	TIFF: '49492a00',
	ICO: '00000100',
	ICNS: '69636e73',
	JXL: 'ff0a',
};
for (const [label, head] of Object.entries(heads)) {
	await pick('.conv-formats', label);
	const got = await magic();
	check(`${label}: the file written has the format's signature`, got.head.startsWith(head), `${got.head} ${got.type}`);
}
await pick('.conv-formats', 'ICNS');
s = await state();
check('ICNS: output is the icon square', s.resultDetail.startsWith('128 × 128 ·') && s.lines.join() === '128px,128px', s.resultDetail);
check('ICNS: the result is not shown, the source dims', s.image === 'source');

await pick('.conv-formats', 'JPEG');
s = await state();
check('JPEG: alpha lamp off, lossy on', s.lamps === 'off,on,off', s.lamps);
check('JPEG: quality and background well', !!(await page.$('.conv-quality [role="slider"]')) && !!(await page.$('.conv-jpeg-background')));
const before = await page.$eval('.conv-quality [role="slider"]', (x) => x.getAttribute('aria-valuenow'));
await page.focus('.conv-quality [role="slider"]');
await page.keyboard.press('ArrowLeft');
await settle();
const after = await page.$eval('.conv-quality [role="slider"]', (x) => x.getAttribute('aria-valuenow'));
check('quality takes the arrow keys', Number(after) === Number(before) - 1, `${before} → ${after}`);

await pick('.conv-formats', 'GIF');
check('GIF: 256 lamp, quantisation menu', (await state()).lamps === 'off,off,on' && !!(await page.$('.conv-quantisation select')));
await page.select('.conv-quantisation select', '2');
await settle();
check('GIF: RGBA4444 keeps alpha', (await state()).lamps === 'on,off,on');

await pick('.conv-formats', 'BMP');
await pick('.conv-depth', '24-bit');
check('BMP: 24-bit drops alpha', (await state()).lamps === 'off,off,off' && (await page.$eval('.conv-depth .canon-row-detail', (x) => x.textContent.trim())) === 'No transparency');

await pick('.conv-formats', 'ICO');
await page.click('.conv-multi [role="switch"]');
await settle();
check('ICO multi-size embeds every size', (await page.$eval('.conv-sizes-note', (x) => x.textContent.trim())) === 'Embeds all sizes: 16, 32, 48, 64, 128, 256px' && (await state()).resultDetail.startsWith('256 × 256'));

await pick('.conv-formats', 'PNG');
await page.click('.conv-png-alpha [role="switch"]');
await settle();
check('PNG: transparency off shows the background well and drops alpha', !!(await page.$('.conv-png-background')) && (await state()).lamps === 'off,off,off');

// resize
await pick('.conv-resize', 'Percentage');
await pick('.conv-presets', '50%');
s = await state();
check('50%: 700 × 500 inside the dashed source', s.resultDetail.startsWith('700 × 500') && s.outline === '1400 × 1000' && s.lines.join() === '700px,500px', `${s.resultDetail} ${s.outline}`);
await type('.conv-percent input', 60);
s = await state();
check('typed 60 %: no preset lit', s.preset === 'none' && s.resultDetail.startsWith('840 × 600'), `${s.preset} ${s.resultDetail}`);
await pick('.conv-presets', '200%');
check('200 %: a preset again', (await state()).resultDetail.startsWith('2800 × 2000'));

await pick('.conv-resize', 'Custom');
s = await state();
check('custom: the fields hold the source', s.width === '1400' && s.height === '1000' && !s.fieldsDisabled, `${s.width} ${s.height}`);
check('custom: aspect ratio detail', (await page.$eval('.conv-lock .canon-row-detail', (x) => x.textContent.trim())) === '7:5');
await type('.conv-width input', 700);
s = await state();
check('locked: height follows width', s.height === '500' && s.resultDetail.startsWith('700 × 500'), `${s.height} ${s.resultDetail}`);
await page.click('.conv-lock [role="switch"]');
await settle();
await type('.conv-height input', 300);
s = await state();
check('unlocked: sides apart', s.width === '700' && s.resultDetail.startsWith('700 × 300'), s.resultDetail);
await page.click('.conv-lock [role="switch"]');
await settle();
check('relocked: height follows width', (await state()).height === '500');

// the batch
await page.evaluate(() => document.querySelectorAll('.conv-show')[1].click());
await settle();
s = await state();
check('preview the second: its own result and locked size', s.resultTitle === 'photo.png' && s.resultDetail.startsWith('700 × 700'), `${s.resultTitle} ${s.resultDetail}`);
await page.evaluate(() => {
	window.__result = undefined;
	document.querySelector('.conv-zip').click();
});
await page.waitForFunction(() => window.__result?.type === 'application/zip' || window.__result?.size > 0 && !document.querySelector('.conv-zip').disabled, { timeout: 20000 });
const zip = await page.evaluate(async () => {
	const bytes = new Uint8Array(await window.__result.arrayBuffer());
	const text = new TextDecoder('latin1').decode(bytes);
	return { pk: text.startsWith('PK'), names: ['logo.png', 'photo.png'].filter((n) => text.includes(n)).length };
});
check('zip: both files converted', zip.pk && zip.names === 2, JSON.stringify(zip));

await page.evaluate(() => document.querySelectorAll('.conv-remove')[1].click());
await settle();
s = await state();
check('remove: one row left with Clear, shown', s.files.length === 1 && !!(await page.$('.conv-clear')) && s.resultTitle === 'logo.png' && !s.zip);

// paste anywhere and drop on the picture add files
const pngBase64 = await make(320, 200, 'image/png', false);
await page.evaluate((b64) => {
	const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
	const transfer = new DataTransfer();
	transfer.items.add(new File([bytes], 'pasted.png', { type: 'image/png' }));
	document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true }));
}, pngBase64);
await page.waitForFunction(() => document.querySelectorAll('.conv-file').length === 2, { timeout: 5000 }).catch(() => {});
check('paste anywhere adds a file', (await state()).files.length === 2);
await page.evaluate((b64) => {
	const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
	const transfer = new DataTransfer();
	transfer.items.add(new File([bytes], 'a.png', { type: 'image/png' }));
	transfer.items.add(new File([bytes], 'b.png', { type: 'image/png' }));
	const target = document.querySelector('.conv-picture');
	target.dispatchEvent(new DragEvent('dragover', { dataTransfer: transfer, bubbles: true, cancelable: true }));
	target.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
}, pngBase64);
await page.waitForFunction(() => document.querySelectorAll('.conv-file').length === 4, { timeout: 5000 }).catch(() => {});
check('drop on the picture adds every file', (await state()).files.length === 4);
await page.evaluate(() => {
	const transfer = new DataTransfer();
	transfer.items.add(new File(['nope'], 'broken.png', { type: 'image/png' }));
	document.querySelector('.conv-picture').dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
});
await page.waitForSelector('.conv-load-error', { timeout: 5000 }).catch(() => {});
s = await state();
check('an unreadable file is named, not added', s.loadError === 'Failed to load image: broken.png' && s.files.length === 4, s.loadError);
await page.evaluate(() => {
	const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="40" height="30"><rect width="40" height="30" fill="red"/></svg>';
	const transfer = new DataTransfer();
	transfer.items.add(new File([svg], 'logo.svg', { type: 'image/svg+xml' }));
	document.querySelector('.conv-picture').dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
});
await page.waitForFunction(() => document.querySelectorAll('.conv-file').length === 5, { timeout: 5000 }).catch(() => {});
check('an svg loads', (await state()).files.length === 5);
await page.click('.conv-clear-all');
await sleep(100);
s = await state();
check('clear all: back to the empty layout', s.files.length === 0 && s.drop && s.slotTag === 'BUTTON' && s.download);

// iOS launch arguments
await visit(page, '/tools/image-converter?convSample&convFormat=JPEG&convQuality=40&convResize=1&convPercent=50');
await page.waitForSelector('.conv-file', { timeout: 5000 });
await settle();
s = await state();
check('flags: format, scale, sample', s.format === 'JPEG' && s.resize === 'Percentage' && s.preset === '50%' && s.resultDetail.startsWith('800 × 600'), `${s.format} ${s.resize} ${s.preset} ${s.resultDetail}`);
check('flags: quality', (await page.$eval('.conv-quality [role="slider"]', (x) => x.getAttribute('aria-valuenow'))) === '40');

await page.click('.conv-svg');
await page.waitForFunction(() => location.pathname.endsWith('/image-tracer'), { timeout: 5000 }).catch(() => {});
check('SVG opens the image tracer', await page.evaluate(() => location.pathname.endsWith('/image-tracer')));

// phone: stacked, no sideways scroll
await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/image-converter?convSample');
await page.waitForSelector('.conv-file', { timeout: 5000 });
check('390 px: no horizontal scroll', await page.evaluate(() => document.querySelector('.dt-main').scrollWidth <= document.querySelector('.dt-main').clientWidth));

await finish(browser);
