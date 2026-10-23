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
const bandHeight = () =>
	page.evaluate(() => ({
		band: document.querySelector('.video-atlas .canon-canvas').getBoundingClientRect().height,
		strip: document.querySelector('.media-strips').getBoundingClientRect().height,
	}));
const headings = () =>
	page.evaluate(() =>
		[...document.querySelectorAll('.video-atlas .canon-heading')].map((h) => h.textContent.trim()).join('|'),
	);
const shots = async (state) => {
	if (!process.env.SHOTS) return;
	for (const [w, h] of [
		[390, 844],
		[1400, 1000],
	])
		for (const theme of ['light', 'dark']) {
			await page.setViewport({ width: w, height: h });
			await page.evaluate((t) => {
				document.documentElement.classList.remove('light', 'dark');
				document.documentElement.classList.add(t);
			}, theme);
			await sleep(400);
			await page.screenshot({ path: `${process.env.SHOTS}/video-atlas-${state}-${w}-${theme}.png` });
		}
	await page.setViewport({ width: 1400, height: 1000 });
	await sleep(300);
};

check(
	'empty: the Source row is the drop slot, a button with the web wording',
	await page.evaluate(
		() =>
			document.querySelector('.va-slot.media-slot--row')?.tagName === 'BUTTON' &&
			document.querySelector('.va-slot').textContent.trim() === 'Drop a video here',
	),
);
check(
	'empty: blank frame cells, no waveform, dashed General/Video/Audio info',
	await page.evaluate(
		() =>
			document.querySelectorAll('.media-strips--blank .media-frame--blank').length > 0 &&
			!document.querySelector('.media-wave') &&
			[...document.querySelectorAll('.media-sections .canon-heading')].map((h) => h.textContent.trim()).join('|') ===
				'General|Video #1|Audio #1' &&
			[...document.querySelectorAll('.media-sections .canon-tiles-value')].every(
				(v) => v.textContent.trim() === '\u2014',
			),
	),
);
check(
	'empty: the counter shows hyphens',
	await page.evaluate(() => !/\d/.test(document.querySelector('.canon-timecode')?.textContent ?? '')),
);
const emptyBand = await bandHeight();
check('empty: the band is bandHeight (138) tall', emptyBand.band === 138, JSON.stringify(emptyBand));
const previewBox = () =>
	page.evaluate(() => {
		const { x, y, width, height } = document.querySelector('.va-preview').getBoundingClientRect();
		return JSON.stringify([x, y, width, height].map(Math.round));
	});
check(
	'empty: the picture is a blank muted box, no video, 16:9 below the 340 px cap',
	await page.evaluate(() => {
		const preview = document.querySelector('.va-preview');
		const box = preview.querySelector('.canon-canvas-content').getBoundingClientRect();
		const fill = preview.style.getPropertyValue('--canon-canvas-background');
		return (
			!preview.querySelector('video') &&
			(box.height >= 336 || Math.abs(box.width / box.height - 16 / 9) < 0.02) &&
			fill.trim() === 'var(--canon-muted)' &&
			preview.textContent.trim() === ''
		);
	}),
);
const emptyPreview = await previewBox();
check(
	'empty: Copy report, the transport and Full Screen are off',
	await page.evaluate(
		() =>
			document.querySelector('.va-copy').disabled === true &&
			document.querySelector('.media-play')?.disabled === true &&
			document.querySelector('.va-full')?.disabled === true,
	),
);
check(
	'empty: the Open in cells are shown, inert, without this tool',
	await page.evaluate(() => {
		const open = document.querySelector('.media-open--blank');
		const ids = [...(open?.querySelectorAll('[data-tool]') ?? [])].map((a) => a.dataset.tool);
		return open?.inert === true && ids.includes('video-muter') && !ids.includes('video-atlas');
	}),
);
const emptyOrder = await headings();
await shots('empty');

await makeClip(page, { audio: true, name: 'sweep.webm' });
await dropClip(page, '.video-atlas');
await page.waitForFunction(
	() => /WebM|Matroska/.test(document.querySelector('.media-sections .canon-tiles-value')?.textContent ?? ''),
	{ timeout: 30000 },
);
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

await page.waitForFunction(() => document.querySelectorAll('img.media-frame').length > 0, {
	timeout: 15000,
});
check(
	'the band is a filmstrip without a waveform',
	!(await page.$('.media-wave')) && !(await page.$('.media-frame--blank')),
);
const loadedBand = await bandHeight();
check(
	'loaded: the band is bandHeight (138) tall, the filmstrip as tall as empty',
	loadedBand.band === 138 && loadedBand.strip === emptyBand.strip,
	JSON.stringify(loadedBand),
);
check('loaded: the picture keeps the blank box size and place (16:9 clip)', (await previewBox()) === emptyPreview, `${emptyPreview} → ${await previewBox()}`);
check('loaded: the same headings in the same order as empty', (await headings()) === emptyOrder, emptyOrder);
check(
	'loaded: the Open in cells are live',
	await page.evaluate(() => !document.querySelector('.media-open--blank') && !document.querySelector('.va-open').inert),
);
await shots('loaded');
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
	'Clear returns to the blank layout',
	!!(await page.$('.va-slot')) &&
		!!(await page.$('.media-strips--blank')) &&
		(await page.evaluate(() =>
			[...document.querySelectorAll('.media-sections .canon-tiles-value')].every(
				(v) => v.textContent.trim() === '\u2014',
			),
		)),
);

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/video-atlas');
check(
	'phone: nothing scrolls sideways',
	await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
);

await finish(browser);
