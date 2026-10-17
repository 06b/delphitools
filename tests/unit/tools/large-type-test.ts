import { module, test } from 'qunit';
import {
	cell,
	charClass,
	fit,
	frames,
	marqueeSize,
	sizes,
	wordCap,
	wrap,
} from 'delphitools-v2/components/tools/large-type/layout';

module('Unit | Tool | large-type', function () {
	test('charClass', function (assert) {
		assert.strictEqual(charClass('7'), 'digit');
		assert.strictEqual(charClass(' '), 'space');
		assert.strictEqual(charClass('é'), 'letter');
		assert.strictEqual(charClass('#'), 'special');
	});

	test('cells and fit, as LargeTypeLayout', function (assert) {
		assert.deepEqual(cell(100, 0.6, false), {
			width: 72,
			height: 132,
		});
		assert.strictEqual(fit([], 0.6, 300, 300, false), sizes.start);
		assert.strictEqual(
			fit(['x'], 0.6, 4000, 4000, false),
			sizes.max,
		);
		assert.strictEqual(
			fit(Array<string>(400).fill('x'), 0.6, 100, 100, true),
			sizes.min,
		);
	});

	test('rows centre and words move whole', function (assert) {
		const one = frames(Array.from('abc'), 100, 0.6, 720, false);
		assert.strictEqual(one.length, 3);
		assert.strictEqual(one[0]?.x, 252);
		assert.true(one.every((f) => f.y === 0));
		assert.deepEqual(wrap(Array.from('ab cde'), 4), [3, 3]);
		assert.deepEqual(wrap(Array.from('abcdefg'), 4), [4, 3]);
		assert.deepEqual(wrap(Array.from('a bcdefg'), 4), [4, 4]);
		assert.deepEqual(wrap(Array.from('abcd ef'), 4), [4, 3]);
	});

	test('the longest word always fits on one line', function (assert) {
		const texts = [
			'Massachusetts',
			'hello Massachusetts',
			'Supercalifragilisticexpialidocious',
			'Pneumonoultramicroscopicsilicovolcanoconiosis',
			'a bb ccc dddd eeeee ffffff ggggggg',
			'the quick brown fox jumps over the lazy dog',
		];
		for (const text of texts)
			for (const width of [302, 520, 1100])
				for (const height of [180, 600])
					for (const widest of [0.6, 1]) {
						const glyphs = Array.from(text);
						const size = fit(
							glyphs,
							widest,
							width,
							height,
							true,
						);
						const placed = frames(
							glyphs,
							size,
							widest,
							width,
							true,
						);
						const words =
							text.matchAll(/\S+/g);
						const whole = [...words].every(
							(word) =>
								placed[
									word
										.index
								]?.y ===
								placed[
									word.index +
										word[0]
											.length -
										1
								]?.y,
						);
						assert.true(
							whole,
							`${text} at ${width} x ${height}, ${widest}`,
						);
					}
	});

	test('below the smallest size the cell padding shrinks', function (assert) {
		assert.deepEqual(cell(28, 0.5, false), {
			width: 26,
			height: 46,
		});
		assert.deepEqual(cell(14, 0.5, false), {
			width: 13,
			height: 23,
		});
	});

	test('the word cap', function (assert) {
		assert.strictEqual(wordCap([], 0.6, 300), Infinity);
		assert.strictEqual(
			wordCap(Array.from('ab abcd'), 0.5, 200),
			76,
			'four cells of 50 px, 12 px of padding',
		);
		assert.strictEqual(
			wordCap(Array<string>(400).fill('x'), 0.6, 100),
			Infinity,
			'a word no size holds is left to break',
		);
	});

	test('the marquee holds three characters at least', function (assert) {
		const band = { width: 300, height: 600 };
		assert.strictEqual(marqueeSize(band, 0.5, undefined), 200);
		assert.strictEqual(marqueeSize(band, 0.5, 80), 80);
		assert.strictEqual(marqueeSize(band, 0.5, 360), 200);
	});
});
