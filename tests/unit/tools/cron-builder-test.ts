import { module, test } from 'qunit';
import {
	cellsOf,
	initialState,
	modeOf,
	nameOf,
	parseOf,
	spanOf,
	summaryOf,
	withBox,
	withField,
	withMode,
	withSub,
} from 'delphitools-v2/components/tools/cron-builder/cron';

module('Unit | Tool | cron-builder', function () {
	test('withBox: five fields land in the rows, fewer keep the text', function (assert) {
		const state = withBox(initialState(), '*/15 9-17 * * 1-5');
		assert.strictEqual(state.fields.minute, '*/15');
		assert.strictEqual(state.subs.minute.step, 15);
		assert.deepEqual(
			[state.subs.hour.lo, state.subs.hour.hi],
			[9, 17],
		);
		const short = withBox(state, '1 2 3');
		assert.strictEqual(short.box, '1 2 3');
		assert.strictEqual(short.fields.minute, '*/15');
	});

	test('withMode and withSub rewrite one field', function (assert) {
		let state = withMode(initialState(), 'minute', 'step');
		assert.strictEqual(state.box, '*/5 9 * * MON-FRI');
		state = withSub(state, 'minute', 'step', 1);
		assert.strictEqual(
			state.fields.minute,
			'*/2',
			'a step starts at 2',
		);
		state = withMode(state, 'hour', 'range');
		assert.strictEqual(state.fields.hour, '9-17');
		state = withSub(state, 'hour', 'lo', 20);
		assert.strictEqual(
			state.fields.hour,
			'20-20',
			'from pushes to',
		);
		state = withSub(state, 'dow', 'hi', 7);
		assert.strictEqual(
			state.fields.dow,
			'1-7',
			'a range keeps the 7 for Sunday',
		);
		state = withMode(state, 'dow', 'value');
		state = withSub(state, 'dow', 'value', 7);
		assert.strictEqual(
			state.fields.dow,
			'6',
			'a weekday value is 0 to 6',
		);
		state = withField(state, 'month', 'JAN');
		assert.strictEqual(state.box, '*/2 20-20 * JAN 6');
	});

	test('modeOf and summaryOf', function (assert) {
		const state = withBox(initialState(), '0,30 * 1-5 6 1,3,5');
		assert.strictEqual(modeOf(parseOf(state, 'minute')), undefined);
		assert.strictEqual(modeOf(parseOf(state, 'hour')), 'every');
		assert.strictEqual(
			summaryOf(parseOf(state, 'minute'), 'minute'),
			'List',
		);
		assert.strictEqual(
			summaryOf(parseOf(state, 'dom'), 'dom'),
			'Range',
		);
		assert.strictEqual(
			summaryOf(parseOf(state, 'month'), 'month'),
			nameOf(6, 'month'),
		);
		assert.strictEqual(
			summaryOf(parseOf(state, 'dow'), 'dow'),
			[1, 3, 5].map((d) => nameOf(d, 'dow')).join(', '),
		);
		assert.strictEqual(
			nameOf(7, 'dow'),
			nameOf(0, 'dow'),
			'7 is Sunday',
		);
		assert.strictEqual(nameOf(5, 'hour'), undefined);
	});

	test('cellsOf and spanOf', function (assert) {
		assert.strictEqual(cellsOf('minute').length, 60);
		assert.strictEqual(cellsOf('dom')[0], 1);
		assert.strictEqual(cellsOf('month').at(-1), 12);
		assert.deepEqual(cellsOf('dow', 1), [1, 2, 3, 4, 5, 6, 0]);
		assert.strictEqual(spanOf(86_400 * 2.5)[0], '2');
		assert.strictEqual(spanOf(59)[0], '59');
		assert.strictEqual(spanOf(3_600 * 23.9)[0], '23');
		assert.strictEqual(spanOf(0)[0], '0');
	});
});
