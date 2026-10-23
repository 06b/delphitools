// the canon scroll-genny: carousel picture, live slides, exports, file input, paste, drop, flow
// usage: bun run start, then node scripts/verify/scroll-genny.mjs

import { writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BASE, launch, visit, check, finish, sleep } from './harness.mjs';

const SOURCE = join(mkdtempSync(join(tmpdir(), 'scroll-')), 'pano.png');

const { browser, page } = await launch();
page.on('dialog', (dialog) => void dialog.accept());
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' });

const tiles = () =>
	page.$$eval('.scroll-genny .canon-tiles-value', (els) =>
		els.map((el) => el.textContent.trim()).join('|'),
	);
const sourceRow = () =>
	page.evaluate(() => ({
		title:
			document
				.querySelector('.scroll-source .canon-row-title')
				?.textContent.trim() ?? '',
		detail:
			document
				.querySelector('.scroll-source .canon-row-detail')
				?.textContent.trim() ?? '',
	}));
const picture = () =>
	page.evaluate(() => ({
		label:
			document
				.querySelector('.scroll-strip')
				?.getAttribute('aria-label') ?? '',
		slides: document.querySelectorAll('.scroll-slide img[src^="blob:"]')
			.length,
		seams: document.querySelectorAll('.scroll-seam').length,
		edges: document.querySelectorAll('.scroll-edge').length,
		pages: document.querySelectorAll(
			'.scroll-strip-pages .canon-page-strip-page',
		).length,
	}));
const pick = (group, text) =>
	page.evaluate(
		(group, text) =>
			[...document.querySelectorAll(`.${group} [role="radio"]`)]
				.find((b) => b.textContent.trim() === text)
				.click(),
		group,
		text,
	);
const settle = () => sleep(400);

await visit(page, '/tools/scroll-genny');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.scroll-genny').getBoundingClientRect()
				.height,
	),
);
const slot = await page.evaluate(() => {
	const el = document.querySelector('.scroll-slot');
	return {
		tag: el?.querySelector('.media-slot-upload')?.tagName,
		text: el?.querySelector('.media-slot-prompt')?.textContent.trim(),
		dashed: el && getComputedStyle(el).borderTopStyle,
	};
});
check(
	'empty: the dashed slot in the banner is the drop target, a button',
	slot.tag === 'BUTTON' &&
		slot.text === 'Drop an image here' &&
		slot.dashed === 'dashed',
	JSON.stringify(slot),
);
check(
	'empty: Download all and Fill are off, the tiles dashed',
	(await page.$eval('.scroll-export .media-download-all-each', (el) => el.disabled)) &&
		(await page.$$eval('.scroll-fills [role="radio"]', (els) =>
			els.every((el) => el.disabled),
		)) &&
		(await tiles()) === '—|—|—',
	await tiles(),
);
check(
	'empty: the tool can expand',
	!!(await page.$('.dt-canon-tool.is-expandable')),
);

// 3000 x 1350: three 4:5 slides with an edge fill
const panorama = (width) =>
	page.evaluate((width) => {
		const canvas = document.createElement('canvas');
		canvas.width = width;
		canvas.height = 1350;
		const ctx = canvas.getContext('2d');
		ctx.fillStyle = '#3050c0';
		ctx.fillRect(0, 0, width, 1350);
		return canvas.toDataURL('image/png').split(',')[1];
	}, width);
writeFileSync(SOURCE, Buffer.from(await panorama(3000), 'base64'));
const [chooser] = await Promise.all([
	page.waitForFileChooser({ timeout: 5000 }),
	page.click('.scroll-slot'),
]);
await chooser.accept([SOURCE]);
await page.waitForSelector('.scroll-slide img', { timeout: 10000 });
await settle();
let row = await sourceRow();
check(
	'the slot loads the file',
	row.title === 'pano' && row.detail === '3000 × 1350 px',
	JSON.stringify(row),
);
check(
	'tiles: count, size, fit',
	(await tiles()) === '3|1080 × 1350 px|Edge fill',
	await tiles(),
);
let seen = await picture();
check(
	'the picture: three slides, two seams, two image edges, named',
	seen.slides === 3 &&
		seen.seams === 2 &&
		seen.edges === 2 &&
		seen.label === '3 slides',
	JSON.stringify(seen),
);
check('the page strip holds the three slides', seen.pages === 3);

// settings are live
await pick('scroll-shapes', '1:1 Square');
await settle();
check(
	'1:1 Square: 1350 px slides, live',
	(await tiles()) === '3|1350 × 1350 px|Edge fill',
	await tiles(),
);
await pick('scroll-fills', 'Solid Colour');
await settle();
check(
	'Solid Colour shows the colour well',
	!!(await page.$('.scroll-genny .canon-colour-well')),
);
const edgeRed = await page.evaluate(async () => {
	const img = document.querySelector('.scroll-slide img');
	const bitmap = await createImageBitmap(
		await (await fetch(img.src)).blob(),
	);
	const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
	const ctx = canvas.getContext('2d');
	ctx.drawImage(bitmap, 0, 0);
	return [...ctx.getImageData(2, 10, 1, 1).data].slice(0, 3).join(',');
});
check('the first slide starts with the black fill', edgeRed === '0,0,0', edgeRed);
await pick('scroll-fills', 'Blur');
await settle();
check('Blur hides the well', !(await page.$('.scroll-genny .canon-colour-well')));
await pick('scroll-shapes', '4:5 Portrait');
await settle();

// Download all: one PNG a slide, at full size, web names
await page.evaluate(() => {
	window.__saved = [];
	const create = URL.createObjectURL.bind(URL);
	URL.createObjectURL = (blob) => {
		const url = create(blob);
		window.__blobs = { ...(window.__blobs ?? {}), [url]: blob };
		return url;
	};
	const anchor = HTMLAnchorElement.prototype.click;
	HTMLAnchorElement.prototype.click = function () {
		window.__saved.push({ name: this.download, blob: window.__blobs[this.href] });
		return anchor.call(this);
	};
});
await page.click('.scroll-export .media-download-all-each');
await page.waitForFunction(() => window.__saved.length === 3, { timeout: 15000 }).catch(() => {});
const saved = await page.evaluate(() =>
	Promise.all(
		window.__saved.map(async ({ name, blob }) => {
			const bitmap = await createImageBitmap(blob);
			return `${name} ${blob.type} ${bitmap.width}x${bitmap.height}`;
		}),
	),
);
check(
	'Download all writes three PNGs at 1080 x 1350, named after the source',
	saved.join('|') ===
		[1, 2, 3].map((n) => `pano-scroll-${n}.png image/png 1080x1350`).join('|'),
	saved.join('|'),
);

await page.evaluate(() => (window.__saved = []));
await page.click('.scroll-export .media-download-all-zip');
await page.waitForFunction(() => window.__saved.length === 1, { timeout: 15000 }).catch(() => {});
const zip = await page.evaluate(async () => {
	const { name, blob } = window.__saved[0] ?? {};
	const head = blob ? new Uint8Array(await blob.slice(0, 2).arrayBuffer()) : [];
	return `${name} ${String.fromCharCode(...head)}`;
});
check('Zip writes one archive of the slides', zip === 'pano-scroll.zip PK', zip);

// custom ratio: the popover sets any width:height, the presets unselect
await page.click('.scroll-ratio .canon-aspect-popover-trigger');
await page.waitForSelector('.canon-aspect-popover:popover-open', { timeout: 3000 });
const typeSide = async (field, value) => {
	await page.$eval(`.canon-aspect-popover:popover-open .canon-aspect-popover-${field} input`, (el) => el.select());
	await page.keyboard.type(String(value));
	await page.keyboard.press('Tab');
};
await typeSide('width', 3);
await typeSide('height', 4);
await page.keyboard.press('Escape');
await settle();
check(
	'a custom 3:4 ratio: 1013 px tiles, no preset selected',
	(await tiles()) === '3|1013 × 1350 px|Edge fill' &&
		(await page.$$('.scroll-shapes [aria-checked="true"]')).length === 0 &&
		(await page.$eval('.scroll-ratio .canon-menu-cell-title', (el) => el.textContent.trim())) === '3:4',
	await tiles(),
);
await pick('scroll-shapes', '4:5 Portrait');
await settle();
check(
	'a preset sets the ratio back',
	(await page.$eval('.scroll-ratio .canon-menu-cell-title', (el) => el.textContent.trim())) === '4:5',
);

// a slide in the strip: click downloads it, the menu copies it
await page.evaluate(() => (window.__saved = []));
await page.click('.scroll-strip-pages [data-page-index="1"] .canon-page-strip-page');
await page.waitForFunction(() => window.__saved.length === 1, { timeout: 10000 }).catch(() => {});
check(
	'a click on a slide downloads that slide',
	(await page.evaluate(() => window.__saved[0]?.name)) === 'pano-scroll-2.png',
);
await page.evaluate(() => {
	navigator.clipboard.write = async (items) => {
		window.__copied = items[0].types.join(',');
	};
	const button = document.querySelector('.scroll-strip-pages [data-page-index="0"] .canon-page-strip-page');
	const box = button.getBoundingClientRect();
	button.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: box.left + 10, clientY: box.top + 10 }));
});
await sleep(300);
const items = await page.$$eval('.canon-page-strip-menu [role="menuitem"]', (els) => els.map((el) => el.textContent.trim()));
check('the slide menu: Download, Copy', items.join('|') === 'Download|Copy', items.join('|'));
await page.evaluate(() =>
	[...document.querySelectorAll('.canon-page-strip-menu [role="menuitem"]')]
		.find((el) => el.textContent.trim() === 'Copy')
		.click(),
);
await page.waitForFunction(() => window.__copied, { timeout: 5000 }).catch(() => {});
await sleep(200);
check(
	'Copy writes a PNG and confirms through the toast',
	(await page.evaluate(() => window.__copied)) === 'image/png' &&
		(await page.$eval('.canon-toast-live', (el) => el.textContent.trim())) === 'Copied',
);

// an exact fit needs no fill
const paste = (target, name, width, height) =>
	page.evaluate(
		async ({ target, name, width, height }) => {
			const canvas = document.createElement('canvas');
			canvas.width = width;
			canvas.height = height;
			const blob = await new Promise((r) => canvas.toBlob(r, 'image/png'));
			const data = new DataTransfer();
			data.items.add(new File([blob], name, { type: 'image/png' }));
			document.querySelector(target).dispatchEvent(
				new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
			);
		},
		{ target, name, width, height },
	);
await paste('.scroll-genny .canon-split-sidebar', 'exact.png', 3240, 1350);
await page.waitForFunction(
	() => document.querySelector('.scroll-source .canon-row-title')?.textContent.trim() === 'exact',
	{ timeout: 5000 },
).catch(() => {});
await settle();
check('a paste in the settings loads the image', (await sourceRow()).detail === '3240 × 1350 px');
seen = await picture();
check(
	'an exact fit: Perfect fit, Fill off and Not needed, no image edges',
	(await tiles()) === '3|1080 × 1350 px|Perfect fit' &&
		(await page.$$eval('.scroll-fills [role="radio"]', (els) => els.every((el) => el.disabled))) &&
		!!(await page.$('.scroll-not-needed')) &&
		seen.edges === 0,
	`${await tiles()} ${JSON.stringify(seen)}`,
);

const drop = (target, file) =>
	page.evaluate(
		async ({ target, file }) => {
			let part = file.text;
			if (!part) {
				const canvas = document.createElement('canvas');
				canvas.width = 200;
				canvas.height = 100;
				part = await new Promise((r) => canvas.toBlob(r, 'image/png'));
			}
			const data = new DataTransfer();
			data.items.add(new File([part], file.name, { type: 'image/png' }));
			const el = document.querySelector(target);
			el.dispatchEvent(new DragEvent('dragover', { dataTransfer: data, bubbles: true, cancelable: true }));
			el.dispatchEvent(new DragEvent('drop', { dataTransfer: data, bubbles: true, cancelable: true }));
		},
		{ target, file },
	);
await drop('.scroll-picture', { name: 'dropped.png' });
await page.waitForFunction(
	() => document.querySelector('.scroll-source .canon-row-title')?.textContent.trim() === 'dropped',
	{ timeout: 5000 },
).catch(() => {});
await settle();
check(
	'a drop on the picture loads the image; three 80 px slides with fill',
	(await sourceRow()).title === 'dropped' && (await tiles()) === '3|80 × 100 px|Edge fill',
	await tiles(),
);

await drop('.scroll-picture', { name: 'broken.png', text: 'not a png' });
await page.waitForFunction(() => !!document.querySelector('.scroll-genny .canon-status'), { timeout: 5000 }).catch(() => {});
check(
	'a broken file shows the web wording and the slot',
	(await page.evaluate(() =>
		document.querySelector('.scroll-genny .canon-status')?.textContent.includes('Image could not be read. Try another file?'),
	)) && !!(await page.$('.scroll-slot')),
);

await drop('.scroll-slot', { name: 'again.png' });
await page.waitForSelector('.scroll-source', { timeout: 5000 });
await page.evaluate(() =>
	[...document.querySelectorAll('.scroll-genny button')].find((b) => b.textContent.trim() === 'Clear').click(),
);
await sleep(200);
check(
	'Clear: the slot is back, Download all off, the strip empty',
	!!(await page.$('.scroll-slot')) &&
		(await page.$eval('.scroll-export .media-download-all-each', (el) => el.disabled)) &&
		(await picture()).pages === 0,
);

// launch flags
await visit(page, '/tools/scroll-genny?scrollSample&scrollShape=1&scrollFill=1&scrollColour=1e6626');
await page.waitForSelector('.scroll-slide img', { timeout: 10000 });
await settle();
check(
	'?scrollSample ?scrollShape ?scrollFill ?scrollColour',
	(await tiles()) === '3|1350 × 1350 px|Edge fill' &&
		(await page.$eval('.scroll-fills [aria-checked="true"]', (el) => el.textContent.trim())) === 'Solid Colour' &&
		(await page.$eval('.scroll-genny .canon-colour-well input[type="color"]', (el) => el.value === '#1e6626')),
	await tiles(),
);

// stacked to side by side and back: the strip morphs between its two places, a plain resize does not
const strideSizes = async (from, to) => {
	await page.setViewport(from);
	await visit(page, '/tools/scroll-genny?scrollSample');
	await page.waitForSelector('.scroll-slide img', { timeout: 10000 });
	await sleep(800);
	await page.evaluate(() => {
		window.__widths = [];
		const t0 = performance.now();
		const tick = () => {
			window.__widths.push(Math.round(document.querySelector('.scroll-strip').getBoundingClientRect().width));
			if (performance.now() - t0 < 600) requestAnimationFrame(tick);
		};
		requestAnimationFrame(tick);
	});
	await page.setViewport(to);
	await sleep(800);
	return [...new Set(await page.evaluate(() => window.__widths))];
};
for (const [from, to, name] of [
	[{ width: 860, height: 600 }, { width: 900, height: 600 }, 'stacked to side by side'],
	[{ width: 900, height: 600 }, { width: 860, height: 600 }, 'side by side to stacked'],
]) {
	const widths = await strideSizes(from, to);
	check(`${name}: the strip morphs over frames`, widths.length > 4, widths.join(' '));
}
const plain = await strideSizes({ width: 1000, height: 800 }, { width: 1060, height: 800 });
check('a resize that keeps the layout follows at once', plain.length === 2, plain.join(' '));
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
const still = await strideSizes({ width: 860, height: 600 }, { width: 900, height: 600 });
check('reduced motion: no morph', still.length <= 2, still.join(' '));
await page.setViewport({ width: 1400, height: 1000 });

// reduced motion: no transitions
await visit(page, '/tools/scroll-genny?scrollSample');
await page.waitForSelector('.scroll-strip', { timeout: 10000 });
check(
	'reduced motion: the strip does not animate',
	await page.$eval('.scroll-strip', (el) => {
		const style = getComputedStyle(el);
		return style.animationName === 'none' && (style.transitionProperty === 'none' || style.transitionDuration === '0s');
	}),
);
await page.emulateMediaFeatures([]);

// a workflow step: the carried image loads, Download all reads Pass along
await page.goto(`${BASE}/w/paste-image.scroll-genny`, { waitUntil: 'networkidle2' });
await page.waitForSelector('.dt-pass-go', { timeout: 15000 });
await page.click('.dt-pass-go');
await page.waitForSelector('.dt-flow', { timeout: 15000 });
await sleep(400);
await paste('body', 'carried.png', 400, 200);
await page.waitForSelector('.media-crop-image', { timeout: 10000 });
await page.click('.pi-save');
await page.waitForFunction(() => location.pathname === '/tools/scroll-genny', { timeout: 15000 });
await page.waitForSelector('.scroll-source', { timeout: 15000 });
check('in a flow the carried image loads', (await sourceRow()).detail === '400 × 200 px', (await sourceRow()).detail);
check(
	'and Download all reads Pass along',
	(await page.$eval('.scroll-export .media-download-all-each', (el) => el.textContent.trim())) === 'Pass along',
);
await page.click('.scroll-export .media-download-all-each');
check(
	'Pass along finishes the flow',
	await page
		.waitForSelector('.dt-flow-next.is-done', { timeout: 10000 })
		.then(() => true)
		.catch(() => false),
);
await page.click('.dt-flow-exit').catch(() => {});
await sleep(300);

// phone: the banner first, it collapses, nothing scrolls sideways
await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/scroll-genny?scrollSample');
await page.waitForSelector('.scroll-slide img', { timeout: 10000 });
const phone = await page.evaluate(async () => {
	const body = document.querySelector('.scroll-genny .canon-split-body');
	const canvas = () =>
		document.querySelector('.scroll-genny .canon-split-banner .canon-canvas').getBoundingClientRect();
	const full = canvas();
	const first = full.top < document.querySelector('.scroll-shapes').getBoundingClientRect().top;
	body.scrollTop = 800;
	await new Promise((r) => setTimeout(r, 300));
	return {
		first,
		full: full.height,
		band: canvas().height,
		wide: document.documentElement.scrollWidth > document.documentElement.clientWidth,
	};
});
check('phone: the picture comes first', phone.first);
check(
	'phone: the picture shrinks on scroll, not below 120 px',
	phone.band < phone.full && Math.round(phone.band) >= 120,
	`${phone.full} ${phone.band}`,
);
check('phone: no horizontal scroll', !phone.wide);

await finish(browser);
