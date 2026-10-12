// the canon qr-genny: picture, sweep, export (seam-seal: stroke=fill, 0.5 wide)
// SHOTS=<dir> also saves a mid-sweep and a settled picture

import {
	BASE,
	launch,
	visit,
	check,
	finish,
	sleep,
	captureObjectUrl,
} from './harness.mjs';

const shots = process.env.SHOTS;
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
		const stats = host.codeSheetStats;
		return {
			label: canvas.getAttribute('aria-label'),
			role: canvas.getAttribute('role'),
			moving: canvas.hasAttribute('data-moving'),
			pixels: canvas.toDataURL(),
			sweeps: stats.sweeps,
			fades: stats.fades,
			frames: stats.frames,
			drawMs: [...stats.drawMs],
			figure:
				host
					.querySelector('.canon-figure-said')
					?.textContent.trim() ?? '',
		};
	});

const tiles = () =>
	page.$$eval('.qr-genny .canon-tiles-value', (els) =>
		els.map((el) => el.textContent.trim()),
	);

const buttons = () =>
	page.evaluate(() =>
		Object.fromEntries(
			[...document.querySelectorAll('.qr-genny button')]
				.filter((b) => ['Copy', 'Export'].includes(b.textContent.trim()))
				.map((b) => [b.textContent.trim(), b.disabled]),
		),
	);

const settle = () =>
	page.waitForFunction(
		() =>
			!document
				.querySelector('.code-sheet canvas')
				.hasAttribute('data-moving'),
		{ timeout: 5000 },
	);

// shell and empty state
await visit(page, '/tools/qr-genny');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.qr-genny').getBoundingClientRect().height,
	),
);
let p = await picture();
check('the picture is a named image', p.role === 'img' && !!p.label, p.label);
check('empty: the web wording as the name', p.label === 'Enter content to generate QR code');
let b = await buttons();
check('empty: Copy and Export are off', b.Copy === true && b.Export === true, JSON.stringify(b));
const field = await page.evaluate(() => {
	const area = document.querySelector('.qr-content');
	const first = document.querySelector('.canon-split-main > *');
	return {
		first: first?.contains(area),
		size: getComputedStyle(area).fontSize,
	};
});
check('the content field is in the first block, larger than a cell', field.first && parseFloat(field.size) >= 18, field.size);

// typing: the first code draws without a sweep, the next one sweeps
await page.click('.qr-content');
await sleep(100);
await page.keyboard.type('https://delphi.tools');
await settle();
p = await picture();
check('typing is live: the picture is the content', p.label === 'https://delphi.tools', p.label);
check('the figure shows the written size', p.figure === '300 × 300px', p.figure);
const t = await tiles();
check('tiles: version, modules, level, payload, contrast', t.join('|') === '2|25 × 25|M · 15%|20 B|21:1', t.join('|'));
b = await buttons();
check('Copy and Export are on', b.Copy === false && b.Export === false);

const sweepsBefore = p.sweeps;
await page.keyboard.type('/');
const frames = [];
for (let i = 0; i < 6; i++) {
	await sleep(60);
	frames.push(await picture());
	if (i === 1 && shots)
		await (await page.$('.code-sheet')).screenshot({ path: `${shots}/qr-sweep-mid.png` });
}
await settle();
const settled = await picture();
await sleep(200);
const later = await picture();
check('a change of modules sweeps', settled.sweeps === sweepsBefore + 1, `${settled.sweeps}`);
check('it runs on animation frames', frames.some((f) => f.moving));
check(
	'frames change during the sweep',
	new Set(frames.filter((f) => f.moving).map((f) => f.pixels)).size >= 3,
	`${new Set(frames.map((f) => f.pixels)).size} distinct`,
);
check('it settles', !settled.moving && settled.pixels === later.pixels);
check('the settled picture differs from the start', settled.pixels !== frames[0].pixels);
if (shots)
	await (await page.$('.code-sheet')).screenshot({ path: `${shots}/qr-settled.png` });

// fast typing: every key restarts from what is on screen, no pile-up
const before = await picture();
const typing = page.evaluate(
	() =>
		new Promise((resolve) => {
			const stamps = [];
			let last = performance.now();
			const tick = (now) => {
				stamps.push(now - last);
				last = now;
				if (stamps.length < 120) requestAnimationFrame(tick);
				else resolve(stamps);
			};
			requestAnimationFrame(tick);
		}),
);
await page.keyboard.type('tools/qr-genny?fast=typing', { delay: 25 });
const stamps = await typing;
await settle();
const fast = await picture();
const keys = 'tools/qr-genny?fast=typing'.length;
const longest = Math.max(...stamps.slice(1));
const worstDraw = Math.max(...fast.drawMs);
check('one sweep per key', fast.sweeps - before.sweeps === keys, `${fast.sweeps - before.sweeps} of ${keys}`);
check('no frame over 50 ms while typing', longest < 50, `${longest.toFixed(1)} ms`);
check('a frame draws in under 8 ms', worstDraw < 8, `${worstDraw.toFixed(2)} ms`);
console.log(
	`        frame gaps while typing: median ${stamps.sort((a, z) => a - z)[stamps.length >> 1].toFixed(1)} ms, longest ${longest.toFixed(1)} ms; draw mean ${(fast.drawMs.reduce((a, z) => a + z, 0) / fast.drawMs.length).toFixed(2)} ms, worst ${worstDraw.toFixed(2)} ms`,
);

// a style change fades; undo sweeps back
const fadesBefore = fast.fades;
await page.evaluate(() =>
	[...document.querySelectorAll('.qr-swatch')]
		.find((s) => s.textContent.trim() === 'Bouba')
		.click(),
);
await sleep(80);
p = await picture();
check('a new dot style crossfades', p.fades === fadesBefore + 1 && p.moving);
await settle();
await page.evaluate(() => document.activeElement?.blur());
const contentBefore = await page.$eval('.qr-content', (el) => el.value);
await page.keyboard.down('Meta');
await page.keyboard.press('z');
await page.keyboard.up('Meta');
await sleep(50);
await page.keyboard.down('Meta');
await page.keyboard.press('z');
await page.keyboard.up('Meta');
await sleep(60);
p = await picture();
const contentAfter = await page.$eval('.qr-content', (el) => el.value);
check('undo steps back', contentAfter !== contentBefore, contentAfter);
check('and animates', p.moving);
await settle();
await page.keyboard.down('Meta');
await page.keyboard.down('Shift');
await page.keyboard.press('z');
await page.keyboard.up('Shift');
await page.keyboard.up('Meta');
await sleep(50);
check('redo steps forward', (await page.$eval('.qr-content', (el) => el.value)) !== contentAfter);
await settle();

// keyboard: number fields take arrows, swatches are buttons
await page.focus('.qr-genny .canon-stepper-field');
const sizeBefore = await picture();
await page.keyboard.press('ArrowUp');
await settle();
p = await picture();
check('the size field takes the arrow keys', p.figure === '310 × 310px', p.figure);
check('a size change keeps the modules: it fades', p.fades > sizeBefore.fades);
check(
	'every swatch is a named button',
	await page.$$eval('.qr-swatch', (els) =>
		els.every((el) => el.tagName === 'BUTTON' && el.textContent.trim()),
	),
);

// export: SVG, one path each for modules, eyes and pupils
await page.evaluate(() =>
	[...document.querySelectorAll('.qr-genny [role="radio"], .qr-genny button')]
		.find((el) => el.textContent.trim() === 'SVG')
		.click(),
);
await captureObjectUrl(page);
await page.evaluate(() =>
	[...document.querySelectorAll('.qr-genny button')]
		.find((el) => el.textContent.trim() === 'Export')
		.click(),
);
await page.waitForFunction(() => window.__result, { timeout: 10000 });
const result = await page.evaluate(async () => {
	const text = await window.__result.text();
	const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
	const filled = [...doc.querySelectorAll('[fill]')].filter(
		(el) => el.getAttribute('fill') !== 'none',
	);
	const paths = doc.querySelectorAll('path');
	return {
		type: window.__result.type,
		parses: !doc.querySelector('parsererror'),
		filled: filled.length,
		paths: paths.length,
		evenodd: paths[1]?.getAttribute('fill-rule'),
		text,
		width: doc.documentElement.getAttribute('width'),
	};
});
check('export is SVG', result.type === 'image/svg+xml', result.type);
check('and still parses', result.parses);
check('at the chosen size', result.width === '310', result.width);
check('it has filled shapes', result.filled > 0, String(result.filled));
check('one path each for modules, eyes and pupils', result.paths === 3, String(result.paths));
check('the eyes fill even-odd', result.evenodd === 'evenodd', result.evenodd);
if (process.env.QR_SVG_OUT) (await import('node:fs')).writeFileSync(process.env.QR_SVG_OUT, result.text);
await page.evaluate(() =>
	[...document.querySelectorAll('.qr-genny button')]
		.find((el) => el.textContent.trim() === 'Copy')
		.click(),
);
await sleep(400);
const copied = await page.evaluate(() => navigator.clipboard.readText());
check('Copy in SVG copies the markup', copied.includes('<svg'), copied.slice(0, 20));
check(
	'and the toast shows',
	await page.$eval('.canon-toast', (el) => el.style.opacity === '1'),
);

// a logo pasted anywhere clears the middle of the code
await page.evaluate(async () => {
	document.activeElement?.blur();
	const canvas = document.createElement('canvas');
	canvas.width = 64;
	canvas.height = 32;
	const context = canvas.getContext('2d');
	context.fillStyle = '#e11d48';
	context.fillRect(0, 0, 64, 32);
	const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
	const data = new DataTransfer();
	data.items.add(new File([blob], 'logo.png', { type: 'image/png' }));
	document.body.dispatchEvent(
		new ClipboardEvent('paste', {
			clipboardData: data,
			bubbles: true,
			cancelable: true,
		}),
	);
});
await page.waitForFunction(
	() =>
		[...document.querySelectorAll('.qr-genny .canon-row-detail')].some(
			(el) => el.textContent.trim() === '64 × 32 px',
		),
	{ timeout: 5000 },
);
await settle();
const logoRed = await page.evaluate(() => {
	const canvas = document.querySelector('.code-sheet canvas');
	const context = canvas.getContext('2d');
	const { data } = context.getImageData(
		canvas.width / 2,
		(canvas.height - 57 * devicePixelRatio) / 2 + 10 * devicePixelRatio,
		1,
		1,
	);
	return [...data];
});
check('a pasted logo shows in the picture', logoRed[0] > 200 && logoRed[1] < 80, logoRed.join(','));
if (shots)
	await (await page.$('.code-sheet')).screenshot({ path: `${shots}/qr-logo.png` });
await page.evaluate(() => {
	window.__result = undefined;
	[...document.querySelectorAll('.qr-genny button')]
		.find((el) => el.textContent.trim() === 'Export')
		.click();
});
await page.waitForFunction(() => window.__result, { timeout: 10000 });
check(
	'and in the export',
	await page.evaluate(async () => (await window.__result.text()).includes('<image')),
);

// reduced motion: no sweep, no fade
await page.emulateMediaFeatures([
	{ name: 'prefers-reduced-motion', value: 'reduce' },
]);
await visit(page, '/tools/qr-genny?qrText=https://delphi.tools');
p = await picture();
check('the first draw does not animate', p.sweeps === 0 && p.fades === 0 && !p.moving);
await page.click('.qr-content');
await sleep(100);
await page.keyboard.press('End');
await page.keyboard.type('/x');
await sleep(40);
p = await picture();
check('reduced motion: the change is drawn at once', !p.moving && p.sweeps === 0 && p.fades === 0);
await page.emulateMediaFeatures([]);

// too long, other modes
await visit(page, `/tools/qr-genny?qrText=${'x'.repeat(3000)}`);
check(
	'a payload past a QR code shows the iOS warning',
	await page.evaluate(() =>
		[...document.querySelectorAll('.qr-genny .canon-status')].some((el) =>
			el.textContent.includes('Too long for a QR code'),
		),
	),
);
await visit(page, '/tools/qr-genny?qrKind=1&qrText=Home&qrPassword=secret');
p = await picture();
check('wifi: the code is the WIFI string', p.label === 'WIFI:T:WPA;S:Home;P:secret;;', p.label);
await visit(page, '/tools/qr-genny?qrKind=2');
check(
	'vcard: eight fields',
	(await page.$$('.qr-genny .canon-split-main .canon-rows:first-child .canon-text-cell')).length === 8,
);
await visit(page, '/tools/qr-genny?qrKind=3');
check(
	'batch: Generate & Download ZIP, off while empty',
	await page.evaluate(() => {
		const button = [...document.querySelectorAll('.qr-genny button')].find(
			(el) => el.textContent.trim() === 'Generate & Download ZIP',
		);
		return !!button && button.disabled;
	}),
);

// phone: stacked, the picture collapses, nothing scrolls sideways
await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/qr-genny?qrText=https://delphi.tools');
const phone = await page.evaluate(async () => {
	const body = document.querySelector('.qr-genny .canon-split-body');
	const canvas = () =>
		document
			.querySelector('.qr-genny .canon-canvas')
			.getBoundingClientRect().height;
	const full = canvas();
	body.scrollTop = 800;
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
	'the picture collapses to 240 px',
	phone.full > 240 && Math.round(phone.band) === 240,
	`${phone.full} ${phone.band}`,
);
check('no horizontal scroll', !phone.wide);

await finish(browser);
