// the canon voice-recorder: band, transport, platter, takes, overview, flags
import { launch, visit, check, finish, sleep } from './harness.mjs';

const { browser, page } = await launch({
	args: [
		'--use-fake-device-for-media-stream',
		'--use-fake-ui-for-media-stream',
		'--autoplay-policy=no-user-gesture-required',
	],
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
// lit columns left of the head, in the primary colour
const inked = () =>
	page.$eval('.media-recorder-wave', (canvas) => {
		const context = canvas.getContext('2d');
		const { width, height } = canvas;
		const data = context.getImageData(0, 0, Math.round(width * 0.7), height).data;
		let count = 0;
		for (let i = 3; i < data.length; i += 4) if (data[i] > 0) count++;
		return count;
	});

await visit(page, '/tools/voice-recorder');
await page.evaluate(() => {
	window.__saved = [];
	HTMLAnchorElement.prototype.click = function () {
		window.__saved.push(this.download);
	};
});

check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.voice-recorder').getBoundingClientRect().height,
	),
);
check(
	'idle: Record alone in the footer, no takes, counter in hyphens',
	(await label('.media-recorder-record')) === 'Record' &&
		(await page.$('.media-recorder-stop')) === null &&
		(await page.$eval('.voice-recorder .canon-empty-row', (el) => el.textContent.trim())) ===
			'No takes' &&
		!/\d/.test(await counter()),
);
// fake-ui grants up front, so labels show before Record
const granted = await page.evaluate(async () =>
	(await navigator.mediaDevices.enumerateDevices()).some((d) => d.kind === 'audioinput' && d.label),
);
check(
	'idle: the web hint asks for the microphone until it is granted',
	granted
		? (await page.$('.vr-hint')) === null
		: (await page.$eval('.vr-hint', (el) => el.textContent.trim())) ===
				'Allow microphone access to start recording.',
	granted ? 'granted up front' : 'asked',
);
check(
	'the band has record, play and pause lamps, none lit',
	(await page.$$('.media-recorder .canon-lamps-lamp')).length === 3 && (await lit()) === '',
);

await press('.media-recorder-record');
await page.waitForSelector('.media-recorder-meter', { timeout: 10000 });
check('Record starts: the record lamp lights', (await lit()) === 'record');
check(
	'recording: Stop, the platter, Pause',
	(await label('.media-recorder-stop')) === 'Stop' &&
		(await label('.media-recorder-pause')) === 'Pause' &&
		(await page.$('.media-recorder-platter')) !== null,
);
await sleep(1200);
check('the clock runs', /0?0?:?0?1[.,:]/.test(await counter()) || /\d/.test(await counter()), await counter());
check('the live waveform draws behind the head', (await inked()) > 200, String(await inked()));
const levels = [];
for (let i = 0; i < 20; i++) {
	levels.push(
		Number(await page.$eval('.media-recorder-meter', (el) => el.getAttribute('aria-valuenow'))),
	);
	await sleep(50);
}
check('the level meter moves', Math.max(...levels) > 0, levels.join(' '));
const inputs = await page.evaluate(
	async () => (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === 'audioinput').length,
);
check(
	'the hint goes once granted; the Input pick shows for more than one device, locked while recording',
	(await page.$('.vr-hint')) === null &&
		(inputs > 1
			? (await page.$eval('.vr-input', (el) => el.textContent.includes('Input'))) &&
				(await page.$eval('.vr-input button, .vr-input select', (el) => el.disabled))
			: (await page.$('.vr-input')) === null),
	`${inputs} inputs`,
);

await press('.media-recorder-pause');
await sleep(100);
const frozen = await counter();
check('Pause lights pause beside record', (await lit()) === 'pause,record');
check('Pause turns to Resume', (await label('.media-recorder-pause')) === 'Resume');
await sleep(800);
check('pause freezes the clock', (await counter()) === frozen, frozen);
await press('.media-recorder-pause');
await sleep(600);
check('Resume runs the clock again', (await counter()) !== frozen);

// the platter: press pauses, release resumes
const platterAt = () => page.$eval('.media-recorder-platter', (el) => {
	const box = el.getBoundingClientRect();
	return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
});
let platter = await platterAt();
await page.mouse.move(platter.x, platter.y);
await page.mouse.down();
await sleep(150);
check('holding the platter pauses the take', (await lit()) === 'pause,record');
await page.mouse.up();
await sleep(150);
check('releasing the platter resumes', (await lit()) === 'record');

await press('.media-recorder-stop');
await page.waitForSelector('.vr-take', { timeout: 10000 });
check(
	'Stop keeps a take: name and length with date',
	/^voice-recording-\d{4}-\d\d-\d\dT/.test(
		await page.$eval('.vr-take-name', (el) => el.textContent.trim()),
	) &&
		/^0:0[1-4] · /.test(await page.$eval('.vr-take-detail', (el) => el.textContent.trim())),
	await page.$eval('.vr-take-detail', (el) => el.textContent.trim()),
);
check(
	'idle again: Record back, the counter shows the take length',
	(await page.$('.media-recorder-record')) !== null && /\d/.test(await counter()) && (await lit()) === '',
	await counter(),
);
check('the take overview shows', (await page.$('.vr-overview .media-strips')) !== null);

await press('.vr-take-play');
await page.waitForFunction(() => document.querySelector('.vr-take-play')?.getAttribute('aria-label') === 'Stop', {
	timeout: 5000,
});
check('the row plays the take: play lamp, row shows Stop', (await lit()) === 'play');
const playStart = await counter();
await sleep(500);
check('the playhead runs', (await counter()) !== playStart, `${playStart} → ${await counter()}`);
check('the take runs under the head with what lies ahead dimmed', (await inked()) > 200);

platter = await platterAt();
await page.mouse.move(platter.x, platter.y);
await page.mouse.down();
await sleep(100);
check('holding the platter pauses playback', (await lit()) === 'pause');
const held = await counter();
await page.mouse.move(platter.x + 60, platter.y, { steps: 6 });
await sleep(100);
check('dragging the platter right winds the take back', (await counter()) !== held, `${held} → ${await counter()}`);
await page.mouse.up();
await sleep(150);
check('releasing the platter plays on', (await lit()) === 'play');

await press('.media-recorder-stop');
await sleep(150);
check('transport Stop ends playback', (await lit()) === '' && (await label('.vr-take-play')) === 'Play');

await page.focus('.vr-overview .media-scrub');
await page.keyboard.press('ArrowRight');
await sleep(150);
check(
	'the overview scrubs from the keyboard and parks the take',
	(await lit()) === 'pause' && (await label('.media-recorder-pause')) === 'Resume',
);
await press('.media-recorder-stop');

await press('.vr-take-save');
await sleep(100);
check(
	'Download saves the take as webm',
	(await page.evaluate(() => window.__saved.at(-1) ?? '')).match(/^voice-recording-.*\.webm$/) !== null,
	await page.evaluate(() => window.__saved.at(-1) ?? ''),
);

await press('.media-recorder-record');
await page.waitForSelector('.media-recorder-meter', { timeout: 10000 });
check('a take row cannot play while recording', await page.$eval('.vr-take-play', (el) => el.disabled));
await sleep(600);
await press('.media-recorder-stop');
await page.waitForFunction(() => document.querySelectorAll('.vr-take').length === 2, { timeout: 10000 });
const names = await page.$$eval('.vr-take-name', (els) => els.map((el) => el.textContent.trim()));
check('takes list newest first', names[0] > names[1], names.join(' | '));
await press('.vr-take:last-child .vr-take-play');
await page
	.waitForFunction(
		() => document.querySelector('.vr-take:last-child .vr-take-play')?.getAttribute('aria-label') === 'Stop',
		{ timeout: 5000 },
	)
	.catch(() => {});
await sleep(300);
check(
	'an older take loads and plays from its row',
	(await label('.vr-take:last-child .vr-take-play')) === 'Stop' && (await lit()) === 'play',
);
await press('.media-recorder-stop');
await press('.vr-take:last-child .vr-take-delete');
await sleep(150);
check('Delete drops a take', (await page.$$('.vr-take')).length === 1);
await press('.vr-take-delete');
await sleep(150);
check(
	'deleting the last take: No takes, overview gone',
	(await page.$('.vr-take')) === null && (await page.$('.vr-overview')) === null,
);

check(
	'every button has a name; the waveform is a named image',
	await page.evaluate(
		() =>
			[...document.querySelectorAll('.voice-recorder button')].every(
				(b) => (b.getAttribute('aria-label') ?? b.textContent).trim() !== '',
			) && document.querySelector('.media-recorder-wave').getAttribute('role') === 'img',
	),
);

await visit(page, '/tools/voice-recorder?recStart=1&recStop=1');
await page.waitForSelector('.vr-take', { timeout: 10000 });
check('?recStart&recStop record a take with no clicks', true);

await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
await press('.media-recorder-record');
await page.waitForSelector('.media-recorder-platter', { timeout: 10000 });
await sleep(700);
check(
	'reduced motion: the platter hatch stands still',
	await page.$eval('.media-recorder-platter', (el) => getComputedStyle(el).backgroundPosition === '0px 0px'),
);
check('reduced motion: the take fits the strip and still draws', (await inked()) > 50);
await press('.media-recorder-stop');
await page.emulateMediaFeatures([]);

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/voice-recorder');
check(
	'phone: nothing scrolls sideways',
	await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
);
check(
	'phone: the transport floats in view',
	await page.$eval('.media-recorder-record', (el) => el.getBoundingClientRect().bottom <= innerHeight),
);

await page.setViewport({ width: 1400, height: 1000 });
// workflow: the newest take passes along to the next step
await visit(page, '/workflows');
await page.waitForSelector('.dt-wf tbody tr');
await page.evaluate(() =>
	[...document.querySelectorAll('.dt-wf tbody tr')]
		.find((row) => row.textContent.includes('Record, level, transcribe'))
		.querySelector('.dt-wf-go')
		.click(),
);
await page.waitForSelector('.voice-recorder', { timeout: 15000 });
await press('.media-recorder-record');
await page.waitForSelector('.media-recorder-meter', { timeout: 10000 });
await sleep(800);
await press('.media-recorder-stop');
await page.waitForSelector('.vr-pass', { timeout: 10000 });
check(
	'in a workflow: Pass along under the takes and on each row',
	(await page.$eval('.vr-pass', (el) => el.textContent.trim())) === 'Pass along' &&
		(await label('.vr-take-save')) === 'Pass along',
);
await press('.vr-pass');
await page.waitForSelector('.an-source', { timeout: 15000 });
check(
	'the take arrives in audio-normaliser',
	/^voice-recording-.*\.webm$/.test(await page.$eval('.an-source .canon-row-title', (el) => el.textContent.trim())),
);

await finish(browser);
