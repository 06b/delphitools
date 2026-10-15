// the canon audio-atlas: slot, band, MediaInfo and loudness tiles, sheet, zoom, transport, open-in
import {
	launch,
	visit,
	check,
	finish,
	sleep,
	makeWav,
	dropClip,
} from './harness.mjs';

const { browser, page } = await launch();
await visit(page, '/tools/audio-atlas');

const report = () =>
	page.evaluate(() => {
		const out = {};
		let title = '';
		for (const el of document.querySelectorAll(
			'.media-sections .canon-heading, .media-sections .canon-tiles-tile',
		)) {
			if (el.matches('.canon-heading')) {
				title = el.textContent.trim();
				out[title] = {};
			} else
				out[title][
					el.querySelector('.canon-tiles-label').textContent.trim()
				] = {
					value: el.querySelector('.canon-tiles-value').textContent.trim(),
					level: !!el.querySelector('.canon-tiles-level'),
				};
		}
		return out;
	});
const painted = (selector) =>
	page.evaluate((sel) => {
		const canvas = document.querySelector(sel);
		if (!canvas?.width) return false;
		const { data } = canvas
			.getContext('2d')
			.getImageData(0, 0, canvas.width, canvas.height);
		for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true;
		return false;
	}, selector);
const view = () =>
	page.$eval('.aa-view .canon-row-detail', (el) => el.textContent.trim());
const audioTime = () => page.$eval('.aa-audio', (a) => a.currentTime);
const head = () =>
	page.evaluate(() => {
		const el = document.querySelector('.aa-head');
		return el ? parseFloat(el.style.insetInlineStart) : -1;
	});
// a press on the sheet at a share of its width, with a drag of `dx` px
const press = async (share, dx = 0, y = 60) => {
	const box = await page.$eval('.aa-scrub', (el) => {
		const { left, top, width } = el.getBoundingClientRect();
		return { left, top, width };
	});
	const x = box.left + box.width * share;
	await page.mouse.move(x, box.top + y);
	await page.mouse.down();
	if (dx) await page.mouse.move(x + dx, box.top + y, { steps: 4 });
	await page.mouse.up();
	await sleep(30);
};
// at max scroll the floating footer leaves the last row clear
const footerClear = () =>
	page.evaluate(async () => {
		const footer = document.querySelector('.canon-split-footer');
		const pane = footer.parentElement;
		const stacked = getComputedStyle(pane).display === 'contents';
		const scroller = stacked ? pane.closest('.canon-split-body') : pane;
		scroller.scrollTop = scroller.scrollHeight;
		await new Promise((r) =>
			requestAnimationFrame(() => requestAnimationFrame(r)),
		);
		const rows = [
			...(stacked
				? document.querySelectorAll('.canon-split-pane > *')
				: pane.children),
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
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.audio-atlas').getBoundingClientRect().height,
	),
);
check(
	'empty: the drop slot with the web wording, no report or footer',
	await page.evaluate(
		() =>
			document.querySelector('.aa-slot')?.textContent.trim() ===
				'Drop an audio file here or click to upload' &&
			!document.querySelector('.media-sections') &&
			!document.querySelector('.media-transport'),
	),
);

await page.evaluate(() => {
	const transfer = new DataTransfer();
	transfer.items.add(new File(['x'], 'notes.txt', { type: 'text/plain' }));
	document.dispatchEvent(
		new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true }),
	);
});
await sleep(200);
check(
	'a paste that is not audio is ignored',
	!!(await page.$('.aa-slot')) && !(await page.$('.aa-source')),
);

await makeWav(page, { seconds: 4, amplitude: 0.5, frequency: 440 });
await dropClip(page, '.audio-atlas');
await page.waitForSelector('.aa-sheet', { timeout: 15000 });
await page.waitForFunction(
	() => /LUFS/.test(document.querySelector('.media-sections')?.textContent),
	{ timeout: 15000 },
);
await page.waitForFunction(
	() => /General/.test(document.querySelector('.media-sections')?.textContent),
	{ timeout: 20000 },
);
const detail = await page.$eval('.aa-source .canon-row-detail', (el) =>
	el.textContent.trim(),
);
check(
	'the source row: length, rate, channels',
	/^4\.00 s · \d+ Hz · 2 ch$/.test(detail),
	detail,
);
const r = await report();
check(
	'MediaInfo reports the container, size, length and the audio stream',
	r.General?.Container?.value === 'Wave' &&
		/MB|KB/.test(r.General?.Size?.value ?? '') &&
		r.General?.Duration?.value === '00:00:04.000' &&
		r['Audio #1']?.['Sample rate']?.value === '48000 Hz' &&
		r['Audio #1']?.Channels?.value === '2',
	JSON.stringify(r).slice(0, 400),
);
check(
	'Loudness: the peak of a half-scale sine reads -6 dBFS, RMS -9, LUFS measured, each over a level bar',
	/^-6\.\d dBFS$/.test(r.Loudness?.Peak?.value) &&
		/^-9\.\d dBFS$/.test(r.Loudness?.RMS?.value) &&
		/^-\d+\.\d LUFS$/.test(r.Loudness?.Loudness?.value) &&
		r.Loudness.Peak.level &&
		r.Loudness.RMS.level &&
		r.Loudness.Loudness.level,
	JSON.stringify(r.Loudness),
);
check('the band waveform is painted', await painted('.aa-band .media-wave-canvas'));
check('the sheet waveform is painted', await painted('.aa-wave'));
await page.waitForFunction(() => !document.querySelector('.aa-loader'), {
	timeout: 15000,
});
check('the spectrogram is painted', await painted('.aa-spectro'));
check(
	'the plate reads the kHz at a quarter, half and three quarters',
	(await page.$$eval('.aa-hz', (els) => els.map((e) => e.textContent.trim())))
		.join() === '6 kHz,12 kHz,18 kHz',
);
check(
	'the ruler labels the seconds',
	(
		await page.$$eval('.aa-tick-label', (els) =>
			els.map((e) => e.textContent.trim()),
		)
	).includes('2.0'),
);
const ink = () =>
	page.$eval('.aa-wave', (canvas) => {
		const { data } = canvas
			.getContext('2d')
			.getImageData(0, 0, canvas.width, canvas.height);
		for (let i = 3; i < data.length; i += 4)
			if (data[i] > 0) return [...data.slice(i - 3, i)].join();
		return '';
	});
const flip = () =>
	page.evaluate(() => {
		const root = document.documentElement.classList;
		const dark = root.contains('dark');
		root.toggle('dark', !dark);
		root.toggle('light', dark);
	});
const lightInk = await ink();
await flip();
await sleep(100);
check(
	'a theme change repaints the sheet waveform',
	lightInk !== '' && (await ink()) !== lightInk,
	lightInk,
);
await flip();
check(
	'the sheet is a named slider reading the view',
	await page.evaluate(() => {
		const s = document.querySelector('.aa-scrub');
		return (
			s.getAttribute('role') === 'slider' &&
			s.getAttribute('aria-label') === 'Waveform' &&
			s.getAttribute('aria-valuetext') === '0.00 – 4.00' &&
			s.tabIndex === 0
		);
	}),
);
check(
	'unzoomed: Zoom out and Reset zoom wait, Zoom in is on, all named',
	await page.evaluate(
		() =>
			document.querySelector('.aa-zoom-out').disabled &&
			document.querySelector('.aa-fit').disabled &&
			!document.querySelector('.aa-zoom-in').disabled &&
			document.querySelector('.aa-zoom-out').getAttribute('aria-label') ===
				'Zoom out',
	),
);
check('the view row reads the whole file', (await view()) === '0.00 – 4.00');
check(
	'open-in lists the audio tools, not this one',
	await page.evaluate(() => {
		const ids = [...document.querySelectorAll('.aa-open [data-tool]')].map(
			(a) => a.dataset.tool,
		);
		return ids.includes('audio-trimmer') && !ids.includes('audio-atlas');
	}),
);

await press(0.75);
await sleep(100);
check(
	'a press on the sheet seeks there; the head shows on sheet and band',
	Math.abs((await audioTime()) - 3) < 0.05 &&
		Math.abs((await head()) - 75) < 1 &&
		!!(await page.$('.aa-band .media-head')),
	`${await audioTime()} ${await head()}`,
);
await page.focus('.aa-scrub');
await page.keyboard.press('ArrowRight');
await sleep(50);
check(
	'the arrow keys nudge the playhead a twentieth of the view',
	Math.abs((await audioTime()) - 3.2) < 0.01,
	String(await audioTime()),
);

await page.click('.media-play');
await sleep(300);
check(
	'Play runs the transport and the counter',
	await page.evaluate(
		() =>
			document.querySelector('.media-play').textContent.trim() === 'Pause' &&
			document.querySelector('.aa-audio').currentTime > 3.2,
	),
);
await page.click('.media-stop');
await sleep(100);
check(
	'Stop parks at the start, the head goes',
	(await audioTime()) === 0 && (await head()) === -1,
);

await page.click('.aa-zoom-in');
await sleep(50);
check('Zoom in halves the view round its centre', (await view()) === '1.00 – 3.00');
check(
	'zoomed, the band dims the file outside the view',
	(await page.$$('.aa-band .media-shade')).length === 2,
);
await press(0.5, -100);
await sleep(50);
const panned = await view();
check(
	'a drag pans the zoomed view, the length kept',
	panned !== '1.00 – 3.00' &&
		(() => {
			const [a, b] = panned.split(' – ').map(Number);
			return a > 1 && Math.abs(b - a - 2) < 0.011;
		})(),
	panned,
);
check('a drag does not seek', (await audioTime()) === 0);
await page.click('.aa-fit');
check('Reset zoom fits the file', (await view()) === '0.00 – 4.00');

await page.evaluate(() => {
	const sheet = document.querySelector('.aa-scrub');
	const box = sheet.getBoundingClientRect();
	sheet.dispatchEvent(
		new WheelEvent('wheel', {
			deltaY: -69.3,
			ctrlKey: true,
			clientX: box.left + box.width / 4,
			clientY: box.top + 60,
			bubbles: true,
			cancelable: true,
		}),
	);
});
await sleep(50);
check(
	'a ctrl-wheel (a trackpad pinch) zooms round the pointer',
	(await view()) === '0.50 – 2.50',
	await view(),
);
await sleep(300);
await page.waitForFunction(() => !document.querySelector('.aa-loader'), {
	timeout: 15000,
});
check(
	'the spectrogram rescans the view',
	await page.$eval(
		'.aa-spectro',
		(c) =>
			Math.abs(parseFloat(c.style.insetInlineStart)) < 0.1 &&
			Math.abs(parseFloat(c.style.inlineSize) - 100) < 0.1,
	),
	await page.$eval('.aa-spectro', (c) => c.getAttribute('style')),
);
await page.click('.aa-zoom-out');
check('Zoom out doubles the view', (await view()) === '0.00 – 3.50');
await page.click('.aa-fit');

await page.click('.aa-zoom-in');
await page.click('.media-loop');
check(
	'Loop latches',
	await page.$eval('.media-loop', (b) => b.getAttribute('aria-pressed') === 'true'),
);
await page.click('.media-play');
await page.waitForFunction(
	() => document.querySelector('.aa-audio').currentTime > 2.6,
	{ timeout: 5000 },
);
await sleep(700);
const looped = await audioTime();
check(
	'Loop plays the view: from its start, wrapping at its end',
	looped >= 0.99 && looped <= 3.05,
	String(looped),
);
await page.click('.media-stop');
check('Stop parks at the view start while looping', Math.abs((await audioTime()) - 1) < 0.01);
await page.click('.media-loop');
await page.click('.aa-fit');

await page.focus('.aa-band .media-scrub');
await page.keyboard.press('ArrowRight');
await sleep(50);
check('the band scrubs with the keys', Math.abs((await audioTime()) - 1) < 0.01);

let clear = await footerClear();
check(
	'wide: at the end of the scroll the footer clears the last row',
	clear.ok,
	JSON.stringify(clear),
);

await page.evaluate(() =>
	[...document.querySelectorAll('.aa-source button')]
		.find((b) => b.textContent.trim() === 'Clear')
		.click(),
);
await sleep(200);
check(
	'Clear returns to the slot',
	!!(await page.$('.aa-slot')) &&
		!(await page.$('.aa-sheet')) &&
		!(await page.$('.media-sections')),
);

// paste anywhere loads; ?atlasZoom and ?atlasLoop as the iOS launch arguments
await visit(page, '/tools/audio-atlas?atlasZoom=yes');
await makeWav(page, { seconds: 10, name: 'paste.wav' });
await page.evaluate(() => {
	const transfer = new DataTransfer();
	transfer.items.add(window.__clip);
	document.dispatchEvent(
		new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true }),
	);
});
await page.waitForSelector('.aa-sheet', { timeout: 15000 });
await sleep(100);
check(
	'paste loads; ?atlasZoom=yes shows 30 to 50 %',
	(await view()) === '3.00 – 5.00',
	await view(),
);

await visit(page, '/tools/audio-atlas?atlasZoom=yes&atlasLoop=yes');
await makeWav(page, { seconds: 10, name: 'loop.wav' });
await dropClip(page, '.audio-atlas');
await page.waitForFunction(
	() =>
		document.querySelector('.media-loop')?.getAttribute('aria-pressed') ===
		'true',
	{ timeout: 15000 },
);
await sleep(600);
const t = await audioTime();
check(
	'?atlasLoop=yes loops the view',
	t >= 3 &&
		t <= 5.05 &&
		(await page.evaluate(
			() => document.querySelector('.media-play').textContent.trim() === 'Pause',
		)),
	String(t),
);
await page.click('.media-stop');

await page.setViewport({ width: 390, height: 844 });
await sleep(400);
check(
	'phone: nothing scrolls sideways',
	await page.evaluate(
		() =>
			document.documentElement.scrollWidth <=
			document.documentElement.clientWidth,
	),
);
check(
	'phone: the main pane leads the report',
	await page.evaluate(
		() =>
			document.querySelector('.aa-source').getBoundingClientRect().top <
			document.querySelector('.media-sections').getBoundingClientRect().top,
	),
);
clear = await footerClear();
check(
	'phone: at the end of the scroll the footer clears the last row',
	clear.ok,
	JSON.stringify(clear),
);

await finish(browser);
