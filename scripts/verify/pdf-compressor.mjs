// excluded from all.mjs: ~10mb wasm fetch
// npm run verify:pdf-compressor

import {
	mkdtempSync,
	readdirSync,
	readFileSync,
	statSync,
	writeFileSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PDFDocument } from 'pdf-lib';
import * as mupdf from 'mupdf';
import { launch, visit, check, finish, sleep } from './harness.mjs';

// fixture: image-heavy, compressible
async function makeImagePdf() {
	const [w, h] = [1600, 1200];
	const pix = new mupdf.Pixmap(mupdf.ColorSpace.DeviceRGB, [0, 0, w, h], false);
	const px = pix.getPixels();
	for (let y = 0; y < h; y++)
		for (let x = 0; x < w; x++) {
			const i = (y * w + x) * 3;
			px[i] = ((x * 255) / w) ^ (y & 63);
			px[i + 1] = ((y * 255) / h) & 255;
			px[i + 2] = ((x + y) * 7) & 255;
		}
	const jpeg = pix.asJPEG(92, false);
	const doc = await PDFDocument.create();
	const img = await doc.embedJpg(jpeg);
	for (let p = 0; p < 3; p++) {
		const page = doc.addPage([612, 792]);
		page.drawImage(img, { x: 20, y: 20, width: 572, height: 752 });
	}
	const bytes = await doc.save();
	const path = join(mkdtempSync(join(tmpdir(), 'dt-pcmp-')), 'src.pdf');
	writeFileSync(path, bytes);
	return { path, size: bytes.length };
}

const src = await makeImagePdf();
const downloads = mkdtempSync(join(tmpdir(), 'dt-pcmp-dl-'));

async function waitForDownload(match, timeout = 90000) {
	const until = Date.now() + timeout;
	while (Date.now() < until) {
		const name = readdirSync(downloads).find(
			(n) => match.test(n) && !n.endsWith('.crdownload'),
		);
		if (name) {
			const path = join(downloads, name);
			if (statSync(path).size > 0)
				return { name, bytes: readFileSync(path) };
		}
		await sleep(250);
	}
	return null;
}

const { browser, page } = await launch();
const client = await page.createCDPSession();
await client.send('Browser.setDownloadBehavior', {
	behavior: 'allow',
	downloadPath: downloads,
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
await visit(page, '/tools/pdf-compressor');
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
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.pdf-compressor').getBoundingClientRect().height,
	),
);
check(
	'empty: the page strip is the drop slot with the web wording, Compress off',
	await page.evaluate(
		() =>
			document.querySelector('.pc-slot .media-slot-prompt')?.textContent.trim() === 'Drop PDF here' &&
			document.querySelector('.media-job-run')?.disabled === true,
	),
);

const [chooser] = await Promise.all([
	page.waitForFileChooser({ timeout: 5000 }),
	page.click('.pc-slot'),
]);
await chooser.accept([src.path]);
await page.waitForFunction(
	() =>
		document.querySelectorAll('.pdf-compressor .canon-page-strip-picture[src^="blob:"]').length === 3,
	{ timeout: 30000 },
).catch(() => {});
const loaded = await page.evaluate(() => ({
	name: document.querySelector('.pc-source .canon-row-title')?.textContent.trim(),
	detail: document.querySelector('.pc-source .canon-row-detail')?.textContent.trim(),
	compare: document.querySelectorAll('.pc-compare img').length,
}));
check(
	'the slot opens the picker; the row names the file with size and pages',
	loaded.name === 'src.pdf' && / · 3 pages$/.test(loaded.detail ?? ''),
	JSON.stringify(loaded),
);
check(
	'the strip shows the three pages, the first lit',
	(await page.$$('.pdf-compressor .canon-page-strip-picture[src^="blob:"]')).length === 3 &&
		(await page.$eval('.pdf-compressor .canon-page-strip-page', (el) => el.getAttribute('aria-current'))) === 'true',
);
await page.waitForFunction(() => !!document.querySelector('.pc-compare img[src^="blob:"]'), {
	timeout: 15000,
}).catch(() => {});
check('the comparison shows the page', !!(await page.$('.pc-compare img[src^="blob:"]')));

await sleep(500);
check('does not auto-compress on load', !(await page.$('.media-job-result')) && !(await page.$('.media-job-progress')));

const pick = (group, text) =>
	page.evaluate(
		(group, text) =>
			[...document.querySelectorAll(`.${group} [role="radio"]`)]
				.find((b) => b.textContent.trim() === text)
				.click(),
		group,
		text,
	);
await pick('pc-modes', 'Keep');
check(
	'Keep hides quality and size and reads Lossless',
	!(await page.$('.pc-quality')) &&
		!(await page.$('.pc-sizes')) &&
		(await page.$eval('.pc-loss', (el) => el.textContent.trim())) === 'Lossless',
);
await pick('pc-modes', 'Recompress');
await page.focus('.pc-quality .canon-slider');
await page.keyboard.press('ArrowRight');
check(
	'the quality slider takes the arrow keys',
	(await page.$eval('.pc-quality .canon-slider', (el) => el.getAttribute('aria-valuenow'))) === '66',
);

// first compress fetches wasm
await page.click('.media-job-run');
await page.waitForSelector('.media-job-result', { timeout: 90000 });
const images = await page.$eval('.media-job-result .canon-row-detail', (el) => el.textContent.trim());
check('images were recompressed', /image/.test(images), images);
await page.waitForFunction(() => document.querySelectorAll('.pc-compare img[src^="blob:"]').length === 2, {
	timeout: 15000,
}).catch(() => {});
check('the comparison shows the result beside the original', (await page.$$('.pc-compare img[src^="blob:"]')).length === 2);

await page.click('.media-job-save');
const out = await waitForDownload(/-small\.pdf$/);
check('compressed PDF downloads', !!out, out?.name ?? 'no download');

if (out) {
	check(
		'output is smaller than the input',
		out.bytes.length < src.size,
		`${src.size} -> ${out.bytes.length}`,
	);
	const doc = new mupdf.PDFDocument(new Uint8Array(out.bytes));
	check('output keeps all 3 pages', doc.countPages() === 3, `${doc.countPages()} pages`);
}

await pick('pc-sizes', '1000');
check('a new setting drops the result', !(await page.$('.media-job-result')));

// paste anywhere replaces the file
await page.evaluate((base64) => {
	const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
	const data = new DataTransfer();
	data.items.add(new File([bytes], 'pasted.pdf', { type: 'application/pdf' }));
	document
		.querySelector('.pdf-compressor .canon-split-main')
		.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
}, readFileSync(src.path).toString('base64'));
await page.waitForFunction(
	() => document.querySelector('.pc-source .canon-row-title')?.textContent.trim() === 'pasted.pdf',
	{ timeout: 10000 },
).catch(() => {});
check(
	'a paste anywhere loads the PDF',
	(await page.$eval('.pc-source .canon-row-title', (el) => el.textContent.trim())) === 'pasted.pdf',
);

await page.evaluate(() =>
	[...document.querySelectorAll('.pc-source button')].find((b) => b.textContent.trim() === 'Clear').click(),
);
await sleep(200);
check('Clear returns to the slot', !!(await page.$('.pc-slot')) && !(await page.$('.pc-compare')));

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/pdf-compressor');
check(
	'phone: nothing scrolls sideways',
	await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
);

await finish(browser);
