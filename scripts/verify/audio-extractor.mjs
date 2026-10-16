// the canon audio-extractor: slot, band, formats, extract, transport, paste, drop
// wav re-encodes, ogg stream-copies
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
await visit(page, '/tools/audio-extractor');

const formats = () =>
	page.$$eval('.ax-formats [role="radio"]', (cells) =>
		cells.map((c) => `${c.textContent.trim()}${c.disabled ? '!' : ''}`),
	);
const pick = (text) =>
	page.evaluate(
		(text) =>
			[...document.querySelectorAll('.ax-formats [role="radio"]')]
				.find((b) => b.textContent.trim() === text)
				.click(),
		text,
	);
const resultDetail = () =>
	page.$eval('.media-job-result .canon-row-detail', (el) => el.textContent.trim());

check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.audio-extractor').getBoundingClientRect().height,
	),
);
check(
	'empty: the band is the drop slot, a button with the web wording',
	await page.evaluate(
		() =>
			document.querySelector('.ax-slot')?.tagName === 'BUTTON' &&
			document.querySelector('.ax-slot').textContent.trim() === 'Drop a video file',
	),
);
check(
	'empty: Extract is off and the transport hidden',
	await page.evaluate(
		() =>
			document.querySelector('.media-job-run')?.disabled === true &&
			!document.querySelector('.media-transport'),
	),
);
check(
	'empty: the counter shows hyphens',
	await page.evaluate(() => !/\d/.test(document.querySelector('.canon-timecode')?.textContent ?? '')),
);

await captureObjectUrl(page);
await makeClip(page, { audio: true, ms: 1500, name: 'tone.webm' });
await dropClip(page, '.audio-extractor');
await page.waitForFunction(
	() => document.querySelector('.media-job-run')?.disabled === false,
	{ timeout: 15000 },
);
const detail = await page.$eval('.ax-source .canon-row-detail', (el) => el.textContent.trim());
check(
	'a drop anywhere loads: the row shows length, codec and sample rate',
	/^00:00:0\d\.\d{3} · opus · \d+ Hz$/.test(detail),
	detail,
);
check(
	'formats: WAV and Ogg enabled',
	(await formats()).join('|').match(/^WAV\|M4A \(AAC\)!?\|Ogg \(Opus\)\|FLAC!?$/) !== null,
	(await formats()).join('|'),
);
await page.waitForFunction(() => document.querySelectorAll('.media-frame').length > 0, {
	timeout: 15000,
});
check('the band shows frames', (await page.$$('.media-frame')).length > 0);
check(
	'the band shows the waveform and the length',
	await page.evaluate(() => /1\.\d\d/.test(document.querySelector('.canon-timecode')?.textContent ?? '')) &&
		!!(await page.$('.media-wave-canvas')),
);

await page.click('.media-job-run');
await page.waitForSelector('.media-job-result', { timeout: 30000 });
const wav = await page.evaluate(async () => {
	const blob = window.__result;
	const ctx = new AudioContext();
	const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
	return { type: blob.type, duration: buffer.duration, channels: buffer.numberOfChannels };
});
check(
	'WAV decodes to ~1.5 s of audio',
	wav.type === 'audio/wav' && Math.abs(wav.duration - 1.5) < 0.4 && wav.channels >= 1,
	JSON.stringify(wav),
);
check(
	'the result row names the file with type and size',
	(await page.$eval('.media-job-result .canon-row-title', (el) => el.textContent.trim())) === 'tone.wav' &&
		/^wav · /.test(await resultDetail()),
	await resultDetail(),
);
check(
	'Download is labelled Download',
	(await page.$eval('.media-job-save', (el) => el.textContent.trim())) === 'Download',
);
await page.waitForSelector('.media-sections', { timeout: 15000 }).catch(() => {});
check(
	'the sidebar reports the result',
	await page.evaluate(() =>
		[...document.querySelectorAll('.media-sections .canon-tiles-value')].some(
			(el) => el.textContent.trim() === 'Wave',
		),
	),
);

// transport plays the result
await page.click('.media-play');
await sleep(500);
const playing = await page.evaluate(() => ({
	text: document.querySelector('.media-play').textContent.trim(),
	head: !!document.querySelector('.media-head'),
	src: document.querySelector('.audio-extractor video').src === document.querySelector('.audio-extractor video').currentSrc,
	time: document.querySelector('.audio-extractor video').currentTime,
}));
check(
	'Play plays the result: Pause shows, the head moves',
	playing.text === 'Pause' && playing.head && playing.time > 0,
	JSON.stringify(playing),
);
await page.click('.media-play');
await page.click('.media-stop');
await sleep(100);
check(
	'Stop parks and the head goes',
	await page.evaluate(
		() =>
			!document.querySelector('.media-head') &&
			document.querySelector('.media-play').textContent.trim() === 'Play',
	),
);
await page.click('.media-loop');
check(
	'Loop toggles and lights',
	(await page.$eval('.media-loop', (el) => el.getAttribute('aria-pressed'))) === 'true',
);
await page.click('.media-loop');

// scrub by keyboard
await page.focus('.media-scrub');
await page.keyboard.press('ArrowRight');
await sleep(100);
check(
	'the strip is a slider that takes the arrow keys',
	(await page.$eval('.media-scrub', (el) => Number(el.getAttribute('aria-valuenow')))) === 1 &&
		!!(await page.$('.media-head')),
);

await pick('Ogg (Opus)');
check('a new format drops the result', !(await page.$('.media-job-result')));
await page.click('.media-job-run');
await page.waitForSelector('.media-job-result', { timeout: 30000 });
const ogg = await page.evaluate(() => ({ type: window.__result?.type, size: window.__result?.size }));
check(
	'Ogg (Opus) comes out as a copied Opus stream',
	ogg.type === 'audio/ogg' && ogg.size > 0 && /^ogg · /.test(await resultDetail()),
	JSON.stringify(ogg),
);

// paste anywhere replaces the video
await page.evaluate(() => {
	const data = new DataTransfer();
	data.items.add(new File([window.__clip], 'pasted.webm', { type: 'video/webm' }));
	document
		.querySelector('.audio-extractor .canon-split-sidebar')
		.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
});
await page.waitForFunction(
	() => document.querySelector('.ax-source .canon-row-title')?.textContent.trim() === 'pasted.webm',
	{ timeout: 10000 },
);
check('a paste anywhere loads the video and drops the result', !(await page.$('.media-job-result')));

await page.evaluate(() =>
	[...document.querySelectorAll('.ax-source button')].find((b) => b.textContent.trim() === 'Clear').click(),
);
await sleep(200);
check(
	'Clear returns to the slot',
	!!(await page.$('.ax-slot')) && !(await page.$('.ax-source')),
);

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/audio-extractor');
check(
	'phone: the band leads and nothing scrolls sideways',
	await page.evaluate(
		() =>
			document.documentElement.scrollWidth <= document.documentElement.clientWidth &&
			document.querySelector('.audio-extractor .canon-readout-band').getBoundingClientRect().top <
				document.querySelector('.ax-formats').getBoundingClientRect().top,
	),
);

await page.setViewport({ width: 800, height: 800 });
await visit(page, '/tools/audio-extractor');
const bannerGap = await page.evaluate(
	() =>
		document.querySelector('.canon-split-banner').getBoundingClientRect().top -
		document.querySelector('.canon-split-body').getBoundingClientRect().top,
);
check('stacked: the band meets the top edge', bannerGap === 0, bannerGap);

await finish(browser);
