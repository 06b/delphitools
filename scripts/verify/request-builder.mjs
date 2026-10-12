// usage: npm start, then node scripts/verify/request-builder.mjs

import { launch, visit, check, finish, sleep, BASE } from './harness.mjs';

const { browser, page } = await launch();
await browser
	.defaultBrowserContext()
	.overridePermissions(BASE, [
		'clipboard-read',
		'clipboard-write',
		'clipboard-sanitized-write',
	]);

await visit(page, '/tools/request-builder');

const blocks = () =>
	page.$$eval('.request-builder .rq-code pre', (els) => els.map((el) => el.textContent));
const curlOut = async () => (await blocks())[0];
const httpOut = async () => (await blocks())[1];
const group = (label) => `.rq-pairs[aria-label="${label}"]`;
const addPair = async (label, key, value) => {
	await page.click(`${group(label)} .rq-pair-add`);
	await sleep(50);
	// the new row's key cell takes focus
	await page.keyboard.type(key);
	await page.keyboard.press('Tab');
	await page.keyboard.type(value);
	await sleep(50);
};

check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.request-builder').getBoundingClientRect().height,
	),
);
check('an empty form still renders a request line', (await httpOut()).startsWith('GET / HTTP/1.1'));
check(
	'the picture names the request line',
	(await page.$eval('.rq-picture', (el) => el.getAttribute('aria-label'))) === 'GET / HTTP/1.1',
);
check(
	'empty body: a dashed bar',
	(await page.$$eval('.rq-bar--empty', (els) => els.length)) === 1,
);

await page.type('.rq-url', 'https://api.example.com/things');
await page.$$eval('.request-builder [aria-label="Method"] [role="radio"]', (els) =>
	els.find((b) => b.textContent.trim() === 'POST').click(),
);
await addPair('Headers', 'Content-Type', 'application/json');
await addPair('Query', 'page', '2');
await page.type('.rq-body', '{"name":"delphi"}');
await sleep(100);

const curl = await curlOut();
check('curl names the method', curl.includes('curl -X POST'), curl);
check('curl carries the query in the URL', curl.includes("'https://api.example.com/things?page=2'"));
check('curl carries the header', curl.includes("-H 'Content-Type: application/json'"));
check('curl carries the body', curl.includes(`--data '{"name":"delphi"}'`));
check('curl breaks across lines', curl.includes(' \\\n'));

const http = await httpOut();
check(
	'raw request line and host',
	http.startsWith('POST /things?page=2 HTTP/1.1\nHost: api.example.com'),
	http.split('\n')[0],
);
check('raw request counts the body', http.includes('Content-Length: 17'));
check('blank line before the body', http.includes('\n\n{"name":"delphi"}'));

const picture = await page.evaluate(() => ({
	figure: document.querySelector('.rq-head .canon-figure-said')?.textContent.trim(),
	host: document.querySelector('.rq-host').textContent.trim(),
	offsets: [...document.querySelectorAll('.rq-offset')].map((el) => el.textContent),
	endings: [...document.querySelectorAll('.rq-ending')].map((el) => el.textContent),
	bars: [...document.querySelectorAll('.rq-bar-detail')].map((el) => el.textContent),
}));
const wire = new TextEncoder().encode(http.replace(/\n\n/, '\r\n\r\n').replace(/\n(?=[^]*\r\n\r\n)/g, '\r\n'));
check('the figure is the size on the wire', picture.figure.replace(" ", "") === `${wire.length}bytes`, `${picture.figure} vs ${wire.length}`);
check('the host beside it', picture.host === 'api.example.com');
check(
	'every head line ends in CRLF, the body as typed',
	picture.endings.length === 5 && picture.endings.every((e) => e === '␍␊'),
	picture.endings.join(' '),
);
check('offsets count bytes in hex', picture.offsets[0] === '0000' && picture.offsets[1] === "001e", picture.offsets.slice(0, 2).join());
check('the bars count each part', picture.bars.at(-1) === '17 bytes', picture.bars.join());

await page.click(`${group('Headers')} .rq-pair-remove`);
await sleep(100);
check('removing the row removes the header', !(await curlOut()).includes('Content-Type'));

check(
	'the URL line reads method and full URL',
	(await page.$eval('.rq-target', (el) => el.textContent.replace(/\s+/g, ' ').trim())) ===
		'POST https://api.example.com/things?page=2',
);
await page.click('.rq-target');
await sleep(300);
check(
	'a click on it copies the URL through the toast',
	(await page.evaluate(() => navigator.clipboard.readText())) === 'https://api.example.com/things?page=2' &&
		(await page.$eval('.canon-toast', (t) => t.style.opacity === '1')),
);
await page.click('.rq-code .canon-code-block-copy');
await sleep(150);
check(
	'a code block copies the command',
	(await page.evaluate(() => navigator.clipboard.readText())).startsWith('curl -X POST'),
);
check(
	'generated code is monospaced, no ligatures',
	await page.$eval('.rq-code pre', (el) => {
		const s = getComputedStyle(el);
		return /iosevka|mono/i.test(s.fontFamily) && s.fontVariantLigatures === 'none';
	}),
);

await visit(page, '/tools/request-builder?reqSample=1');
check(
	'launch flag: the sample request',
	(await httpOut()).startsWith('POST /v1/notes?draft=1&tag=work%20%26%20play HTTP/1.1') &&
		(await page.$$eval('.rq-pair', (els) => els.length)) === 4,
);

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/request-builder?reqSample=1');
check(
	'no horizontal scroll on a phone',
	await page.evaluate(
		() =>
			document.documentElement.scrollWidth <= document.documentElement.clientWidth &&
			document.querySelector('.rq-picture').scrollWidth <= document.querySelector('.rq-picture').clientWidth,
	),
);

await finish(browser);
