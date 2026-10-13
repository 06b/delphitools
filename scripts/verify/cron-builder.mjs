// cron-builder: the canon port
//
// Usage: npm start, then node scripts/verify/cron-builder.mjs

import { launch, visit, check, finish, sleep } from './harness.mjs';
import { grantClipboard } from './text-tool.mjs';

const { browser, page } = await launch();
await grantClipboard(page);
await visit(page, '/tools/cron-builder');

const settle = () => sleep(150);
const setBox = async (value) => {
	await page.$eval(
		'.cron-expression',
		(el, v) => {
			el.value = v;
			el.dispatchEvent(new Event('input', { bubbles: true }));
		},
		value,
	);
	await settle();
};
const state = () =>
	page.evaluate(() => ({
		box: document.querySelector('.cron-expression').value,
		sentence: document.querySelector('.cron-sentence')?.textContent.trim(),
		canonical: document
			.querySelector('.cron-canonical .canon-value-line-value')
			?.textContent.trim(),
		runs: [...document.querySelectorAll('.cron-run .canon-value-line-value')].map(
			(e) => e.textContent.trim(),
		),
		headings: [...document.querySelectorAll('.cron-schedule .canon-heading')].map(
			(e) => e.textContent.trim(),
		),
		sources: [...document.querySelectorAll('.cron-field-source')].map((e) => e.value),
		details: [...document.querySelectorAll('.cron-field-detail')].map((e) =>
			e.textContent.trim(),
		),
		errors: [...document.querySelectorAll('.cron-errors .canon-status')].map((e) =>
			e.textContent.trim(),
		),
		copyDisabled: document.querySelector('.cron-copy').disabled,
		open: [...document.querySelectorAll('.cron-field')].findIndex((e) =>
			e.classList.contains('cron-field--open'),
		),
		rails: [...document.querySelectorAll('.cron-rail')].map((r) => ({
			detail: r.querySelector('.cron-rail-detail').textContent.trim(),
			kept: r.querySelectorAll('.cron-cell--kept').length,
			next: r.querySelectorAll('.cron-cell--next').length,
			chosen: r.classList.contains('cron-rail--chosen'),
			failed: r.classList.contains('cron-rail--failed'),
		})),
		figure: document.querySelector('.cron-head .canon-figure-said')?.textContent.replace(/\s+/g, ''),
		when: document.querySelector('.cron-head-when')?.textContent.trim(),
		either: !!document.querySelector('.cron-either'),
	}));

check(
	'the split fills the sheet',
	await page.evaluate(() => {
		const sheet = document.querySelector('.dt-canon-tool');
		const split = document.querySelector('.cron-builder');
		return (
			Math.abs(
				sheet.getBoundingClientRect().height -
					split.getBoundingClientRect().height,
			) < 1
		);
	}),
);
const expression = await page.evaluate(() => {
	const sidebar = document.querySelector('.canon-split-sidebar');
	const first = sidebar.querySelector('textarea, input, button, [tabindex]');
	const box = document.querySelector('.cron-expression');
	return {
		first: first === box,
		height: box.getBoundingClientRect().height,
		font: parseFloat(getComputedStyle(box).fontSize),
		fits: box.scrollWidth <= box.clientWidth,
	};
});
check('the expression is the first control', expression.first);
check(
	'at primary height and a large size',
	expression.height >= 68 && expression.font >= 28,
	`${expression.height} px tall, ${expression.font} px`,
);
check('the default expression fits the sidebar', expression.fits);
await setBox('0,30 9 1,15 JAN-JUN MON-FRI');
check(
	'a long expression shrinks to stay whole',
	await page.$eval('.cron-expression', (el) => el.scrollWidth <= el.clientWidth),
);
await setBox('30 9 * * MON-FRI');
await page.click('.cron-expression');
await sleep(100);
check(
	'focus selects the whole expression',
	await page.$eval(
		'.cron-expression',
		(el) => el.selectionStart === 0 && el.selectionEnd === el.value.length,
	),
);

let seen = await state();
check('the box starts at the default expression', seen.box === '30 9 * * MON-FRI');
check('the canonical line normalises the day names', seen.canonical === '30 9 * * 1-5');
check('the sentence reads the default', seen.sentence === 'At 09:30 on weekdays', seen.sentence);
check(
	'five next runs, the time zone in the heading',
	seen.runs.length === 5 && /^Next runs · .+/.test(seen.headings[1] ?? ''),
	seen.headings[1],
);
check(
	'the rails keep minute 30, hour 9, every day, five weekdays',
	seen.rails[0].kept + seen.rails[0].next === 1 &&
		seen.rails[1].kept + seen.rails[1].next === 1 &&
		seen.rails[4].kept + seen.rails[4].next === 5,
	JSON.stringify(seen.rails.map((r) => r.kept + r.next)),
);
check(
	'the next run lights one cell on each rail',
	seen.rails.every((r) => r.next === 1),
);
check('the open field lights its rail', seen.open === 0 && seen.rails[0].chosen);
check(
	'the figure counts down to the next run',
	/^\d+\D+$/.test(seen.figure ?? '') && seen.when === seen.runs[0],
	`${seen.figure} · ${seen.when}`,
);
check('the weekday row names the range', seen.details[4] === 'Monday–Friday', seen.details[4]);

// the minute row is open: Step, then its number
await page.$$eval('.cron-field-panel .canon-segmented button', (els) =>
	els.find((e) => e.textContent.trim() === 'Step')?.click(),
);
await settle();
seen = await state();
check('Step rewrites the expression', seen.canonical === '*/5 9 * * 1-5', seen.canonical);
check(
	'the sentence follows',
	seen.sentence === 'Every 5 minutes during hour 9 on weekdays',
	seen.sentence,
);
await page.click('.cron-field-panel .canon-number-field button:last-of-type');
await settle();
seen = await state();
check('the Every number steps the field', seen.sources[0] === '*/6', seen.sources[0]);
await page.focus('.cron-field-panel .canon-number-field input');
await page.keyboard.press('ArrowUp');
await settle();
check(
	'and takes the arrow keys',
	(await state()).sources[0] === '*/7',
	(await state()).sources[0],
);

// a row toggles; typing in another row opens it
await page.click('.cron-field-face');
await settle();
check('a tap on the open row closes it', (await state()).open === -1);
await page.$$eval('.cron-field-source', (els) => {
	els[1].focus();
	els[1].select();
});
await page.keyboard.type('9-17');
await settle();
seen = await state();
check('typing in a row opens it', seen.open === 1);
check('and is live', seen.box === '*/7 9-17 * * MON-FRI', seen.box);
check('the hour rail keeps nine hours', seen.rails[1].kept + seen.rails[1].next === 9);

await setBox('*/15 9-17 * * 1-5');
seen = await state();
check(
	'a typed expression lands in the rows',
	seen.sources[0] === '*/15' && seen.sources[4] === '1-5',
	seen.sources.join(' '),
);

await setBox('0 9 1 * MON');
check('both day rails restricted: the or bracket', (await state()).either);

await setBox('0 9 * MON 1');
seen = await state();
check(
	'a name in the wrong field is named with its reason',
	seen.errors.some((e) => e.startsWith('Month · Wrong field')),
	seen.errors.join(' | '),
);
check(
	'the row and the rail carry the error too',
	seen.details[3].startsWith('Wrong field') && seen.rails[3].failed,
);
check('no schedule while it is broken', seen.canonical === undefined);
check('Copy refuses an invalid expression', seen.copyDisabled);

await setBox('0 9');
seen = await state();
check(
	'four words short: the five-field warning, the rows blank',
	seen.errors[0]?.startsWith('A cron expression has five fields') &&
		seen.sources.every((s) => s === '') &&
		!!(await page.$('.canon-split-sidebar .canon-status')),
);

await setBox('0 0 31 2 *');
seen = await state();
check(
	'a date that never comes: Never',
	seen.when === 'Never' && !!(await page.$('.cron-schedule .canon-empty-row')),
	seen.when,
);

await setBox('*/15 9-17 * * 1-5');
await page.click('.cron-copy');
await sleep(150);
check(
	'Copy puts the canonical expression on the clipboard',
	(await page.evaluate(() => navigator.clipboard.readText())) === '*/15 9-17 * * 1-5',
);
check(
	'and the toast shows',
	await page.$eval('.canon-toast', (el) => el.style.opacity === '1'),
);

await visit(page, '/tools/cron-builder?cronExpr=0%200%201%20*%20SUN&cronField=4&cronFocus=field');
await sleep(300);
seen = await state();
check(
	'?cronExpr= ?cronField= ?cronFocus= set the expression, open row and focus',
	seen.canonical === '0 0 1 * 0' &&
		seen.open === 4 &&
		(await page.evaluate(() =>
			document.activeElement?.closest('.cron-field--open'),
		)) !== null,
);

await page.setViewport({ width: 390, height: 844 });
await visit(page, '/tools/cron-builder');
const narrow = await page.evaluate(() => {
	const body = document.querySelector('.canon-split-body');
	return {
		wide: getComputedStyle(body).getPropertyValue('--canon-split-layout').trim(),
		overflow:
			document.documentElement.scrollWidth > window.innerWidth ||
			body.scrollWidth > body.clientWidth,
	};
});
check('390 px: one column', narrow.wide === 'stacked', narrow.wide);
check('390 px: no horizontal scroll', !narrow.overflow);

await finish(browser);
