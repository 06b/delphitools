// the canon time-calc: the field first and large, every format read and
// written, the live clock, arithmetic with quick offsets and the web amount,
// timezone conversion with the web zone list, launch flags, phone

import { BASE, launch, visit, check, finish, sleep } from './harness.mjs';

const { browser, page } = await launch();
await page
	.browserContext()
	.overridePermissions(BASE, [
		'clipboard-read',
		'clipboard-write',
		'clipboard-sanitized-write',
	]);
await page.emulateTimezone('Europe/Berlin');

const field = '.tc-field .canon-big-number-field-input';
const stopped = 'timeNow=2026-10-17T19:03:00Z';

const state = () =>
	page.evaluate(() => {
		const q = (s) => document.querySelector(s);
		const lines = {};
		for (const line of document.querySelectorAll('.time-calc .canon-value-line'))
			lines[line.querySelector('.canon-value-line-label').textContent.trim()] = line
				.querySelector('.canon-value-line-value')
				.textContent.trim();
		return {
			field: q('.tc-field .canon-big-number-field-input').value,
			unit: q('.tc-field .canon-big-number-field-unit')?.textContent.trim() ?? '',
			status: q('.time-calc .canon-status')?.textContent.trim() ?? '',
			figure: q('.tc-figure .canon-figure-said')?.textContent.trim() ?? '',
			word: q('.tc-word')?.textContent.trim() ?? '',
			label: q('.tc-picture-label').getAttribute('aria-label'),
			drawing: q('.tc-drawing').innerHTML.length,
			band: q('.time-calc .canon-canvas').getBoundingClientRect().height,
			lines,
			tiles: [...document.querySelectorAll('.time-calc .canon-tiles-tile')].map((t) =>
				t.textContent.replace(/\s+/g, ' ').trim(),
			),
			end: q('.tc-date-pick')?.textContent.trim() ?? '',
		};
	});

const retype = async (text) => {
	await page.evaluate(() => document.activeElement?.blur());
	await page.click(field);
	await sleep(80);
	await page.keyboard.type(text);
	await sleep(60);
};

const press = (text, scope = '.time-calc') =>
	page.evaluate(
		(t, s) =>
			[...document.querySelector(s).querySelectorAll('button')]
				.find((b) => b.textContent.trim() === t || b.getAttribute('aria-label') === t)
				.click(),
		text,
		scope,
	);

const mode = (title) =>
	page.evaluate(
		(t) =>
			[...document.querySelectorAll('[aria-label="Mode"] [role="radio"]')]
				.find((b) => b.textContent.trim() === t)
				.click(),
		title,
	);

const line = (lines, city) =>
	Object.entries(lines).find(([k]) => k.startsWith(`${city} ·`))?.[1] ?? '';

const pickZone = (index, zone) =>
	page.evaluate(
		(i, z) => {
			const select = document.querySelectorAll('.tc-zone-cell select')[i];
			select.value = z;
			select.dispatchEvent(new Event('change', { bubbles: true }));
		},
		index,
		zone,
	);

// timestamp
await visit(page, `/tools/time-calc?${stopped}`);
check(
	'the split fills the sheet',
	await page.evaluate(
		() =>
			document.querySelector('.dt-canon-tool').getBoundingClientRect().height ===
			document.querySelector('.time-calc').getBoundingClientRect().height,
	),
);
const layout = await page.evaluate(() => {
	const input = document.querySelector('.tc-field .canon-big-number-field-input');
	const first = document.querySelector('.canon-split-sidebar .canon-rows > *');
	return { first: first?.contains(input), size: parseFloat(getComputedStyle(input).fontSize) };
});
check('the field opens the settings pane', layout.first);
check('in the big-number size', layout.size >= 28, `${layout.size}px`);
let s = await state();
check('opens on now in Unix seconds', s.field === '1792263780' && s.unit === 'Unix (seconds)', `${s.field} ${s.unit}`);
check('the figure says now', s.figure === '0s' && s.word === 'Now', `${s.figure} ${s.word}`);
check('the epoch is drawn', s.drawing > 1000 && s.label.startsWith('Timestamp'), `${s.drawing} ${s.label}`);
check(
	'every web format is a line',
	['Local Time', 'UTC', 'ISO 8601', 'RFC 822', 'Unix (seconds)', 'Unix (milliseconds)', 'Date & Time', 'Relative'].every(
		(l) => l in s.lines,
	),
	Object.keys(s.lines).join('|'),
);
check('ISO and RFC 822 of now', s.lines['ISO 8601'] === '2026-10-17T19:03:00.000Z' && s.lines['RFC 822'] === 'Sat, 17 Oct 2026 19:03:00 GMT', s.lines['ISO 8601']);

await page.click(field);
await sleep(80);
check(
	'focus selects the whole value',
	await page.evaluate(() => {
		const f = document.querySelector('.tc-field .canon-big-number-field-input');
		return f.selectionStart === 0 && f.selectionEnd === f.value.length;
	}),
);
await page.keyboard.type('1704067200');
await sleep(40);
s = await state();
check('typing replaces it and is live', s.lines['ISO 8601'] === '2024-01-01T00:00:00.000Z' && s.lines['Date & Time'] === '2024-01-01 01:00:00', JSON.stringify(s.lines));
check('the figure counts back from now', s.word === 'ago' && s.figure === '2y', `${s.figure} ${s.word}`);
await page.keyboard.press('ArrowUp');
await sleep(40);
s = await state();
check('the arrow keys step a second', s.field === '1704067201', s.field);
await retype('2024-01-01T00:00:00Z');
s = await state();
check('an ISO date reads', s.unit === 'ISO 8601' && s.lines['Unix (seconds)'] === '1704067200', `${s.unit} ${s.lines['Unix (seconds)']}`);
await page.keyboard.press('ArrowDown');
await sleep(40);
s = await state();
check('and steps as ISO', s.field === '2023-12-31T23:59:59.000Z', s.field);
await retype('Mon, 01 Jan 2024 00:00:00 GMT');
s = await state();
check('RFC 822 reads', s.unit === 'RFC 822' && s.lines['Unix (seconds)'] === '1704067200', s.unit);
await retype('2024-01-01 01:00:00');
s = await state();
check('a wall clock reads in local time', s.unit === 'Date & Time' && s.lines['Unix (seconds)'] === '1704067200', `${s.unit} ${s.lines['Unix (seconds)']}`);
await retype('1704067200000');
s = await state();
check('thirteen digits read as milliseconds', s.unit === 'Unix (milliseconds)' && s.lines['Unix (seconds)'] === '1704067200', s.unit);
await retype('soon');
s = await state();
check('nonsense warns and dashes', s.status === 'Invalid date' && s.lines['UTC'] === '—' && s.figure === '', `${s.status} ${s.lines['UTC']}`);

await page.evaluate(() => document.activeElement?.blur());
await press('Now');
await sleep(60);
s = await state();
check('Now goes back to the clock', s.field === '1792263780' && s.status === '', s.field);

await page.evaluate(() =>
	[...document.querySelectorAll('.time-calc .canon-value-line')]
		.find((l) => l.querySelector('.canon-value-line-label').textContent.trim() === 'Unix (milliseconds)')
		.click(),
);
await sleep(300);
const copied = await page.evaluate(() => navigator.clipboard.readText());
check('a line copies its value', copied === '1792263780000', copied);
check('and the toast shows', await page.$eval('.canon-toast', (t) => t.style.opacity === '1'));

await page.evaluate(() => navigator.clipboard.writeText(' 86400 '));
await press('Paste');
await sleep(150);
s = await state();
check('Paste fills the field', s.field === '86400' && s.lines['ISO 8601'] === '1970-01-02T00:00:00.000Z', s.field);

// the clock runs without a stop
await visit(page, '/tools/time-calc');
const before = (await state()).field;
await sleep(2100);
const after = (await state()).field;
check('the field follows the clock', Number(after) - Number(before) >= 1, `${before} → ${after}`);
await page.click(field);
await sleep(100);
const held = (await state()).field;
await sleep(1200);
check('focus stops it', (await state()).field === held, held);

// arithmetic
await visit(page, `/tools/time-calc?${stopped}&timeMode=arithmetic&timeStart=2024-01-31%2009:00`);
s = await state();
check('arithmetic opens on start plus a week', s.tiles[0] === 'Difference 7d' && s.tiles[1] === 'Total Days 7', s.tiles.join('|'));
check('the field is the start', s.unit === 'Start Date · Date & Time', s.unit);
check('the span is drawn', s.drawing > 1000 && s.label === 'Difference 7d', s.label);
await press('+1 month');
await sleep(60);
s = await state();
check('+1 month clamps to the month end', s.lines['ISO 8601'] === '2024-02-29T08:00:00.000Z', s.lines['ISO 8601']);
check('the figure keeps the exact span', s.figure === '29d', s.figure);
await page.evaluate(() =>
	[...document.querySelectorAll('[aria-label="Operation"] [role="radio"]')]
		.find((b) => b.textContent.trim() === 'Subtract')
		.click(),
);
await sleep(60);
s = await state();
check('Subtract runs the amount back', s.lines['ISO 8601'] === '2023-12-31T08:00:00.000Z', s.lines['ISO 8601']);
check('a negative span signs the figure', s.figure.startsWith('−'), s.figure);
await page.evaluate(() => {
	const select = document.querySelector('.time-calc .canon-menu-cell:not(.tc-zone-cell) select');
	select.value = '1';
	select.dispatchEvent(new Event('change', { bubbles: true }));
});
await sleep(60);
s = await state();
check('the unit menu is live', s.lines['ISO 8601'] === '2024-01-31T07:00:00.000Z', s.lines['ISO 8601']);
await press('Now', '.tc-date');
await sleep(60);
s = await state();
check('End Now picks the clock', s.lines['Unix'] === '1792263780', s.lines['Unix']);
check('Total Hours follow', s.tiles[2]?.startsWith('Total Hours'), s.tiles[2]);
await retype('2026-10-16 21:03');
s = await state();
check('a picked End stays while the start moves', s.tiles[0] === 'Difference 1d', s.tiles[0]);

// timezone
await visit(page, `/tools/time-calc?${stopped}&timeMode=timezone&timeFrom=Europe/Berlin&timeTo=Asia/Tokyo&timeZoneDate=2024-01-01%2009:00`);
s = await state();
check('the wall clock reads in From', s.unit === 'Date & Time · Berlin', s.unit);
check('From and To lines', /\b0?9:00:00/.test(line(s.lines, 'Berlin')) && /17:00:00|5:00:00\sPM/.test(line(s.lines, 'Tokyo')), JSON.stringify(s.lines));
check('the figure is the offset', s.figure === '+8h', s.figure);
check('the zones are drawn', s.drawing > 3000 && s.label === 'Offset +8h', s.label);
check('the web zones are listed', ['UTC', 'New York', 'London', 'Tokyo'].every((c) => Object.keys(s.lines).some((k) => k.startsWith(c))), Object.keys(s.lines).join('|'));
await press('Swap');
await sleep(60);
s = await state();
check('Swap reads the wall clock in the new From', s.figure === '−8h' && /\b0?9:00:00/.test(line(s.lines, 'Tokyo')), `${s.figure} ${JSON.stringify(s.lines)}`);
await pickZone(1, 'America/Los_Angeles');
await sleep(60);
s = await state();
check('a zone picked from the menu', line(s.lines, 'Los Angeles') !== '', Object.keys(s.lines).join('|'));
await pickZone(2, 'Asia/Kolkata');
await sleep(60);
s = await state();
check('Add Timezone adds a line', Object.keys(s.lines).some((k) => k.startsWith('Kolkata')), Object.keys(s.lines).join('|'));
await press('Remove London');
await sleep(60);
s = await state();
check('a zone line goes', !Object.keys(s.lines).some((k) => k.startsWith('London')), Object.keys(s.lines).join('|'));
check(
	'every zone is in the menu',
	await page.evaluate(() => document.querySelector('.tc-zone-cell select').options.length > 300),
);

check(
	'mode changes the band height',
	await (async () => {
		const zones = (await state()).band;
		await mode('Timestamp');
		await sleep(100);
		const stamp = (await state()).band;
		return zones > stamp && stamp > 100;
	})(),
);

check(
	'mode is a keyboard radio group',
	await page.evaluate(() => document.querySelectorAll('[aria-label="Mode"] [role="radio"]').length === 3),
);

// phone
await page.setViewport({ width: 390, height: 844 });
for (const m of ['timestamp', 'arithmetic', 'timezone']) {
	await visit(page, `/tools/time-calc?${stopped}&timeMode=${m}`);
	check(
		`no horizontal scroll on a phone, ${m}`,
		await page.evaluate(
			() =>
				document.documentElement.scrollWidth <= document.documentElement.clientWidth &&
				document.querySelector('.dt-main').scrollWidth <= document.querySelector('.dt-main').clientWidth,
		),
	);
}

await finish(browser);
