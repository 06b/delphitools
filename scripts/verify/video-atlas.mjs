// the canon video-atlas: slot, filmstrip band, report, copy, preview, transport
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
await page
	.browserContext()
	.overridePermissions(process.env.BASE_URL ?? 'http://localhost:3000', [
		'clipboard-read',
		'clipboard-write',
		'clipboard-sanitized-write',
	]);
await visit(page, '/tools/video-atlas');

check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.video-atlas').getBoundingClientRect().height,
	),
);
check(
	'empty: the band is the drop slot with the web wording, no transport',
	await page.evaluate(
		() =>
			document.querySelector('.va-slot')?.textContent.trim() === 'Drop a video here' &&
			!document.querySelector('.media-transport'),
	),
);

await makeClip(page, { audio: true, name: 'sweep.webm' });
await dropClip(page, '.video-atlas');
await page.waitForSelector('.media-sections', { timeout: 30000 });
const report = await page.evaluate(() => {
	const out = {};
	let title = '';
	for (const el of document.querySelectorAll('.media-sections .canon-heading, .media-sections .canon-tiles-tile')) {
		if (el.matches('.canon-heading')) {
			title = el.textContent.trim();
			out[title] = {};
		} else
			out[title][el.querySelector('.canon-tiles-label').textContent.trim()] = el
				.querySelector('.canon-tiles-value')
				.textContent.trim();
	}
	return out;
});
check(
	'MediaInfo reports the container and the video stream in the sidebar',
	/WebM|Matroska/.test(report.General?.Container ?? '') &&
		/VP8/.test(report['Video #1']?.Codec ?? '') &&
		(report['Video #1']?.['Frame size'] ?? '').startsWith('320 × 180'),
	JSON.stringify(report),
);
await page.waitForFunction(
	() => /^\d+ streams?$/.test(document.querySelector('.va-source .canon-row-detail')?.textContent.trim() ?? ''),
	{ timeout: 10000 },
);
check(
	'the row counts the streams and Copy report is on',
	await page.$eval('.va-copy', (el) => !el.disabled),
);

await page.click('.va-copy');
await sleep(300);
const copied = await page.evaluate(async () => ({
	text: await navigator.clipboard.readText(),
	toast: document.querySelector('.canon-toast')?.textContent.trim() ?? '',
}));
check(
	'Copy report copies the text report and confirms in the toast',
	copied.text.startsWith('General\n') && /Video #1/.test(copied.text) && /Copied/.test(copied.toast),
	JSON.stringify(copied).slice(0, 120),
);

await page.waitForFunction(() => document.querySelectorAll('.media-frame').length > 0, {
	timeout: 15000,
});
check(
	'the band is a filmstrip without a waveform',
	!(await page.$('.media-wave')) && (await page.$$('.media-frame')).length > 0,
);
check(
	'the preview has no native controls; the transport has Picture in Picture and Full Screen',
	await page.evaluate(
		() =>
			!document.querySelector('.va-preview video').controls &&
			!!document.querySelector('.va-full[aria-label="Full Screen"]'),
	),
);
check(
	'open-in lists the video tools, not this one',
	await page.evaluate(() => {
		const ids = [...document.querySelectorAll('.va-open [data-tool]')].map((a) => a.dataset.tool);
		return ids.includes('video-muter') && !ids.includes('video-atlas');
	}),
);

await page.click('.media-play');
await sleep(400);
check(
	'Play runs the transport and the head moves',
	await page.evaluate(
		() =>
			document.querySelector('.media-play').textContent.trim() === 'Pause' &&
			document.querySelector('.va-preview video').currentTime > 0,
	),
);
await page.click('.media-stop');

await page.evaluate(() =>
	[...document.querySelectorAll('.va-source button')].find((b) => b.textContent.trim() === 'Clear').click(),
);
await sleep(200);
check(
	'Clear returns to the slot',
	!!(await page.$('.va-slot')) && !(await page.$('.media-sections')),
);

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/video-atlas');
check(
	'phone: nothing scrolls sideways',
	await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
);

await finish(browser);
