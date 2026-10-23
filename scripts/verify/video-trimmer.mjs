// the canon video-trimmer: slot, band, preview, trim editor, cut, transport
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
await visit(page, '/tools/video-trimmer');

const state = () =>
	page.evaluate(() => {
		const grip = (label) =>
			document.querySelector(`.media-trim-grip[aria-label="${label}"]`);
		const field = (cls) => document.querySelector(`.${cls} input`);
		return {
			start: Number(grip('Start')?.getAttribute('aria-valuenow')),
			end: Number(grip('End')?.getAttribute('aria-valuenow')),
			startField: field('vt-start')?.value,
			endField: field('vt-end')?.value,
			startDetail: document.querySelector('.vt-start .canon-row-detail')?.textContent.trim(),
			counter: document.querySelector('.canon-readout-band .canon-timecode')?.textContent.replace(/\s/g, ''),
		};
	});
const pick = (group, text) =>
	page.evaluate(
		(group, text) =>
			[...document.querySelectorAll(`.${group} [role="radio"]`)]
				.find((b) => b.textContent.trim() === text)
				.click(),
		group,
		text,
	);
const typeInto = async (cls, value) => {
	await page.$eval(`.${cls} input`, (input) => {
		input.focus();
		input.select();
	});
	await page.keyboard.type(value);
	await page.keyboard.press('Enter');
	await sleep(100);
};
const decoded = () =>
	page.evaluate(async () => {
		const blob = window.__result;
		const video = document.createElement('video');
		video.muted = true;
		video.src = URL.createObjectURL(blob);
		await new Promise((resolve, reject) => {
			video.onloadedmetadata = resolve;
			video.onerror = () => reject(new Error('decode'));
		});
		if (!Number.isFinite(video.duration)) {
			video.currentTime = 1e101;
			await new Promise((resolve) => (video.ondurationchange = resolve));
		}
		return { duration: video.duration, type: blob.type };
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
const videoTime = () => page.$eval('.vt-preview video', (v) => v.currentTime);
// floating footer covers rows
const tap = async (sel) => {
	await page.$eval(sel, (el) => el.scrollIntoView({ block: 'center' }));
	await page.click(sel);
};
// media/strips readoutBandHeight(96)
const BAND = 138;
const layout = () =>
	page.evaluate(() => {
		const box = (sel) => {
			const r = document.querySelector(sel)?.getBoundingClientRect();
			return r ? { top: Math.round(r.top), height: Math.round(r.height) } : null;
		};
		return {
			bandBox: Math.round(
				document.querySelector('.canon-readout-band').closest('.canon-canvas').getBoundingClientRect().height,
			),
			preview: box('.vt-preview'),
			editor: box('.vt-editor'),
			start: box('.vt-start'),
			job: box('.media-job-run'),
		};
	});

check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.video-trimmer').getBoundingClientRect().height,
	),
);
check(
	'empty: the loaded layout in blank: Source slot row, blank strips, a blank picture, dashed fields',
	await page.evaluate(() => {
		const slot = document.querySelector('.vt-slot');
		const preview = document.querySelector('.vt-preview');
		return (
			slot?.classList.contains('media-slot--row') &&
			slot.textContent.trim() === 'Drop a video file' &&
			slot.closest('.canon-rows').querySelector('.canon-heading')?.textContent.trim() === 'Source' &&
			document.querySelectorAll('.canon-readout-band .media-frame--blank').length > 0 &&
			document.querySelectorAll('.vt-editor .media-frame--blank').length > 0 &&
			!preview.querySelector('video') &&
			Math.abs(Number(preview.dataset.canonAspect) - 16 / 9) < 0.001 &&
			[...document.querySelectorAll('.vt-start .canon-row-detail, .vt-end .canon-row-detail')].every(
				(d) => d.textContent.trim() === '—',
			)
		);
	}),
);
check(
	'empty: no Container picked, Cut presets the output; Trim, Start, End, Set in, Set out and the transport are off',
	await page.evaluate(
		() =>
			[...document.querySelectorAll('.vt-containers [role="radio"], .vt-modes [role="radio"]')].every(
				(b) => !b.disabled,
			) &&
			!document.querySelector('.vt-containers [aria-checked="true"]') &&
			['.media-job-run', '.vt-start input', '.vt-end input', '.vt-set-in', '.vt-set-out', '.vt-back', '.vt-forward', '.media-play', '.media-loop'].every(
				(sel) => document.querySelector(sel)?.disabled === true,
			),
	),
);
const emptyLayout = await layout();
check('empty: the band is bandHeight tall', emptyLayout.bandBox === BAND, JSON.stringify(emptyLayout));

await captureObjectUrl(page);
await makeClip(page, { audio: true, ms: 2500, name: 'tone.webm' });
await dropClip(page, '.video-trimmer');
await page.waitForFunction(
	() => document.querySelector('.media-job-run')?.disabled === false,
	{ timeout: 15000 },
);
await sleep(300);
const loadedLayout = await layout();
check(
	'loaded: the band stays bandHeight; the picture, editor, fields and Trim keep their place',
	loadedLayout.bandBox === BAND && JSON.stringify(loadedLayout) === JSON.stringify(emptyLayout),
	JSON.stringify({ emptyLayout, loadedLayout }),
);
let s = await state();
check(
	'a drop selects the whole file: Start 0, End the length, the counter reads the length',
	s.start === 0 &&
		s.end > 2.3 &&
		s.end < 2.8 &&
		s.startField === '0' &&
		Number(s.endField) === s.end &&
		s.startDetail === '00:00:00.000',
	JSON.stringify(s),
);
const detail = await page.$eval('.vt-source .canon-row-detail', (el) => el.textContent.trim());
check(
	'the source row: size, rate, length',
	/^320 × 180 · .*fps · 00:00:0\d\.\d{3}$/.test(detail),
	detail,
);
check(
	'WebM, the source container, is chosen; Keyframe is the cut',
	await page.evaluate(
		() =>
			document.querySelector('.vt-containers [aria-checked="true"]')?.textContent.trim() === 'WebM' &&
			document.querySelector('.vt-modes [aria-checked="true"]')?.textContent.trim() === 'Keyframe',
	),
);
check(
	'the preview has no native controls; the band and the editor show frames',
	await page.evaluate(
		() =>
			!document.querySelector('.vt-preview video').controls &&
			document.querySelectorAll('.canon-readout-band .media-frame').length > 0 &&
			document.querySelectorAll('.vt-editor .media-frame').length > 0,
	),
);

await page.focus('.media-trim-grip[aria-label="Start"]');
for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight');
s = await state();
check(
	'the Start grip takes the arrow keys, 0.1 s a step',
	s.start === 0.5 && s.startField === '0.5' && s.startDetail === '00:00:00.500',
	JSON.stringify(s),
);
await typeInto('vt-end', '1.8');
s = await state();
check('typing End moves the End grip', s.end === 1.8, JSON.stringify(s));
await typeInto('vt-start', 'garbage');
s = await state();
check('a field ignores what is not a number', s.start === 0.5, JSON.stringify(s));
check(
	'the band dims the frames outside the cut',
	(await page.$$('.canon-readout-band .media-shade')).length === 2,
);

const length = await page.$eval('.media-trim-grip[aria-label="End"]', (g) =>
	Number(g.getAttribute('aria-valuemax')),
);
const grip = await page.$('.media-trim-grip[aria-label="End"]');
const box = await grip.boundingBox();
const track = await page.$eval('.media-trim-track', (el) => el.clientWidth);
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
await page.mouse.move(box.x + box.width / 2 + track / 10, box.y + box.height / 2, { steps: 4 });
await page.mouse.up();
s = await state();
const moved = s.end;
check(
	'dragging the End grip a tenth of the strip adds a tenth of the file, and scrubs there',
	Math.abs(moved - 1.8 - length / 10) < 0.02,
	JSON.stringify(s),
);
check('the drag parks the preview at the out point', Math.abs((await videoTime()) - moved) < 0.05);
await page.focus('.media-trim-grip[aria-label="End"]');
await page.keyboard.press('Home');
s = await state();
check('Home on End stops a hundredth short of Start', s.end === 0.51, JSON.stringify(s));
await typeInto('vt-end', '1.8');

await pick('vt-modes', 'Exact');
await page.click('.media-job-run');
await page.waitForSelector('.media-job-result', { timeout: 60000 });
let out = await decoded();
let resultDetail = await page.$eval('.media-job-result .canon-row-detail', (el) => el.textContent.trim());
check(
	'Exact re-encodes 0.5 to 1.8 s into a 1.3 s file',
	Math.abs(out.duration - 1.3) < 0.25 &&
		/^webm · .* · 00:00:00\.500 – 00:00:01\.800$/.test(resultDetail),
	JSON.stringify({ ...out, resultDetail }),
);
check(
	'the result is named from the in point, with Preview and Download',
	(await page.$eval('.media-job-result .canon-row-title', (el) => el.textContent.trim())) ===
		'tone-00-00-00-500.webm' &&
		!!(await page.$('.media-job-preview')) &&
		!!(await page.$('.media-job-save')),
);

await pick('vt-modes', 'Keyframe');
check('a new cut mode drops the result', !(await page.$('.media-job-result')));
await page.click('.media-job-run');
await page.waitForSelector('.media-job-result', { timeout: 60000 });
out = await decoded();
resultDetail = await page.$eval('.media-job-result .canon-row-detail', (el) => el.textContent.trim());
check(
	'Keyframe copies packets from the keyframe before In up to Out',
	out.duration > 1.2 && out.duration < 2.0 && /^webm · .* – 00:00:01\.800$/.test(resultDetail),
	JSON.stringify({ ...out, resultDetail }),
);
await page.focus('.media-trim-grip[aria-label="Start"]');
await page.keyboard.press('ArrowLeft');
check('moving a grip drops the result', !(await page.$('.media-job-result')));
await page.keyboard.press('ArrowRight');

await page.click('.media-play');
await sleep(300);
check(
	'Play runs from the in point',
	await page.evaluate(
		() =>
			document.querySelector('.media-play').textContent.trim() === 'Pause' &&
			!!document.querySelector('.canon-readout-band .media-head'),
	),
);
const before = await videoTime();
check('playback starts inside the cut', before >= 0.45 && before < 1.8, String(before));
await page.waitForFunction(
	() => document.querySelector('.media-play').textContent.trim() === 'Play',
	{ timeout: 5000 },
);
check(
	'playback stops at the out point and parks at the in point',
	Math.abs((await videoTime()) - 0.5) < 0.05,
	String(await videoTime()),
);

let clear = await footerClear();
check('wide: at the end of the scroll the footer clears the last row', clear.ok, JSON.stringify(clear));

await page.$eval('.vt-preview video', (v) => (v.currentTime = 1));
await sleep(200);
await tap('.vt-set-in');
s = await state();
check('Set in takes the preview time', s.start === 1, JSON.stringify(s));
await page.$eval('.vt-preview video', (v) => (v.currentTime = 1.5));
await sleep(200);
await tap('.vt-set-out');
s = await state();
check('Set out takes the preview time', s.end === 1.5, JSON.stringify(s));

const t0 = await videoTime();
await page.click('.vt-forward');
await sleep(200);
const t1 = await videoTime();
check(
	'Forward one frame steps one frame',
	Math.abs(t1 - t0 - 1 / 30) < 0.01,
	`${t0} -> ${t1}`,
);
check(
	'the frame steps are named',
	await page.evaluate(
		() =>
			document.querySelector('.vt-back')?.getAttribute('aria-label') === 'Back one frame' &&
			document.querySelector('.vt-forward')?.getAttribute('aria-label') === 'Forward one frame',
	),
);

await page.evaluate(() =>
	[...document.querySelectorAll('.vt-source button')].find((b) => b.textContent.trim() === 'Clear').click(),
);
await sleep(200);
check(
	'Clear returns to the slot and the blank picture',
	!!(await page.$('.vt-slot')) && !(await page.$('.vt-preview video')) && !!(await page.$('.vt-preview')),
);

await visit(page, '/tools/video-trimmer?vtrimCut=0.25,1');
await pick('vt-containers', 'MKV');
await pick('vt-modes', 'Exact');
await makeClip(page, { ms: 1500, name: 'paste.webm' });
await page.evaluate(() => {
	const transfer = new DataTransfer();
	transfer.items.add(window.__clip);
	document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true }));
});
await page.waitForFunction(
	() => document.querySelector('.media-trim-grip[aria-label="End"]')?.getAttribute('aria-valuenow') === '1',
	{ timeout: 15000 },
);
s = await state();
check('paste loads; ?vtrimCut=0.25,1 sets the cut', s.start === 0.25 && s.end === 1, JSON.stringify(s));
check(
	'the pre-file MKV and Exact hold after the load',
	await page.evaluate(
		() =>
			document.querySelector('.vt-containers [aria-checked="true"]')?.textContent.trim() === 'MKV' &&
			document.querySelector('.vt-modes [aria-checked="true"]')?.textContent.trim() === 'Exact',
	),
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

await finish(browser);
