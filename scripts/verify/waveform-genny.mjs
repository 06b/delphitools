// the canon waveform-genny: slot, picture as the export, sizes, detail, colours, PNG and SVG
// SHOTS=<dir> saves screenshots
import {
	launch,
	visit,
	check,
	finish,
	sleep,
	captureObjectUrl,
} from './harness.mjs';

const shots = process.env.SHOTS;
const { browser, page } = await launch();

// 2 s at 22.05 khz mono: a swelling 220 hz tone, peak 0.5 (-6 dBFS)
const makeTone = (name = 'tone.wav') =>
	page.evaluate((name) => {
		const rate = 22050;
		const frames = rate * 2;
		const bytes = new ArrayBuffer(44 + frames * 2);
		const view = new DataView(bytes);
		const ascii = (offset, text) => {
			for (let i = 0; i < text.length; i++) view.setUint8(offset + i, text.charCodeAt(i));
		};
		ascii(0, 'RIFF');
		view.setUint32(4, 36 + frames * 2, true);
		ascii(8, 'WAVE');
		ascii(12, 'fmt ');
		view.setUint32(16, 16, true);
		view.setUint16(20, 1, true);
		view.setUint16(22, 1, true);
		view.setUint32(24, rate, true);
		view.setUint32(28, rate * 2, true);
		view.setUint16(32, 2, true);
		view.setUint16(34, 16, true);
		ascii(36, 'data');
		view.setUint32(40, frames * 2, true);
		for (let i = 0; i < frames; i++) {
			const t = i / frames;
			const envelope = 0.5 * Math.abs(Math.sin(Math.PI * 3 * t)) ** 1.5 * (0.4 + 0.6 * Math.sin(Math.PI * t));
			const v = envelope * Math.sin((2 * Math.PI * 220 * i) / rate);
			view.setInt16(44 + i * 2, Math.round(v * 32767), true);
		}
		window.__clip = new File([bytes], name, { type: 'audio/wav' });
	}, name);

const dropTone = async () => {
	await makeTone();
	await page.evaluate(() => {
		const transfer = new DataTransfer();
		transfer.items.add(window.__clip);
		document
			.querySelector('.waveform-genny')
			.dispatchEvent(new DragEvent('drop', { dataTransfer: transfer, bubbles: true, cancelable: true }));
	});
	await page.waitForSelector('.wg-audio .canon-tiles-tile', { timeout: 15000 });
	await sleep(200);
};

const tiles = (selector) =>
	page.$$eval(`${selector} .canon-tiles-tile`, (els) =>
		Object.fromEntries(
			els.map((el) => [
				el.querySelector('.canon-tiles-label')?.textContent.trim(),
				el.querySelector('.canon-tiles-value')?.textContent.trim(),
			]),
		),
	);
const radio = (group, text) =>
	page.evaluate(
		(group, text) =>
			[...document.querySelectorAll(`${group} [role="radio"]`)].find((b) => b.textContent.trim() === text).click(),
		group,
		text,
	);
const picture = () =>
	page.evaluate(() => {
		const canvas = document.querySelector('.wg-image');
		const box = canvas.getBoundingClientRect();
		const band = canvas.closest('.canon-canvas-content').getBoundingClientRect();
		const context = canvas.getContext('2d');
		const at = (x, y) => [...context.getImageData(x, y, 1, 1).data.slice(0, 3)].join();
		return {
			role: canvas.getAttribute('role'),
			label: canvas.getAttribute('aria-label'),
			width: canvas.width,
			height: canvas.height,
			shown: box.width / box.height,
			inside:
				box.left >= band.left - 0.5 &&
				box.right <= band.right + 0.5 &&
				box.top >= band.top - 0.5 &&
				box.bottom <= band.bottom + 0.5,
			fills: Math.abs(box.width - band.width) < 1 || Math.abs(box.height - band.height) < 1,
			corner: at(0, 0),
			middle: at(Math.round(canvas.width * 0.5), Math.round(canvas.height / 2)),
		};
	});
const theme = (dark) =>
	page.evaluate((dark) => {
		const root = document.documentElement.classList;
		root.toggle('dark', dark);
		root.toggle('light', !dark);
	}, dark);

// downloads land in __saved instead of the disk
const keepDownloads = () =>
	page.evaluate(() => {
		window.__saved = [];
		HTMLAnchorElement.prototype.click = function () {
			window.__saved.push(this.download);
		};
	});

await visit(page, '/tools/waveform-genny');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.waveform-genny').getBoundingClientRect().height,
	),
);
check('the tool can expand', !!(await page.$('.dt-canon-tool.is-expandable')));
const hexField = async (well, value) => {
	const field = await page.$(`${well} input[type="text"]`);
	await field.focus();
	await field.evaluate((el) => el.select());
	await page.keyboard.type(value);
	await page.keyboard.press('Enter');
	await sleep(150);
};
let audio, image;
const bannerHeight = () =>
	page.$eval('.waveform-genny .canon-canvas', (el) => el.getBoundingClientRect().height);
const blankTiles = (values) => Object.values(values).every((v) => v === '—');

check(
	'empty: the Source row is the drop slot with the web wording',
	await page.evaluate(() => {
		const slot = document.querySelector('.canon-split-sidebar .wg-slot');
		const heading = slot?.closest('.media-slot-bar').parentElement.querySelector('.canon-heading');
		return (
			slot?.tagName === 'BUTTON' &&
			slot.classList.contains('media-slot--row') &&
			slot.textContent.trim() === 'Drop an audio file here or click to upload' &&
			heading?.textContent.trim() === 'Source'
		);
	}),
);
let p = await picture();
check(
	'empty: the picture is the image frame at the export size, background with a flat wave line',
	p.role === 'img' &&
		p.width === 1500 &&
		p.height === 500 &&
		p.corner === '250,245,230' &&
		p.middle === '46,125,50' &&
		Math.abs(p.shown - 3) < 0.02 &&
		p.inside &&
		p.fills,
	`${p.width} × ${p.height} ${p.corner} / ${p.middle}`,
);
check(
	'empty: the line is flat, background above and below it',
	await page.evaluate(() => {
		const canvas = document.querySelector('.wg-image');
		const context = canvas.getContext('2d');
		const at = (y) => [...context.getImageData(canvas.width / 3, y, 1, 1).data.slice(0, 3)].join();
		return at(canvas.height / 2 - 10) === '250,245,230' && at(canvas.height / 2 + 10) === '250,245,230';
	}),
);
check(
	'empty: Size, Detail, Colours and Format are there and enabled, Download is off',
	await page.evaluate(
		() =>
			['.wg-sizes', '.wg-details', '.wg-formats'].every((group) =>
				[...document.querySelectorAll(`${group} [role="radio"]`)].every((b) => !b.disabled),
			) &&
			!!document.querySelector('.wg-wave input[type="text"]:not(:disabled)') &&
			!!document.querySelector('.wg-background input[type="text"]:not(:disabled)') &&
			document.querySelector('.wg-download')?.disabled === true,
	),
);
audio = await tiles('.wg-audio');
check(
	'empty: Audio tiles keep their labels, every value a dash, the peak bar empty',
	Object.keys(audio).join() === 'Duration,Sample rate,Channels,Peak' &&
		blankTiles(audio) &&
		(await page.$$('.wg-audio .canon-tiles-level')).length === 1,
	JSON.stringify(audio),
);
image = await tiles('.wg-image-tiles');
check(
	'empty: Image tiles follow the settings',
	image.Width === '1500 px' && image.Height === '500 px' && image.Columns === '750' && image.Pixels === '0.75 MP',
	JSON.stringify(image),
);
await radio('.wg-sizes', 'Full HD');
await sleep(150);
p = await picture();
image = await tiles('.wg-image-tiles');
check(
	'empty: a size previews before a file',
	p.width === 1920 && p.height === 1080 && Math.abs(p.shown - 16 / 9) < 0.02 && p.inside && image.Width === '1920 px',
	`${p.width} × ${p.height} ${p.shown.toFixed(3)}`,
);
await hexField('.wg-wave', 'cc2244');
await hexField('.wg-background', '101820');
p = await picture();
check('empty: colours preview before a file', p.middle === '204,34,68' && p.corner === '16,24,32', `${p.middle} / ${p.corner}`);

await visit(page, '/tools/waveform-genny');
const emptyBanner = await bannerHeight();
const sizesTop = () => page.$eval('.wg-sizes', (el) => el.getBoundingClientRect().top);
const emptySizes = await sizesTop();
await dropTone();
check('the banner keeps its height when the file loads', Math.abs((await bannerHeight()) - emptyBanner) < 0.5, `${emptyBanner}`);
check(
	'the Source row keeps its height: Size does not move',
	Math.abs((await sizesTop()) - emptySizes) < 0.5,
	`${emptySizes} → ${await sizesTop()}`,
);
p = await picture();
check('the picture is the export canvas, a named image', p.role === 'img' && p.label === 'Waveform', p.label);
check('drawn at the SoundCloud size by default', p.width === 1500 && p.height === 500, `${p.width} × ${p.height}`);
check('in the web default colours', p.corner === '250,245,230' && p.middle === '46,125,50', `${p.corner} / ${p.middle}`);
check('shown at the export aspect, inside the band', Math.abs(p.shown - 3) < 0.02 && p.inside && p.fills, p.shown.toFixed(3));
check(
	'the source row: name, length, rate and channels',
	(await page.$eval('.wg-source .canon-row-title', (el) => el.textContent.trim())) === 'tone.wav' &&
		(await page.$eval('.wg-source .canon-row-detail', (el) => el.textContent.trim())).match(/^2\.00 s · \d+ Hz · 1 ch$/),
);
audio = await tiles('.wg-audio');
check(
	'audio tiles: duration, rate, channels, peak',
	audio.Duration === '2.00 s' && /^\d+ Hz$/.test(audio['Sample rate']) && audio.Channels === '1' && /^-6\.\d dBFS$/.test(audio.Peak),
	JSON.stringify(audio),
);
check('the peak tile carries a level bar', (await page.$$('.wg-audio .canon-tiles-level')).length === 1);
image = await tiles('.wg-image-tiles');
check(
	'image tiles: width, height, columns at 2 px, pixels',
	image.Width === '1500 px' && image.Height === '500 px' && image.Columns === '750' && image.Pixels === '0.75 MP',
	JSON.stringify(image),
);

await radio('.wg-sizes', 'Full HD');
await sleep(150);
p = await picture();
image = await tiles('.wg-image-tiles');
check('Full HD redraws at 1920 × 1080', p.width === 1920 && p.height === 1080 && image.Columns === '960', `${p.width} × ${p.height}`);
check('and the band follows the aspect', Math.abs(p.shown - 16 / 9) < 0.02 && p.inside, p.shown.toFixed(3));
await radio('.wg-sizes', 'Square');
await sleep(150);
p = await picture();
check('Square letterboxes inside the band', Math.abs(p.shown - 1) < 0.02 && p.inside, p.shown.toFixed(3));

check('no custom fields until Custom', !(await page.$('.wg-width')));
await radio('.wg-sizes', 'Custom');
await sleep(150);
check('Custom shows width and height at the custom default', (await picture()).width === 1500 && !!(await page.$('.wg-height')));
await page.focus('.wg-width .canon-stepper-field');
await page.$eval('.wg-width .canon-stepper-field', (el) => el.select());
await page.keyboard.type('2000');
await sleep(150);
check('typing a width redraws at once', (await picture()).width === 2000, String((await picture()).width));
await page.focus('.wg-height .canon-stepper-field');
await page.keyboard.press('ArrowUp');
await sleep(100);
check('the height takes the arrow keys, step 10', (await picture()).height === 510, String((await picture()).height));
await page.$eval('.wg-width .canon-stepper-field', (el) => el.select());
await page.focus('.wg-width .canon-stepper-field');
await page.keyboard.type('9');
await sleep(100);
check('a width under 100 px does not commit while typed', (await picture()).width === 2000);
await page.keyboard.press('Enter');
await radio('.wg-sizes', 'SoundCloud');
await sleep(150);

await radio('.wg-details', '8 px');
await sleep(150);
image = await tiles('.wg-image-tiles');
check('Detail 8 px draws 188 columns', image.Columns === '188', image.Columns);
await radio('.wg-details', '2 px');

await hexField('.wg-wave', 'cc2244');
await hexField('.wg-background', '101820');
p = await picture();
check('typed colours repaint the wave and the background', p.middle === '204,34,68' && p.corner === '16,24,32', `${p.middle} / ${p.corner}`);

await captureObjectUrl(page);
await keepDownloads();
check(
	'the export button names the format',
	(await page.$eval('.wg-download', (el) => el.textContent.trim())) === 'Download PNG',
);
await page.click('.wg-download');
await page.waitForFunction(() => window.__saved.length === 1, { timeout: 5000 });
const png = await page.evaluate(async () => {
	const bitmap = await createImageBitmap(window.__result);
	return { type: window.__result.type, width: bitmap.width, height: bitmap.height, name: window.__saved[0] };
});
check(
	'Download PNG saves the export at full size, named after the file',
	png.type === 'image/png' && png.width === 1500 && png.height === 500 && png.name === 'tone.png',
	JSON.stringify(png),
);

await radio('.wg-formats', 'SVG');
await sleep(100);
check(
	'SVG renames the button',
	(await page.$eval('.wg-download', (el) => el.textContent.trim())) === 'Download SVG',
);
await page.click('.wg-download');
await page.waitForFunction(() => window.__saved.length === 2, { timeout: 5000 });
const svg = await page.evaluate(async () => ({
	type: window.__result.type,
	text: await window.__result.text(),
	name: window.__saved[1],
}));
check(
	'Download SVG writes the viewBox, the colours and 750 bars',
	svg.type === 'image/svg+xml' &&
		svg.name === 'tone.svg' &&
		svg.text.includes('viewBox="0 0 1500 500"') &&
		svg.text.includes('fill="#101820"') &&
		svg.text.includes('<g fill="#cc2244">') &&
		(svg.text.match(/<rect x=/g) ?? []).length === 750,
	`${svg.name} ${svg.text.slice(0, 80)}`,
);

// paste anywhere loads a new file
await makeTone('second.wav');
await page.evaluate(() => {
	const data = new DataTransfer();
	data.items.add(window.__clip);
	document
		.querySelector('.waveform-genny .canon-split-main')
		.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
});
await page.waitForFunction(
	() => document.querySelector('.wg-source .canon-row-title')?.textContent.trim() === 'second.wav',
	{ timeout: 15000 },
);
check('a paste anywhere loads the file', true);

check(
	'every control is a named button or field',
	await page.evaluate(() =>
		[...document.querySelectorAll('.waveform-genny button, .waveform-genny input:not([hidden])')].every(
			(el) =>
				el.hasAttribute('aria-label') ||
				el.hasAttribute('aria-labelledby') ||
				el.textContent.trim() !== '',
		),
	),
);

await page.evaluate(() =>
	[...document.querySelectorAll('.wg-source button')].find((b) => b.textContent.trim() === 'Clear').click(),
);
await sleep(200);
check(
	'Clear returns to the slot and the dashed tiles',
	!!(await page.$('.wg-slot')) && blankTiles(await tiles('.wg-audio')),
);

// iOS launch arguments as query flags
await visit(page, '/tools/waveform-genny?wgSize=2&wgDetail=3&wgFormat=1');
await dropTone();
p = await picture();
image = await tiles('.wg-image-tiles');
check(
	'?wgSize=2&wgDetail=3&wgFormat=1: Full HD, 8 px, SVG',
	p.width === 1920 && image.Columns === '240' && (await page.$eval('.wg-download', (el) => el.textContent.trim())) === 'Download SVG',
	`${p.width} ${image.Columns}`,
);

const sizes = [
	[390, 844],
	[1400, 1000],
	[2200, 1100],
];
for (const [width, height] of sizes) {
	await page.setViewport({ width, height });
	await visit(page, '/tools/waveform-genny');
	const empty = await bannerHeight();
	if (shots)
		for (const dark of [false, true]) {
			await theme(dark);
			await sleep(150);
			await page.screenshot({ path: `${shots}/wg-empty-${width}-${dark ? 'dark' : 'light'}.png` });
		}
	await theme(false);
	await dropTone();
	check(`${width}: the banner is as tall empty as loaded`, Math.abs((await bannerHeight()) - empty) < 0.5, `${empty}`);
	check(
		`${width}: nothing scrolls sideways, the document stays put`,
		await page.evaluate(
			() =>
				document.documentElement.scrollWidth <= document.documentElement.clientWidth &&
				document.documentElement.scrollHeight <= document.documentElement.clientHeight,
		),
	);
	p = await picture();
	check(`${width}: the picture fits the band`, p.inside && Math.abs(p.shown - 3) < 0.02, p.shown.toFixed(3));
	if (width === 390) {
		await radio('.wg-sizes', 'Square');
		await sleep(300);
		const before = await page.$eval('.wg-picture', (el) => el.getBoundingClientRect().height);
		await page.$eval('.waveform-genny > .canon-split-body', (el) => el.scrollTo(0, 400));
		await sleep(300);
		const after = await page.$eval('.wg-picture', (el) => el.getBoundingClientRect().height);
		check('390: the picture collapses as the page scrolls', after < before && after >= 110, `${before} → ${after}`);
		p = await picture();
		check('390: and the image still fits inside it', p.inside);
		if (shots) await page.screenshot({ path: `${shots}/wg-390-square-scrolled-light.png` });
		await page.$eval('.waveform-genny > .canon-split-body', (el) => el.scrollTo(0, 0));
		await radio('.wg-sizes', 'SoundCloud');
		await sleep(300);
	}
	if (width === 2200) {
		check(
			'2200: a 1200 px column',
			Math.round(await page.$eval('.dt-canon-tool > .canon-split', (el) => el.getBoundingClientRect().width)) === 1200,
		);
	}
	if (shots)
		for (const dark of [false, true]) {
			await theme(dark);
			await sleep(150);
			await page.screenshot({ path: `${shots}/wg-${width}-${dark ? 'dark' : 'light'}.png` });
		}
	await theme(false);
}

// 2200 expanded
await page.click('.dt-canon-edge.is-start');
await sleep(400);
const expanded = await page.$eval('.dt-canon-tool > .canon-split', (el) => el.getBoundingClientRect().width);
p = await picture();
// 1960 sheet less the 40 px expanded gutter each side
check('2200: expanding stretches the picture', expanded > 1850 && p.inside, `${expanded}`);
if (shots) await page.screenshot({ path: `${shots}/wg-2200-expanded-light.png` });

await finish(browser);
