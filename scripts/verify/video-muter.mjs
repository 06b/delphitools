// the canon video-muter: slot, band, preview, containers, mute, transport
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
await visit(page, '/tools/video-muter');

const containers = () =>
	page.$$eval('.vm-containers [role="radio"]', (cells) =>
		cells.map((c) => `${c.textContent.trim()}${c.disabled ? '!' : ''}${c.getAttribute('aria-checked') === 'true' ? '*' : ''}`),
	);
const pick = (text) =>
	page.evaluate(
		(text) =>
			[...document.querySelectorAll('.vm-containers [role="radio"]')]
				.find((b) => b.textContent.trim() === text)
				.click(),
		text,
	);

check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.video-muter').getBoundingClientRect().height,
	),
);
// readoutBandHeight(96): the shared A/V band
const BAND = 138;
const bandHeight = () =>
	page.evaluate(() => document.querySelector('.media-strips')?.closest('.canon-canvas')?.getBoundingClientRect().height);
const blankLayout = () =>
	page.evaluate(() => {
		const preview = document.querySelector('.vm-preview');
		const box = preview?.getBoundingClientRect();
		return (
			document.querySelectorAll('.media-frame--blank').length > 0 &&
			!!document.querySelector('.media-strips--blank .media-wave') &&
			[...document.querySelectorAll('.media-sections .canon-heading')].map((h) => h.textContent.trim()).join('|') ===
				'General|Video #1' &&
			[...document.querySelectorAll('.media-sections .canon-tiles-value')].every((v) => v.textContent.trim() === '—') &&
			[...document.querySelectorAll('.video-muter .canon-heading')].some((h) => h.textContent.trim() === 'Source') &&
			document.querySelector('.vm-slot.media-slot--row')?.textContent.trim() === 'Drop a video here' &&
			preview?.classList.contains('vm-preview--blank') &&
			!preview.querySelector('video') &&
			preview.textContent.trim() === '' &&
			// 16:9 plus the frame, at most 340 tall
			Math.abs(box.height - Math.min((box.width * 9) / 16, 340)) < 3
		);
	});
const emptyControls = () =>
	page.evaluate(
		() =>
			document.querySelector('.media-job-run')?.disabled === true &&
			document.querySelector('.media-play')?.disabled === true &&
			[...document.querySelectorAll('.vm-containers [role="radio"]')].every((c) => !c.disabled),
	);

check(
	'empty: the loaded layout in blank: frame cells, flat wave, dashed info, Source slot, 16:9 box',
	await blankLayout(),
);
check('empty: Containers on, Mute and the transport off', await emptyControls());
check('empty: the band is the shared height', (await bandHeight()) === BAND, String(await bandHeight()));

await captureObjectUrl(page);
await makeClip(page, { audio: true, name: 'tone.webm' });
await dropClip(page, '.video-muter');
await page.waitForFunction(
	() => document.querySelector('.media-job-run')?.disabled === false,
	{ timeout: 15000 },
);
const detail = await page.$eval('.vm-source .canon-row-detail', (el) => el.textContent.trim());
check(
	'a drop loads: size, rate, length and the audio track count',
	/^320 × 180 · .*fps · 00:00:0\d\.\d{3} · 1 audio track$/.test(detail),
	detail,
);
check(
	'the four containers, the source (WebM) chosen, WebM and MKV enabled',
	/WebM\*/.test((await containers()).join('|')) &&
		!/WebM!|MKV!/.test((await containers()).join('|')),
	(await containers()).join('|'),
);
check('loaded: the band is the shared height', (await bandHeight()) === BAND, String(await bandHeight()));
check(
	'loaded: the strips and the preview are no longer blank',
	await page.evaluate(
		() => !document.querySelector('.media-strips--blank') && !document.querySelector('.vm-preview--blank'),
	),
);
check(
	'the preview shows the video, without native controls',
	await page.evaluate(() => {
		const video = document.querySelector('.vm-preview video');
		return !!video?.src && !video.controls;
	}),
);

await pick('MKV');
await page.click('.media-job-run');
await page.waitForSelector('.media-job-result', { timeout: 30000 });
const result = await page.evaluate(() => ({
	name: document.querySelector('.media-job-result .canon-row-title')?.textContent.trim(),
	detail: document.querySelector('.media-job-result .canon-row-detail')?.textContent.trim(),
	failed: !!document.querySelector('.video-muter .canon-status'),
	struck: !!document.querySelector('.media-strips--removed'),
}));
check(
	'mute into MKV: a named result, no failure',
	result.name === 'tone-muted.mkv' && /^mkv · /.test(result.detail ?? '') && !result.failed,
	JSON.stringify(result),
);
check('the band rules out the waveform', result.struck);
check(
	'the preview plays the result',
	await page.evaluate(() => {
		const video = document.querySelector('.vm-preview video');
		return video.src === video.currentSrc && video.src.startsWith('blob:');
	}),
);
await page.click('.media-play');
await sleep(400);
check(
	'Play runs the transport',
	await page.evaluate(
		() =>
			document.querySelector('.media-play').textContent.trim() === 'Pause' &&
			!!document.querySelector('.media-head'),
	),
);
await page.click('.media-stop');

await pick('WebM');
check('a new container drops the result', !(await page.$('.media-job-result')));

await page.evaluate(() =>
	[...document.querySelectorAll('.vm-source button')].find((b) => b.textContent.trim() === 'Clear').click(),
);
await sleep(200);
check('Clear returns to the blank layout', await blankLayout());
check('Clear: Containers on, Mute and the transport off', await emptyControls());
check('Clear: no container chosen', !(await containers()).join('|').includes('*'), (await containers()).join('|'));
await pick('MKV');
check(
	'empty: a container can be picked before a file',
	(await containers()).join('|') === 'MP4|MOV|WebM|MKV*',
	(await containers()).join('|'),
);

// silent video: the warning and no Mute
await makeClip(page, { audio: false, name: 'quiet.webm' });
await dropClip(page, '.video-muter');
await page.waitForFunction(
	() => /No audio track/.test(document.querySelector('.vm-source .canon-row-detail')?.textContent ?? ''),
	{ timeout: 15000 },
);
check(
	'a silent video says No audio track and keeps Mute off',
	await page.$eval('.media-job-run', (el) => el.disabled),
);
await page.waitForFunction(() => !!document.querySelector('.vm-containers [role="radio"]:not([disabled])'), {
	timeout: 15000,
});
check(
	'the pick made before the file holds',
	/MKV\*/.test((await containers()).join('|')),
	(await containers()).join('|'),
);

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/video-muter');
check(
	'phone: nothing scrolls sideways',
	await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
);
check('phone: the blank layout', await blankLayout());
check('phone: the band is the shared height', (await bandHeight()) === BAND, String(await bandHeight()));

await finish(browser);
