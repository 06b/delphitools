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
	const main = document.querySelector('.decoder .canon-split-main');
	const style = getComputedStyle(area);
	return {
		inMain: main.contains(area),
		named: area.getAttribute('aria-label'),
		placeholder: area.placeholder,
		dashed: style.outlineStyle,
		height: area.getBoundingClientRect().height,
	};
});
check(
	'the ciphertext is typed in the main pane, the dashed box when empty',
	editor.inMain &&
		editor.named === 'Input' &&
		editor.placeholder === 'Paste cipher text or plaintext here…' &&
		editor.dashed === 'dashed' &&
		editor.height >= 180,
	JSON.stringify(editor),
);

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

await finish(browser);
