import {
	launch,
	visit,
	check,
	finish,
	sleep,
	makeClip,
	dropClip,
	captureObjectUrl,
} from './harness.mjs';

const { browser, page } = await launch();
await visit(page, '/tools/frame-extractor');

const text = (selector) =>
	page.evaluate((s) => document.querySelector(s)?.textContent.trim() ?? null, selector);
const count = (selector) => page.$$eval(selector, (els) => els.length);
const videoTime = () => page.$eval('.fx-video', (v) => v.currentTime);
const lastBlob = () =>
	page.evaluate(async () => {
		const blob = window.__result;
		if (!blob) return null;
		const head = new Uint8Array(await blob.slice(0, 4).arrayBuffer());
		return { type: blob.type, size: blob.size, head: [...head] };
	});
const pngSize = () =>
	page.evaluate(async () => {
		const bitmap = await createImageBitmap(window.__result);
		return [bitmap.width, bitmap.height];
	});
const clearResult = () => page.evaluate(() => (window.__result = null));
const menuItem = (title) =>
	page.evaluate((title) => {
		const item = [...document.querySelectorAll('.canon-menu-item')].find(
			(el) => el.checkVisibility() && el.textContent.trim() === title,
		);
		item?.click();
		return !!item;
	}, title);
// at max scroll the floating footer leaves the last row clear
const footerClear = () =>
	page.evaluate(async () => {
		const footer = document.querySelector('.canon-split-footer');
		const pane = footer.parentElement;
		const stacked = getComputedStyle(pane).display === 'contents';
		const scroller = stacked ? pane.closest('.canon-split-body') : pane;
		scroller.scrollTop = scroller.scrollHeight;
		await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
		const rows = [
			...(stacked ? document.querySelectorAll('.canon-split-pane > *') : pane.children),
		].filter((c) => c !== footer && c.getBoundingClientRect().height > 0);
		const last = Math.max(...rows.map((c) => c.getBoundingClientRect().bottom));
		const top = footer.getBoundingClientRect().top;
		scroller.scrollTop = 0;
		return { ok: last < top, last: Math.round(last), top: Math.round(top) };
	});

check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.frame-extractor').getBoundingClientRect().height,
	),
);
// media/strips readoutBandHeight(96)
const bandHeight = 138;
const band = () =>
	page.evaluate(() =>
		Math.round(
			document.querySelector('.canon-readout-band').closest('.canon-canvas').getBoundingClientRect()
				.height,
		),
	);
check('empty: the band is the shared A/V height', (await band()) === bandHeight, String(await band()));
check(
	'empty: the Source row is the slot, a button with the iOS wording',
	await page.evaluate(() => {
		const slot = document.querySelector('.fx-slot');
		const rows = slot?.closest('.canon-rows');
		return (
			slot?.tagName === 'BUTTON' &&
			slot.textContent.trim() === 'Choose video file' &&
			slot.classList.contains('media-slot--row') &&
			rows?.querySelector('.canon-heading')?.textContent.trim() === 'Source'
		);
	}),
);
check(
	'empty: blank strips and no marks',
	(await count('.media-strips--blank .media-frame--blank')) > 0 &&
		(await count('.media-frame:not(.media-frame--blank)')) === 0 &&
		(await count('.media-mark')) === 0,
);
check(
	'empty: the frames block reads 0 frames, None',
	(await text('.fx-stills-rows .canon-heading')) === '0 frames' &&
		(await text('.fx-stills-rows .canon-empty-row')) === 'None',
);
check(
	'empty: the Frames slider is on, Contact sheet is off',
	await page.evaluate(
		() =>
			document.querySelector('.fx-sheet-count [role="slider"]')?.getAttribute('aria-disabled') !==
				'true' && document.querySelector('.fx-sheet-rows .media-job-run')?.disabled === true,
	),
);
check(
	'empty: a blank 16:9 picture, no video, muted fill',
	await page.evaluate(() => {
		const box = document.querySelector('.fx-preview');
		const picture = box.querySelector('.fx-blank rect');
		if (!picture) return false;
		const { width, height } = picture.getBoundingClientRect();
		const probe = document.createElement('div');
		probe.style.background = 'var(--canon-muted)';
		box.append(probe);
		const muted = getComputedStyle(probe).backgroundColor;
		probe.remove();
		return (
			!box.querySelector('video') &&
			box.textContent.trim() === '' &&
			Math.abs(width / height - 16 / 9) < 0.02 &&
			getComputedStyle(picture).fill === muted
		);
	}),
);
check(
	'empty: Grab frame and the step transport are there, off',
	await page.evaluate(
		() =>
			document.querySelector('.fx-grab')?.disabled === true &&
			document.querySelectorAll('.fx-transport button').length === 5 &&
			[...document.querySelectorAll('.fx-transport button')].every((b) => b.disabled),
	),
);
await page.focus('.fx-sheet-count [role="slider"]');
await page.keyboard.press('ArrowRight');
await sleep(100);
check(
	'empty: the Frames slider moves before a file, no marks on the blank strip',
	(await page.$eval('.fx-sheet-count [role="slider"]', (s) => s.getAttribute('aria-valuenow'))) ===
		'13' && (await count('.media-mark')) === 0,
);
await page.keyboard.press('ArrowLeft');
await sleep(100);

await captureObjectUrl(page);
await makeClip(page, { ms: 2500, name: 'clip.webm' });
await dropClip(page, '.frame-extractor');
await page.waitForFunction(() => document.querySelector('.fx-grab')?.disabled === false, {
	timeout: 15000,
});
await sleep(300);

const detail = await text('.fx-source .canon-row-detail');
check('the source row: size, rate, length', /^320 × 180 · .*fps · 00:00:0\d\.\d{3}$/.test(detail), detail);
check('loaded: the band keeps the shared A/V height', (await band()) === bandHeight, String(await band()));
check(
	'the preview has no native controls; the band shows frames',
	await page.evaluate(
		() =>
			!document.querySelector('.fx-video').controls &&
			document.querySelectorAll('.canon-readout-band .media-frame').length > 0,
	),
);
check(
	'no stills yet: 0 frames, None',
	(await text('.fx-stills-rows .canon-heading')) === '0 frames' &&
		(await text('.fx-stills-rows .canon-empty-row')) === 'None',
);
check(
	'the transport cells are named',
	await page.evaluate(() =>
		[
			['.fx-back', 'Back 1 second'],
			['.fx-step-back', 'Back one frame'],
			['.fx-step-forward', 'Forward one frame'],
			['.fx-forward', 'Forward 1 second'],
		].every(([s, name]) => document.querySelector(s)?.getAttribute('aria-label') === name),
	),
);

await page.click('.fx-forward');
await sleep(200);
let t = await videoTime();
check('+1 s moves the preview a second', Math.abs(t - 1) < 0.01, String(t));
await page.click('.fx-step-forward');
await sleep(200);
const t1 = await videoTime();
check('Forward one frame steps one frame', Math.abs(t1 - t - 1 / 30) < 0.01, `${t} -> ${t1}`);
await page.click('.fx-step-back');
await page.click('.fx-back');
await sleep(200);
t = await videoTime();
check('Back one frame and -1 s return to the start', Math.abs(t) < 0.01, String(t));

await page.focus('.canon-readout-band .media-scrub');
await page.keyboard.press('ArrowRight');
await sleep(200);
t = await videoTime();
check('the strip takes the arrow keys and scrubs the preview', Math.abs(t - 1) < 0.01, String(t));

await clearResult();
await page.click('.fx-grab');
await page.waitForSelector('.fx-still');
check(
	'Grab frame adds a still at the playhead: 1 frame',
	(await text('.fx-stills-rows .canon-heading')) === '1 frame' &&
		(await text('.fx-still-time')) === '00:00:01.000',
);
let blob = await lastBlob();
check(
	'the still is a full-size PNG',
	blob?.type === 'image/png' && JSON.stringify(await pngSize()) === '[320,180]',
	JSON.stringify(blob),
);
check('the strip marks the still', (await count('.media-mark--lit')) === 1);

await page.$eval('.fx-video', (v) => (v.currentTime = 2));
await sleep(300);
await page.click('.fx-grab');
await page.waitForFunction(() => document.querySelectorAll('.fx-still').length === 2);
check(
	'a second grab: 2 frames, two marks',
	(await text('.fx-stills-rows .canon-heading')) === '2 frames' &&
		(await count('.media-mark--lit')) === 2,
);

await clearResult();
await page.focus('.fx-still');
await page.keyboard.press('Enter');
await sleep(200);
check('Enter on a still opens its menu', await menuItem('Download'));
await sleep(200);
blob = await lastBlob();
check('Download saves that still', blob?.type === 'image/png', JSON.stringify(blob));

await clearResult();
await page.click('.fx-save-all');
await page.waitForFunction(() => window.__result?.type === 'application/zip', { timeout: 10000 });
blob = await lastBlob();
check('Download all saves a zip', blob.head[0] === 0x50 && blob.head[1] === 0x4b, JSON.stringify(blob));

await page.click('.fx-still');
await sleep(200);
check('Remove takes a still out', await menuItem('Remove'));
await sleep(200);
check(
	'1 frame, one mark left',
	(await text('.fx-stills-rows .canon-heading')) === '1 frame' &&
		(await count('.media-mark--lit')) === 1,
);

await page.focus('.fx-sheet-count [role="slider"]');
await page.keyboard.press('ArrowRight');
await sleep(100);
check(
	'the Frames slider takes the arrow keys, and the strip shows the sheet times',
	(await page.$eval('.fx-sheet-count [role="slider"]', (s) => s.getAttribute('aria-valuenow'))) ===
		'13' && (await count('.media-mark--dim')) === 13,
);
await sleep(1800);
check('the sheet times leave the strip after the slider rests', (await count('.media-mark--dim')) === 0);

await clearResult();
await page.click('.fx-sheet-rows .media-job-run');
await page.waitForSelector('.fx-sheet', { timeout: 30000 });
check(
	'Contact sheet builds a result with Download and the picture; its times stay on the strip',
	(await text('.fx-sheet-rows .media-job-result .canon-row-title')) === 'clip-contact-sheet.png' &&
		!!(await page.$('.fx-sheet-rows .media-job-save')) &&
		(await count('.media-mark--dim')) === 13,
);
check(
	'13 frames make a 4 × 4 sheet of 320 px thumbs',
	JSON.stringify(await page.$eval('.fx-sheet', (img) => [img.naturalWidth, img.naturalHeight])) ===
		'[1280,720]',
);
await page.click('.fx-sheet-rows .media-job-save');
await sleep(200);
blob = await lastBlob();
check('Download saves the sheet PNG', blob?.type === 'image/png', JSON.stringify(blob));
await page.focus('.fx-sheet-count [role="slider"]');
await page.keyboard.press('ArrowLeft');
await sleep(100);
check('a new frame count drops the sheet', !(await page.$('.fx-sheet')));

await page.click('.fx-play');
await sleep(300);
check(
	'Play plays; the strip shows the playhead',
	(await text('.fx-play')) === 'Pause' && !!(await page.$('.canon-readout-band .media-head')),
);
await page.click('.fx-play');
await page.click('.fx-grab');
await sleep(300);
check('Grab frame works after playback', (await count('.fx-still')) === 2);

let clear = await footerClear();
check('wide: at the end of the scroll the footer clears the last row', clear.ok, JSON.stringify(clear));

await page.evaluate(() =>
	[...document.querySelectorAll('.fx-source button')].find((b) => b.textContent.trim() === 'Clear').click(),
);
await sleep(200);
check(
	'Clear returns to the slot and the blank strip, and drops the stills',
	!!(await page.$('.fx-slot')) &&
		!!(await page.$('.media-strips--blank')) &&
		!(await page.$('.fx-still')) &&
		!(await page.$('.media-mark')),
);

// paste anywhere loads; the query flags grab, step and build
await visit(page, '/tools/frame-extractor?fxGrab=0.5,1&fxStep=3&fxSheet=yes');
await makeClip(page, { ms: 1500, name: 'paste.webm' });
await page.evaluate(() => {
	const transfer = new DataTransfer();
	transfer.items.add(window.__clip);
	document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true }));
});
await page.waitForSelector('.fx-sheet', { timeout: 30000 });
await sleep(300);
const times = await page.$$eval('.fx-still-time', (els) => els.map((e) => e.textContent.trim()));
check(
	'paste loads; ?fxGrab=0.5,1 grabs two stills, ?fxSheet=yes builds the sheet',
	JSON.stringify(times) === '["00:00:00.500","00:00:01.000"]',
	JSON.stringify(times),
);
t = await videoTime();
check('?fxStep=3 steps three frames on', Math.abs(t - 1 - 3 / 30) < 0.02, String(t));

await page.setViewport({ width: 390, height: 844 });
await sleep(400);
check(
	'phone: nothing scrolls sideways',
	await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
);
check(
	'phone: the stills sit three to a row',
	await page.$$eval('.fx-still', (cells) => {
		const [a, b] = cells.map((c) => c.getBoundingClientRect());
		const grid = document.querySelector('.fx-stills').getBoundingClientRect().width;
		return a.top === b.top && Math.round(grid / a.width) === 3;
	}),
);
clear = await footerClear();
check('phone: at the end of the scroll the footer clears the last row', clear.ok, JSON.stringify(clear));
check(
	'phone: the transport cells keep 44 px targets',
	await page.$$eval('.fx-transport button', (cells) =>
		cells.every((c) => c.getBoundingClientRect().height >= 44 && c.getBoundingClientRect().width >= 44),
	),
);

await finish(browser);
