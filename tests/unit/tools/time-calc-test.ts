import { module, test } from 'qunit';
import {
	breakdown,
	difference,
	formats,
	offsetSeconds,
	read,
	rewrite,
	rung,
	rungs,
	shift,
	signed,
	span,
	subsolar,
	terminator,
	ticks,
	wallText,
} from 'delphitools-v2/components/tools/time-calc/time';
import { limit, pose } from 'delphitools-v2/components/tools/time-calc/draw';

// unix, rfc 822 drop ms
const INSTANT = new Date('2024-01-01T00:00:00.000Z');

module('Unit | Tool | time-calc', function () {
	test('every format reads back to the instant it came from', function (assert) {
		const values = formats(INSTANT);
		for (const [format, text] of Object.entries(values)) {
			const reading = read(text);
			assert.strictEqual(
				reading?.date.getTime(),
				INSTANT.getTime(),
				`${format}: ${text}`,
			);
			assert.strictEqual(reading?.format, format, text);
		}
	});

	// rss 2.0 cites rfc 822
	test('rfc822 is a day name, a four-digit year and a zone', function (assert) {
		assert.strictEqual(
			formats(INSTANT).rfc822,
			'Mon, 01 Jan 2024 00:00:00 GMT',
		);
	});

	test('numbers: seconds, decimals, a comma, ms from twelve digits', function (assert) {
		assert.strictEqual(
			read('1704067200')?.date.getTime(),
			INSTANT.getTime(),
		);
		assert.strictEqual(
			read('1704067200,5')?.date.getTime(),
			INSTANT.getTime() + 500,
		);
		assert.strictEqual(read('−1')?.date.getTime(), -1000);
		const ms = read('1704067200000');
		assert.strictEqual(ms?.format, 'unixMs');
		assert.strictEqual(ms?.date.getTime(), INSTANT.getTime());
	});

	test('four digits are a year', function (assert) {
		const year = read('2024', 'UTC');
		assert.strictEqual(
			year?.date.toISOString(),
			'2024-01-01T00:00:00.000Z',
		);
		assert.strictEqual(read('20240')?.format, 'unix');
	});

	test('a day past the month end is refused', function (assert) {
		assert.strictEqual(read('2023-02-29'), null);
		assert.strictEqual(read('2023-04-31'), null);
		assert.ok(read('2024-02-29'));
	});

	test('a date with no zone is a wall clock in the zone given', function (assert) {
		const tokyo = read('2024-01-01 09:00', 'Asia/Tokyo');
		assert.strictEqual(tokyo?.date.getTime(), INSTANT.getTime());
		assert.true(tokyo?.floating);
		assert.strictEqual(
			read(
				'2024-01-01T09:00:00+09:00',
				'Europe/Berlin',
			)?.date.getTime(),
			INSTANT.getTime(),
			'an offset wins over the zone',
		);
		// 02:30 does not exist in Berlin on 2024-03-31
		const gap = read('2024-03-31 02:30', 'Europe/Berlin');
		assert.strictEqual(
			wallText(gap!.date, 'Europe/Berlin'),
			'2024-03-31 03:30:00',
		);
	});

	test('rejects what does not read', function (assert) {
		for (const junk of [
			'',
			'   ',
			'not a date',
			'Xyz, 99 Foo 2024',
			'2024-13-01',
		])
			assert.strictEqual(
				read(junk),
				null,
				JSON.stringify(junk),
			);
	});

	test('a step is written the way the value was typed', function (assert) {
		const later = new Date(INSTANT.getTime() + 1000);
		assert.strictEqual(
			rewrite(later, read('1704067200')!),
			'1704067201',
		);
		assert.strictEqual(
			rewrite(
				later,
				read('2024-01-01 09:00', 'Asia/Tokyo')!,
				'Asia/Tokyo',
			),
			'2024-01-01 09:00:01',
		);
		assert.strictEqual(
			rewrite(later, read('2024-01-01T00:00:00Z')!),
			'2024-01-01T00:00:01.000Z',
		);
	});

	test('offsets and signed hours', function (assert) {
		assert.strictEqual(
			offsetSeconds(INSTANT, 'Asia/Kolkata'),
			19_800,
		);
		assert.strictEqual(signed(19_800), '+5:30');
		assert.strictEqual(signed(-8 * 3600), '−8');
		assert.strictEqual(signed(0), '0');
	});

	test('calendar shifts clamp month ends', function (assert) {
		const end = shift(new Date(2024, 0, 31, 9), 1, 'months');
		assert.deepEqual(
			[end.getMonth(), end.getDate(), end.getHours()],
			[1, 29, 9],
		);
		const leap = shift(new Date(2024, 1, 29), 1, 'years');
		assert.deepEqual(
			[leap.getFullYear(), leap.getMonth(), leap.getDate()],
			[2025, 1, 28],
		);
		const back = shift(new Date(2024, 0, 10), -1, 'weeks');
		assert.deepEqual(
			[back.getFullYear(), back.getMonth(), back.getDate()],
			[2024, 0, 3],
		);
		assert.strictEqual(
			shift(INSTANT, 90, 'minutes').getTime(),
			INSTANT.getTime() + 90 * 60_000,
		);
	});

	test('differences and spans', function (assert) {
		const parts = difference(
			INSTANT,
			new Date(
				INSTANT.getTime() +
					(7 * 86_400 + 3 * 3600 + 5) * 1000,
			),
		);
		assert.strictEqual(breakdown(parts), '7d 3h 5s');
		assert.strictEqual(
			breakdown(difference(INSTANT, INSTANT)),
			'0s',
		);
		assert.deepEqual(span(90), ['1', 'm']);
		assert.deepEqual(span(0.4), ['0', 's']);
	});

	// the iOS TimeCalcAxis and TimeCalcWorld self-checks
	test('axis rungs and ticks', function (assert) {
		const decades = rungs[rung(limit, 330, 44)]!;
		assert.deepEqual(
			[decades.component, decades.count],
			['year', 10],
		);
		const days = rungs[rung(7 * 86_400, 330, 44)]!;
		assert.deepEqual([days.component, days.count], ['day', 1]);
		const noon = new Date(2024, 0, 10, 12);
		const hours = ticks(
			noon,
			new Date(noon.getTime() + 86_400_000),
			rungs[5]!,
		);
		assert.strictEqual(hours.length, 9);
		assert.strictEqual(hours[0]!.getTime(), noon.getTime());
		assert.true(
			rungs.every(
				(r) =>
					r.minor === undefined ||
					rungs[r.minor]!.seconds < r.seconds,
			),
		);
	});

	test('the sun and the terminator', function (assert) {
		const sun = subsolar(new Date('2026-03-20T12:00:00Z'));
		assert.true(Math.abs(sun[0]) < 1.5);
		assert.true(Math.abs(sun[1]) < 0.01);
		const june = subsolar(new Date('2026-06-21T12:00:00Z'));
		assert.true(june[0] > 23);
		assert.true(Math.abs(terminator(180, june) - 66.6) < 1);
	});

	test('the epoch pose runs from 1970 past 2038 and now', function (assert) {
		const now = new Date('2026-10-17T00:00:00Z');
		const p = pose({ kind: 'epoch', date: INSTANT }, now);
		assert.true(p.lo < 0);
		assert.true(p.hi > limit);
		assert.strictEqual(p.a, INSTANT.getTime() / 1000);
	});
});
