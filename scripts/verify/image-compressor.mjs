// the canon image-compressor on the real codecs and worker (no network)
// avif and jxl are slow even at 192 px; the gradient compresses, noise would not
// usage: bun run start, then node scripts/verify/image-compressor.mjs
// SHOTS=<dir> also saves the loaded tool

import { writeFileSync, statSync, mkdtempSync } from 'node:fs';
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

const shots = process.env.SHOTS;
const SOURCE = join(mkdtempSync(join(tmpdir(), 'ic-')), 'source.png');

const { browser, page } = await launch();
page.on("dialog", (dialog) => void dialog.accept());
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' });

await page.evaluateOnNewDocument(() => {
	window.__decodes = 0;
	const original = window.createImageBitmap.bind(window);
	window.createImageBitmap = (...args) => {
		window.__decodes += 1;
		return original(...args);
	};
});

// the Original label's offset in its bar, every frame from the first paint
await page.evaluateOnNewDocument(() => {
	window.__originalLabel = [];
	const t0 = performance.now();
	const tick = () => {
		const bar = document.querySelector('.canon-compression-scale-bar');
		const label = bar?.querySelector('.canon-compression-scale-label');
		if (label)
			window.__originalLabel.push(
				Math.round(label.getBoundingClientRect().left - bar.getBoundingClientRect().left),
			);
		if (performance.now() - t0 < 3000) requestAnimationFrame(tick);
	};
	requestAnimationFrame(tick);
});
await visit(page, '/tools/image-compressor');
await sleep(800);
const original = await page.evaluate(() => [...new Set(window.__originalLabel)]);
check(
	'the Original bar sits full from the start, its label still',
	original.length === 1 && original[0] === 10,
	original.join(','),
);

check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document
				.querySelector('.image-compressor')
				.getBoundingClientRect().height,
	),
);
check(
	'empty: the picture pane is the drop zone',
	await page.evaluate(
		() =>
			!!document.querySelector('.canon-split-main .canon-drop-zone') &&
			!document.querySelector('.canon-split-sidebar .canon-drop-zone'),
	),
);
const segments = () =>
	page.$$eval('.ic-formats [role="radio"], .ic-formats button', (els) =>
		els.map((el) => el.textContent.trim()),
	);
check(
	'empty: the settings are ready, every format a plain option',
	(await segments()).join() === 'JPEG,WebP,PNG,AVIF,JXL',
	(await segments()).join(),
);
check('empty: no Download yet', !(await page.$('.ic-download')));

const pngBase64 = await page.evaluate(() => {
	const canvas = document.createElement('canvas');
	canvas.width = 192;
	canvas.height = 192;
	const ctx = canvas.getContext('2d');
	const gradient = ctx.createLinearGradient(0, 0, 192, 192);
	gradient.addColorStop(0, '#e2503f');
	gradient.addColorStop(0.5, '#3f7fe2');
	gradient.addColorStop(1, '#46c46a');
	ctx.fillStyle = gradient;
	ctx.fillRect(0, 0, 192, 192);
	ctx.fillStyle = '#f2e8d5';
	ctx.fillRect(24, 24, 64, 64);
	ctx.fillStyle = '#1c1c28';
	ctx.fillRect(96, 104, 72, 48);
	return canvas.toDataURL('image/png').split(',')[1];
});
writeFileSync(SOURCE, Buffer.from(pngBase64, 'base64'));
const sourceSize = statSync(SOURCE).size;

const input = await page.$('.image-compressor .canon-drop-zone input[type="file"]');
await input.uploadFile(SOURCE);

async function readResult() {
	return page.evaluate(async () => {
		const img = document.querySelector(
			'.image-compressor .canon-image-compare-after img',
		);
		if (!img) return null;
		const buf = new Uint8Array(
			await (await fetch(img.src)).arrayBuffer(),
		);
		return {
			src: img.src,
			size: buf.length,
			magic: Array.from(buf.slice(0, 12)),
		};
	});
}

async function waitForNewResult(previousSrc, timeoutMs = 30000) {
	const deadline = Date.now() + timeoutMs;
	for (;;) {
		const result = await readResult();
		if (result && result.src !== previousSrc) return result;
		if (Date.now() > deadline) return null;
		await sleep(150);
	}
}

const settled = () =>
	page.waitForFunction(
		() => !document.querySelector('.canon-compression-scale-loader'),
		{ timeout: 120000 },
	);

const isMagic = (result, offsets) =>
	offsets.every(([at, byte]) => result.magic[at] === byte);
const ascii = (result, from, to) =>
	String.fromCharCode(...result.magic.slice(from, to));

const webp = await waitForNewResult('');
await settled();
check(
	'the default encode is WebP',
	webp && ascii(webp, 0, 4) === 'RIFF' && ascii(webp, 8, 12) === 'WEBP',
);
check(
	'and it is smaller than the PNG source',
	webp && webp.size < sourceSize,
	webp ? `${webp.size} vs ${sourceSize}` : 'no result',
);
const loaded = await page.evaluate(() => ({
	title: document.querySelector('.ic-source .canon-row-title')?.textContent.trim(),
	detail: document.querySelector('.ic-source .canon-row-detail')?.textContent.trim(),
	figure: document
		.querySelector('.canon-compression-scale .canon-figure-said')
		?.textContent.trim(),
	compare: !!document.querySelector('.canon-split-main .canon-image-compare'),
	drop: !!document.querySelector('.image-compressor .canon-drop-zone'),
}));
check('the source row: name', loaded.title === 'source.png', loaded.title);
check('and size', /^192 × 192 · [\d.]+ (B|KB)$/.test(loaded.detail), loaded.detail);
check('the scale figure reads a saving', /^−\d+%$/.test(loaded.figure), loaded.figure);
check('the picture shows the comparison', loaded.compare && !loaded.drop);
check(
	'Download is on',
	await page.$eval('.ic-download', (el) => !el.disabled),
);
if (shots)
	await page.screenshot({ path: `${shots}/image-compressor-loaded.png` });

let lastSrc = webp?.src ?? '';
const pick = (label) =>
	page.evaluate((label) => {
		[...document.querySelectorAll('.ic-formats [role="radio"], .ic-formats button')]
			.find((b) => b.textContent.trim() === label)
			.click();
	}, label);

await pick('JPEG');
let result = await waitForNewResult(lastSrc);
check('switching to JPEG re-encodes', result && isMagic(result, [[0, 0xff], [1, 0xd8]]));
await settled();
lastSrc = (await readResult())?.src ?? lastSrc;

// the slider takes the arrow keys; End and Home reach the ends
await page.focus('.ic-quality .canon-slider');
await page.keyboard.press('End');
await waitForNewResult(lastSrc);
await settled();
const q100 = await readResult();
lastSrc = q100?.src ?? lastSrc;
check(
	'End: quality 100',
	(await page.$eval('.ic-quality .canon-slider', (el) => el.getAttribute('aria-valuenow'))) === '100',
);
await page.keyboard.press('Home');
await waitForNewResult(lastSrc);
await settled();
const q1 = await readResult();
lastSrc = q1?.src ?? lastSrc;
check(
	'quality 1 beats quality 100 on size',
	q1 && q100 && q1.size < q100.size,
	q1 && q100 ? `${q1.size} vs ${q100.size}` : 'timed out',
);

// live: every key re-encodes, no debounce, and a burst ends on its last value
const encodesBefore = await page.evaluate(() => window.__decodes);
for (let i = 0; i < 8; i++) await page.keyboard.press('ArrowRight');
await settled();
const after = await readResult();
check(
	'a burst of keys settles on one result',
	(await page.$eval('.ic-quality .canon-slider', (el) => el.getAttribute('aria-valuenow'))) === '9' &&
		after.src !== lastSrc,
);
check(
	'the image decodes once per file, not per encode',
	(await page.evaluate(() => window.__decodes)) === encodesBefore,
);
lastSrc = after.src;

// oxipng lossless: effort replaces quality
await pick('PNG');
result = await waitForNewResult(lastSrc);
check(
	'switching to PNG re-encodes through OxiPNG',
	result && isMagic(result, [[0, 0x89], [1, 0x50], [2, 0x4e], [3, 0x47]]),
);
await settled();
lastSrc = (await readResult())?.src ?? lastSrc;
check(
	'and the quality slider becomes effort',
	!!(await page.$('.ic-effort .canon-slider')) && !(await page.$('.ic-quality')),
);
check(
	'the effort slider is named',
	await page.$eval('.ic-effort .canon-slider', (el) => {
		const id = el.getAttribute('aria-labelledby');
		return document.getElementById(id)?.textContent.trim() === 'Effort';
	}),
);

// AVIF and JXL are plain options; their slow encode shows the loader over the picture
const loaderSeen = () =>
	page.evaluate(() => {
		window.__loaderShown = false;
		const watch = () => {
			const el = document.querySelector(".canon-split-main .ic-encoding");
			if (el) window.__loaderShown = true;
			if (!window.__loaderShown) window.__loaderWatch = requestAnimationFrame(watch);
		};
		watch();
	});
check("no AVIF switch", !(await page.$(".ic-avif")));
await loaderSeen();
await pick("AVIF");
result = await waitForNewResult(lastSrc, 120000);
check(
	"AVIF encodes",
	result && ascii(result, 4, 8) === "ftyp",
	result ? `${result.size} B` : "timed out",
);
await settled();
lastSrc = (await readResult())?.src ?? lastSrc;
check("the loader is over the picture during the encode", await page.evaluate(() => window.__loaderShown));
check(
	"and is gone once it is done",
	!(await page.$(".canon-split-main .ic-encoding")),
);
await pick("JXL");
result = await waitForNewResult(lastSrc, 120000);
check(
	"JXL encodes (a codestream or a container)",
	result &&
		(isMagic(result, [[0, 0xff], [1, 0x0a]]) ||
			ascii(result, 4, 8) === "JXL "),
	result ? `${result.size} B` : "timed out",
);
check("JXL takes the quality slider", !!(await page.$(".ic-quality .canon-slider")));
await settled();
lastSrc = (await readResult())?.src ?? lastSrc;
await pick("WebP");
await waitForNewResult(lastSrc);
await settled();

// download: the file, named after the source
await captureObjectUrl(page);
await page.evaluate(() => {
	window.__result = undefined;
	const anchor = HTMLAnchorElement.prototype.click;
	HTMLAnchorElement.prototype.click = function () {
		window.__name = this.download;
		return anchor.call(this);
	};
});
await page.click('.ic-download');
await page.waitForFunction(() => window.__result, { timeout: 10000 });
const saved = await page.evaluate(() => ({
	type: window.__result.type,
	name: window.__name,
}));
check('Download saves the WebP', saved.type === 'image/webp', saved.type);
check('named after the source', saved.name === 'source.webp', saved.name);

// paste anywhere replaces the image
const paste = (target, name, colour) =>
	page.evaluate(
		async ({ target, name, colour }) => {
			const canvas = document.createElement('canvas');
			canvas.width = 64;
			canvas.height = 32;
			const context = canvas.getContext('2d');
			context.fillStyle = colour;
			context.fillRect(0, 0, 64, 32);
			const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
			const data = new DataTransfer();
			data.items.add(new File([blob], name, { type: 'image/png' }));
			document.querySelector(target).dispatchEvent(
				new ClipboardEvent('paste', {
					clipboardData: data,
					bubbles: true,
					cancelable: true,
				}),
			);
		},
		{ target, name, colour },
	);
const sourceName = () =>
	page.evaluate(
		() => document.querySelector('.ic-source .canon-row-title')?.textContent.trim() ?? '',
	);
await paste('.canon-split-sidebar', 'pasted.png', '#e11d48');
await page.waitForFunction(
	() => document.querySelector('.ic-source .canon-row-title')?.textContent.trim() === 'pasted.png',
	{ timeout: 5000 },
).catch(() => {});
check('a paste in the settings loads the image', (await sourceName()) === 'pasted.png');
await settled();
check(
	'the picture takes its aspect (64 x 32 is 2:1)',
	await page.$eval('.canon-split-main .canon-canvas', (el) => {
		const box = el.querySelector('.canon-image-compare').getBoundingClientRect();
		return Math.abs(box.width / box.height - 2) < 0.05;
	}),
);

// drop on the picture replaces the image
await page.evaluate(async () => {
	const canvas = document.createElement('canvas');
	canvas.width = 40;
	canvas.height = 40;
	const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
	const data = new DataTransfer();
	data.items.add(new File([blob], 'dropped.png', { type: 'image/png' }));
	const target = document.querySelector('.canon-image-compare');
	target.dispatchEvent(new DragEvent('dragover', { dataTransfer: data, bubbles: true, cancelable: true }));
	target.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
});
await sleep(400);
check('a drop on the picture loads the image', (await sourceName()) === 'dropped.png');
await settled();

await page.evaluate(() => {
	const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"><rect width="120" height="60" fill="#f00"/></svg>';
	const data = new DataTransfer();
	data.items.add(new File([svg], 'shape.svg', { type: 'image/svg+xml' }));
	document.querySelector('.canon-image-compare').dispatchEvent(
		new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }),
	);
});
await sleep(400);
await settled();
check(
	'a dropped SVG compresses',
	(await sourceName()) === 'shape.svg' &&
		!(await page.$eval('.ic-download', (el) => el.disabled)),
	await sourceName(),
);

// a file that is not an image shows the failure over the empty picture
await page.evaluate(() => {
	const data = new DataTransfer();
	data.items.add(new File(['not a png'], 'broken.png', { type: 'image/png' }));
	document.querySelector('.canon-image-compare').dispatchEvent(
		new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }),
	);
});
await sleep(400);
check(
	'a broken file shows Failed',
	await page.evaluate(() =>
		document.querySelector('.canon-image-compare')?.textContent.includes('Failed'),
	),
);
check(
	'and Download stays off',
	await page.$eval('.ic-download', (el) => el.disabled),
);

// Clear goes back to the drop zone; a paste inside it loads once
await page.evaluate(() =>
	[...document.querySelectorAll('.ic-source button')]
		.find((b) => b.textContent.trim() === 'Clear')
		.click(),
);
await sleep(200);
check(
	'Clear: the drop zone is back',
	!!(await page.$('.canon-split-main .canon-drop-zone')) && !(await page.$('.ic-source')),
);
const decodes = await page.evaluate(() => window.__decodes);
await paste('.canon-drop-zone', 'zone.png', '#2563eb');
await page.waitForFunction(
	() => document.querySelector('.ic-source .canon-row-title')?.textContent.trim() === 'zone.png',
	{ timeout: 5000 },
).catch(() => {});
await settled();
check('a paste in the drop zone loads the image', (await sourceName()) === 'zone.png');
check(
	'once',
	(await page.evaluate(() => window.__decodes)) - decodes === 1,
	String((await page.evaluate(() => window.__decodes)) - decodes),
);

// launch flags
await visit(page, '/tools/image-compressor?compressSample&compressFormat=JPEG&compressQuality=40');
await page.waitForSelector('.ic-source', { timeout: 10000 });
await settled();
const flagged = await page.evaluate(() => ({
	title: document.querySelector('.ic-source .canon-row-title')?.textContent.trim(),
	detail: document.querySelector('.ic-source .canon-row-detail')?.textContent.trim(),
	quality: document.querySelector('.ic-quality .canon-slider')?.getAttribute('aria-valuenow'),
}));
check(
	'?compressSample loads the drawn 1600 x 1200 sample',
	flagged.title === 'sample.png' && flagged.detail.startsWith('1600 × 1200'),
	`${flagged.title} ${flagged.detail}`,
);
check('?compressQuality sets the slider', flagged.quality === '40', flagged.quality);
result = await readResult();
check('?compressFormat=JPEG encodes JPEG', result && isMagic(result, [[0, 0xff], [1, 0xd8]]));

// a workflow step: the carried image loads, Download reads Pass along and hands it on
await page.goto(`${BASE}/w/paste-image.image-compressor`, {
	waitUntil: 'networkidle2',
});
await page.waitForSelector('.dt-pass-go', { timeout: 15000 });
await page.click('.dt-pass-go');
await page.waitForSelector('.dt-flow', { timeout: 15000 });
await sleep(400);
await paste('body', 'carried.png', '#16a34a');
await page.waitForSelector('.media-crop-image', { timeout: 10000 });
await page.click('.pi-save');
await page.waitForFunction(
	() => location.pathname === '/tools/image-compressor',
	{ timeout: 15000 },
);
await page.waitForSelector('.ic-source', { timeout: 15000 });
await settled();
check(
	'in a flow the carried image loads',
	/\.png$/.test(await sourceName()),
	await sourceName(),
);
check(
	'and Download reads Pass along',
	(await page.$eval('.ic-download', (el) => el.textContent.trim())) ===
		'Pass along',
);
await page.click('.ic-download');
check(
	'Pass along finishes the flow',
	await page
		.waitForSelector('.dt-flow-next.is-done', { timeout: 10000 })
		.then(() => true)
		.catch(() => false),
);
await page.click('.dt-flow-exit').catch(() => {});
await sleep(300);

// phone: stacked, the picture before the settings, nothing scrolls sideways
await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/image-compressor');
const phone = await page.evaluate(() => {
	const drop = document.querySelector('.canon-split-main .canon-drop-zone').getBoundingClientRect();
	const formats = document.querySelector('.ic-formats').getBoundingClientRect();
	return {
		order: drop.top < formats.top,
		wide: document.documentElement.scrollWidth > document.documentElement.clientWidth,
		zoneWide: drop.right <= document.documentElement.clientWidth,
	};
});
check('phone: the drop zone comes before the settings', phone.order);
check('phone: no horizontal scroll', !phone.wide && phone.zoneWide);

await finish(browser);
