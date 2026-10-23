// the canon audio-normaliser: slot, picture, target, readings, render
// 1khz: -20dbfs ≈ -20lufs
import {
	launch,
	visit,
	check,
	finish,
	sleep,
	makeWav,
	dropClip,
	captureObjectUrl,
} from './harness.mjs';

const { browser, page } = await launch();
await visit(page, '/tools/audio-normaliser');

const tiles = () =>
	page.evaluate(() =>
		Object.fromEntries(
			[...document.querySelectorAll('.an-readings .canon-tiles-tile')].map((tile) => [
				tile.querySelector('.canon-tiles-label')?.textContent?.trim(),
				tile.querySelector('.canon-tiles-value')?.textContent?.trim(),
			]),
		),
	);
const pick = (text) =>
	page.evaluate(
		(text) =>
			[...document.querySelectorAll('.an-targets [role="radio"]')]
				.find((b) => b.textContent.trim() === text)
				.click(),
		text,
	);
const figure = () =>
	page.evaluate(() => document.querySelector('.an-figure')?.textContent.replace(/\s+/g, '') ?? '');

check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.audio-normaliser').getBoundingClientRect().height,
	),
);
const band = () => page.evaluate(() => document.querySelector('.audio-normaliser .canon-canvas').getBoundingClientRect().height);
check('empty: the band is the shared A/V height', (await band()) === 138, String(await band()));
check(
	'empty: the Source row is the drop slot with the web wording, Normalise off, Target on',
	await page.evaluate(
		() =>
			document.querySelector('.an-slot.media-slot--row')?.textContent.trim() === 'Drop an audio file' &&
			[...document.querySelectorAll('.audio-normaliser .canon-heading')].some((h) => h.textContent.trim() === 'Source') &&
			document.querySelector('.media-job-run')?.disabled === true &&
			[...document.querySelectorAll('.an-targets [role="radio"]')].every((b) => !b.disabled),
	),
);
check(
	'empty: the loaded layout in blank: empty picture, hyphen figure, dashed tiles, empty meters',
	await page.evaluate(
		() =>
			!!document.querySelector('.an-picture canvas.an-wave') &&
			document.querySelector('.an-figure')?.textContent.replace(/\s+/g, '') === '-.-dB-.-dB' &&
			[...document.querySelectorAll('.an-readings .canon-tiles-label')].map((l) => l.textContent.trim()).join() ===
				'Loudness,Peak,Gain,Output peak' &&
			[...document.querySelectorAll('.an-readings .canon-tiles-value')].every((v) => v.textContent.trim() === '\u2014') &&
			document.querySelectorAll('.an-readings .canon-tiles-level').length === 3,
	),
	await figure(),
);

await captureObjectUrl(page);
await makeWav(page, { amplitude: 0.1, name: 'tone.wav' });
await dropClip(page, '.audio-normaliser');
await page.waitForFunction(
	() => document.querySelectorAll('.an-readings .canon-tiles-tile').length === 4,
	{ timeout: 15000 },
);
const rows = await tiles();
check(
	'measures about -20 LUFS / -20 dBFS and plans about +6 dB to -14',
	/^-(19|20)\.\d LUFS$/.test(rows.Loudness ?? '') &&
		/^-20\.0 dBFS$/.test(rows.Peak ?? '') &&
		/^\+[56]\.\d dB$/.test(rows.Gain ?? ''),
	JSON.stringify(rows),
);
check(
	'the source row: length, rate and channels',
	(await page.$eval('.an-source .canon-row-detail', (el) => el.textContent.trim())) ===
		'3.00 s · 48000 Hz · 2 ch',
);
check('loaded: the band is the shared A/V height', (await band()) === 138, String(await band()));
check('the picture shows the gain as a figure', /^\+[56]\.\ddB/.test(await figure()), await figure());
check(
	'loudness tiles carry level bars',
	(await page.$$('.an-readings .canon-tiles-level')).length === 3,
);

await pick('-23');
check(
	'switching the target to -23 re-plans without re-measuring',
	/^-[23]\.\d dB$/.test((await tiles()).Gain ?? '') &&
		(await page.$eval('.an-target .canon-row-detail', (el) => el.textContent.trim())) === 'Broadcast',
	JSON.stringify(await tiles()),
);
await pick('-14');

await page.click('.media-job-run');
await page.waitForSelector('.media-job-result', { timeout: 30000 });
const result = await page.evaluate(async () => {
	const blob = window.__result;
	const ctx = new AudioContext();
	const buffer = await ctx.decodeAudioData(await blob.arrayBuffer());
	let peak = 0;
	for (let c = 0; c < buffer.numberOfChannels; c++)
		for (const v of buffer.getChannelData(c)) peak = Math.max(peak, Math.abs(v));
	return {
		name: document.querySelector('.media-job-result .canon-row-title')?.textContent?.trim(),
		label: document.querySelector('.media-job-result .canon-row-detail')?.textContent?.trim(),
		peakDb: 20 * Math.log10(peak),
		player: !!document.querySelector('audio.an-player'),
	};
});
check(
	'the render lands at -14 LUFS with the peak raised by the same gain',
	result.name === 'tone-normalised.wav' &&
		/^wav · .* · -1[34]\.\d LUFS$/.test(result.label ?? '') &&
		result.peakDb > -15 &&
		result.peakDb < -13 &&
		result.player,
	JSON.stringify(result),
);

// a loud file: the gain caps at -1 dBFS
// k-weighting cuts 20 hz: low loudness, high peak
await makeWav(page, { amplitude: 0.9, frequency: 20, name: 'loud.wav' });
await page.evaluate(() => {
	const data = new DataTransfer();
	data.items.add(window.__clip);
	document
		.querySelector('.audio-normaliser .canon-split-main')
		.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
});
await page.waitForFunction(
	() => document.querySelector('.an-source .canon-row-title')?.textContent.trim() === 'loud.wav' &&
		document.querySelectorAll('.an-readings .canon-tiles-tile').length === 4,
	{ timeout: 15000 },
);
check(
	'a paste anywhere loads; a loud file says the gain is capped',
	await page.evaluate(() =>
		document.querySelector('.an-readings .canon-empty-row')?.textContent.includes('Gain capped at -1 dBFS peak'),
	),
);

await page.evaluate(() =>
	[...document.querySelectorAll('.an-source button')].find((b) => b.textContent.trim() === 'Clear').click(),
);
await sleep(200);
check(
	'Clear returns to the slot and the blank tiles',
	!!(await page.$('.an-slot')) &&
		!(await page.$('.media-job-result')) &&
		(await tiles()).Gain === '\u2014',
);

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/audio-normaliser');
check(
	'phone: nothing scrolls sideways',
	await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
);

await finish(browser);
