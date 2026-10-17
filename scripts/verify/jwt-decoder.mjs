// proves wiring; suite covers math
// usage: npm start, then node scripts/verify/jwt-decoder.mjs

import { BASE, launch, visit, check, finish, sleep } from './harness.mjs';

const b64u = (s) => Buffer.from(s, 'utf8').toString('base64url');
const SEG = {
	alg: `${b64u('{"alg":"HS256","typ":"JWT"}')}`,
	payload: `${b64u(
		JSON.stringify({
			sub: '1234567890',
			name: 'John Doe',
			iat: 1771135200, // 2026-02-15
			nbf: 1771135000,
			exp: 2999999000, // 2064, far future
		}),
	)}`,
	sig: 'SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c', // 32 bytes
};
const TOKEN = [SEG.alg, SEG.payload, SEG.sig].join('.');

const { browser, page } = await launch();
await page
	.browserContext()
	.overridePermissions(BASE, [
		'clipboard-read',
		'clipboard-write',
		'clipboard-sanitized-write',
	]);

const setToken = async (value) => {
	await page.evaluate((v) => {
		const el = document.querySelector('.media-marked-source');
		const setter = Object.getOwnPropertyDescriptor(
			HTMLTextAreaElement.prototype,
			'value',
		).set;
		setter.call(el, v);
		el.dispatchEvent(new Event('input', { bubbles: true }));
	}, value);
	await sleep(100);
};

const snapshot = () =>
	page.evaluate(() => {
		const text = (el) => el?.textContent.replace(/\s+/g, ' ').trim();
		return {
			tiles: Object.fromEntries(
				[...document.querySelectorAll('.jwt-decoder .canon-tiles-tile')]
					.filter((el) => el.querySelector('.canon-tiles-value'))
					.map((el) => [
						text(el.querySelector('.canon-tiles-label')),
						text(el.querySelector('.canon-tiles-value')),
					]),
			),
			blocks: [...document.querySelectorAll('.jwt-code')].map((el) => ({
				language: text(el.querySelector('.canon-code-block-language')),
				code: el.querySelector('pre').textContent,
			})),
			errors: [...document.querySelectorAll('.jwt-decoder .canon-split-main .canon-status')].map(text),
			empty: text(document.querySelector('.jwt-decoder .canon-empty-row')),
			status: text(document.querySelector('.jwt-picture-head .canon-status')),
			word: text(document.querySelector('.jwt-picture-word')),
			figure: text(document.querySelector('.jwt-picture-figure .canon-figure-said')),
			parts: [...document.querySelectorAll('.jwt-part')].map((el) => ({
				name: text(el.querySelector('.jwt-part-name')),
				detail: text(el.querySelector('.jwt-part-detail')),
				failed: el.classList.contains('jwt-part--failed'),
			})),
			marks: [...document.querySelectorAll('.media-marked-marks > span')].map((el) => [
				el.className,
				el.textContent,
			]),
			ticks: [...document.querySelectorAll('.jwt-timeline-label')].map(text),
		};
	});

await visit(page, '/tools/jwt-decoder');
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.jwt-decoder').getBoundingClientRect().height,
	),
);
let s = await snapshot();
check('empty: the iOS wording, no blocks', s.empty === 'Paste a token here' && s.blocks.length === 0, s.empty);
const editor = await page.evaluate(() => {
	const area = document.querySelector('.media-marked-source');
	const picture = document.querySelector('.canon-split-sidebar');
	return {
		inPicture: picture.contains(area),
		named: area.getAttribute('aria-label'),
		dashed: getComputedStyle(area).borderTopStyle,
		share: area.getBoundingClientRect().width / document.querySelector('.jwt-decoder').getBoundingClientRect().width,
	};
});
check(
	'the token is typed in the picture pane, the dashed box when empty',
	editor.inPicture && editor.named === 'Token' && editor.dashed === 'dashed' && editor.share > 0.4,
	JSON.stringify(editor),
);

await page.click('.media-marked-source');
await page.keyboard.type(SEG.alg);
await sleep(50);
s = await snapshot();
check('live: one segment reads 1 / 3', s.status === 'Segments 1 / 3', s.status);
await page.keyboard.type(`.${SEG.payload}`);
await sleep(50);
s = await snapshot();
check('two segments read 2 / 3', s.status === 'Segments 2 / 3', s.status);
await page.keyboard.type(`.${SEG.sig}`);
await sleep(100);
s = await snapshot();
check(
	'the token decodes as it is typed',
	s.blocks.map((b) => b.language).join() === 'Header,Payload,Signature' &&
		s.blocks[0].code.includes('"alg": "HS256"') &&
		s.blocks[1].code.includes('"sub": "1234567890"') &&
		s.blocks[2].code === SEG.sig,
	JSON.stringify(s.blocks.map((b) => b.language)),
);
check(
	'the tiles read algorithm, type, signature and status',
	s.tiles.Algorithm === 'HS256' && s.tiles.Type === 'JWT' && s.tiles.Signature === '32 bytes' && s.tiles.Status === 'Valid',
	JSON.stringify(s.tiles),
);
check(
	'the three time claims as absolute dates',
	['Issued', 'Not before', 'Expires'].every((k) => /\d{4}, \d{2}:\d{2}:\d{2}/.test(s.tiles[k] ?? '')),
);
check(
	'the marks follow the segments and rebuild the text',
	s.marks.map(([c]) => c).join() === 'jwt-mark--0,jwt-mark--dot,jwt-mark--1,jwt-mark--dot,jwt-mark--2' &&
		s.marks.map(([, t]) => t).join('') === TOKEN,
	s.marks.map(([c]) => c).join(),
);
check(
	'the marks sit under the editor in the same type',
	await page.evaluate(() => {
		const a = getComputedStyle(document.querySelector('.media-marked-marks'));
		const b = getComputedStyle(document.querySelector('.media-marked-source'));
		const ra = document.querySelector('.media-marked-marks').getBoundingClientRect();
		const rb = document.querySelector('.media-marked-source').getBoundingClientRect();
		return (
			a.fontFamily === b.fontFamily &&
			a.fontSize === b.fontSize &&
			a.lineHeight === b.lineHeight &&
			Math.abs(ra.height - rb.height) < 1 &&
			ra.left === rb.left
		);
	}),
);
check(
	'the editor keeps focus while typing',
	await page.evaluate(() => document.activeElement?.classList.contains('media-marked-source')),
);
check(
	'the parts carry their byte counts',
	s.parts.map((p) => `${p.name} ${p.detail}`).join('|') === 'Header 27 bytes|Payload 89 bytes|Signature 32 bytes',
	s.parts.map((p) => `${p.name} ${p.detail}`).join('|'),
);
check('the figure counts down to exp, Valid', s.word === 'Valid' && /^\d+ ?y$/.test(s.figure ?? ''), `${s.figure} ${s.word}`);
check(
	'the timeline labels the claims and now',
	s.ticks.length === 4 && s.ticks.at(-1) === 'Now',
	s.ticks.join(' | '),
);
check(
	'code blocks are monospaced',
	await page.$eval('.jwt-code pre', (el) => /iosevka|mono/i.test(getComputedStyle(el).fontFamily)),
);

await page.click('.jwt-code .canon-code-block-copy');
await sleep(200);
check(
	'a block copies its code',
	(await page.evaluate(() => navigator.clipboard.readText())).includes('"alg": "HS256"'),
);

await setToken([SEG.alg, b64u(JSON.stringify({ sub: '1', exp: 1516239023 })), SEG.sig].join('.'));
s = await snapshot();
check('a past exp reads Expired', s.tiles.Status === 'Expired' && s.word === 'Expired', s.tiles.Status);

await visit(page, '/tools/jwt-decoder?jwtSample=early');
s = await snapshot();
check('launch flag: an early sample reads Not yet valid', s.word === 'Not yet valid' && s.tiles.Status === 'Not yet valid', s.word);

await visit(page, `/tools/jwt-decoder?jwtToken=${TOKEN}`);
await setToken(`%%.${SEG.payload}.${SEG.sig}`);
s = await snapshot();
check(
	'a bad header fails on its own',
	s.errors.join() === 'not base64url' &&
		s.blocks.map((b) => b.language).join() === 'Payload,Signature' &&
		s.parts[0].failed &&
		s.marks[0][0].includes('jwt-mark--failed'),
	s.errors.join(),
);
await setToken(`${b64u('hello')}.${SEG.payload}.${SEG.sig}`);
check('a non-JSON header says so', (await snapshot()).errors.join() === 'not JSON');
await setToken(`${SEG.alg}.${b64u('[1,2]')}.${SEG.sig}`);
s = await snapshot();
check('a non-object payload says so', s.errors.join() === 'not an object' && s.tiles.Algorithm === 'HS256');
await setToken('lorem ipsum dolor sit amet');
check('free text cannot crash the tool', (await snapshot()).status === 'Segments 1 / 3');

await page.$$eval('.jwt-picture-tools .canon-button', (els) =>
	els.find((el) => el.getAttribute('aria-label') === 'Clear').click(),
);
await sleep(100);
s = await snapshot();
check(
	'Clear resets the tool',
	(await page.$eval('.media-marked-source', (el) => el.value)) === '' && s.empty === 'Paste a token here',
);
await page.evaluate((t) => navigator.clipboard.writeText(t), TOKEN);
await page.$$eval('.jwt-picture-tools .canon-button', (els) =>
	els.find((el) => el.getAttribute('aria-label') === 'Paste').click(),
);
await sleep(200);
check('Paste reads the clipboard', (await snapshot()).blocks.length === 3);

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/jwt-decoder?jwtSample=valid');
check(
	'no horizontal scroll on a phone',
	await page.evaluate(
		() =>
			document.documentElement.scrollWidth <= document.documentElement.clientWidth &&
			document.querySelector('.jwt-picture-body').scrollWidth <= document.querySelector('.jwt-picture-body').clientWidth,
	),
);

await finish(browser);
