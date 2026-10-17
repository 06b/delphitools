// proves wiring; the unit suite covers the ciphers
// usage: npm start, then node scripts/verify/decoder.mjs

import { BASE, launch, visit, check, finish, sleep } from './harness.mjs';

const { browser, page } = await launch();
await page
	.browserContext()
	.overridePermissions(BASE, [
		'clipboard-read',
		'clipboard-write',
		'clipboard-sanitized-write',
	]);

const snapshot = () =>
	page.evaluate(() => {
		const text = (el) => el?.textContent.replace(/\s+/g, ' ').trim();
		const q = (s) => document.querySelector(`.decoder ${s}`);
		return {
			caption: text(q('.dec-caption')),
			score: q('.dec-score--shown')
				? text(q('.dec-score .canon-figure-said') ?? q('.dec-score'))
				: '',
			candidates: [...document.querySelectorAll('.dec-candidate')].map((el) => ({
				name: text(el.querySelector('.dec-candidate-name')),
				output: el.querySelector('.dec-candidate-text').textContent,
				lit: el.classList.contains('dec-candidate--lit'),
				tweak: !!el.querySelector('.dec-tweak'),
			})),
			empty: text(q('.canon-empty-row')),
			examples: [...document.querySelectorAll('.decoder .dec-candidates .canon-button')]
				.map(text)
				.filter((t) => !['Paste', 'Clear', 'Download', 'Copy'].includes(t)),
			output: text(q('.dec-output .tt-result-text')),
			warn: text(q('.dec-output .canon-status--warn')),
			pairs: [...document.querySelectorAll('.decoder .dec-pair')].filter((el) => getComputedStyle(el.closest('.canon-glyph-flow-glyph')).opacity !== '0').length,
			keys: [...document.querySelectorAll('.decoder .dec-pair-key')].map(text),
			strips: document.querySelectorAll('.decoder .dec-strip').length,
			fence: [...document.querySelectorAll('.decoder .dec-fence-glyph')].map(text).join(''),
			cipher: text(q('.canon-menu-cell-title')),
			manual: !!q('.dec-output'),
		};
	});

const setInput = async (value) => {
	await page.evaluate((v) => {
		const el = document.querySelector('.decoder .dec-input');
		Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, v);
		el.dispatchEvent(new Event('input', { bubbles: true }));
	}, value);
	await sleep(150);
};

const press = async (label) => {
	await page.evaluate((l) => {
		[...document.querySelectorAll('.decoder button')]
			.find((b) => b.textContent.replace(/\s+/g, ' ').trim() === l || b.getAttribute('aria-label') === l)
			?.click();
	}, label);
	await sleep(250);
};

// empty
await visit(page, '/tools/decoder');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.decoder').getBoundingClientRect().height,
	),
);
let s = await snapshot();
check('empty: the picture reads Auto-decode, no score', s.caption === 'Auto-decode' && !s.score, s.caption);
check(
	'empty: six examples',
	s.examples.join() === 'Caesar,ROT13,Vigenère,Morse,Hex,Base64',
	s.examples.join(),
);
const editor = await page.evaluate(() => {
	const area = document.querySelector('.decoder .dec-input');
	const banner = document.querySelector('.decoder .canon-split-banner');
	const main = document.querySelector('.decoder .canon-split-main');
	const style = getComputedStyle(area);
	return {
		inBanner: banner.contains(area),
		mainFields: main.querySelectorAll('textarea').length,
		named: area.getAttribute('aria-label'),
		placeholder: area.placeholder,
		dashed: style.borderTopStyle,
		height: area.getBoundingClientRect().height,
	};
});
check(
	'the ciphertext is typed into the picture, none in the main pane, the dashed box when empty',
	editor.inBanner &&
		editor.mainFields === 0 &&
		editor.named === 'Input' &&
		editor.placeholder === 'Paste cipher text or plaintext here…' &&
		editor.dashed === 'dashed' &&
		editor.height >= 60,
	JSON.stringify(editor),
);

// the band's own height, the editor's scroller and the tones under the editor
const picture = () =>
	page.evaluate(() => {
		const q = (s) => document.querySelector(`.decoder ${s}`);
		const area = q('.dec-input');
		const marks = q('.dec-marks');
		const scroll = q('.dec-scroll');
		const a = getComputedStyle(area);
		const m = getComputedStyle(marks);
		const ra = area.getBoundingClientRect();
		const rm = marks.getBoundingClientRect();
		return {
			band: q('.canon-split-banner .canon-canvas').getBoundingClientRect().height,
			split: q('.canon-split-body').clientHeight,
			scrolls: scroll.scrollHeight - scroll.clientHeight,
			scrollTop: scroll.scrollTop,
			marks: marks.textContent.replace(/​/g, ''),
			value: area.value,
			sameBox: Math.abs(ra.top - rm.top) < 0.5 && Math.abs(ra.left - rm.left) < 0.5 && Math.abs(ra.width - rm.width) < 0.5,
			sameType:
				a.fontFamily === m.fontFamily &&
				a.fontSize === m.fontSize &&
				a.lineHeight === m.lineHeight &&
				a.whiteSpace === 'pre-wrap' &&
				m.whiteSpace === 'pre-wrap',
			transparent: a.color === 'rgba(0, 0, 0, 0)',
			tones: [...marks.querySelectorAll('span')].map((s) => [s.className.replace('dec-tone--', ''), s.textContent]),
		};
	});
const emptyBand = (await picture()).band;

// a sample
await press('Caesar');
s = await snapshot();
check('a sample fills the input', (await page.$eval('.decoder .dec-input', (el) => el.value)).startsWith('AOL XBPJR'));
check(
	'candidates ranked, the first lit, the Caesar reading first',
	s.candidates[0]?.lit &&
		s.candidates.slice(1).every((c) => !c.lit) &&
		s.candidates[0].output === 'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG',
	JSON.stringify(s.candidates[0]),
);
check('the picture captions the hero with its score', s.caption === s.candidates[0].name && /^\d+%$/.test(s.score.replace(/\s/g, '')), `${s.caption} ${s.score}`);
check('the picture pairs the symbols', s.pairs > 20, String(s.pairs));
check('the ranking note under the candidates', /ranked by English-likeness/.test(await page.$eval('.decoder .dec-note', (el) => el.textContent)));
let p = await picture();
check(
	'the typed text is the picture\'s top line: the tones under a transparent textarea, same box, same type',
	p.marks === p.value && p.sameBox && p.sameType && p.transparent,
	JSON.stringify({ ...p, tones: undefined }),
);
check('the band fits the text, nothing to scroll', p.scrolls <= 0 && p.band < emptyBand, `${p.band} ${emptyBand} ${p.scrolls}`);
check(
	'Caesar tones: letters read, spaces left as they are',
	p.tones.every(([tone, text]) => (tone === 'muted') === /^\s+$/.test(text)),
	JSON.stringify(p.tones.slice(0, 4)),
);

// the band grows with the text up to a cap, then the text scrolls inside
const oneLine = p.band;
await setInput('AOL XBPJR IYVDU MVE QBTWZ VCLY AOL SHGF KVN.\n'.repeat(4));
p = await picture();
check('the band grows with the text', p.band > oneLine && p.scrolls <= 0, `${oneLine} -> ${p.band}`);
await setInput('AOL XBPJR IYVDU MVE QBTWZ VCLY AOL SHGF KVN.\n'.repeat(60));
p = await picture();
check(
	'long text: the band stops at its cap and the text scrolls inside',
	p.band <= p.split * 0.46 && p.scrolls > 0 && p.marks === p.value,
	`${p.band} of ${p.split}, scrolls ${p.scrolls}`,
);
await page.focus('.decoder .dec-input');
await page.$eval('.decoder .dec-scroll', (el) => (el.scrollTop = 120));
await page.evaluate(() => {
	const el = document.querySelector('.decoder .dec-input');
	Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(el, `X${el.value}`);
	el.setSelectionRange(1, 1);
	el.dispatchEvent(new Event('input', { bubbles: true }));
});
await sleep(150);
check('typing does not move the editor\'s scroll', (await picture()).scrollTop === 120, String((await picture()).scrollTop));
await page.$eval('.decoder .dec-input', (el) => el.blur());

// Paste and Clear sit in the picture's corner
await page.evaluate(() => navigator.clipboard.writeText('Uryyb jbeyq'));
await press('Paste');
check(
	'Paste in the picture fills the editor',
	(await page.$eval('.decoder .dec-input', (el) => el.value)) === 'Uryyb jbeyq' &&
		(await page.$eval('.decoder .canon-split-banner', (el) => !!el.querySelector('[aria-label="Paste"]'))),
);
await press('Clear');
check('Clear in the picture empties it', (await page.$eval('.decoder .dec-input', (el) => el.value)) === '');
await press('Caesar');

// live typing
await setInput('');
await page.click('.decoder .dec-input');
await page.keyboard.type('Uryyb jbeyq');
await sleep(150);
s = await snapshot();
check('typing decodes live (ROT13)', s.candidates.some((c) => c.output === 'Hello world'), s.candidates.map((c) => c.output).join(' | '));

await setInput('%%%%');
s = await snapshot();
check('no match: the web wording', s.empty === 'No confident matches found. Try the Manual tab if you know the cipher.', s.empty);

// copy
await setInput('AOL XBPJR IYVDU MVE QBTWZ VCLY AOL SHGF KVN');
await page.click('.decoder .dec-candidate-cell');
await sleep(300);
check(
	'pressing a candidate copies its output, confirmed by the toast',
	(await page.evaluate(() => navigator.clipboard.readText())) === 'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG' &&
		(await page.evaluate(() => /Copied/.test(document.querySelector('.canon-toast-live')?.textContent ?? ''))),
);

// tweak
await page.click('.decoder .dec-tweak');
await sleep(300);
s = await snapshot();
const shift = await page.$eval('.decoder .canon-stepper-field', (el) => el.getAttribute('aria-valuenow'));
check(
	'Tweak opens Manual with the cipher and its shift',
	s.manual && s.cipher === 'Caesar' && shift === '7' && s.output === 'THE QUICK BROWN FOX JUMPS OVER THE LAZY DOG',
	`${s.cipher} ${shift} ${s.output}`,
);
check('Manual captions the settings', s.caption === 'Caesar (shift 7)', s.caption);
await page.focus('.decoder .canon-stepper-field');
await page.keyboard.press('ArrowUp');
await sleep(150);
s = await snapshot();
check('the shift steps with the arrow keys, the output follows', s.caption === 'Caesar (shift 8)' && s.output.startsWith('SGD'), `${s.caption} ${s.output}`);

// cipher menu
const pick = async (label) => {
	await page.evaluate((l) => {
		const select = document.querySelector('.decoder .canon-menu-cell-select');
		select.value = [...select.options].find((o) => o.textContent.trim() === l).value;
		select.dispatchEvent(new Event('change', { bubbles: true }));
	}, label);
	await sleep(200);
};
check(
	'the cipher menu lists every cipher',
	(await page.$$eval('.decoder .canon-menu-cell-select option', (o) => o.length)) === 14,
);
await pick('Hex');
await setInput('abc');
s = await snapshot();
check('a bad input shows the iOS error in a warn row', s.warn === 'Hex must have even length.', s.warn);
await setInput('48 69');
s = await snapshot();
check('Hex decodes, the picture regroups the bits', s.output === 'Hi' && s.strips > 0, `${s.output} ${s.strips}`);

await pick('Vigenère');
await page.type('.decoder .dec-key', 'lemon');
await press('Encode');
await setInput('attack at dawn');
s = await snapshot();
check('Vigenère encodes with the key letters in the picture', s.output === 'lxfopv ef rnhr' && s.keys.join('') === 'LEMONLEMONLE', `${s.output} ${s.keys.join('')}`);

await pick('Rail fence');
await setInput('WEAREDISCOVERED');
s = await snapshot();
check('Rail fence draws the plain text along the rails', s.fence === 'WEAREDISCOVERED' && s.output === 'WECRERDSOEEAIVD', `${s.fence} ${s.output}`);
const toneOf = (tones) => tones.map(([tone, text]) => tone[0].repeat([...text].length)).join('');
check('Rail fence tones: the odd rail lit in the typed text', toneOf((await picture()).tones) === 'ililililililili', toneOf((await picture()).tones));
await press('Decode');
await setInput('WECRERDSOEEAIVD');
check('Rail fence decode tones: the cipher text is the rails in turn', toneOf((await picture()).tones) === 'iiiillllllliiii', toneOf((await picture()).tones));
await press('Encode');

await pick('Affine');
check(
	'Affine offers the coprimes for a',
	(await page.$$eval('.decoder [aria-label="a"] button', (b) => b.map((x) => x.textContent.trim()).join())) ===
		'1,3,5,7,9,11,15,17,19,21,23,25',
);

await pick('Morse code');
await press('Decode');
await setInput('.... ..');
// removed glyphs fade out
await sleep(400);
s = await snapshot();
check('Morse decodes, marks over letters', s.output === 'HI' && s.pairs === 2, `${s.output} ${s.pairs}`);
check('Morse tones: one tone per code, the gap muted', toneOf((await picture()).tones) === 'iiiimll', toneOf((await picture()).tones));

// back to auto
await press('Auto-decode');
s = await snapshot();
check('Auto-decode comes back with candidates', !s.manual && s.candidates.length > 0);

// reference
const toggle = '.decoder .dec-reference .canon-button';
check('the reference starts closed', (await page.$eval(toggle, (el) => el.getAttribute('aria-expanded'))) === 'false');
await page.click(toggle);
await sleep(150);
check(
	'the reference opens with every section',
	(await page.$$eval('.decoder .dec-reference .canon-heading', (h) => h.map((x) => x.textContent.trim()).join('|'))) ===
		'Classical (alphabet) ciphers|Codes|Encodings|Not included',
);

// query flags
await visit(page, '/tools/decoder?cipherManual=1&cipherId=rail-fence&cipherRails=4&cipherEncode=1&cipherText=HELLOWORLD&cipherReference=1');
s = await snapshot();
check('query flags set up Manual', s.manual && s.cipher === 'Rail fence' && s.caption === 'Rail fence 4 rails' && s.fence === 'HELLOWORLD', `${s.caption} ${s.fence}`);
check('?cipherReference opens the reference', (await page.$eval(toggle, (el) => el.getAttribute('aria-expanded'))) === 'true');

// phone
await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/decoder?cipherSample=5');
const phone = await page.evaluate(() => ({
	overflow: document.documentElement.scrollWidth - window.innerWidth,
	pageScroll: document.scrollingElement.scrollHeight - window.innerHeight,
	strip: document.querySelectorAll('.decoder .dec-strip').length,
}));
check('phone: no horizontal scroll, the page does not scroll', phone.overflow <= 0 && phone.pageScroll <= 0, JSON.stringify(phone));
check('phone: the Base64 sample regroups bits', phone.strip > 0);
check(
	'phone: Base64 tones by group of four',
	toneOf((await picture()).tones) === `${'iiiillll'.repeat(4)}iiii`,
	toneOf((await picture()).tones),
);

// phone: the picture collapses as the page scrolls, unless the editor has focus
await visit(page, `/tools/decoder?cipherReference=1&cipherText=${encodeURIComponent('AOL XBPJR IYVDU MVE QBTWZ VCLY AOL SHGF KVN. '.repeat(3))}`);
const full = (await picture()).band;
await page.$eval('.decoder .canon-split-body', (el) => (el.scrollTop = 500));
await sleep(200);
const collapsed = (await picture()).band;
check('phone: scrolled, the picture collapses to the head and drawing', collapsed < full && collapsed <= 140, `${full} -> ${collapsed}`);
await page.$eval('.decoder .dec-input', (el) => el.focus());
await sleep(200);
const focused = (await picture()).band;
check('phone: focused, the picture keeps its full height', Math.abs(focused - full) < 2, `${full} vs ${focused}`);
await page.$eval('.decoder .dec-input', (el) => el.blur());
await sleep(200);
check('phone: blurred, it collapses again', (await picture()).band <= 140, String((await picture()).band));

await finish(browser);
