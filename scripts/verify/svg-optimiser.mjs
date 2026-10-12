// the canon svg-optimiser: typed, pasted, dropped and handed-off input
// usage: npm start, then node scripts/verify/svg-optimiser.mjs

import { BASE, launch, visit, check, finish, sleep } from './harness.mjs';

const SVG = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Generator: test -->
<svg xmlns="http://www.w3.org/2000/svg" width="240" height="160" viewBox="0 0 240 160" data-name="badge">
  <g id="layer1">
    <rect x="10.000" y="10.000" width="220.000" height="140.000" rx="12" fill="#1f6f3a"/>
    <circle cx="80.0000" cy="80.0000" r="40.0000" fill="#ffffff"/>
  </g>
</svg>`;

const { browser, page } = await launch({ ignore: [/SVG optimisation failed/] });
await page
	.browserContext()
	.overridePermissions(BASE, [
		'clipboard-read',
		'clipboard-write',
		'clipboard-sanitized-write',
	]);
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' });

const state = () =>
	page.evaluate(() => {
		const text = (sel) =>
			document.querySelector(sel)?.textContent.replace(/\s+/g, ' ').trim() ?? null;
		return {
			input: document.querySelector('.svg-optimiser .tt-source').value,
			code: document.querySelector('.so-code pre')?.textContent ?? null,
			preview: !!document.querySelector('.so-preview')?.src.startsWith('blob:'),
			empty: text('.svg-optimiser .canon-split-main .canon-empty-row'),
			failure: text('.so-failure'),
			file: text('.so-file .canon-row-title'),
			drop: !!document.querySelector('.so-drop'),
			scale: text('.canon-compression-scale'),
		};
	});
const settle = () =>
	page.waitForFunction(
		() => !document.querySelector('.canon-compression-scale-loader'),
		{ timeout: 10000 },
	);

await visit(page, '/tools/svg-optimiser');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.svg-optimiser').getBoundingClientRect().height,
	),
);
let s = await state();
check('empty: the iOS placeholder, a drop zone', s.empty === 'Optimised SVG' && s.drop && !s.code);

// typed: live on every edit
await page.click('.svg-optimiser .tt-source');
await page.evaluate((svg) => {
	const area = document.querySelector('.svg-optimiser .tt-source');
	const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
	setter.call(area, svg);
	area.dispatchEvent(new Event('input', { bubbles: true }));
}, SVG);
await settle();
s = await state();
check('typed code optimises', !!s.code && s.code.startsWith('<svg') && s.preview, s.code?.slice(0, 60));
check('the root keeps its viewBox and loses width and height', /viewBox="0 0 240 160"/.test(s.code) && !/^<svg[^>]*\swidth=/.test(s.code));
check('data attributes and comments go', !s.code.includes('data-name') && !s.code.includes('Generator'));
const before = new TextEncoder().encode(SVG).length;
const after = new TextEncoder().encode(s.code).length;
check(
	'the scale reads both sizes',
	s.scale.includes(`${before} B`) && s.scale.includes(`${after} B`),
	s.scale,
);
check(
	'the code is monospaced',
	await page.$eval('.so-code pre', (el) => {
		const style = getComputedStyle(el);
		return /iosevka|mono/i.test(style.fontFamily);
	}),
);
check(
	'the preview is a named image',
	(await page.$eval('.so-preview', (el) => el.getAttribute('alt'))) === 'Optimised SVG preview',
);

await page.click('.so-code .canon-code-block-copy');
await sleep(200);
check('the code block copies the result', (await page.evaluate(() => navigator.clipboard.readText())) === s.code);
check(
	'Download is the primary action',
	(await page.$eval('.so-download', (el) => el.textContent.trim())) === 'Download',
);

// broken svg: the optimiser's own message
await page.evaluate(() => {
	const area = document.querySelector('.svg-optimiser .tt-source');
	const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
	setter.call(area, '<svg><g></svg>');
	area.dispatchEvent(new Event('input', { bubbles: true }));
});
await settle();
s = await state();
check('a broken svg shows why', !!s.failure && !s.code, s.failure);

// Clear
await page.$$eval('.svg-optimiser .canon-button', (els) =>
	els.find((b) => b.textContent.trim() === 'Clear').click(),
);
await sleep(100);
s = await state();
check('Clear empties the input and the result', s.input === '' && s.empty === 'Optimised SVG');

// pasted code outside a field
await page.click('.canon-compression-scale');
await page.evaluate((svg) => {
	const data = new DataTransfer();
	data.setData('text/plain', svg);
	document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
}, SVG);
await settle();
s = await state();
check('svg code pasted anywhere loads', s.input === SVG && !!s.code);

// a dropped file, anywhere
await page.evaluate((svg) => {
	const data = new DataTransfer();
	data.items.add(new File([svg], 'badge.svg', { type: 'image/svg+xml' }));
	const target = document.querySelector('.canon-compression-scale');
	target.dispatchEvent(new DragEvent('dragover', { dataTransfer: data, bubbles: true, cancelable: true }));
	target.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
}, SVG.replace('#ffffff', '#fff000'));
await sleep(200);
await settle();
s = await state();
check('a file dropped anywhere loads, its name shown', s.file === 'badge.svg' && !s.drop && s.code?.includes('#fff000'), s.file);

// a pasted file
await page.evaluate((svg) => {
	const data = new DataTransfer();
	data.items.add(new File([svg], 'pasted.svg', { type: 'image/svg+xml' }));
	document.body.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true }));
}, SVG);
await sleep(200);
await settle();
check('a pasted file loads', (await state()).file === 'pasted.svg');

// typing after a file drops the file name
await page.focus('.svg-optimiser .tt-source');
await page.keyboard.press('End');
await page.keyboard.type(' ');
await sleep(100);
check('editing the text lets go of the file', (await state()).file === null);

// the image tracer hand-off
await page.evaluate((svg) => sessionStorage.setItem('svg-optimiser-input', svg), SVG);
await visit(page, '/tools/svg-optimiser');
await settle();
s = await state();
check('the image tracer hand-off loads as traced.svg', s.file === 'traced.svg' && !!s.code);

await page.setViewport({ width: 390, height: 844 });
await visit(page, `/tools/svg-optimiser?svgoText=${encodeURIComponent(SVG)}`);
await settle();
check('launch flag: svgoText', !!(await state()).code);
check(
	'no horizontal scroll on a phone',
	await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
);

await finish(browser);
