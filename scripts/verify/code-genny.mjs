// code-genny: the canon port on qr-genny's code sheet picture
//
// Usage: npm start, then node scripts/verify/code-genny.mjs

import {
	BASE,
	launch,
	visit,
	check,
	finish,
	sleep,
	captureObjectUrl,
} from './harness.mjs';

const { browser, page } = await launch();
await page
	.browserContext()
	.overridePermissions(BASE, [
		'clipboard-read',
		'clipboard-write',
		'clipboard-sanitized-write',
	]);
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' });

const picture = () =>
	page.evaluate(() => {
		const host = document.querySelector('.code-sheet');
		const canvas = host.querySelector('canvas');
		return {
			label: canvas.getAttribute('aria-label'),
			role: canvas.getAttribute('role'),
			caption: host.querySelector('.code-sheet-name')?.textContent.trim(),
			figure:
				host.querySelector('.canon-figure-said')?.textContent.trim() ?? '',
			empty: !!host.querySelector('.code-sheet-empty'),
		};
	});
const tiles = () =>
	page.$$eval('.code-genny .canon-tiles-value', (els) =>
		els.map((el) => el.textContent.trim()),
	);
const type = async (text) => {
	await page.$eval('.cg-content', (el) => {
		el.focus();
		el.select();
	});
	await page.keyboard.type(text);
	await sleep(100);
};
const pick = async (label, name) => {
	await page.$$eval(
		`.code-genny [aria-label="${label}"] button`,
		(els, n) => els.find((e) => e.textContent.trim() === n)?.click(),
		name,
	);
	await sleep(150);
};
const error = () =>
	page.$eval('.code-genny', (el) =>
		el.querySelector('.cg-error')?.textContent.trim(),
	);

await visit(page, '/tools/code-genny');
await page.waitForFunction(() => !!document.querySelector('.code-sheet'));

check(
	'the split fills the sheet',
	await page.evaluate(() => {
		const sheet = document.querySelector('.dt-canon-tool');
		const split = document.querySelector('.code-genny');
		return (
			Math.abs(
				sheet.getBoundingClientRect().height -
					split.getBoundingClientRect().height,
			) < 1
		);
	}),
);
const field = await page.evaluate(() => {
	const main = document.querySelector('.canon-split-main');
	const first = main.querySelector('textarea, input, button, [tabindex]');
	const box = document.querySelector('.cg-content');
	return {
		first: first === box,
		height: box.getBoundingClientRect().height,
		font: parseFloat(getComputedStyle(box).fontSize),
	};
});
check('the content is the first control', field.first);
check(
	'at primary height in the big-number size',
	field.height >= 68 && field.font >= 32,
	`${field.height} px, ${field.font} px`,
);
let p = await picture();
check('empty: the picture says what to do', p.empty && p.role === 'img');
check(
	'empty: Copy and Export are off',
	await page.$eval('.cg-copy', (el) => el.disabled) &&
		(await page.$eval('.cg-export', (el) => el.disabled)),
);

await type('Hello delphi');
p = await picture();
check('typing is live: the picture is the content', p.label === 'Hello delphi', p.label);
check('captioned with the type and its written size', p.caption === 'Data Matrix' && /× \d+/.test(p.figure), `${p.caption} ${p.figure}`);
check('tiles: modules, characters, contrast', (await tiles()).join(',') === '16 × 16,12,21:1', (await tiles()).join(','));
await page.$eval('.cg-content', (el) => el.blur());
await page.click('.cg-content');
await sleep(100);
check(
	'focus selects the whole content',
	await page.$eval('.cg-content', (el) => el.selectionStart === 0 && el.selectionEnd === el.value.length),
);

// every type renders
const types = await page.$$eval('.code-genny [aria-label="Code Type"] button', (els) =>
	els.map((e) => e.textContent.trim()),
);
check('eight types', types.length === 8, types.join(', '));
const samples = {
	'Micro QR': 'Hello',
	'Data Matrix': 'ABC123',
	'Aztec Code': 'ABC123',
	PDF417: 'ABC123',
	'Code 128': 'ABC-12345',
	'Code 39': 'CODE39',
	'EAN-13': '590123412345',
	'UPC-A': '01234567890',
};
const rendered = [];
for (const name of types) {
	await pick('Code Type', name);
	await type(samples[name]);
	p = await picture();
	if (!p.empty && p.caption === name) rendered.push(name);
}
check('each type draws its code', rendered.length === 8, rendered.join(', '));
check('UPC-A shows its check digit', (await tiles()).at(-1) === '5', (await tiles()).join(','));

await pick('Code Type', 'EAN-13');
await type('5901234123458');
check('a wrong check digit says what it should be', /^Check digit should be 7/.test((await error()) ?? ''), await error());
check('and draws nothing', (await picture()).empty);
await type('5901234123457');
check('the right one draws', !(await picture()).empty && !(await error()));
check('the check digit tile', (await tiles()).at(-1) === '7');

await pick('Code Type', 'Code 39');
await type('abc');
check('Code 39 takes uppercase only, as typed', (await page.$eval('.cg-content', (el) => el.value)) === 'ABC');
await type('a€b');
check('characters a type cannot hold are dropped', (await page.$eval('.cg-content', (el) => el.value)) === 'AB');

// numbers and padding redraw
await pick('Code Type', 'Code 128');
await type('ABC');
const before = (await picture()).figure;
await page.$$eval('.code-genny .canon-row', (rows) =>
	rows.find((r) => r.textContent.includes('Show numbers'))?.querySelector('input')?.click(),
);
await sleep(150);
check('Show numbers off drops the text band', (await picture()).figure !== before, `${before} -> ${(await picture()).figure}`);

// export and copy
await captureObjectUrl(page);
await page.click('.cg-export');
await sleep(300);
const png = await page.evaluate(async () => {
	const blob = window.__result;
	if (!blob) return null;
	const bitmap = await createImageBitmap(blob);
	return { type: blob.type, width: bitmap.width, height: bitmap.height };
});
const shown = (await picture()).figure.match(/(\d+) × (\d+)/);
check(
	'Export writes a PNG at the shown size',
	png?.type === 'image/png' && shown && png.width === Number(shown[1]) && png.height === Number(shown[2]),
	`${JSON.stringify(png)} vs ${shown?.[0]}`,
);
await pick('Format', 'SVG');
await page.click('.cg-export');
await sleep(300);
const svg = await page.evaluate(async () => {
	const blob = window.__result;
	const text = await blob.text();
	const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
	return { type: blob.type, rects: doc.querySelectorAll('rect').length, root: doc.documentElement.nodeName };
});
check('SVG export is an SVG of rects', svg.type === 'image/svg+xml' && svg.root === 'svg' && svg.rects > 10, JSON.stringify(svg));
await page.click('.cg-copy');
await sleep(200);
const copied = await page.evaluate(() => navigator.clipboard.readText());
check('Copy in SVG copies the markup', copied.startsWith('<svg'), copied.slice(0, 20));
check('and the toast shows', await page.$eval('.canon-toast', (el) => el.style.opacity === '1'));
await pick('Format', 'PNG');
await page.click('.cg-copy');
await sleep(300);
check(
	'Copy in PNG puts an image on the clipboard',
	await page.evaluate(async () => {
		const items = await navigator.clipboard.read();
		return items.some((i) => i.types.includes('image/png'));
	}),
);

// transparent
await page.$$eval('.code-genny .canon-row', (rows) =>
	rows.find((r) => r.textContent.trim().startsWith('Transparent'))?.querySelector('input')?.click(),
);
await sleep(150);
check('Transparent turns the background off', await page.$eval('.cg-background', (el) => el.inert));

// batch
await pick('Mode', 'Batch Mode');
check('Batch Mode shows its list', !!(await page.$('.cg-batch-run')) && (await page.$eval('.cg-batch-run', (el) => el.disabled)));
await page.$$eval('.code-genny button', (els) => els.find((e) => e.textContent.trim() === 'Add Item')?.click());
await page.$$eval('.code-genny button', (els) => els.find((e) => e.textContent.trim() === 'Add Item')?.click());
await sleep(100);
const cells = await page.$$('.cg-batch-row .canon-text-cell');
await cells[0].type('ONE');
await cells[1].type('TWO');
await captureObjectUrl(page);
await page.click('.cg-batch-run');
await page.waitForFunction(() => window.__result?.type === 'application/zip', { timeout: 10000 }).catch(() => {});
check(
	'Generate & Download ZIP saves a zip, a thumbnail per item',
	(await page.evaluate(() => window.__result?.type)) === 'application/zip' &&
		(await page.$$('.cg-batch-thumb')).length === 2,
);

await visit(page, '/tools/code-genny?codeKind=6&codeText=590123412345&codePadding=4&codeFormat=1');
await sleep(500);
check(
	'?codeKind= ?codeText= ?codePadding= ?codeFormat= set up a state',
	(await picture()).caption === 'EAN-13' &&
		(await page.$eval('.cg-content', (el) => el.value)) === '590123412345' &&
		(await page.$eval('[aria-label="Format"] button:last-child', (el) => el.getAttribute('aria-checked') === 'true' || el.classList.contains('canon-button--selected'))),
);

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/code-genny?codeText=Hello');
const narrow = await page.evaluate(() => {
	const body = document.querySelector('.canon-split-body');
	const picture = document.querySelector('.canon-split-sidebar .canon-canvas');
	const before = picture.getBoundingClientRect().height;
	body.scrollTop = body.scrollHeight;
	return new Promise((resolve) =>
		requestAnimationFrame(() =>
			requestAnimationFrame(() =>
				resolve({
					wide: getComputedStyle(body).getPropertyValue('--canon-split-layout').trim(),
					overflow:
						document.documentElement.scrollWidth > window.innerWidth ||
						body.scrollWidth > body.clientWidth,
					before,
					after: picture.getBoundingClientRect().height,
				}),
			),
		),
	);
});
check('390 px: one column', narrow.wide === 'stacked', narrow.wide);
check('390 px: no horizontal scroll', !narrow.overflow);
check('390 px: the picture collapses as the page scrolls', narrow.after < narrow.before, `${narrow.before} -> ${narrow.after}`);

await finish(browser);
