// the canon audio-trimmer: blank layout, band, trim editor, fades, zoom, export, transport
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
// the preview gain, to read the live fade
await page.evaluateOnNewDocument(() => {
	const create = AudioContext.prototype.createGain;
	AudioContext.prototype.createGain = function () {
		const node = create.call(this);
		window.__gain = node;
		return node;
	};
});
await visit(page, '/tools/audio-trimmer');

const state = () =>
	page.evaluate(() => {
		const grip = (label) =>
			document.querySelector(`.media-trim-grip[aria-label="${label}"]`);
		const field = (cls) => document.querySelector(`.${cls} input`);
		const slider = (cls) => document.querySelector(`.${cls} [role="slider"]`);
		return {
			start: Number(grip('Start')?.getAttribute('aria-valuenow')),
			end: Number(grip('End')?.getAttribute('aria-valuenow')),
			startField: field('at-start')?.value,
			endField: field('at-end')?.value,
			startDetail: document.querySelector('.at-start .canon-row-detail')?.textContent.trim(),
			fadeIn: Number(slider('at-fade-in')?.getAttribute('aria-valuenow')),
			fadeOut: Number(slider('at-fade-out')?.getAttribute('aria-valuenow')),
			fadeMax: Number(slider('at-fade-in')?.getAttribute('aria-valuemax')),
			counter: document.querySelector('.canon-readout-band .canon-timecode')?.textContent.replace(/\s/g, ''),
			view: document.querySelector('.at-view .canon-row-detail')?.textContent.trim() ?? '',
		};
	});
const typeInto = async (cls, value) => {
	await page.$eval(`.${cls} input`, (input) => {
		input.focus();
		input.select();
	});
	await page.keyboard.type(value);
	await page.keyboard.press('Enter');
	await sleep(100);
};
const press = async (selector, key, times = 1) => {
	await page.focus(selector);
	for (let i = 0; i < times; i++) await page.keyboard.press(key);
	await sleep(50);
};
const painted = (selector) =>
	page.evaluate((sel) => {
		const canvas = document.querySelector(sel);
		if (!canvas?.width) return false;
		const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
		for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return true;
		return false;
	}, selector);
const decoded = () =>
	page.evaluate(async () => {
		const blob = window.__result;
		const buffer = await new AudioContext().decodeAudioData(await blob.arrayBuffer());
		const data = buffer.getChannelData(0);
		const peak = (from, to) => {
			let most = 0;
			for (let i = Math.floor(from * buffer.sampleRate); i < to * buffer.sampleRate; i++)
				most = Math.max(most, Math.abs(data[i]));
			return most;
		};
		return {
			duration: buffer.duration,
			type: blob.type,
			head: peak(0, 0.01),
			middle: peak(0.95, 1.05),
			tail: peak(buffer.duration - 0.01, buffer.duration),
		};
	});
const audioTime = () => page.$eval('.at-audio', (a) => a.currentTime);
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

check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.audio-trimmer').getBoundingClientRect().height,
	),
);
const bandHeight = () =>
	page.$eval('.canon-split-banner .canon-canvas', (el) => Math.round(el.getBoundingClientRect().height));
let band = await bandHeight();
check('empty: the band is the shared 138 px', band === 138, String(band));
check(
	'empty: the Source row is the slot with the web wording',
	await page.evaluate(
		() =>
			document.querySelector('.canon-split-sidebar .at-slot.media-slot--row')?.textContent.trim() ===
				'Drop an audio file here or click to upload',
	),
);
check(
	'empty: the loaded layout in blank: flat band and editor lanes',
	await page.evaluate(
		() =>
			!!document.querySelector('.at-band.media-strips--blank .media-wave') &&
			!!document.querySelector('.at-editor .media-strips--blank .media-wave') &&
			[...document.querySelectorAll('.audio-trimmer .canon-heading')].map((h) => h.textContent.trim()).join() ===
				'Source,Fades',
	),
);
check(
	'empty: no grips; fades, Export, Start, End, Set in, Set out, zoom and the transport are off',
	await page.evaluate(() => {
		const off = (sel) => document.querySelector(sel)?.disabled === true;
		const sliders = [...document.querySelectorAll('.at-fade [role="slider"]')];
		return (
			sliders.length === 2 &&
			sliders.every((s) => s.getAttribute('aria-disabled') === 'true' && s.tabIndex === -1) &&
			['.media-job-run', '.at-start input', '.at-end input', '.at-set-in', '.at-set-out', '.at-zoom-out', '.at-zoom-in', '.at-fit', '.media-play', '.media-loop', '.media-stop'].every(off) &&
			!document.querySelector('.media-trim-grip')
		);
	}),
);

const emptyClear = await footerClear();
check('empty: the footer clears the last row', emptyClear.ok, JSON.stringify(emptyClear));

await page.evaluate(() => {
	const transfer = new DataTransfer();
	transfer.items.add(new File(['x'], 'notes.txt', { type: 'text/plain' }));
	document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true }));
});
await sleep(200);
check('a paste that is not audio is ignored', !!(await page.$('.at-slot')) && !(await page.$('.at-source')));

await captureObjectUrl(page);
await makeWav(page, { seconds: 3, amplitude: 0.5, frequency: 440, channels: 2 });
await dropClip(page, '.audio-trimmer');
await page.waitForFunction(
	() => document.querySelector('.media-job-run')?.disabled === false,
	{ timeout: 15000 },
);
await sleep(300);
let s = await state();
check(
	'a drop selects the whole file: Start 0, End the length, the counter reads the length',
	s.start === 0 && s.end === 3 && s.startField === '0' && s.endField === '3' && s.startDetail === '00:00:00.000' && /^0:03\.00$|3\.00/.test(s.counter ?? ''),
	JSON.stringify(s),
);
const detail = await page.$eval('.at-source .canon-row-detail', (el) => el.textContent.trim());
check('the source row: length, rate, channels', /^3\.00 s · \d+ Hz · 2 ch$/.test(detail), detail);
band = await bandHeight();
check('loaded: the band stays 138 px', band === 138, String(band));
check(
	'loaded: the strips are no longer blank, the fades are on',
	await page.evaluate(
		() =>
			!document.querySelector('.media-strips--blank') &&
			[...document.querySelectorAll('.at-fade [role="slider"]')].every(
				(s) => !s.hasAttribute('aria-disabled') && s.tabIndex === 0,
			),
	),
);
check('the band waveform is painted', await painted('.at-band .media-wave-canvas'));
check('the editor waveform is painted', await painted('.at-editor .media-wave-canvas'));
const ink = () =>
	page.$eval('.at-band .media-wave-canvas', (canvas) => {
		const { data } = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);
		for (let i = 3; i < data.length; i += 4) if (data[i] > 0) return [...data.slice(i - 3, i)].join();
		return '';
	});
const lightInk = await ink();
await page.evaluate(() => {
	const root = document.documentElement.classList;
	const dark = root.contains('dark');
	root.toggle('dark', !dark);
	root.toggle('light', dark);
});
await sleep(100);
check('a theme change repaints the waveform', lightInk !== '' && (await ink()) !== lightInk, lightInk);
await page.evaluate(() => {
	const root = document.documentElement.classList;
	const dark = root.contains('dark');
	root.toggle('dark', !dark);
	root.toggle('light', dark);
});
check('fades start at 0, capped at the cut length', s.fadeIn === 0 && s.fadeOut === 0 && s.fadeMax === 3, JSON.stringify(s));
check('no fade, no curve', !(await page.$('.at-curve')));
check(
	'Set in and Set out wait for a playhead',
	await page.evaluate(
		() => document.querySelector('.at-set-in').disabled && document.querySelector('.at-set-out').disabled,
	),
);

await press('.media-trim-grip[aria-label="Start"]', 'ArrowRight', 5);
s = await state();
check(
	'the Start grip takes the arrow keys, 0.1 s a step',
	s.start === 0.5 && s.startField === '0.5' && s.startDetail === '00:00:00.500',
	JSON.stringify(s),
);
await typeInto('at-end', '2.5');
s = await state();
check('typing End moves the End grip', s.end === 2.5, JSON.stringify(s));
await typeInto('at-start', 'garbage');
s = await state();
check('a field ignores what is not a number', s.start === 0.5, JSON.stringify(s));
check('the band dims the waveform outside the cut', (await page.$$('.at-band .media-shade')).length === 2);
check('the fade sliders stop at the cut length', s.fadeMax === 2, JSON.stringify(s));

await press('.at-fade-in [role="slider"]', 'End');
await press('.at-fade-in [role="slider"]', 'ArrowLeft', 100);
await press('.at-fade-out [role="slider"]', 'ArrowRight', 50);
s = await state();
check('the fade sliders take the arrow keys and End', s.fadeIn === 1 && s.fadeOut === 0.5, JSON.stringify(s));
const curve = await page.$eval('.at-curve polyline', (p) => p.getAttribute('points')).catch(() => '');
const corners = curve.split(' ').map((pair) => pair.split(',').map(Number));
check(
	'the editor draws the gain curve from floor at In to ceiling and back',
	corners.length > 4 &&
		Math.abs(corners[0][0] - 0.5 / 3) < 1e-6 &&
		corners[0][1] === 1 &&
		corners.some(([x, y]) => Math.abs(x - 1.5 / 3) < 1e-6 && y === 0) &&
		corners.at(-1)[1] === 1,
	curve.slice(0, 80),
);

const stale = await page.evaluate(() => !!document.querySelector('.media-job-result'));
await page.click('.media-job-run');
await page.waitForSelector('.media-job-result', { timeout: 15000 });
const out = await decoded();
const resultDetail = await page.$eval('.media-job-result .canon-row-detail', (el) => el.textContent.trim());
check(
	'Export WAV writes the 0.5 to 2.5 s cut, a 2 s WAV',
	!stale && Math.abs(out.duration - 2) < 0.01 && out.type === 'audio/wav' &&
		/^wav · .* · 00:00:00\.500 – 00:00:02\.500$/.test(resultDetail),
	JSON.stringify({ ...out, resultDetail }),
);
check(
	'the export has the fades: silent at both ends, full in the middle',
	out.head < 0.02 && out.tail < 0.05 && out.middle > 0.45,
	JSON.stringify(out),
);
check(
	'the result is named after the source, with Preview and Download',
	(await page.$eval('.media-job-result .canon-row-title', (el) => el.textContent.trim())) === 'tone-trimmed.wav' &&
		!!(await page.$('.media-job-preview')) &&
		!!(await page.$('.media-job-save')),
);
await press('.at-fade-out [role="slider"]', 'ArrowRight');
check('a new fade drops the result', !(await page.$('.media-job-result')));
await press('.at-fade-out [role="slider"]', 'ArrowLeft');


await page.click('.media-play');
await sleep(250);
const t0 = await audioTime();
const gain0 = await page.evaluate(() => window.__gain?.gain.value ?? -1);
check(
	'Play runs from the in point, Pause in its place, the band shows the head',
	await page.evaluate(
		() =>
			document.querySelector('.media-play').textContent.trim() === 'Pause' &&
			!!document.querySelector('.at-band .media-head') &&
			!!document.querySelector('.at-editor .media-head'),
	) &&
		t0 >= 0.5 &&
		t0 < 1.2,
	String(t0),
);
await page.waitForFunction(() => (document.querySelector('.at-audio')?.currentTime ?? 0) > 1.7, { timeout: 5000 });
const gain1 = await page.evaluate(() => window.__gain?.gain.value ?? -1);
check(
	'the preview gain follows the fade in, then plays at full',
	gain0 >= 0 && gain0 < 0.9 && gain1 > 0.95,
	`${gain0} -> ${gain1}`,
);
await page.waitForFunction(
	() => document.querySelector('.media-play').textContent.trim() === 'Play',
	{ timeout: 5000 },
);
check(
	'playback stops at the out point and parks at the in point',
	Math.abs((await audioTime()) - 0.5) < 0.05,
	String(await audioTime()),
);

let clear = await footerClear();
check('wide: at the end of the scroll the footer clears the last row', clear.ok, JSON.stringify(clear));

await press('.at-band .media-scrub', 'ArrowRight');
await sleep(100);
await page.click('.at-set-in');
s = await state();
check('the band scrubs with the keys; Set in takes the playhead', s.start === 1, JSON.stringify(s));
await press('.at-band .media-scrub', 'ArrowLeft');
await page.click('.at-set-out');
s = await state();
check('Set out before In stops a hundredth past In', s.start === 1 && s.end === 1.01, JSON.stringify(s));
await typeInto('at-start', '0.5');
await typeInto('at-end', '2.5');

await page.click('.media-loop');
check(
	'Loop latches',
	await page.$eval('.media-loop', (b) => b.getAttribute('aria-pressed') === 'true'),
);
await page.click('.media-loop');

await page.click('.at-zoom-in');
await sleep(100);
s = await state();
check('Zoom in halves the view round its centre', s.view === '0.75 – 2.25 s', JSON.stringify(s));
check('the editor waveform is painted zoomed', await painted('.at-editor .media-wave-canvas'));
const grips = await page.evaluate(() =>
	[...document.querySelectorAll('.media-trim-grip')].map((g) => [
		g.getAttribute('aria-valuemin'),
		g.getAttribute('aria-valuenow'),
		g.getAttribute('aria-valuemax'),
	]),
);
check(
	'zoomed, the grips announce file seconds, limited to the view',
	JSON.stringify(grips) === JSON.stringify([['0.75', '0.75', '2.24'], ['0.76', '2.25', '2.25']]),
	JSON.stringify(grips),
);
await press('.media-trim-grip[aria-label="End"]', 'ArrowLeft', 3);
s = await state();
check('a grip moved in the zoomed view sets the file point', s.endField === '1.95' && s.startField === '0.5', JSON.stringify(s));
await press('.at-band .media-scrub', 'End');
await sleep(300);
s = await state();
check('a playhead outside the zoomed view pages the view to it', s.view === '1.50 – 3.00 s', JSON.stringify(s));
await page.click('.at-zoom-out');
await sleep(100);
s = await state();
check('Zoom out doubles the view', s.view === '0.75 – 3.00 s', JSON.stringify(s));
await page.click('.at-fit');
s = await state();
check('Reset zoom fits the file', s.view === '', JSON.stringify(s));

await page.evaluate(() =>
	[...document.querySelectorAll('.at-source button')].find((b) => b.textContent.trim() === 'Clear').click(),
);
await sleep(200);
check(
	'Clear returns to the slot and the blank layout',
	!!(await page.$('.at-slot')) && !(await page.$('.at-source')) && !(await page.$('.media-trim-grip')) &&
		(await page.$$('.media-strips--blank')).length === 2,
);

// paste anywhere loads; ?trimFades and ?trimLoop as the iOS launch arguments
await visit(page, '/tools/audio-trimmer?trimFades=yes');
await makeWav(page, { seconds: 4, name: 'paste.wav' });
await page.evaluate(() => {
	const transfer = new DataTransfer();
	transfer.items.add(window.__clip);
	document.dispatchEvent(new ClipboardEvent('paste', { clipboardData: transfer, bubbles: true }));
});
await page.waitForFunction(
	() => document.querySelector('.media-trim-grip[aria-label="End"]')?.getAttribute('aria-valuenow') === '4',
	{ timeout: 15000 },
);
s = await state();
check('paste loads; ?trimFades=yes sets 1.5 s and 2.5 s', s.fadeIn === 1.5 && s.fadeOut === 2.5, JSON.stringify(s));

await visit(page, '/tools/audio-trimmer?trimLoop=yes');
await makeWav(page, { seconds: 3, name: 'loop.wav' });
await dropClip(page, '.audio-trimmer');
await page.waitForFunction(
	() => document.querySelector('.media-loop')?.getAttribute('aria-pressed') === 'true',
	{ timeout: 15000 },
);
await sleep(1500);
s = await state();
check(
	'?trimLoop=yes loops 1 to 1.6 s',
	s.start === 1 && s.end === 1.6 &&
		(await page.evaluate(() => document.querySelector('.media-play').textContent.trim() === 'Pause')),
	JSON.stringify(s),
);
const t = await audioTime();
check('the loop wraps inside the cut', t >= 0.95 && t <= 1.65, String(t));
await page.click('.media-stop');

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
