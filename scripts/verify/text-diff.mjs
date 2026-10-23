// what unit tests cannot see
// usage: npm start, then node scripts/verify/text-diff.mjs
//   SHOTS=<dir> also saves 390, 1400 and 2200 wide, light and dark, empty and loaded

import { mkdtempSync, writeFileSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { BASE, launch, visit, check, finish, sleep } from './harness.mjs';

const shots = process.env.SHOTS;
const { browser, page } = await launch();
await page
	.browserContext()
	.overridePermissions(BASE, ['clipboard-read', 'clipboard-write', 'clipboard-sanitized-write']);
const downloads = mkdtempSync(join(tmpdir(), 'dt-td-dl-'));
const client = await page.createCDPSession();
await client.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: downloads });

const settle = () => sleep(150);
const side = (id) => `.td-side--${id}`;
const area = (id) => `${side(id)} .media-marked-source`;
const value = (id) => page.$eval(area(id), (el) => el.value);
const setValue = (id, text) =>
	page.$eval(
		area(id),
		(el, v) => {
			el.value = v;
			el.dispatchEvent(new Event('input', { bubbles: true }));
		},
		text,
	);
const cell = (id, label) => `${side(id)} .td-side-head button[aria-label="${label}"]`;
const disabled = (sel) => page.$eval(sel, (el) => el.disabled);
const emptyRow = () => page.$eval('.text-diff .canon-empty-row', (el) => el.textContent.trim()).catch(() => null);
const listing = () =>
	page.$$eval('.td-row', (els) =>
		els.map((el) => el.querySelector('.td-marker').textContent + el.querySelector('.td-row-text').textContent),
	);
const lit = (id) =>
	page.$$eval(`${side(id)} .media-marked-line--lit .media-marked-text`, (els) => els.map((el) => el.textContent));
const words = (id) => page.$$eval(`${side(id)} .td-word`, (els) => els.map((el) => el.textContent));
const toastShown = () => page.$('.canon-toast').then(Boolean);

async function waitForDownload(match, timeout = 15000) {
	const until = Date.now() + timeout;
	while (Date.now() < until) {
		const name = readdirSync(downloads).find((n) => match.test(n) && !n.endsWith('.crdownload'));
		if (name) return { name, text: readFileSync(join(downloads, name), 'utf8') };
		await sleep(150);
	}
	return null;
}

await visit(page, '/tools/text-diff');

check(
	'the split fills the slot',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.text-diff').getBoundingClientRect().height,
	),
);
const editors = await page.evaluate(() => {
	const split = document.querySelector('.text-diff').getBoundingClientRect();
	const pane = document.querySelector('.canon-split-sidebar');
	return [...document.querySelectorAll('.media-marked-source')].map((el) => ({
		inPicture: pane.contains(el),
		named: el.getAttribute('aria-label'),
		dashed: getComputedStyle(el).borderTopStyle,
		share: el.getBoundingClientRect().width / split.width,
		height: Math.round(el.getBoundingClientRect().height),
	}));
});
check(
	'both sides are typed in the picture pane, each the dashed box when empty',
	editors.length === 2 &&
		editors.every((e) => e.inPicture && e.dashed === 'dashed' && e.share > 0.4 && e.height >= 96) &&
		editors.map((e) => e.named).join() === 'Original,Modified',
	JSON.stringify(editors),
);
check(
	'empty: Nothing to compare, copy and download off, the blank map',
	(await emptyRow()) === 'Nothing to compare' &&
		(await disabled('.td-copy')) &&
		(await disabled('.td-download')) &&
		(await page.$$('.td-ribbons-blank')).length === 2,
);

// live: marks follow each keystroke
await page.click(area('old'));
await page.keyboard.type('alpha\nbeta two\ngamma');
await page.click(area('new'));
await page.keyboard.type('alpha\nbeta three\ngamma\ndelta');
await page.evaluate(() => new Promise(requestAnimationFrame));
check(
	'live: each side lights its own lines as typed',
	(await lit('old')).join('|') === 'beta two' && (await lit('new')).join('|') === 'beta three|delta',
	`${(await lit('old')).join('|')} / ${(await lit('new')).join('|')}`,
);
check(
	'changed words are marked on both sides',
	(await words('old')).join() === 'two' && (await words('new')).join() === 'three',
);
check(
	'the listing is the unified diff',
	(await listing()).join('\n') === ' alpha\n−beta two\n+beta three\n gamma\n+delta',
	(await listing()).join('\n'),
);
check(
	'the figures read the counts, said once',
	(await page.$$eval('.td-ribbons-figure .canon-figure-said', (els) => els.map((el) => el.textContent))).join() ===
		'−1,+2' && (await page.$eval('.td-ribbons output', (el) => el.textContent)) === 'Removed 1, Added 2',
);
check(
	'the map joins runs: grey, a removed-to-added swap, grey, added',
	(await page.$$eval('.td-ribbon', (els) => els.map((el) => el.classList[1]).join())) === 'td-ribbon--same,td-ribbon--swap,td-ribbon--same,td-ribbon--add' &&
		(await page.$eval('.td-bars--add', (el) => el.getAttribute('d').length)) > 0,
);
check(
	'the marks sit under the editor in the same type',
	await page.evaluate(() => {
		const text = document.querySelector('.td-side--old .media-marked-text');
		const source = document.querySelector('.td-side--old .media-marked-source');
		const a = getComputedStyle(text);
		const b = getComputedStyle(source);
		const ra = text.getBoundingClientRect();
		const rb = source.getBoundingClientRect();
		return (
			a.fontFamily === b.fontFamily &&
			a.fontSize === b.fontSize &&
			a.lineHeight === b.lineHeight &&
			Math.abs(ra.right - rb.right) < 1 &&
			Math.abs(ra.left - (rb.left + parseFloat(b.paddingLeft))) < 1 &&
			b.color === 'rgba(0, 0, 0, 0)' &&
			a.fontFamily.includes('Iosevka')
		);
	}),
);

const PATCH = '  alpha\n- beta two\n+ beta three\n  gamma\n+ delta';
await page.click('.td-copy');
await sleep(300);
check(
	'Copy patch writes the patch and confirms through the toast',
	(await page.evaluate(() => navigator.clipboard.readText())) === PATCH && (await toastShown()),
);
await page.click('.td-download');
const download = await waitForDownload(/^changes\.diff$/);
check('Download writes changes.diff with the patch', download?.text === PATCH, download?.name ?? 'none');

// wrap
const wrapped = () => page.$eval('.td-listing', (el) => el.classList.contains('td-listing--wrap'));
check('Wrap is on by default, as iOS', await wrapped());
await page.click('.text-diff .canon-row [role="switch"], .text-diff .canon-row input[type="checkbox"]');
await settle();
check('the Wrap switch turns wrapping off', !(await wrapped()));

// side cells
await page.click(cell('new', 'Swap'));
await settle();
check(
	'Swap trades the texts',
	(await value('old')) === 'alpha\nbeta three\ngamma\ndelta' && (await value('new')) === 'alpha\nbeta two\ngamma',
);
await page.click(cell('old', 'Copy'));
await sleep(200);
check(
	'Copy on a side copies its text',
	(await page.evaluate(() => navigator.clipboard.readText())) === 'alpha\nbeta three\ngamma\ndelta',
);
await page.evaluate(() => navigator.clipboard.writeText('alpha\nbeta two\ngamma'));
await page.click(cell('old', 'Paste'));
await sleep(300);
check(
	'Paste takes the clipboard; equal texts read Texts are identical',
	(await value('old')) === 'alpha\nbeta two\ngamma' &&
		(await emptyRow()) === 'Texts are identical' &&
		(await disabled('.td-copy')) &&
		!(await page.$('.td-listing')),
);

const fixture = join(downloads, 'rig-fixture.txt');
writeFileSync(fixture, 'from\nfile');
const [chooser] = await Promise.all([page.waitForFileChooser(), page.click(cell('new', 'Open file'))]);
await chooser.accept([fixture]);
await sleep(400);
check('Open file loads that side', (await value('new')) === 'from\nfile');

await page.$eval(area('new'), (el) => {
	const transfer = new DataTransfer();
	transfer.items.add(new File(['dropped'], 'drop.txt', { type: 'text/plain' }));
	el.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: transfer }));
});
await sleep(400);
check('a file dropped on a side loads into it', (await value('new')) === 'dropped' && (await value('old')) !== 'dropped');

await page.evaluate(() => {
	const transfer = new DataTransfer();
	transfer.items.add(new File(['pasted'], 'paste.txt', { type: 'text/plain' }));
	document.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: transfer }));
});
await sleep(400);
check('a file pasted anywhere loads the original', (await value('old')) === 'pasted');

await page.click(cell('old', 'Clear'));
await page.click(cell('new', 'Clear'));
await settle();
check(
	'Clear empties both sides, back to Nothing to compare',
	(await value('old')) === '' && (await value('new')) === '' && (await emptyRow()) === 'Nothing to compare',
);
check(
	'side cells are named and empty sides disable Copy and Clear',
	(await disabled(cell('old', 'Copy'))) && (await disabled(cell('new', 'Clear'))) && !(await disabled(cell('old', 'Paste'))),
);

// query flags
await visit(page, '/tools/text-diff?diffSample=1&diffWrap=0');
check(
	'?diffSample ?diffWrap set up a state',
	(await page.$$eval('.td-row', (els) => els.length)) === 17 && !(await wrapped()),
);
await visit(page, '/tools/text-diff?diffOld=a&diffNew=b');
check('?diffOld ?diffNew fill the sides', (await value('old')) === 'a' && (await value('new')) === 'b');
check('the document never scrolls', await page.evaluate(() => document.scrollingElement.scrollTop === 0));

// phone: one column, the picture collapses
await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/text-diff?diffSample=1');
const phone = await page.evaluate(() => {
	const split = document.querySelector('.text-diff');
	const body = split.querySelector('.canon-split-body');
	const picture = () => split.querySelector('.canon-split-sidebar .canon-canvas').getBoundingClientRect().height;
	const before = picture();
	body.scrollTop = 400;
	return new Promise((resolve) =>
		requestAnimationFrame(() =>
			resolve({
				collapsing: split.hasAttribute('data-collapsing'),
				before,
				after: picture(),
				overflow: document.documentElement.scrollWidth > window.innerWidth,
			}),
		),
	);
});
check(
	'390: stacked, the editors collapse to 150 on scroll, no sideways scroll',
	phone.collapsing && phone.after === 150 && phone.before > phone.after && !phone.overflow,
	JSON.stringify(phone),
);

if (shots) {
	const sizes = [
		[390, 844],
		[1400, 1000],
		[2200, 1100],
	];
	for (const theme of ['light', 'dark'])
		for (const [width, height] of sizes)
			for (const [state, query] of [
				['loaded', '?diffSample=1'],
				['empty', ''],
			]) {
				await page.setViewport({ width, height });
				await visit(page, `/tools/text-diff${query}`);
				await page.evaluate((t) => {
					document.documentElement.classList.toggle('dark', t === 'dark');
					document.documentElement.classList.toggle('light', t === 'light');
				}, theme);
				await sleep(700);
				await page.screenshot({ path: `${shots}/text-diff-${width}-${theme}-${state}.png` });
			}
}

await finish(browser);
