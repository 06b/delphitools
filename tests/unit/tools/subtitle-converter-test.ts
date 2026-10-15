import { module, test } from 'qunit';
import {
	RATES,
	downloadName,
	parseRatePair,
	ratePair,
} from 'delphitools-v2/components/tools/subtitle-converter/rates';

module('Unit | Tool | subtitle-converter', function () {
	test('a rate pair scales by from over to', function (assert) {
		const pair = ratePair(0, 2);
		assert.deepEqual([pair.from, pair.to], [0, 2]);
		assert.strictEqual(pair.factor, 24000 / 1001 / 25);
	});

	test('one side picked alone means the same rate both sides', function (assert) {
		assert.deepEqual(ratePair(3, undefined), {
			from: 3,
			to: 3,
			factor: 1,
		});
		assert.deepEqual(ratePair(undefined, 5), {
			from: 5,
			to: 5,
			factor: 1,
		});
	});

	test('the subRate flag takes two indices in range', function (assert) {
		assert.strictEqual(parseRatePair('1,2')?.factor, 24 / 25);
		assert.strictEqual(parseRatePair(null), undefined);
		assert.strictEqual(parseRatePair('1'), undefined);
		assert.strictEqual(
			parseRatePair(`0,${RATES.length}`),
			undefined,
		);
		assert.strictEqual(parseRatePair('0.5,1'), undefined);
	});

	test('the download keeps the stem and takes the target', function (assert) {
		assert.strictEqual(downloadName('', 'vtt'), 'subtitles.vtt');
		assert.strictEqual(downloadName('Film.SRT', 'vtt'), 'Film.vtt');
		assert.strictEqual(downloadName('a.vtt', 'srt'), 'a.srt');
	});
});
