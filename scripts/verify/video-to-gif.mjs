// the canon video-to-gif: slot, band with frame ticks, trim, settings, job, inline gif
// chromium #642012 webm duration infinity; the MediaRecorder clip covers resolveDuration
import {
	launch,
	visit,
	check,
	finish,
	sleep,
	makeClip,
	dropClip,
} from './harness.mjs';

const { browser, page } = await launch();
await visit(page, '/tools/video-to-gif');

const state = () =>
	page.evaluate(() => {
		const grip = (label) =>
			document.querySelector(`.media-trim-grip[aria-label="${label}"]`);
		const tile = (label) =>
			[...document.querySelectorAll('.vg-budget .canon-tiles-tile')]
				.find((t) => t.querySelector('.canon-tiles-label').textContent.trim() === label)
				?.querySelector('.canon-tiles-value')
				.textContent.trim();
		return {
			start: Number(grip('Start')?.getAttribute('aria-valuenow')),
			end: Number(grip('End')?.getAttribute('aria-valuenow')),
			endField: document.querySelector('.vg-end input')?.value,
			fps: Number(document.querySelector('.vg-fps [role="slider"]')?.getAttribute('aria-valuenow')),
			frames: tile('Frames'),
			size: tile('Size'),
			ticks: document.querySelectorAll('.canon-readout-band .media-mark--dim').length,
			over: !!document.querySelector('.vg-over'),
			runDisabled: document.querySelector('.media-job-run')?.disabled,
		};
	});
const typeInto = async (selector, value) => {
	await page.$eval(selector, (input) => {
		input.focus();
		input.select();
	});
	await page.keyboard.type(value);
	await page.keyboard.press('Enter');
	await sleep(700);
};
const gifInfo = () =>
	page.evaluate(async () => {
		const img = document.querySelector('.vg-gif');
		await img.decode();
		const bytes = new Uint8Array(await (await fetch(img.src)).arrayBuffer());
		let controls = 0;
		for (let i = 0; i < bytes.length - 2; i++)
			if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 0x04) controls++;
		return {
			head: String.fromCharCode(...bytes.slice(0, 6)),
			width: img.naturalWidth,
			height: img.naturalHeight,
			controls,
			detail: document.querySelector('.media-job-result .canon-row-detail')?.textContent.trim(),
			title: document.querySelector('.media-job-result .canon-row-title')?.textContent.trim(),
		};
	});
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
const videoTime = () => page.$eval('.vg-preview video', (v) => v.currentTime);

check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.video-to-gif').getBoundingClientRect().height,
	),
);
check(
	'empty: the slot has the web wording, no settings or footer',
	await page.evaluate(
		() =>
			document.querySelector('.vg-slot')?.textContent.trim() ===
				'Drop a video here or click to upload' &&
			!document.querySelector('.media-job-run') &&
			!document.querySelector('.media-transport'),
	),
);

// 7 s: past the 5 s first cut, and 7 s at 50 fps passes the 300 frame cap
await makeClip(page, { ms: 7000, name: 'clip.webm' });
await dropClip(page, '.video-to-gif');
await page.waitForFunction(
	() => document.querySelector('.media-job-run')?.disabled === false,
	{ timeout: 20000 },
);
await sleep(300);
const detail = await page.$eval('.vg-source .canon-row-detail', (el) => el.textContent.trim());
check(
	'webm duration resolves: the source row reads size, rate and a finite length',
	/^320 × 180 · .*fps · 00:00:0[67]\.\d{3}$/.test(detail),
	detail,
);
let s = await state();
check(
	'a drop selects the first 5 s at 10 fps: 50 frames, 50 ticks, the width capped at the source',
	s.start === 0 &&
		s.end === 5 &&
		s.fps === 10 &&
		s.frames === '50 frames' &&
		s.ticks === 50 &&
		s.size === '320 × 180',
	JSON.stringify(s),
);
check(
	'the preview has no native controls; band and editor show frames',
	await page.evaluate(
		() =>
			!document.querySelector('.vg-preview video').controls &&
			document.querySelectorAll('.canon-readout-band .media-frame').length > 0 &&
			document.querySelectorAll('.vg-editor .media-frame').length > 0,
	),
);

await typeInto('.vg-end input', '2');
await page.focus('.vg-fps [role="slider"]');
await page.keyboard.press('ArrowRight');
await sleep(100);
s = await state();
check(
	'typed End and the FPS slider arrow keys drive the frame count',
	s.end === 2 && s.fps === 11 && s.frames === '22 frames' && s.ticks === 22,
	JSON.stringify(s),
);
await page.keyboard.press('ArrowLeft');
await typeInto('.vg-width input', '160');
s = await state();
check('typing Width sets the output size', s.size === '160 × 90', JSON.stringify(s));
await page.focus('.vg-width input');
await page.keyboard.press('ArrowUp');
await sleep(100);
s = await state();
check('Width steps 16 px on the arrow keys', s.size === '176 × 99', JSON.stringify(s));
await page.keyboard.press('ArrowDown');

await page.click('.media-job-run');
await page.waitForSelector('.vg-gif', { timeout: 30000 });
let gif = await gifInfo();
check(
	'Create GIF encodes 20 frames at 160 × 90 and shows the GIF inline',
	gif.head === 'GIF89a' && gif.width === 160 && gif.height === 90 && gif.controls === 20,
	JSON.stringify(gif),
);
check(
	'the result row names the file and reads KB and frames, with Download',
	gif.title === 'clip.gif' &&
		/^\d+ KB · 20 frames$/.test(gif.detail) &&
		!!(await page.$('.media-job-save')) &&
		(await page.$eval('.vg-gif', (img) => img.alt)) === 'Encoded GIF',
	JSON.stringify(gif),
);

await page.focus('.vg-fps [role="slider"]');
await page.keyboard.press('ArrowRight');
await sleep(100);
check('a new rate drops the GIF', !(await page.$('.vg-gif')) && !(await page.$('.media-job-result')));
await page.keyboard.press('ArrowLeft');

await page.focus('.vg-fps [role="slider"]');
await page.keyboard.press('End');
await sleep(100);
await page.focus('.media-trim-grip[aria-label="End"]');
await page.keyboard.press('End');
await sleep(100);
s = await state();
check(
	'over 300 frames: the warning shows, Create GIF disables, the ticks go',
	s.fps === 50 && s.over && s.runDisabled === true && s.ticks === 0,
	JSON.stringify(s),
);
const warning = await page.$eval('.vg-over', (el) => el.textContent.trim());
check(
	'the warning is the web wording',
	warning === 'Over 300 frames. Please lower the fps or shorten the range',
	warning,
);

await typeInto('.vg-end input', '5');
s = await state();
check('back under the cap', !s.over && s.runDisabled === false && s.frames === '250 frames', JSON.stringify(s));
await page.click('.media-job-run');
await page.waitForSelector('.media-job-cancel', { timeout: 5000 });
await sleep(200);
await page.click('.media-job-cancel');
await sleep(500);
check(
	'Cancel stops the run and leaves no GIF',
	!!(await page.$('.media-job-run')) && !(await page.$('.vg-gif')),
);
await page.focus('.vg-fps [role="slider"]');
await page.keyboard.press('Home');
await typeInto('.vg-end input', '2');
await page.keyboard.press('ArrowRight');

await page.focus('.media-trim-grip[aria-label="Start"]');
for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
await sleep(100);
s = await state();
check('the Start grip takes the arrow keys', s.start > 0 && s.start < 1, JSON.stringify(s));

await page.click('.media-play');
await sleep(300);
check(
	'Play runs inside the cut',
	await page.evaluate(
		() =>
			document.querySelector('.media-play').textContent.trim() === 'Pause' &&
			!!document.querySelector('.canon-readout-band .media-head'),
	),
);
const before = await videoTime();
check('playback starts at the in point', before >= s.start - 0.05 && before < 2, String(before));
await page.click('.media-play');

await page.$eval('.vg-preview video', (v) => (v.currentTime = 1));
await sleep(200);
await page.click('.vg-set-in');
await page.$eval('.vg-preview video', (v) => (v.currentTime = 1.5));
await sleep(200);
await page.click('.vg-set-out');
s = await state();
check('Set in and Set out take the preview time', s.start === 1 && s.end === 1.5, JSON.stringify(s));
check(
	'the frame steps and fields are named',
	await page.evaluate(
		() =>
			document.querySelector('.vg-back')?.getAttribute('aria-label') === 'Back one frame' &&
			document.querySelector('.vg-forward')?.getAttribute('aria-label') === 'Forward one frame' &&
			['.vg-fps [role="slider"]', '.vg-width input', '.vg-start input', '.vg-end input'].every(
				(sel) => {
					const el = document.querySelector(sel);
					const id = el?.getAttribute('aria-labelledby');
					return !!id && !!document.getElementById(id)?.textContent.trim();
				},
			),
	),
);

let clear = await footerClear();
check('wide: at the end of the scroll the footer clears the last row', clear.ok, JSON.stringify(clear));

await page.evaluate(() =>
	[...document.querySelectorAll('.vg-source button')].find((b) => b.textContent.trim() === 'Clear').click(),
);
await sleep(200);
check('Clear returns to the slot', !!(await page.$('.vg-slot')) && !(await page.$('.vg-preview')));

// paste anywhere loads; ?gifCut, ?gifFps and ?gifRun set up a state
await visit(page, '/tools/video-to-gif?gifCut=0.5,1.5&gifFps=20&gifRun=yes');
await makeClip(page, { ms: 2500, name: 'paste.webm' });
await page.evaluate(() => {
	const transfer = new DataTransfer();
	transfer.items.add(window.__clip);
	document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true }));
});
await page.waitForSelector('.vg-gif', { timeout: 30000 });
s = await state();
gif = await gifInfo();
check(
	'paste loads; ?gifCut=0.5,1.5&gifFps=20&gifRun=yes makes a 20 frame GIF',
	s.start === 0.5 && s.end === 1.5 && s.fps === 20 && gif.controls === 20 && gif.title === 'paste.gif',
	JSON.stringify({ s, gif }),
);

await page.setViewport({ width: 390, height: 844 });
await sleep(400);
check(
	'phone: nothing scrolls sideways',
	await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
);
clear = await footerClear();
check('phone: at the end of the scroll the footer clears the last row', clear.ok, JSON.stringify(clear));
check(
	'phone: the grips keep 44 px targets',
	await page.$$eval('.media-trim-grip', (grips) =>
		grips.every((g) => Math.round(g.getBoundingClientRect().width) === 44),
	),
);
check(
	'phone: the GIF fits its pane',
	await page.$eval('.vg-gif', (img) => {
		const box = img.getBoundingClientRect();
		const pane = img.closest('.canon-rows').getBoundingClientRect();
		return box.width > 0 && box.left >= pane.left - 1 && box.right <= pane.right + 1;
	}),
);

await finish(browser);
