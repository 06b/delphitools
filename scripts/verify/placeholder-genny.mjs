// the canon placeholder-genny: picture is the export, live fields, copy, export

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

await visit(page, '/tools/placeholder-genny');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document
				.querySelector('.placeholder-genny')
				.getBoundingClientRect().height,
	),
);

const picture = () =>
	page.evaluate(() => {
		const canvas = document.querySelector('.ph-sheet');
		const rect = canvas.getBoundingClientRect();
		const [r, g, b] = canvas
			.getContext('2d')
			.getImageData(0, 0, 1, 1).data;
		return {
			role: canvas.getAttribute('role'),
			label: canvas.getAttribute('aria-label'),
			width: canvas.width,
			height: canvas.height,
			shown: rect.width / rect.height,
			corner: `${r},${g},${b}`,
			lines: [...document.querySelectorAll('.ph-dimension')].map((el) =>
				el.textContent.replace(/\s+/g, '').slice(0, el.textContent.replace(/\s+/g, '').length / 2),
			),
		};
	});
const tiles = () =>
	page.$$eval('.ph-tiles .canon-tiles-tile', (els) =>
		els.map((el) => el.textContent.replace(/\s+/g, ' ').trim()),
	);

let p = await picture();
check('the picture is the export canvas, a named image', p.role === 'img' && p.label === '800 × 600', p.label);
check('drawn at the export size', p.width === 800 && p.height === 600);
check('in the web default colour', p.corner === '226,226,226', p.corner);
check('dimension lines read width and height', p.lines.join('|') === '800px|600px', p.lines.join('|'));
await sleep(500);
let t = await tiles();
check('tiles: aspect, pixels, text, PNG size', t[0] === 'Aspect 4:3' && t[1] === 'Pixels 0.48 MP' && t[2] === 'Text 75 px' && /^PNG [\d.]+ (B|KB)$/.test(t[3]), t.join(' | '));

// typing is live
await page.focus('.ph-width .canon-stepper-field');
await page.$eval('.ph-width .canon-stepper-field', (el) => el.select());
await page.keyboard.type('1200');
await sleep(700);
p = await picture();
check('typing a width redraws at once', p.width === 1200 && p.label === '1200 × 600', `${p.width}`);
check('the sheet keeps the export aspect', Math.abs(p.shown - 2) < 0.02, p.shown.toFixed(3));
await page.focus('.ph-height .canon-stepper-field');
await page.keyboard.press('ArrowUp');
await sleep(100);
p = await picture();
check('the height takes the arrow keys, step 10', p.height === 610, String(p.height));

// presets
await page.evaluate(() =>
	[...document.querySelectorAll('.ph-presets [role="radio"], .ph-presets button')]
		.find((el) => el.textContent.trim() === 'HD')
		.click(),
);
await sleep(700);
p = await picture();
check('HD sets 1920 × 1080', p.width === 1920 && p.height === 1080);
check(
	'and lights HD',
	await page.evaluate(() =>
		[...document.querySelectorAll('.ph-presets [aria-checked="true"], .ph-presets [aria-pressed="true"], .ph-presets .canon-button--selected')]
			.some((el) => el.textContent.trim() === 'HD'),
	),
);
t = await tiles();
check('aspect follows', t[0] === 'Aspect 16:9', t[0]);

// label and colour
await page.click('.ph-label');
await page.keyboard.type('Hi & <there>');
await sleep(200);
p = await picture();
check('the label field draws live', p.label === 'Hi & <there>', p.label);
const hexField = await page.$('.ph-background input[type="text"]');
if (hexField) {
	await hexField.focus();
	await hexField.evaluate((el) => el.select());
	await page.keyboard.type('1e6626');
	await page.keyboard.press('Enter');
	await sleep(200);
	p = await picture();
	check('a typed background hex fills the export', p.corner === '30,102,38', p.corner);
} else check('the background well has a hex field', false);

// copy: PNG data URI through the toast
await page.click('.ph-copy');
await sleep(300);
let copied = await page.evaluate(() => navigator.clipboard.readText());
check('Copy Data URI copies a PNG data URI', copied.startsWith('data:image/png;base64,'), copied.slice(0, 30));
check('and the toast shows', await page.$eval('.canon-toast', (el) => el.style.opacity === '1'));

// SVG: the code block, the data URI and the export
await page.evaluate(() =>
	[...document.querySelectorAll('.ph-formats [role="radio"], .ph-formats button')]
		.find((el) => el.textContent.trim() === 'SVG')
		.click(),
);
await sleep(200);
const code = await page.$eval('.ph-code pre', (el) => el.textContent);
check('SVG shows the markup', code.includes('<rect fill="#1e6626"') && code.includes('&lt;there&gt;</text>'), code.slice(0, 60));
check(
	'the markup is monospaced',
	/iosevka/i.test(await page.$eval('.ph-code pre', (el) => getComputedStyle(el).fontFamily)),
);
await page.click('.ph-copy');
await sleep(300);
copied = await page.evaluate(() => navigator.clipboard.readText());
check('Copy Data URI copies the SVG', copied.startsWith('data:image/svg+xml;base64,'));
check(
	'the export button names the format',
	(await page.$eval('.ph-download', (el) => el.textContent.trim())) === 'Download SVG',
);
await captureObjectUrl(page);
await page.click('.ph-download');
await page.waitForFunction(() => window.__result, { timeout: 5000 });
const svg = await page.evaluate(async () => ({
	type: window.__result.type,
	text: await window.__result.text(),
}));
check('Download writes the SVG', svg.type === 'image/svg+xml' && svg.text === code, svg.type);
await page.evaluate(() => {
	window.__result = undefined;
	[...document.querySelectorAll('.ph-formats [role="radio"], .ph-formats button')]
		.find((el) => el.textContent.trim() === 'PNG')
		.click();
});
await sleep(100);
await page.click('.ph-download');
await page.waitForFunction(() => window.__result, { timeout: 5000 });
const png = await page.evaluate(async () => {
	const bitmap = await createImageBitmap(window.__result);
	return { type: window.__result.type, width: bitmap.width, height: bitmap.height };
});
check('Download PNG writes the export', png.type === 'image/png' && png.width === 1920 && png.height === 1080, JSON.stringify(png));
check('the SVG label names Iosevka', /<text[^>]*font-family="Iosevka/.test(code));
const face = await page.evaluate(async () => {
	const pixels = (source) => {
		const c = document.createElement('canvas');
		c.width = 1920;
		c.height = 1080;
		const ctx = c.getContext('2d');
		ctx.drawImage(source, 0, 0);
		return ctx.getImageData(0, 0, 1920, 1080).data;
	};
	const reference = (family) => {
		const c = document.createElement('canvas');
		c.width = 1920;
		c.height = 1080;
		const ctx = c.getContext('2d');
		ctx.fillStyle = '#1e6626';
		ctx.fillRect(0, 0, 1920, 1080);
		ctx.fillStyle = '#666666';
		ctx.font = `bold 135px ${family}`;
		ctx.textAlign = 'center';
		ctx.textBaseline = 'middle';
		ctx.fillText('Hi & <there>', 960, 540);
		return pixels(c);
	};
	const diff = (a, b) => {
		let n = 0;
		for (let i = 0; i < a.length; i += 4) if (a[i] !== b[i]) n++;
		return n;
	};
	const exported = pixels(document.querySelector('.ph-sheet'));
	return {
		loaded: document.fonts.check('bold 16px Iosevka'),
		iosevka: diff(exported, reference('Iosevka')),
		generic: diff(exported, reference('monospace')),
	};
});
// an in-page canvas antialiases a few edge pixels differently from the attached one
check('the PNG label is drawn in Iosevka', face.loaded && face.iosevka * 4 < face.generic, JSON.stringify(face));

// phone: collapses, nothing scrolls sideways
await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/placeholder-genny');
const phone = await page.evaluate(async () => {
	const body = document.querySelector('.placeholder-genny .canon-split-body');
	const canvas = () =>
		document.querySelector('.placeholder-genny .canon-canvas').getBoundingClientRect().height;
	const full = canvas();
	body.scrollTop = 1200;
	await new Promise((r) => setTimeout(r, 200));
	return {
		full,
		band: canvas(),
		wide: document.documentElement.scrollWidth > document.documentElement.clientWidth,
	};
});
check('phone: the picture collapses to 200 px', Math.round(phone.band) === 200 && phone.full > 200, `${phone.full} ${phone.band}`);
check('phone: no horizontal scroll', !phone.wide);

await finish(browser);
