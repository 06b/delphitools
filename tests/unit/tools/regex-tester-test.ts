import { module, test } from 'qunit';
import {
	listLimit,
	matchesHeading,
	matchLines,
	pieces,
	runRegex,
	type RegexOutcome,
} from 'delphitools-v2/components/tools/regex-tester/regex';

type Matched = Extract<RegexOutcome, { kind: 'matched' }>;

function matched(outcome: RegexOutcome): Matched {
	if (outcome.kind !== 'matched') throw new Error(outcome.kind);
	return outcome;
}

module('Unit | Tool | regex-tester', function () {
	// the iOS RegexTesterEngine.selfCheck cases
	test('global matches carry their group ranges', function (assert) {
		const all = matched(runRegex('(a)b', 'g', 'ab ab ab'));
		assert.strictEqual(all.matches.length, 3);
		assert.strictEqual(all.groups, 1);
		assert.deepEqual(all.matches[1], {
			start: 3,
			end: 5,
			groups: [[3, 4]],
		});
	});

	test('without g only the first match', function (assert) {
		const first = matched(runRegex('ab', '', 'ab ab ab'));
		assert.strictEqual(first.matches.length, 1);
		assert.strictEqual(first.groups, 0);
	});

	test('i folds case', function (assert) {
		assert.strictEqual(
			matched(runRegex('AB', 'gi', 'ab ab ab')).matches
				.length,
			3,
		);
	});

	test('a group that took no part is null', function (assert) {
		const optional = matched(runRegex('(x)?(b)', 'g', 'b'));
		assert.strictEqual(optional.groups, 2);
		assert.deepEqual(optional.matches[0]?.groups, [null, [0, 1]]);
	});

	test('zero-width matches advance', function (assert) {
		const empty = matched(runRegex('^', 'gm', 'a\nb'));
		assert.deepEqual(
			empty.matches.map((m) => [m.start, m.end]),
			[
				[0, 0],
				[2, 2],
			],
		);
	});

	test('the limit truncates', function (assert) {
		const capped = matched(runRegex('.', 'g', 'x'.repeat(20), 5));
		assert.strictEqual(capped.matches.length, 5);
		assert.true(capped.truncated);
	});

	test('groups are counted without a match', function (assert) {
		const none = matched(runRegex('(a)(?:b)(c(d))', 'g', 'zzz'));
		assert.strictEqual(none.matches.length, 0);
		assert.strictEqual(none.groups, 3);
	});

	test('invalid and empty patterns', function (assert) {
		const invalid = runRegex('(', 'g', 'ab');
		assert.strictEqual(invalid.kind, 'invalid');
		assert.notOk(
			(invalid as { message: string }).message.includes(
				'/gd',
			),
			'the error names the flags as typed',
		);
		assert.deepEqual(runRegex('', 'g', 'ab'), { kind: 'empty' });
	});

	test('pieces cut at match and group edges', function (assert) {
		const { matches } = matched(runRegex('(a)b', 'g', 'xab ab'));
		assert.deepEqual(pieces('xab ab', matches), [
			{ text: 'x', shade: 0, rails: [] },
			{
				text: 'a',
				shade: 1,
				rails: [{ level: 1, starts: true, ends: true }],
			},
			{ text: 'b', shade: 1, rails: [] },
			{ text: ' ', shade: 0, rails: [] },
			{
				text: 'a',
				shade: 2,
				rails: [{ level: 1, starts: true, ends: true }],
			},
			{ text: 'b', shade: 2, rails: [] },
		]);
	});

	test('a rail spans the pieces a nested group cuts', function (assert) {
		const { matches } = matched(runRegex('(a(b)c)', 'g', 'abc'));
		assert.deepEqual(
			pieces('abc', matches).map((p) => p.rails),
			[
				[{ level: 1, starts: true, ends: false }],
				[
					{
						level: 1,
						starts: false,
						ends: false,
					},
					{ level: 2, starts: true, ends: true },
				],
				[{ level: 1, starts: false, ends: true }],
			],
		);
	});

	test('zero-width matches and groups become carets', function (assert) {
		const { matches } = matched(runRegex('^|(x?)b', 'gm', 'b'));
		const out = pieces('b', matches);
		assert.deepEqual(
			out
				.filter((p) => p.caret !== undefined)
				.map((p) => p.caret),
			[0],
			'the empty match at 0',
		);
		const { matches: grouped } = matched(
			runRegex('(x?)b', 'g', 'b'),
		);
		assert.deepEqual(pieces('b', grouped)[0], {
			text: '',
			shade: 0,
			rails: [],
			caret: 1,
		});
	});

	test('pieces rebuild the text', function (assert) {
		const text = 'Ruby <ruby@delphi.tools>, bob@example.org';
		const { matches } = matched(
			runRegex(String.raw`([\w.]+)@([\w-]+\.\w+)`, 'g', text),
		);
		assert.strictEqual(
			pieces(text, matches)
				.map((p) => p.text)
				.join(''),
			text,
		);
	});

	test('match lines list each match then its groups', function (assert) {
		const { matches } = matched(runRegex('(x)?(b)|c', 'g', 'bc'));
		assert.deepEqual(matchLines('bc', matches), [
			{ label: '1', value: 'b', tint: 0 },
			{ label: '$1', value: null, tint: 1 },
			{ label: '$2', value: 'b', tint: 2 },
			{ label: '2', value: 'c', tint: 0 },
			{ label: '$1', value: null, tint: 1 },
			{ label: '$2', value: null, tint: 2 },
		]);
	});

	test('match lines stop at the list limit; tints cycle', function (assert) {
		const text = 'a'.repeat(listLimit + 5);
		const { matches } = matched(runRegex('a', 'g', text));
		assert.strictEqual(matchLines(text, matches).length, listLimit);
		const { matches: five } = matched(
			runRegex('(a)(a)(a)(a)(a)', 'g', 'aaaaa'),
		);
		assert.deepEqual(
			matchLines('aaaaa', five).map((l) => l.tint),
			[0, 1, 2, 3, 4, 1],
		);
	});

	test('the heading counts what is listed', function (assert) {
		assert.strictEqual(matchesHeading(3, false), 'Matches · 3');
		assert.strictEqual(
			matchesHeading(1000, true),
			'Matches · 100 / 1,000+',
		);
	});
});
