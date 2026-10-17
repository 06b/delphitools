
// the canon metadata-stripper: slot, dossier, found and after tiles, ICC, download
import { launch, visit, check, finish, sleep } from './harness.mjs';

const { browser, page } = await launch();

async function dropTaggedJpeg(selector) {
	await page.evaluate(async (sel) => {
		const u16 = (n) => [n & 0xff, n >> 8];
		const u32le = (n) => [
			n & 0xff,
			(n >> 8) & 0xff,
			(n >> 16) & 0xff,
			(n >> 24) & 0xff,
		];
		const rat = (a, b) => [...u32le(a), ...u32le(b)];
		const asc = (s) => [...s].map((c) => c.charCodeAt(0));
		const ent = (tag, type, count, v) => [
			tag & 0xff,
			tag >> 8,
			type,
			0,
			count & 0xff,
			(count >> 8) & 0xff,
			(count >> 16) & 0xff,
			(count >> 24) & 0xff,
			...(typeof v === 'number' ? u32le(v) : v),
		];
		const tiff = [
			0x49, 0x49, 42, 0, 8, 0, 0, 0,
			...u16(5),
			...ent(0x010f, 2, 8, 206),
			...ent(0x0110, 2, 8, 214),
			...ent(0x0132, 2, 20, 222),
			...ent(0x8769, 4, 1, 74),
			...ent(0x8825, 4, 1, 116),
			...u32le(0),
			...u16(3),
			...ent(0x9003, 2, 20, 242),
			...ent(0x927c, 7, 4, [1, 2, 3, 4]),
			...ent(0xa431, 2, 8, 262),
			...u32le(0),
			...u16(7),
			...ent(0, 2, 2, [0x4e, 0, 0, 0]),
			...ent(1, 5, 3, 270),
			...ent(2, 2, 2, [0x45, 0, 0, 0]),
			...ent(3, 5, 3, 294),
			...ent(4, 1, 1, [0, 0, 0, 0]),
			...ent(5, 5, 1, 318),
			...ent(0x1d, 2, 11, 326),
			...u32le(0),
			...asc('TestCam\0'),
			...asc('Model X\0'),
			...asc('2024:05:01 12:00:00\0'),
			...asc('2024:04:30 09:15:22\0'),
			...asc('SN-0042\0'),
			...rat(51, 1), ...rat(30, 1), ...rat(0, 1),
			...rat(0, 1), ...rat(7, 1), ...rat(36, 1),
			...rat(100, 1),
			...asc('2024:05:01\0'),
		];
		const seg = (marker, payload) => [
			0xff,
			marker,
			(payload.length + 2) >> 8,
			(payload.length + 2) & 0xff,
			...payload,
		];

		const canvas = document.createElement('canvas');
		canvas.width = 64;
		canvas.height = 64;
		const ctx = canvas.getContext('2d');
		ctx.fillStyle = '#c33';
		ctx.fillRect(0, 0, 64, 64);
		const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
		const jpeg = new Uint8Array(
			atob(dataUrl.split(',')[1])
				.split('')
				.map((c) => c.charCodeAt(0)),
		);

		const tagged = new Uint8Array([
			...jpeg.slice(0, 2),
			...seg(0xe1, [...asc('Exif\0\0'), ...tiff]),
			...seg(0xe2, [...asc('ICC_PROFILE\0'), 1, 1, 9, 9]),
			...jpeg.slice(2),
		]);

		const transfer = new DataTransfer();
		transfer.items.add(
			new File([tagged], 'photo.jpg', { type: 'image/jpeg' }),
		);
		document.querySelector(sel).dispatchEvent(
			new DragEvent('drop', { dataTransfer: transfer, bubbles: true }),
		);
	}, selector);
}

async function armDownloadCapture() {
	await page.evaluate(() => {
		const original = URL.createObjectURL.bind(URL);
		window.__captured = null;
		URL.createObjectURL = (blob) => {
			window.__captured = blob;
			return original(blob);
		};
	});
}

await visit(page, '/tools/metadata-stripper');
// real download hangs browser.close()
const cdp = await page.createCDPSession();
await cdp.send('Browser.setDownloadBehavior', { behavior: 'deny' });

check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.metadata-stripper').getBoundingClientRect().height,
	),
);
check(
	'empty: the banner is the drop slot, the main pane says what to do, Download off',
	await page.evaluate(
		() =>
			document.querySelector('.ms-slot .media-slot-prompt')?.textContent.trim() === 'Drop an image here' &&
			document.querySelector('.metadata-stripper .canon-empty-row')?.textContent.trim() ===
				'Add an image to see its metadata' &&
			document.querySelector('.ms-download').disabled,
	),
);

await dropTaggedJpeg('.metadata-stripper');
await page.waitForSelector('.ms-found .canon-tiles-tile', { timeout: 10000 });

const tiles = (scope) =>
	page.$$eval(`${scope} .canon-tiles-tile`, (els) =>
		Object.fromEntries(
			els.map((el) => [
				el.querySelector('.canon-tiles-label')?.textContent.trim(),
				el.querySelector('.canon-tiles-value')?.textContent.trim(),
			]),
		),
	);
const found = await tiles('.ms-found');
check(
	'GPS coordinates surface with the exact fix',
	found['GPS coordinates'] === '51.500000° N, 0.126667° E · alt 100 m',
	found['GPS coordinates'],
);
check('camera make and model surface', found.Camera === 'TestCam Model X', found.Camera);
check('taken timestamp surfaces', found.Taken === '2024:04:30 09:15:22', found.Taken);

const map = await page.evaluate(() => ({
	label: document.querySelector('.ms-map-label')?.getAttribute('aria-label'),
	role: document.querySelector('.ms-map-label')?.getAttribute('role'),
	pin: !!document.querySelector('.ms-pin'),
	struck: !!document.querySelector('.ms-caption--removed'),
}));
check(
	'the map places the photo and names it, struck once stripped',
	map.role === 'img' && map.label === '51.5000° N, 0.1267° E' && map.pin && map.struck,
	JSON.stringify(map),
);
const lamps = await page.$$eval('.ms-lamp', (els) =>
	els.map((el) => `${el.textContent.trim()}:${el.className.match(/ms-lamp--(\w+)/)[1]}`),
);
check(
	'lamps: GPS and EXIF struck, ICC kept on, C2PA off',
	lamps.includes('GPS:struck') &&
		lamps.includes('EXIF:struck') &&
		lamps.includes('ICC:on') &&
		lamps.includes('C2PA:off'),
	lamps.join(' '),
);
// the last strike lands 700 ms + 7 x 120 ms after the strip, then fades 300 ms
await sleep(2000);
const ticks = await page.$$eval('.ms-lamp', (els) =>
	els.map((el) => {
		const tick = el.querySelector('.ms-lamp-light svg');
		const box = tick?.getBoundingClientRect();
		const shown = !!box && box.width > 0 && getComputedStyle(tick).opacity === '1';
		return `${el.textContent.trim()}:${shown}`;
	}),
);
check(
	'a tick shows beside each struck lamp only',
	ticks.includes('GPS:true') &&
		ticks.includes('EXIF:true') &&
		ticks.includes('ICC:false') &&
		ticks.includes('C2PA:false'),
	ticks.join(' '),
);

const removed =await page.$eval('.ms-removed .canon-row-detail', (el) => el.textContent.trim());
check('removed row names the dropped segments', removed.includes('EXIF (APP1)'), removed);

const after = await tiles('.ms-after');
check(
	'after stripping shows only the kept ICC profile',
	Object.keys(after).join() === 'Colour profile',
	JSON.stringify(after),
);
check(
	'the source row shows the size before and after',
	/ → /.test(await page.$eval('.ms-source .canon-row-detail', (el) => el.textContent)),
);

await armDownloadCapture();
await page.click('.ms-download');
await page.waitForFunction(() => window.__captured, { timeout: 5000 });
const cleaned = await page.evaluate(async () => {
	const buf = new Uint8Array(await window.__captured.arrayBuffer());
	let text = '';
	for (const b of buf) text += String.fromCharCode(b);
	const url = URL.createObjectURL(window.__captured);
	const image = new Image();
	const decoded = await new Promise((resolve) => {
		image.onload = () => resolve(true);
		image.onerror = () => resolve(false);
		image.src = url;
	});
	return {
		soi: buf[0] === 0xff && buf[1] === 0xd8,
		decoded,
		width: image.naturalWidth,
		hasCam: text.includes('TestCam'),
		hasIcc: text.includes('ICC_PROFILE'),
	};
});
check(
	'cleaned JPEG still decodes at 64×64',
	cleaned.soi && cleaned.decoded && cleaned.width === 64,
	JSON.stringify(cleaned),
);
check('camera string is gone from the output', !cleaned.hasCam);
check('ICC kept by default', cleaned.hasIcc);

await page.click('.ms-icc .canon-switch');
await page.waitForFunction(
	() => document.querySelector('.ms-removed .canon-row-detail')?.textContent.includes('ICC profile (APP2)'),
	{ timeout: 5000 },
).catch(() => {});
check(
	'the colour profile switch: removing it names it in the removed row',
	await page.$eval('.ms-removed .canon-row-detail', (el) => el.textContent.includes('ICC profile (APP2)')),
);
check(
	'after stripping now reports nothing left and the ICC lamp is struck',
	(await page.$eval('.ms-after', (el) => el.textContent.replace(/\s+/g, ' '))).includes('Nothing left') &&
		!!(await page.$('.ms-lamp--struck .ms-lamp-name')) &&
		(await page.$$eval('.ms-lamp', (els) => els.find((el) => el.textContent.trim() === 'ICC').className)).includes('struck'),
);

await page.evaluate(() =>
	[...document.querySelectorAll('.ms-source button')].find((b) => b.textContent.trim() === 'Clear').click(),
);
await sleep(200);
check('Clear returns to the slot', !!(await page.$('.ms-slot')) && !(await page.$('.ms-found')));

await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await dropTaggedJpeg('.metadata-stripper');
await page.waitForSelector('.ms-pin', { timeout: 10000 });
check(
	'reduced motion: the pin and lamps do not animate',
	await page.evaluate(
		() =>
			getComputedStyle(document.querySelector('.ms-pin')).animationName === 'none' &&
			getComputedStyle(document.querySelector('.ms-lamp')).transitionDuration === '0s',
	),
);
await page.emulateMediaFeatures([]);

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/metadata-stripper');
await dropTaggedJpeg('.metadata-stripper');
await page.waitForSelector('.ms-found .canon-tiles-tile', { timeout: 10000 });
check(
	'phone: the lamps sit under the map, nothing scrolls sideways',
	await page.evaluate(
		() =>
			document.querySelector('.ms-lamps').getBoundingClientRect().top >=
				document.querySelector('.ms-map').getBoundingClientRect().bottom &&
			document.documentElement.scrollWidth <= document.documentElement.clientWidth,
	),
);

await finish(browser);
