// the canon image-atlas: blank layout, picture, details, colour, location, copy, clear, paste
import { launch, visit, check, finish, sleep } from './harness.mjs';

const { browser, page } = await launch();

// a 64 px JPEG with Make, Model, dates, a serial, a MakerNote and a GPS fix
async function taggedJpeg(page, selector) {
	await page.evaluate(async (sel) => {
		const u16 = (n) => [n & 0xff, n >> 8];
		const u32le = (n) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, (n >> 24) & 0xff];
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
			...ent(1, 2, 2, [0x4e, 0, 0, 0]),
			...ent(2, 5, 3, 270),
			...ent(3, 2, 2, [0x45, 0, 0, 0]),
			...ent(4, 5, 3, 294),
			...ent(5, 1, 1, [0, 0, 0, 0]),
			...ent(6, 5, 1, 318),
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
		ctx.fillRect(0, 0, 64, 32);
		ctx.fillStyle = '#36c';
		ctx.fillRect(0, 32, 64, 32);
		const dataUrl = canvas.toDataURL('image/jpeg', 0.9);
		const jpeg = new Uint8Array(
			atob(dataUrl.split(',')[1])
				.split('')
				.map((c) => c.charCodeAt(0)),
		);
		const tagged = new Uint8Array([
			...jpeg.slice(0, 2),
			...seg(0xe1, [...asc('Exif\0\0'), ...tiff]),
			...jpeg.slice(2),
		]);
		const transfer = new DataTransfer();
		transfer.items.add(new File([tagged], 'photo.jpg', { type: 'image/jpeg' }));
		document.querySelector(sel).dispatchEvent(
			new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }),
		);
	}, selector);
}

const tiles = (scope) =>
	page.$$eval(`${scope} .canon-tiles-tile`, (els) =>
		els.map((el) => [
			el.querySelector('.canon-tiles-label')?.textContent.trim(),
			el.querySelector('.canon-tiles-value')?.textContent.trim(),
		]),
	);
const headings = (scope) =>
	page.$$eval(`${scope} .canon-heading`, (els) => els.map((el) => el.textContent.trim()));

await visit(page, '/tools/image-atlas');

check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.image-atlas').getBoundingClientRect().height,
	),
);

const empty = await page.evaluate(() => {
	const banner = document.querySelector('.image-atlas .canon-split-banner .canon-canvas');
	return {
		slot: document.querySelector('.ia-slot.media-slot--dashed')?.textContent.trim(),
		lines: document.querySelectorAll('.ia-dimension.canon-dimension-line--blank').length,
		zone: [...document.querySelectorAll('.ia-drop button')].map((b) => b.textContent.trim()),
		copy: document.querySelector('.ia-copy')?.disabled,
		banner: Math.round(banner?.getBoundingClientRect().height ?? 0),
		bannerData: Number(banner?.dataset.canonHeight),
		histogram: document.querySelector('.ia-scopes')?.getAttribute('aria-label'),
		gps: document.querySelector('.ia-gps')?.textContent.replace(/\s+/g, ' ').trim(),
		map: document.querySelector('.ia-map-label')?.getAttribute('aria-label'),
		blankPalette: document.querySelectorAll('.ia-palette-blank > span').length,
		open: document.querySelectorAll('.ia-open--blank[inert] .dt-atlas-open [data-tool]').length,
	};
});
check('empty: the picture is the dashed slot', empty.slot === 'Drop an image here', empty.slot);
check('empty: the dimension lines are blank', empty.lines === 2, String(empty.lines));
check(
	'empty: the source is a drop zone with Files and Paste',
	empty.zone.includes('Files') && empty.zone.includes('Paste'),
	empty.zone.join(),
);
check('empty: Copy report is off', empty.copy === true);
check(
	// the wide split caps a banner at 45 % of the sheet
	'empty: the banner takes its measured height, capped',
	empty.banner > 100 && empty.banner <= empty.bannerData + 1,
	`${empty.banner} / ${empty.bannerData}`,
);
check('empty: the histogram is named', empty.histogram === 'Histogram');
check('empty: GPS reads a dash', empty.gps === 'GPS —', empty.gps);
check('empty: the map is named', empty.map === 'Location', empty.map);
check('empty: the palette is six blank cells', empty.blankPalette === 6);
check('empty: the open-in block shows, inert', empty.open > 0, String(empty.open));
check(
	'empty: details keep the loaded headings',
	(await headings('.ia-details')).join() === 'File,Camera',
	(await headings('.ia-details')).join(),
);
const blankTiles = await tiles('.ia-details');
check(
	'empty: every detail value is a dash',
	blankTiles.length === 8 && blankTiles.every(([, v]) => v === '—'),
	JSON.stringify(blankTiles),
);
check(
	'empty: colour and location sections keep their place',
	(await headings('.ia-colour')).join() === 'Colour' &&
		(await headings('.ia-location')).join() === 'Location',
);

await taggedJpeg(page, '.image-atlas');
await page.waitForFunction(
	() => document.querySelector('.ia-source .canon-row-detail')?.textContent.includes('fields'),
	{ timeout: 10000 },
);
await page.waitForSelector('.ia-palette', { timeout: 5000 });
await sleep(300);

const source = await page.evaluate(() => ({
	title: document.querySelector('.ia-source .canon-row-title')?.textContent.trim(),
	detail: document.querySelector('.ia-source .canon-row-detail')?.textContent.trim(),
}));
check('the source row names the file', source.title === 'photo.jpg', source.title);
check('the source row reads format, size and fields', /^JPEG · .+ · \d+ fields$/.test(source.detail), source.detail);

const details = Object.fromEntries(await tiles('.ia-details'));
check('File: the name and dimensions', details['File Name'] === 'photo.jpg' && details.Dimensions === '64 × 64', JSON.stringify(details));
check('Camera: make and model', details.Make === 'TestCam' && details.Model === 'Model X');
check('the serial and MakerNote stay hidden', !Object.keys(details).some((k) => /serial|maker ?note/i.test(k)));
const shownHeadings = await headings('.ia-details');
check('details: Camera and Dates headings', shownHeadings.includes('Camera') && shownHeadings.includes('Dates'), shownHeadings.join());
check('details: Location is not in the sidebar', !shownHeadings.includes('Location'));

const picture = await page.evaluate(() => ({
	label: document.querySelector('.ia-name')?.getAttribute('aria-label'),
	figures: [...document.querySelectorAll('.ia-dimension')].map((el) => el.textContent.replace(/\s+/g, '')),
	caption: document.querySelector('.ia-caption')?.textContent,
	checks: !!document.querySelector('.ia-checks'),
}));
check('the picture is named by its size', picture.label === '64 × 64', picture.label);
check('the dimension lines read 64 px', picture.figures.every((f) => f.includes('64')), picture.figures.join());
check('the caption reads aspect and megapixels', picture.caption === '1:1  0.00 MP', picture.caption);
check('an opaque image has no checks', !picture.checks);

const colour = await page.evaluate(() => ({
	swatches: document.querySelectorAll('.ia-palette .canon-swatch').length,
	transparent: document.querySelector('.ia-colour .canon-tiles-value')?.textContent.trim(),
}));
check('the palette shows swatches', colour.swatches >= 2, String(colour.swatches));
check('Transparent reads 0 %', colour.transparent === '0 %', colour.transparent);

const location = await page.evaluate(() => ({
	gps: document.querySelector('.ia-gps')?.textContent.replace(/\s+/g, ' ').trim(),
	map: document.querySelector('.ia-map-label')?.getAttribute('aria-label'),
	pin: !!document.querySelector('.ia-pin'),
	osm: document.querySelector('.ia-osm')?.href ?? '',
	labels: [...document.querySelectorAll('.ia-location .canon-tiles-label')].map((el) => el.textContent.trim()),
}));
check('GPS reads the fix', location.gps === 'GPS 51.500000, 0.126667', location.gps);
check('the map places the pin and names it', location.pin && location.map === '51.5000° N, 0.1267° E', location.map);
check('the OpenStreetMap link carries the fix', location.osm.includes('mlat=51.5'), location.osm);
check(
	'location tiles drop the coordinates the GPS line shows',
	!location.labels.some((l) => /^(GPS )?(Latitude|Longitude)/.test(l)),
	location.labels.join(),
);

await page.evaluate(() => {
	window.__copied = null;
	navigator.clipboard.writeText = (text) => {
		window.__copied = text;
		return Promise.resolve();
	};
});
await page.click('.ia-copy');
await sleep(200);
const report = await page.evaluate(() => window.__copied ?? '');
check('Copy report copies the report', report.startsWith('File: photo.jpg') && report.includes('GPS: 51.500000, 0.126667'), report.slice(0, 80));
check(
	'copy confirms through the toast',
	await page.evaluate(() => !!document.querySelector('.canon-toast')?.textContent.includes('Copied')),
);

const other = await page.$('.ia-other button');
if (other) {
	await other.click();
	await sleep(100);
	check(
		'Other: Show opens its tiles',
		await page.evaluate(
			() => document.querySelector('.ia-other button').getAttribute('aria-expanded') === 'true',
		),
	);
	await other.click();
}

await page.click('.ia-source button');
await sleep(300);
check(
	'Clear returns to the blank layout',
	await page.evaluate(
		() =>
			!!document.querySelector('.ia-slot') &&
			!!document.querySelector('.ia-drop') &&
			document.querySelector('.ia-copy').disabled,
	),
);

// paste anywhere: a transparent PNG with no metadata
await page.evaluate(
	() =>
		new Promise((resolve) => {
			const canvas = document.createElement('canvas');
			canvas.width = 40;
			canvas.height = 20;
			const ctx = canvas.getContext('2d');
			ctx.fillStyle = '#2a2';
			ctx.fillRect(0, 0, 20, 20);
			canvas.toBlob((blob) => {
				const data = new DataTransfer();
				data.items.add(new File([blob], 'clear.png', { type: 'image/png' }));
				document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data }));
				resolve();
			}, 'image/png');
		}),
);
await page.waitForSelector('.ia-palette', { timeout: 5000 }).catch(() => {});
await sleep(300);
const pasted = await page.evaluate(() => ({
	title: document.querySelector('.ia-source .canon-row-title')?.textContent.trim(),
	checks: !!document.querySelector('.ia-checks'),
	transparent: document.querySelector('.ia-colour .canon-tiles-value')?.textContent.trim(),
	clean: document.querySelector('.ia-clean')?.textContent.trim(),
	caption: document.querySelector('.ia-caption')?.textContent,
}));
check('a paste anywhere loads the image', pasted.title === 'clear.png', pasted.title);
check('a transparent image sits on checks', pasted.checks);
check('Transparent reads half', pasted.transparent === '50 %', pasted.transparent);
check('no metadata reads Clean', pasted.clean === 'No EXIF, XMP or IPTC metadata found', pasted.clean);
check('a 2:1 caption', pasted.caption === '2:1  0.00 MP', pasted.caption);

const open = await page.$$eval('.ia-open:not([inert]) .dt-atlas-open [data-tool]', (els) =>
	els.map((el) => el.dataset.tool),
);
check('open-in lists image tools, not itself', open.includes('metadata-stripper') && !open.includes('image-atlas'));

await page.setViewport({ width: 390, height: 844 });
await sleep(500);
check(
	'390 px: no horizontal scroll',
	await page.evaluate(() => {
		const main = document.querySelector('.dt-main');
		return main.scrollWidth <= main.clientWidth + 1;
	}),
);
check(
	'390 px: main leads, the source before the details',
	await page.evaluate(() => {
		const a = document.querySelector('.ia-controls').getBoundingClientRect().top;
		const b = document.querySelector('.ia-details').getBoundingClientRect().top;
		return a < b;
	}),
);

await visit(page, '/tools/image-atlas?iaSample&iaOther');
await page.waitForSelector('.ia-source', { timeout: 5000 }).catch(() => {});
check(
	'?iaSample loads the drawn sample',
	(await page.$eval('.ia-source .canon-row-title', (el) => el.textContent.trim()).catch(() => '')) ===
		'sample.png',
);

await finish(browser);
