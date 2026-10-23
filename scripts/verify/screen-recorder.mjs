// the canon screen-recorder: band, preview, options, takes, transport, workflow
// getDisplayMedia cannot be granted headlessly: a stub hands out a canvas
// stream, with an oscillator track when window.__audio is set
// SHOTS=<dir> also writes screenshots at 390, 1400 and 2200, light and dark
import { launch, visit, check, finish, sleep } from './harness.mjs';

const shots = process.env.SHOTS;

const { browser, page } = await launch({
	args: [
		'--use-fake-device-for-media-stream',
		'--use-fake-ui-for-media-stream',
		'--autoplay-policy=no-user-gesture-required',
	],
});

await page.evaluateOnNewDocument(() => {
	window.__picker = 'grant';
	window.__audio = false;
	window.__saved = [];
	HTMLAnchorElement.prototype.click = function () {
		window.__saved.push(this.download);
	};
	const display = () => {
		const canvas = document.createElement('canvas');
		canvas.width = 320;
		canvas.height = 180;
		const context = canvas.getContext('2d');
		let hue = 0;
		setInterval(() => {
			hue = (hue + 20) % 360;
			context.fillStyle = `hsl(${hue} 60% 40%)`;
			context.fillRect(0, 0, canvas.width, canvas.height);
		}, 50);
		const stream = canvas.captureStream(10);
		if (window.__audio) {
			const audio = new AudioContext();
			const tone = audio.createOscillator();
			const out = audio.createMediaStreamDestination();
			tone.connect(out);
			tone.start();
			stream.addTrack(out.stream.getAudioTracks()[0]);
		}
		return stream;
	};
	navigator.mediaDevices.getDisplayMedia = async () => {
		window.__asked = (window.__asked ?? 0) + 1;
		if (window.__picker === 'cancel')
			throw new DOMException('User cancelled', 'NotAllowedError');
		if (window.__picker === 'fail') throw new TypeError('Unsupported');
		return display();
	};
});

const counter = () =>
	page.$eval('.media-recorder .canon-timecode', (el) =>
		el.textContent.replace(/\s+/g, ''),
	);
const lit = () =>
	page.$$eval('.media-recorder .canon-lamps-lamp--lit', (lamps) =>
		lamps
			.map((lamp) =>
				[...lamp.classList]
					.find((c) => /--(record|play|pause)$/.test(c))
					?.split('--')
					.pop(),
			)
			.sort()
			.join(','),
	);
const press = (selector) =>
	page.evaluate((selector) => document.querySelector(selector)?.click(), selector);
const label = (selector) =>
	page.$eval(selector, (el) => el.getAttribute('aria-label') ?? el.textContent.trim());
const text = (selector) =>
	page.$eval(selector, (el) => el.textContent.trim()).catch(() => '');
const set = (key, value) =>
	page.evaluate((key, value) => (window[key] = value), key, value);
const recordFor = async (ms) => {
	await press('.media-recorder-record');
	await page.waitForSelector('.sr-live', { timeout: 10000 });
	await sleep(ms);
	const count = (await page.$$('.sr-take')).length;
	await press('.media-recorder-stop');
	await page.waitForFunction(
		(count) => document.querySelectorAll('.sr-take').length === count + 1,
		{ timeout: 15000 },
		count,
	);
};
// the last row's bottom against the footer's top, scrolled to the end
const footerClear = () =>
	page.evaluate(async () => {
		const body = document.querySelector('.screen-recorder .canon-split-body');
		const main = document.querySelector('.screen-recorder .canon-split-main');
		for (const box of [body, main]) box.scrollTop = box.scrollHeight;
		await new Promise((r) => setTimeout(r, 200));
		const footer = document.querySelector('.canon-split-footer').getBoundingClientRect();
		const content = [
			...document.querySelectorAll(
				'.screen-recorder .canon-split-pane > :not(.canon-split-footer)',
			),
		].filter((el) => {
			const box = el.getBoundingClientRect();
			return box.height && box.right > footer.left && box.left < footer.right;
		});
		const last = Math.max(...content.map((el) => el.getBoundingClientRect().bottom));
		return { ok: last <= footer.top + 0.5, detail: `content ${last} footer ${footer.top}` };
	});
const shoot = async (name) => {
	if (!shots) return;
	for (const theme of ['light', 'dark']) {
		await page.evaluate((theme) => {
			document.documentElement.classList.remove('light', 'dark');
			document.documentElement.classList.add(theme);
		}, theme);
		await sleep(250);
		const { width } = page.viewport();
		await page.screenshot({ path: `${shots}/screen-recorder-${name}-${width}-${theme}.png` });
	}
};

await visit(page, '/tools/screen-recorder');

check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.screen-recorder').getBoundingClientRect().height,
	),
);
check(
	'idle: Share screen alone in the footer, no takes, counter in hyphens',
	(await label('.media-recorder-record')) === 'Share screen' &&
		(await page.$('.media-recorder-stop')) === null &&
		(await text('.screen-recorder .canon-empty-row')) === 'No takes' &&
		!/\d/.test(await counter()),
);
check(
	'idle: the preview is a slot with the web hint',
	(await text('.sr-slot')) === 'Choose a screen, window or tab to start recording.',
);
check(
	'the band has record, play and pause lamps, none lit',
	(await page.$$('.media-recorder .canon-lamps-lamp')).length === 3 && (await lit()) === '',
);
check('the web aside stays', (await text('.sr-aside')).startsWith("Isn't it crazy"));

const mic = () => page.$eval('.sr-mic .canon-switch', (el) => el.checked);
check(
	'Microphone defaults off, named by its row, no filter rows',
	!(await mic()) &&
		(await page.$eval('.sr-mic .canon-switch', (el) =>
			document.getElementById(el.getAttribute('aria-labelledby'))?.textContent.trim(),
		)) === 'Microphone' &&
		(await page.$('.sr-echo')) === null,
);
await page.click('.sr-mic .canon-switch');
await sleep(100);
check(
	'Microphone on shows echo, noise and gain switches, all off',
	(await mic()) &&
		(await page.$$eval('.sr-echo .canon-switch, .sr-noise .canon-switch, .sr-gain .canon-switch', (els) =>
			els.length === 3 && els.every((el) => !el.checked),
		)),
);
await page.focus('.sr-echo .canon-switch');
await page.keyboard.press('Space');
await sleep(100);
check(
	'a filter switch toggles from the keyboard',
	await page.$eval('.sr-echo .canon-switch', (el) => el.checked),
);
await page.click('.sr-mic .canon-switch');
await sleep(100);

await set('__picker', 'cancel');
await press('.media-recorder-record');
await sleep(400);
check('cancelling the picker is not treated as an error', (await page.$('.sr-error')) === null);

await set('__picker', 'fail');
await press('.media-recorder-record');
await page.waitForSelector('.sr-error', { timeout: 5000 }).catch(() => {});
check(
	'a failed picker surfaces the web error',
	(await text('.sr-error')) === 'Screen sharing failed. Check browser permissions.',
);
await set('__picker', 'grant');

await press('.sr-slot');
await page.waitForSelector('.sr-live', { timeout: 10000 });
check('the slot starts recording too: the record lamp lights', (await lit()) === 'record');
check('the error clears on a new start', (await page.$('.sr-error')) === null);
check(
	'recording: Stop, the platter, Pause; the live screen in the preview',
	(await label('.media-recorder-stop')) === 'Stop' &&
		(await label('.media-recorder-pause')) === 'Pause' &&
		(await page.$('.media-recorder-platter')) !== null &&
		(await page.$eval('.sr-live', (el) => el.srcObject?.getVideoTracks().length === 1)),
);
check('Microphone locks while recording', await page.$eval('.sr-mic .canon-switch', (el) => el.disabled));
await sleep(1200);
check('the clock runs', /\d/.test(await counter()), await counter());
await page.waitForFunction(() => document.querySelector('.sr-live')?.videoWidth > 0, { timeout: 5000 });
await sleep(200);
check(
	'the preview takes the screen aspect',
	await page.$eval('.sr-preview', (el) => el.dataset.canonAspect === String(320 / 180)),
	await page.$eval('.sr-preview', (el) => el.dataset.canonAspect),
);
await shoot('recording');

await press('.media-recorder-pause');
await sleep(100);
const frozen = await counter();
check('Pause lights pause beside record, turns to Resume', (await lit()) === 'pause,record' && (await label('.media-recorder-pause')) === 'Resume');
await sleep(700);
check('pause freezes the clock', (await counter()) === frozen, frozen);
await press('.media-recorder-pause');
await sleep(500);
check('Resume runs the clock again', (await counter()) !== frozen);

await press('.media-recorder-stop');
await page.waitForSelector('.sr-take', { timeout: 15000 });
check(
	'Stop keeps a take: name, then length, size and date',
	/^screen-recording-\d{4}-\d\d-\d\dT/.test(await text('.sr-take-name')),
	await text('.sr-take-name'),
);
await page.waitForFunction(() => document.querySelector('.sr-take-detail')?.textContent.includes('320 × 180'), { timeout: 10000 }).catch(() => {});
check(
	'the take detail carries the resolved dimensions',
	/^0:0[1-5] · 320 × 180 · /.test(await text('.sr-take-detail')),
	await text('.sr-take-detail'),
);
check(
	'idle again: Share screen back, the take in the preview, the overview below',
	(await page.$('.media-recorder-record')) !== null &&
		(await page.$('.sr-player')) !== null &&
		(await page.$('.sr-overview .media-strips')) !== null &&
		(await lit()) === '',
);
await page.waitForFunction(() => document.querySelectorAll('.sr-overview .media-frame').length > 0, { timeout: 15000 }).catch(() => {});
check('the overview fills with frames of the take', (await page.$$('.sr-overview .media-frame')).length > 0);
check('a silent take has no waveform lane', (await page.$('.sr-overview .media-wave')) === null);

await press('.sr-take-play');
await page.waitForFunction(() => document.querySelector('.sr-take-play')?.getAttribute('aria-label') === 'Stop', { timeout: 5000 }).catch(() => {});
check('the row plays the take: play lamp, row shows Stop', (await lit()) === 'play');
const playStart = await counter();
await sleep(500);
check('the playhead runs', (await counter()) !== playStart, `${playStart} -> ${await counter()}`);
await shoot('playing');
await press('.media-recorder-pause');
await sleep(150);
check('transport Pause holds playback', (await lit()) === 'pause');
await press('.media-recorder-stop');
await sleep(150);
check('transport Stop ends playback', (await lit()) === '' && (await label('.sr-take-play')) === 'Play');

await page.focus('.sr-overview .media-scrub');
await page.keyboard.press('ArrowRight');
await sleep(150);
check('the overview scrubs from the keyboard', (await lit()) === 'pause');
await press('.media-recorder-stop');

await press('.sr-take-save');
await sleep(100);
const saved = await page.evaluate(() => window.__saved.at(-1) ?? '');
check('Download saves the take as webm', /^screen-recording-.+\.webm$/.test(saved), saved);

// mic on, mic denied: the web notice, and the recording goes on
await page.click('.sr-mic .canon-switch');
await page.evaluate(() => {
	navigator.mediaDevices.getUserMedia = () =>
		Promise.reject(new DOMException('denied', 'NotAllowedError'));
});
await set('__audio', true);
await press('.media-recorder-record');
await page.waitForSelector('.sr-live', { timeout: 10000 });
await page.waitForSelector('.sr-error', { timeout: 5000 }).catch(() => {});
check(
	'mic denial surfaces while recording continues',
	(await text('.sr-error')) === 'Microphone access was denied, so audio will not be mixed in.' &&
		(await lit()) === 'record',
);
check('a take row cannot play while recording', await page.$eval('.sr-take-play', (el) => el.disabled));
const levels = [];
for (let i = 0; i < 20; i++) {
	levels.push(Number(await page.$eval('.media-recorder-meter', (el) => el.getAttribute('aria-valuenow'))));
	await sleep(50);
}
check('tab audio moves the level meter', Math.max(...levels) > 0, levels.join(' '));
await sleep(600);
await press('.media-recorder-stop');
await page.waitForFunction(() => document.querySelectorAll('.sr-take').length === 2, { timeout: 15000 });
check('a take with audio has a waveform lane', (await page.$('.sr-overview .media-wave')) !== null);
const names = await page.$$eval('.sr-take-name', (els) => els.map((el) => el.textContent.trim()));
check('takes list newest first', names[0] > names[1], names.join(' | '));
await set('__audio', false);
await page.click('.sr-mic .canon-switch');

await press('.sr-take:last-child .sr-take-play');
await page.waitForFunction(() => document.querySelector('.sr-take:last-child .sr-take-play')?.getAttribute('aria-label') === 'Stop', { timeout: 5000 }).catch(() => {});
check('an older take loads and plays from its row', (await lit()) === 'play');
await press('.media-recorder-stop');

// the browser's own Stop sharing ends the take
await press('.media-recorder-record');
await page.waitForSelector('.sr-live', { timeout: 10000 });
await sleep(600);
await page.evaluate(() => {
	const track = document.querySelector('.sr-live').srcObject.getVideoTracks()[0];
	track.stop();
	track.dispatchEvent(new Event('ended'));
});
await page.waitForFunction(() => document.querySelectorAll('.sr-take').length === 3, { timeout: 15000 }).catch(() => {});
check('ending the share in the browser keeps the take', (await page.$$('.sr-take')).length === 3);

check(
	'every button has a name; the waveform is a named image',
	await page.evaluate(
		() =>
			[...document.querySelectorAll('.screen-recorder button')].every(
				(b) => (b.getAttribute('aria-label') ?? b.textContent).trim() !== '',
			) && document.querySelector('.media-recorder-wave').getAttribute('role') === 'img',
	),
);
for (let i = 0; i < 3; i++) await recordFor(300);
const details = await page.$$eval('.sr-take-detail', (els) => els.map((el) => el.textContent));
check(
	'every take carries its size, played or not',
	details.every((detail) => detail.includes('320 × 180')),
	details.join(' | '),
);
let clear = await footerClear();
check('1400: the footer never covers the last row at scroll end', clear.ok, clear.detail);
await shoot('takes');

await page.setViewport({ width: 390, height: 844 });
await sleep(400);
clear = await footerClear();
check('390: the footer never covers the last row at scroll end', clear.ok, clear.detail);
check(
	'390: nothing scrolls sideways',
	await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
);
await page.evaluate(() => (document.querySelector('.screen-recorder .canon-split-body').scrollTop = 0));
await shoot('takes');

while ((await page.$$('.sr-take')).length) {
	await press('.sr-take-delete');
	await sleep(100);
}
check(
	'deleting the last take: No takes, the slot back, overview gone',
	(await page.$('.sr-slot')) !== null && (await page.$('.sr-overview')) === null,
);
await shoot('idle');
await press('.media-recorder-record');
await page.waitForSelector('.sr-live', { timeout: 10000 });
await sleep(800);
await page.waitForFunction(() => document.querySelector('.sr-live')?.videoWidth > 0, { timeout: 5000 });
check(
	'390: the transport floats in view',
	await page.$eval('.media-recorder-stop', (el) => el.getBoundingClientRect().bottom <= innerHeight),
);
await shoot('recording');
await press('.media-recorder-stop');
await page.waitForSelector('.sr-take', { timeout: 15000 });

if (shots) {
	await page.setViewport({ width: 2200, height: 1100 });
	await sleep(400);
	await shoot('takes');
	await press('.sr-take-delete');
	await sleep(150);
	await shoot('idle');
	await page.setViewport({ width: 1400, height: 1000 });
	await sleep(400);
	await shoot('idle');
}

await page.setViewport({ width: 1400, height: 1000 });
await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await visit(page, '/tools/screen-recorder');
await press('.media-recorder-record');
await page.waitForSelector('.media-recorder-platter', { timeout: 10000 });
await sleep(600);
check(
	'reduced motion: the platter hatch stands still',
	await page.$eval('.media-recorder-platter', (el) => getComputedStyle(el).backgroundPosition === '0px 0px'),
);
await press('.media-recorder-stop');
await page.emulateMediaFeatures([]);

// workflow: the newest take passes along to the trimmer
await visit(page, '/workflows');
await page.waitForSelector('.dt-wf tbody tr');
await page.evaluate(() =>
	[...document.querySelectorAll('.dt-wf tbody tr')]
		.find((row) => row.textContent.includes('Record, trim, GIF'))
		.querySelector('.dt-wf-go')
		.click(),
);
await page.waitForSelector('.screen-recorder', { timeout: 15000 });
await recordFor(800);
await page.waitForSelector('.sr-pass', { timeout: 10000 });
check(
	'in a workflow: Pass along under the takes and on each row',
	(await text('.sr-pass')) === 'Pass along' && (await label('.sr-take-save')) === 'Pass along',
);
await press('.sr-pass');
await page.waitForFunction(() => location.pathname === '/tools/video-trimmer', { timeout: 15000 }).catch(() => {});
check('the take moves on to video-trimmer', await page.evaluate(() => location.pathname === '/tools/video-trimmer'));

await finish(browser);
