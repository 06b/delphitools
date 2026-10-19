// morse-code: the canon port, with the tone player
//
// Usage: npm start, then node scripts/verify/morse-code.mjs

import { launch, visit, check, finish, sleep } from './harness.mjs';
import {
	checkActions,
	checkLayout,
	checkNarrow,
	checkPaste,
	grantClipboard,
	headings,
	result,
	setSource,
	typeSource,
} from './text-tool.mjs';

const { browser, page } = await launch({
	args: ['--autoplay-policy=no-user-gesture-required'],
});
await grantClipboard(page);

const tape = () =>
	page.evaluate(() => ({
		marks: document.querySelectorAll('.mt-mark').length,
		lit: document.querySelectorAll('.mt-mark--lit, .mt-mark--sounding')
			.length,
		labels: [...document.querySelectorAll('.mt-label')]
			.map((l) => l.textContent)
			.join(''),
		unknown: document.querySelectorAll('.mt-label--unknown').length,
		time: document
			.querySelector('.canon-timecode')
			?.textContent.replace(/\s+/g, ''),
		lamps: [...document.querySelectorAll('.canon-lamps-lamp--lit')].map(
			(l) => l.className.match(/--(play|pause|loop)/)?.[1],
		),
		play: document.querySelector('.mc-play').textContent.trim(),
		playOff: document.querySelector('.mc-play').disabled,
		stopOff: document.querySelector('.mc-stop').disabled,
	}));

await visit(page, '/tools/morse-code?morseQuiet');
await checkLayout(page, '.morse-code');
check('an empty tape is a blank line', !!(await page.$('.mt-blank')));
check('Play waits for something to play', (await tape()).playOff);

await typeSource(page, 'SOS');
check('text encodes, live', (await result(page)) === '... --- ...', await result(page));
check(
	'the direction reads Text to Morse',
	(await headings(page)).join(' > ') === 'Text > Morse',
);
let t = await tape();
check('the tape draws nine marks', t.marks === 9, `${t.marks}`);
check('each letter under its marks', t.labels === 'SOS', t.labels);
check('stopped, the counter shows the length', /\d/.test(t.time ?? ''), t.time);

// one input, so no half-typed codes linger as fading glyphs
await setSource(page, '.... .. / -.-.-.-.-');
check('morse decodes in Auto', (await result(page)) === 'HI �', await result(page));
check(
	'and the headings swap to Morse > Text',
	(await headings(page)).join(' > ') === 'Morse > Text',
);
t = await tape();
check('an unknown code is marked', t.unknown === 1, `${t.unknown}`);

await setSource(page, 'SOS SOS');
await page.click('.mc-play');
await sleep(600);
t = await tape();
check('Play plays: the button reads Pause', t.play === 'Pause', t.play);
check('the play lamp is lit', t.lamps.includes('play'), t.lamps.join());
check('the tape lights as it plays', t.lit > 0, `${t.lit} lit`);
check('Stop is live', !t.stopOff);

await page.click('.mc-play');
await sleep(100);
const paused = await tape();
await sleep(300);
t = await tape();
check(
	'Pause holds the place',
	paused.time === t.time && t.lamps.includes('pause') && t.play === 'Play',
	`${paused.time} / ${t.time}`,
);
await page.click('.mc-play');
await sleep(300);
t = await tape();
check('Play again resumes', t.play === 'Pause' && t.time !== paused.time);

await page.click('.mc-loop');
await sleep(50);
t = await tape();
check(
	'Loop is pressed and its lamp lit',
	(await page.$eval('.mc-loop', (b) => b.getAttribute('aria-pressed'))) ===
		'true' && t.lamps.includes('loop'),
);

await page.click('.mc-stop');
await sleep(100);
t = await tape();
check('Stop clears the tape', t.lit === 0 && t.play === 'Play' && t.stopOff);

await page.click('.mc-play');
await sleep(200);
await typeSource(page, 'E');
t = await tape();
check('a new source stops the tone', t.play === 'Play' && t.stopOff);

await page.focus('.mc-speed');
await page.keyboard.press('ArrowRight');
await sleep(50);
check(
	'the speed slider takes the arrow keys',
	(await page.$eval('.mc-speed', (el) => el.getAttribute('aria-valuetext'))) ===
		'21 WPM',
);

await page.$$eval('.canon-segmented button', (buttons) =>
	buttons.find((x) => x.textContent.trim() === 'Decode')?.click(),
);
await setSource(page, 'SOS');
check('Decode reads letters as one unknown code', (await result(page)) === '�', await result(page));
await page.$$eval('.canon-segmented button', (buttons) =>
	buttons.find((x) => x.textContent.trim() === 'Encode')?.click(),
);
check('Encode', (await result(page)) === '... --- ...');

await checkActions(page, '... --- ...', 'morse.txt');
await page.$$eval('.canon-segmented button', (buttons) =>
	buttons.find((x) => x.textContent.trim() === 'Auto')?.click(),
);
await checkPaste(page, '-- --- .-. ... .');
check('the pasted morse decodes', (await result(page)) === 'MORSE');

await typeSource(page, 'hello');
check('typed text hides the keypad', !(await page.$('.mc-keypad')));

await visit(page, '/tools/morse-code?morseMode=2&morseQuiet');
const source = () => page.$eval('.tt-source', (el) => el.value);
const keys = await page.$$eval('.mc-keypad button', (els) =>
	els.map((b) => `${b.getAttribute('aria-label')}:${b.getAttribute('aria-keyshortcuts')}`),
);
check(
	'Decode shows the keypad: Dit, Dah, the gaps and Backspace, named with their keys',
	keys.join(' ') === 'Dit:. Dah:- Letter gap:Space Word gap:/ Backspace:Backspace',
	keys.join(' '),
);
await page.evaluate(() => {
	window.__tones = 0;
	const start = AudioBufferSourceNode.prototype.start;
	AudioBufferSourceNode.prototype.start = function (...a) {
		window.__tones += 1;
		return start.apply(this, a);
	};
});
const tap = (label) =>
	page.$$eval(
		'.mc-keypad button',
		(els, l) => els.find((b) => b.getAttribute('aria-label') === l)?.click(),
		label,
	);
for (const label of ['Dit', 'Dit', 'Dit', 'Letter gap', 'Dah', 'Dah', 'Dah', 'Word gap', 'Dit'])
	await tap(label);
await sleep(100);
check('the keypad buttons key Morse', (await source()) === '... --- / .', await source());
check('each dit and dah sounds', (await page.evaluate(() => window.__tones)) === 7);
check('and the result decodes it', (await result(page)) === 'SO E', await result(page));
await tap('Backspace');
await tap('Backspace');
check('Backspace takes a symbol, then a whole gap', (await source()) === '... ---', await source());

await page.focus('.mc-keypad button');
for (const key of ['Space', 'Period', 'Minus', 'Slash', 'Backspace', 'Space']) await page.keyboard.press(key);
await sleep(50);
check(
	'with focus in the keypad, . - space / and Backspace key it',
	(await source()) === '... --- .- ',
	JSON.stringify(await source()),
);
await page.$$eval('.mc-keypad button', (els) =>
	els.find((b) => b.getAttribute('aria-label') === 'Backspace')?.focus(),
);
await page.keyboard.press('Enter');
await sleep(50);
check('Enter presses the focused key', (await source()) === '... --- .-', JSON.stringify(await source()));

await page.$$eval('.canon-segmented button', (buttons) =>
	buttons.find((x) => x.textContent.trim() === 'Auto')?.click(),
);
await setSource(page, '');
check('Auto on an empty input keeps the keypad', !!(await page.$('.mc-keypad')));

await visit(page, '/tools/morse-code?morseText=PARIS&morseWpm=25&morseLoop&morseQuiet');
check(
	'?morseWpm= and ?morseLoop set up the player',
	(await page.$eval('.mc-speed', (el) => el.getAttribute('aria-valuetext'))) ===
		'25 WPM' &&
		(await page.$eval('.mc-loop', (b) => b.getAttribute('aria-pressed'))) ===
			'true',
);

await checkNarrow(page, '/tools/morse-code?morseText=SOS%20delphi&morseQuiet');

await finish(browser);
