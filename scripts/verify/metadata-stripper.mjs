
// the canon metadata-stripper: slot, dossier, found and after tiles, ICC, download
import { launch, visit, check, finish, sleep } from './harness.mjs';

// mupdf logs its xref repair of the corrupt pdf as console errors
const { browser, page } = await launch({
	ignore: [/expected object number|cannot find startxref|repair broken xref|repairing PDF document/],
});

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
			!!document.querySelector('.ms-slot .media-slot-prompt')?.textContent.trim() &&
			!!document.querySelector('.metadata-stripper .canon-empty-row')?.textContent.trim() &&
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

// offsets computed, so mupdf reads the xref without repair
async function dropPdf(selector, body) {
	await page.evaluate(
		(sel, text) => {
			const objects = [
				'<< /Type /Catalog /Pages 2 0 R /Lang (en-US) >>',
				'<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
				'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] >>',
				text,
			];
			let out = '%PDF-1.5\n';
			const offsets = objects.map((object, i) => {
				const at = out.length;
				out += `${i + 1} 0 obj\n${object}\nendobj\n`;
				return at;
			});
			const xref = out.length;
			out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
			for (const at of offsets) out += `${String(at).padStart(10, '0')} 00000 n \n`;
			out += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R /Info 4 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
			const transfer = new DataTransfer();
			transfer.items.add(new File([out], 'GTI Handbuch.pdf', { type: 'application/pdf' }));
			document.querySelector(sel).dispatchEvent(
				new DragEvent('drop', { dataTransfer: transfer, bubbles: true }),
			);
		},
		selector,
		body,
	);
}

await visit(page, '/tools/metadata-stripper');
await dropPdf(
	'.metadata-stripper',
	"<< /Title (GTI Handbuch) /Author (Company GmbH) /Creator (LaTeX with hyperref) /Producer (pdfTeX-1.40.26) /CreationDate (D:20260220140500+01'00') >>",
);
await page.waitForSelector('.ms-found .canon-tiles-tile', { timeout: 15000 });
const pdfFound = await tiles('.ms-found');
check(
	'pdf: found in original lists the document info',
	pdfFound.Title === 'GTI Handbuch' &&
		pdfFound.Author === 'Company GmbH' &&
		pdfFound.Producer === 'pdfTeX-1.40.26' &&
		pdfFound.Language === 'en-US' &&
		pdfFound['PDF version'] === '1.5' &&
		pdfFound.Created === '20.02.2026 14:05',
	JSON.stringify(pdfFound),
);
check(
	'pdf: no colour profile switch or content credentials row',
	!(await page.$('.ms-icc')) && !(await page.$('.ms-c2pa')),
);
const pdfAfter = await tiles('.ms-after');
check(
	'pdf: after stripping keeps only language and version',
	Object.keys(pdfAfter).sort().join() === 'Language,PDF version',
	JSON.stringify(pdfAfter),
);
const pdfRemoved = await page.$eval('.ms-removed .canon-row-detail', (el) => el.textContent.trim());
check('pdf: removed row names the dropped fields', pdfRemoved === 'Title · Author · Creator · Producer · Created', pdfRemoved);

await armDownloadCapture();
await page.click('.ms-download');
await page.waitForFunction(() => window.__captured, { timeout: 5000 });
const cleanedPdf = await page.evaluate(async () => ({
	type: window.__captured.type,
	head: new TextDecoder().decode((await window.__captured.arrayBuffer()).slice(0, 5)),
}));
check('pdf: the download is a pdf', cleanedPdf.type === 'application/pdf' && cleanedPdf.head === '%PDF-', JSON.stringify(cleanedPdf));

await visit(page, '/tools/metadata-stripper');
await page.evaluate(() => {
	const transfer = new DataTransfer();
	transfer.items.add(new File(['%PDF-1.5 broken'], 'broken.pdf', { type: 'application/pdf' }));
	document.querySelector('.metadata-stripper').dispatchEvent(
		new DragEvent('drop', { dataTransfer: transfer, bubbles: true }),
	);
});
await page.waitForSelector('.ms-found .canon-status', { timeout: 15000 });
check(
	'pdf: a corrupt file shows the unreadable state, download off',
	(await page.$eval('.ms-found', (el) => el.textContent)).includes('Format not readable') &&
		(await page.$eval('.ms-download', (el) => el.disabled)),
);

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
