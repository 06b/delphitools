import { BASE, launch, visit, check, finish, sleep } from './harness.mjs';

const { browser, page } = await launch();
await page
	.browserContext()
	.overridePermissions(BASE, [
		'clipboard-read',
		'clipboard-write',
		'clipboard-sanitized-write',
	]);
await visit(page, '/tools/uuid-genny');

const rows = () =>
	page.$$eval(
		'.uuid-genny-row .canon-value-line-value:not(.canon-value-line-ghost)',
		(els) => els.map((el) => el.textContent.trim()),
	);
const picture = () =>
	page.$eval('.uuid-picture', (el) => el.getAttribute('aria-label'));
const V4 =
	/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const NANO = /^[A-Za-z0-9_-]{21}$/;

// microtask/rAF queue
const settle = () => sleep(200);

const setCount = async (value) => {
	const field = await page.$('.uuid-genny .canon-stepper-field');
	await field.focus();
	await field.evaluate((el) => el.select());
	await field.type(String(value));
	await page.keyboard.press('Enter');
};

const clickKind = (label) =>
	page.$$eval(
		'.uuid-genny [role="radio"]',
		(els, l) => els.find((el) => el.textContent.trim() === l)?.click(),
		label,
	);

const sw = (title) =>
	page.evaluateHandle(
		(t) =>
			[...document.querySelectorAll('.uuid-genny-option')]
				.find((row) => row.textContent.includes(t))
				.querySelector('[role="switch"]'),
		title,
	);

check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect()
				.height ===
			document.querySelector('.uuid-genny').getBoundingClientRect()
				.height,
	),
);

let batch = await rows();
check(
	'v4 by default: 10 canonical ids',
	batch.length === 10 && batch.every((id) => V4.test(id)),
	`${batch.length} rows`,
);
check(
	'the banner draws the first id, named',
	(await picture()) === `UUID v4 ${batch[0]}`,
	await picture(),
);
check(
	'the banner has a column per character, four bits each',
	await page.evaluate(
		() =>
			document.querySelectorAll('.uuid-picture-column').length === 36 &&
			document.querySelectorAll('.uuid-picture-bit').length === 128,
	),
);
check(
	'the heading names the kind',
	(await page.$eval('.uuid-genny .canon-split-main .canon-heading', (el) =>
		el.textContent.trim(),
	)) === 'UUID v4',
);

await setCount(100);
await settle();
batch = await rows();
check('count grows the batch to 100', batch.length === 100, `${batch.length}`);
await page.focus('.uuid-genny .canon-stepper-field');
await page.keyboard.press('ArrowUp');
await settle();
batch = await rows();
check('count stops at 100', batch.length === 100, `${batch.length}`);

await setCount(5);
await settle();
batch = await rows();
check('count shrinks the batch', batch.length === 5, `${batch.length} rows`);

const before = batch;
await (await sw('Uppercase')).click();
await settle();
let now = await rows();
check(
	'uppercase reformats the same ids',
	now.every((id, i) => id === before[i].toUpperCase()),
	now[0],
);

await (await sw('Strip hyphens')).click();
await settle();
now = await rows();
check(
	'strip hyphens reformats the same ids',
	now.every((id, i) => id === before[i].replaceAll('-', '').toUpperCase()),
	now[0],
);
check(
	'the banner follows the format',
	(await picture()) === `UUID v4 ${now[0]}` &&
		(await page.$$eval('.uuid-picture-column', (els) => els.length)) ===
			32,
);
await (await sw('Uppercase')).click();
await (await sw('Strip hyphens')).click();
await settle();

const t0 = Date.now();
await clickKind('UUID v7');
const t1 = Date.now();
await settle();
batch = await rows();
const stamps = batch.map((id) =>
	parseInt(id.replaceAll('-', '').slice(0, 12), 16),
);
check(
	'v7 ids carry version 7 and variant 10',
	batch.every(
		(id) => id[14] === '7' && /[89ab]/.test(id.replaceAll('-', '')[16]),
	),
	batch[0],
);
check(
	'v7 ids embed the time they were made',
	stamps.every((ts) => ts >= t0 - 1000 && ts <= t1 + 1000),
	`${stamps[0]} ∈ [${t0 - 1000}, ${t1 + 1000}]`,
);
check(
	'v7 ids come out in creation order',
	stamps.every((ts, i) => i === 0 || ts >= stamps[i - 1]),
	stamps.join(','),
);
await sleep(800);
const stamp = await page.$eval('.uuid-picture-stamp', (el) =>
	el.textContent.trim(),
);
check(
	'the bracket reads the v7 time',
	stamp === new Date(stamps[0]).toISOString(),
	stamp,
);

await clickKind('Nano ID');
await settle();
batch = await rows();
check(
	'nano ids are 21 url-safe chars',
	batch.length === 5 && batch.every((id) => NANO.test(id)),
	batch[0],
);
check(
	'uuid-only options turn off for nano ids',
	(await (await sw('Uppercase')).evaluate((el) => el.disabled)) &&
		(await (await sw('Strip hyphens')).evaluate((el) => el.disabled)),
);
check(
	'six bit rows for nano ids',
	(await page.$$eval('.uuid-picture-bit', (els) => els.length)) === 126,
);

await page.click('.uuid-genny-row:nth-of-type(3)');
await sleep(300);
const third = batch[2];
check(
	'a row copies its id',
	(await page.evaluate(() => navigator.clipboard.readText())) === third,
);
check(
	'and the toast shows',
	await page.$eval('.canon-toast', (t) => t.style.opacity === '1'),
);
await sleep(800);
check(
	'and the banner moves to it',
	(await picture()) === `Nano ID ${third}`,
	await picture(),
);
check(
	'the chosen row is lit',
	await page.$eval('.canon-value-line--lit', (el) =>
		el.textContent.includes('03'),
	),
);

await page.evaluate(() =>
	[...document.querySelectorAll('.uuid-genny .canon-button')]
		.find((b) => b.textContent.includes('Copy all'))
		.click(),
);
await sleep(300);
check(
	'copy all copies every id, one a line',
	(await page.evaluate(() => navigator.clipboard.readText())) ===
		batch.join('\n'),
);

const regenerate = () =>
	page.evaluate(() =>
		[...document.querySelectorAll('.uuid-genny .canon-button')]
			.find((b) => b.textContent.includes('Regenerate'))
			.click(),
	);
const scrambling = () =>
	page.$$eval('.uuid-picture--muted', (els) => els.length);
const stale = batch;
await regenerate();
await sleep(60);
check('a new id scrambles in', (await scrambling()) > 0);
await settle();
await sleep(400);
check('and settles', (await scrambling()) === 0);
batch = await rows();
check(
	'regenerate replaces the batch',
	batch.length === 5 && batch.every((id) => !stale.includes(id)),
);
await page.emulateMediaFeatures([
	{ name: 'prefers-reduced-motion', value: 'reduce' },
]);
await regenerate();
await sleep(60);
check('reduced motion: no scramble', (await scrambling()) === 0);
await page.emulateMediaFeatures([]);

await visit(
	page,
	'/tools/uuid-genny?uuidKind=uuid7&uuidCount=3&uuidSelect=1&uuidUpper=1&uuidStrip=1',
);
batch = await rows();
check(
	'launch flags: kind, count, selection and format',
	batch.length === 3 &&
		/^[0-9A-F]{32}$/.test(batch[1]) &&
		(await picture()) === `UUID v7 ${batch[1]}`,
	batch[1],
);

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/uuid-genny');
check(
	'no horizontal scroll on a phone',
	await page.evaluate(
		() =>
			document.documentElement.scrollWidth <=
				document.documentElement.clientWidth &&
			document.querySelector('.uuid-picture-grid').scrollWidth <=
				document.querySelector('.uuid-picture').clientWidth,
	),
);

await finish(browser);
