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
check(
	'empty: the band is the drop slot with the web wording, Mute off',
	await page.evaluate(
		() =>
			document.querySelector('.vm-slot')?.textContent.trim() === 'Drop a video here' &&
			document.querySelector('.media-job-run')?.disabled === true &&
			!document.querySelector('.vm-preview'),
	),
);

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
check(
	'Clear returns to the slot',
	!!(await page.$('.vm-slot')) && !(await page.$('.vm-preview')),
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

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/video-muter');
check(
	'phone: nothing scrolls sideways',
	await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
);

await finish(browser);
