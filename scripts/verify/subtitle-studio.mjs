// the canon subtitle-studio: drop and paste anywhere, the cue list as the editor, look, burn, flags
// usage: npm start, then node scripts/verify/subtitle-studio.mjs

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

const SRT =
	'1\n00:00:00,200 --> 00:00:01,000\nHello <i>there</i>\n\n2\n00:00:01,200 --> 00:00:01,900\nSecond cue\n';
const many = (count) =>
	Array.from({ length: count }, (_, i) => {
		const at = (ms) => `00:00:${String(Math.floor(ms / 1000)).padStart(2, '0')},${String(ms % 1000).padStart(3, '0')}`;
		return `${i + 1}\n${at(i * 90)} --> ${at(i * 90 + 80)}\nCue ${i + 1}\n`;
	}).join('\n');

const { browser, page } = await launch();

const state = () =>
	page.evaluate(() => {
		const text = (sel) =>
			document.querySelector(sel)?.textContent.replace(/\s+/g, ' ').trim() ?? null;
		const canvas = document.querySelector('.ss-canvas');
		return {
			videoDrop: !!document.querySelector('.canon-split-main .ss-source .ss-video-slot.media-slot--row'),
			subsDrop: !!document.querySelector('.canon-split-main .ss-subs-drop'),
			preview: !!canvas,
			canvas: canvas ? `${canvas.width}x${canvas.height}` : null,
			picture: canvas?.getAttribute('aria-label') ?? null,
			video: text('.ss-video .canon-row-title'),
			subs: text('.ss-subs .canon-row-title'),
			subsDetail: text('.ss-subs .canon-row-detail'),
			rows: document.querySelectorAll('.canon-split-main .ss-cues .cue-row').length,
			marked: [...document.querySelectorAll('.ss-cues .cue-row')].findIndex((r) =>
				r.classList.contains('cue-row--marked'),
			),
			lane: document.querySelectorAll('.ss-lane .cue-timeline-cue').length,
			laneActive: [...document.querySelectorAll('.ss-lane .cue-timeline-cue')].findIndex((c) =>
				c.classList.contains('cue-timeline-cue--active'),
			),
			footer: !!document.querySelector('.canon-split-footer .ss-transport'),
			transportOff: [...document.querySelectorAll('.ss-transport .canon-button')].every((b) => b.disabled),
			blankPicture: !!document.querySelector('.canon-split-main .ss-preview .ss-blank'),
			band: Math.round(document.querySelector('.canon-split-banner .canon-canvas').getBoundingClientRect().height),
			burn: document.querySelector('.media-job-run')?.disabled ?? null,
			handle: document.querySelector('.ss-handle')?.getAttribute('style') ?? null,
		};
	});

const selected = (scope) =>
	page.$eval(`${scope} [aria-checked="true"]`, (el) => el.textContent.trim());
const press = (scope, label) =>
	page.$$eval(
		`${scope} .canon-button`,
		(els, l) => els.find((b) => b.textContent.trim() === l || b.getAttribute('aria-label') === l)?.click(),
		label,
	);
const setField = (selector, value) =>
	page.evaluate(
		(sel, v) => {
			const field = document.querySelector(sel);
			field.focus();
			const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement : HTMLInputElement;
			Object.getOwnPropertyDescriptor(proto.prototype, 'value').set.call(field, v);
			field.dispatchEvent(new Event('input', { bubbles: true }));
		},
		selector,
		value,
	);
const pasteFile = (name, text, type) =>
	page.evaluate(
		(n, t, ty) => {
			const data = new DataTransfer();
			data.items.add(new File([t], n, { type: ty }));
			document.body.dispatchEvent(
				new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }),
			);
		},
		name,
		text,
		type,
	);
const currentTime = () => page.$eval('.subtitle-studio video', (v) => v.currentTime);

await visit(page, '/tools/subtitle-studio');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.subtitle-studio').getBoundingClientRect().height,
	),
);
let s = await state();
// media/strips bandHeight: readoutBandHeight(96)
const BAND = 138;
check(
	'empty: the Source slot row and the subtitles drop zone, a blank picture, no canvas',
	s.videoDrop && s.subsDrop && s.blankPicture && !s.preview,
	JSON.stringify(s),
);
check(
	'empty: the transport is there, off, and Burn is off',
	s.footer && s.transportOff && s.burn === true,
	JSON.stringify(s),
);
check('empty: the band is bandHeight tall', s.band === BAND, `${s.band}`);
const blank = await page.evaluate(() => {
	const picture = document.querySelector('.ss-preview .ss-blank').getBoundingClientRect();
	const headings = (sel) => [...document.querySelectorAll(`${sel} .canon-heading`)].map((h) => h.textContent.trim());
	return {
		frames: document.querySelectorAll('.ss-strips .media-strips--blank .media-frame--blank').length,
		lane: !!document.querySelector('.ss-strips .ss-lane .cue-timeline-lane'),
		laneCues: document.querySelectorAll('.ss-lane .cue-timeline-cue').length,
		aspect: Math.round((picture.width / picture.height) * 100) / 100,
		text: document.querySelector('.ss-preview').textContent.trim(),
		sidebar: headings('.canon-split-sidebar'),
		source: headings('.ss-source'),
		cues: headings('.ss-cues'),
		cueBlank: !!document.querySelector('.ss-cues .ss-cues-blank'),
		settingsOn: [...document.querySelectorAll('.ss-font [role="radio"], .ss-text [role="radio"], .ss-weight [role="radio"]')].every(
			(b) => !b.disabled,
		),
		format: document.querySelectorAll('.ss-format [role="radio"]:not(:disabled)').length,
		slider: !!document.querySelector('.ss-size [role="slider"]'),
	};
});
check(
	'empty: the loaded layout in blank: frame cells, an empty cue lane, a 16:9 picture, an empty cue list',
	blank.frames > 0 &&
		blank.lane &&
		blank.laneCues === 0 &&
		Math.abs(blank.aspect - 16 / 9) < 0.02 &&
		blank.text === '' &&
		blank.source.join() === 'Source,Subtitles' &&
		blank.cues.join() === 'Subtitles' &&
		blank.cueBlank,
	JSON.stringify(blank),
);
check(
	'empty: the look and the format are there and enabled',
	blank.sidebar.join() === 'Font,Style,Position,Format' && blank.settingsOn && blank.format > 0 && blank.slider,
	JSON.stringify(blank),
);
await press('.ss-text', 'Box');
await sleep(50);
check('empty: a look picked before a file sticks', (await selected('.ss-text')) === 'Box');
await press('.ss-text', 'Outline');
const chosen = await page.evaluate(async () => {
	const input = document.querySelector('.ss-source input[type="file"]');
	let clicked = false;
	input.addEventListener('click', (e) => {
		clicked = true;
		e.preventDefault();
	}, { once: true });
	document.querySelector('.ss-video-slot').click();
	return { clicked, multiple: input.multiple, accept: input.accept };
});
check(
	'empty: the Source slot opens a picker for the video and its subtitles',
	chosen.clicked && chosen.multiple && /srt/.test(chosen.accept) && /video/.test(chosen.accept),
	JSON.stringify(chosen),
);

const made = await makeClip(page, { ms: 2000, name: 'sweep.webm' });
check('generated a test video in the page', made > 0, `${made} bytes`);

// a drop anywhere, outside the drop zones
await dropClip(page, '.subtitle-studio .canon-split-banner', [
	{ name: 'sweep.srt', type: 'application/x-subrip', text: SRT },
]);
await page.waitForFunction(() => document.querySelectorAll('.ss-cues .cue-row').length === 2, {
	timeout: 5000,
});
await page.waitForFunction(() => document.querySelector('.ss-canvas')?.width === 320, {
	timeout: 10000,
});
await page.waitForFunction(() => document.querySelector('.media-job-run')?.disabled === false, {
	timeout: 10000,
});
s = await state();
check(
	'one drop on the band loads the video and the SRT',
	s.video === 'sweep.webm' &&
		s.canvas === '320x180' &&
		s.subs === 'sweep.srt' &&
		s.subsDetail === '2 cues' &&
		s.rows === 2 &&
		s.lane === 2 &&
		s.footer,
	JSON.stringify(s),
);
check('loaded: the band is bandHeight tall', s.band === BAND, `${s.band}`);
check(
	'the cue list and the preview are in the main pane',
	await page.evaluate(
		() =>
			!!document.querySelector('.canon-split-main .ss-cues textarea.cue-row-text') &&
			!!document.querySelector('.canon-split-main .ss-preview .ss-canvas'),
	),
);
check(
	'between cues the next cue shows as a ghost with its handle',
	s.marked === -1 && s.picture === 'Hello there' && !!s.handle,
	JSON.stringify({ marked: s.marked, picture: s.picture, handle: s.handle }),
);

// focus in a row seeks to its cue
await page.focus('.ss-cues .cue-row:nth-of-type(2) textarea');
await sleep(400);
s = await state();
const t = await currentTime();
check(
	'focus in the second row seeks to its cue and marks it',
	s.marked === 1 && s.laneActive === 1 && t >= 1.2 && t < 1.9,
	JSON.stringify({ marked: s.marked, lane: s.laneActive, t }),
);

// the text edits live in the preview
await setField('.ss-cues .cue-row:nth-of-type(2) textarea', 'Edited cue');
await sleep(100);
s = await state();
check('typing in a row redraws the preview with the new text', s.picture === 'Edited cue', s.picture);

// retime: start of cue 2 typed and committed on Enter
await page.click('.ss-cues .cue-row:nth-of-type(2) .cue-row-time');
await page.evaluate(() => {
	const field = document.querySelector('.ss-cues .cue-row:nth-of-type(2) .cue-row-time');
	field.value = '00:00:01.500';
});
await page.keyboard.press('Enter');
await sleep(100);
const laneStyle = await page.$eval('.ss-lane .cue-timeline-cue:nth-child(2)', (el) =>
	el.getAttribute('style'),
);
// the recorded clip runs a few ms short of 2 s
const clipLength = await page.$eval('.subtitle-studio video', (v) => v.duration);
const fieldValue = await page.$eval('.ss-cues .cue-row:nth-of-type(2) .cue-row-time', (el) => el.value);
check(
	'a typed start time retimes the cue in the lane',
	fieldValue === '00:00:01.500' &&
		Math.abs(parseFloat(laneStyle.match(/inset-inline-start: ([\d.]+)%/)?.[1]) - (150 / clipLength)) < 0.5,
	`${fieldValue} ${laneStyle}`,
);

// the lane: a press on a cue seeks to it
await page.evaluate(() => {
	const cue = document.querySelector('.ss-lane .cue-timeline-cue');
	const lane = cue.parentElement;
	const box = cue.getBoundingClientRect();
	lane.dispatchEvent(
		new PointerEvent('pointerdown', {
			bubbles: true,
			button: 0,
			pointerId: 1,
			clientX: box.left + box.width / 2,
			clientY: box.top + 2,
		}),
	);
});
await sleep(400);
s = await state();
check('a press on a lane cue seeks to it', s.marked === 0 && (await currentTime()) < 0.5, JSON.stringify(s.marked));

// the transport: next and previous cue, frame steps
await press('.ss-transport', 'Next cue');
await sleep(400);
check('Next cue goes to the second cue', (await state()).marked === 1);
await press('.ss-transport', 'Previous cue');
await sleep(400);
check('Previous cue goes back to the first', (await state()).marked === 0);
const before = await currentTime();
await press('.ss-transport', 'Forward one frame');
await sleep(300);
const after = await currentTime();
check('Forward one frame steps one frame', after > before && after - before < 0.1, `${before} → ${after}`);
check(
	'every transport cell is named',
	await page.$$eval('.ss-transport .canon-button', (els) =>
		els.every((b) => (b.getAttribute('aria-label') || b.textContent.trim()).length > 0),
	),
);

// look
await press('.ss-text', 'Box');
await sleep(50);
check('style segmented selects Box', (await selected('.ss-text')) === 'Box');
await press('.ss-text', 'Plain');
await sleep(50);
check('Plain hides the backing well', !(await page.$('.ss-backing')));
await press('.ss-text', 'Box');
await press('.ss-weight', 'Bold');
await sleep(50);
check('weight segmented selects Bold', (await selected('.ss-weight')) === 'Bold');

const formats = await page.$$eval('.ss-format [role="radio"]', (els) =>
	els.map((el) => `${el.textContent.trim()}${el.disabled ? '!' : ''}`),
);
check(
	'format segmented lists six formats with the unsupported ones disabled',
	formats.length === 6 && formats.some((f) => !f.endsWith('!')),
	formats.join(' | '),
);
await press('.ss-format', 'MP4 · H.264');
await captureObjectUrl(page);

await page.click('.media-job-run');
await page.waitForFunction(() => !!document.querySelector('.media-job-result'), { timeout: 20000 });
const result = await page.evaluate(() => ({
	name: document.querySelector('.media-job-result .canon-row-title')?.textContent.trim(),
	detail: document.querySelector('.media-job-result .canon-row-detail')?.textContent.trim(),
	save: !!document.querySelector('.media-job-save'),
}));
check(
	'burn produces a downloadable mp4 named after the source',
	result.name === 'sweep-subtitled.mp4' &&
		/^mp4 · [\d.]+ [KM]B( · [\d.]+×)?$/.test(result.detail ?? '') &&
		result.save,
	JSON.stringify(result),
);
await page
	.waitForFunction(() => !!document.querySelector('.canon-split-sidebar .media-sections'), { timeout: 10000 })
	.catch(() => {});
check('the burnt file is described in the sidebar', !!(await page.$('.canon-split-sidebar .media-sections')));

const burned = await page.evaluate(async () => {
	const blob = window.__result;
	if (!blob) return { error: 'no blob' };
	const video = document.createElement('video');
	video.muted = true;
	video.src = URL.createObjectURL(blob);
	await new Promise((resolve, reject) => {
		video.onloadeddata = resolve;
		video.onerror = () => reject(new Error('decode'));
	});
	video.currentTime = 0.6;
	await new Promise((resolve) => (video.onseeked = resolve));
	const canvas = document.createElement('canvas');
	canvas.width = video.videoWidth;
	canvas.height = video.videoHeight;
	const ctx = canvas.getContext('2d');
	ctx.drawImage(video, 0, 0);
	const band = ctx.getImageData(0, Math.round(canvas.height * 0.8), canvas.width, Math.round(canvas.height * 0.2)).data;
	let white = 0;
	for (let i = 0; i < band.length; i += 4)
		if (band[i] > 200 && band[i + 1] > 200 && band[i + 2] > 200) white++;
	return { size: `${video.videoWidth}x${video.videoHeight}`, white };
});
check(
	'the burnt file decodes and carries the subtitle in the bottom band',
	burned.size === '320x180' && burned.white > 40,
	JSON.stringify(burned),
);

// position: presets, keys, drag with snap
const top = (style) => Number(/inset-block-start: ([\d.]+)%/.exec(style ?? '')?.[1]);
const start = (style) => Number(/inset-inline-start: (-?[\d.]+)%/.exec(style ?? '')?.[1]);
await press('.ss-place', 'Top');
await sleep(100);
s = await state();
check('Top moves the subtitle to the top', top(s.handle) < 20, s.handle);
check('a new look drops the burnt file', !(await page.$('.media-job-result')));
await press('.ss-place', 'Bottom');
await sleep(100);
const bottomHandle = (await state()).handle;
await page.focus('.ss-handle');
await page.keyboard.press('ArrowRight');
await sleep(100);
s = await state();
check(
	'the handle takes the arrow keys',
	start(s.handle) > start(bottomHandle) && top(s.handle) === top(bottomHandle),
	`${bottomHandle} → ${s.handle}`,
);
const grip = await page.$eval('.ss-handle', (el) => {
	const box = el.getBoundingClientRect();
	return { x: box.left + box.width / 2, y: box.top + box.height / 2 };
});
const guides = () =>
	page.evaluate(() => ({
		count: document.querySelectorAll('.ss-guide').length,
		snapped: !!document.querySelector('.ss-guide--centre.ss-guide--snapped'),
	}));
await page.mouse.move(grip.x, grip.y);
await page.mouse.down();
await page.mouse.move(grip.x + 30, grip.y - 40, { steps: 3 });
await sleep(50);
const far = await guides();
await page.mouse.move(grip.x - 4, grip.y - 40, { steps: 3 });
await sleep(50);
const near = await guides();
await page.mouse.up();
await sleep(50);
const dragged = { guides: far.count, snapped: far.snapped, snappedNear: near.snapped, after: (await guides()).count };
s = await state();
check(
	'a drag shows the guides and snaps to the centre line',
	dragged.guides === 2 && !dragged.snapped && dragged.snappedNear && top(s.handle) < top(bottomHandle),
	JSON.stringify({ ...dragged, handle: s.handle }),
);

// paste anywhere: a subtitle file replaces the cues
await page.evaluate(() => document.activeElement?.blur());
await pasteFile('long.srt', many(30), '');
await page.waitForFunction(() => document.querySelectorAll('.ss-cues .cue-row').length === 30, {
	timeout: 5000,
});
check('a pasted SRT replaces the cues', (await state()).subs === 'long.srt');

// the floating footer never covers the last row at scroll end
const footerClear = () =>
	page.evaluate(async () => {
		const body = document.querySelector('.subtitle-studio .canon-split-body');
		const main = document.querySelector('.subtitle-studio .canon-split-main');
		const scrollers = [body, main].filter((el) => el.scrollHeight > el.clientHeight + 1);
		for (const el of scrollers) el.scrollTop = el.scrollHeight;
		await new Promise((r) => setTimeout(r, 200));
		const footer = document.querySelector('.canon-split-footer').getBoundingClientRect();
		// the last row of whatever column the footer floats over
		const column = [...document.querySelectorAll('.subtitle-studio .canon-split-pane > :not(.canon-split-footer)')]
			.map((el) => el.getBoundingClientRect())
			.filter((box) => box.height > 0 && box.left < footer.right && box.right > footer.left);
		const lastBottom = Math.max(...column.map((box) => box.bottom));
		const rows = document.querySelectorAll('.ss-cues .cue-row');
		return {
			lastBottom: Math.round(lastBottom),
			lastCue: Math.round(rows[rows.length - 1].getBoundingClientRect().bottom),
			footerTop: Math.round(footer.top),
			scrolls: scrollers.length,
		};
	});
let clear = await footerClear();
check(
	'1400: the footer clears the last cue row at scroll end',
	clear.lastBottom <= clear.footerTop && clear.lastCue <= clear.footerTop,
	JSON.stringify(clear),
);
await page.setViewport({ width: 390, height: 844 });
await sleep(400);
clear = await footerClear();
check('390: the footer clears the last row at scroll end', clear.lastBottom <= clear.footerTop, JSON.stringify(clear));
check(
	'390: no horizontal scroll',
	await page.evaluate(() => {
		const body = document.querySelector('.subtitle-studio .canon-split-body');
		return body.scrollWidth <= body.clientWidth && document.documentElement.scrollWidth <= 390;
	}),
);
await page.setViewport({ width: 1400, height: 1000 });
await sleep(300);

// clears
await page.$$eval('.ss-subs .canon-button', (els) => els[0].click());
await sleep(100);
s = await state();
check('Clear on the subtitles row keeps the video and empties the list', s.subsDrop && s.rows === 0 && s.preview);
await page.$$eval('.ss-video .canon-button', (els) => els[0].click());
await sleep(100);
s = await state();
check(
	'Clear on the video row returns to the empty state',
	s.videoDrop && !s.preview && s.blankPicture && s.footer && s.transportOff && s.band === BAND,
	JSON.stringify(s),
);

// a bad subtitle file warns
await pasteFile('broken.srt', 'not subtitles', '');
await sleep(200);
check('a file with no cues warns', !!(await page.$('.ss-subs-error')));

// launch flags
await visit(
	page,
	`/tools/subtitle-studio?ssFont=2&ssText=1&ssWeight=1&ssSubs=${encodeURIComponent(SRT)}`,
);
s = await state();
check('?ssSubs= loads cues', s.rows === 2 && s.subs === 'subtitles.srt', JSON.stringify(s));
await makeClip(page, { ms: 600, name: 'flag.webm' });
await dropClip(page, '.subtitle-studio');
await page.waitForSelector('.ss-font', { timeout: 5000 });
check(
	'?ssFont= ?ssText= ?ssWeight= set the look',
	(await selected('.ss-font')) === 'Mono' &&
		(await selected('.ss-text')) === 'Box' &&
		(await selected('.ss-weight')) === 'Bold',
);

await finish(browser);
