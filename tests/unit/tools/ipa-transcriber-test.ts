import { module, test } from 'qunit';
import {
	glossOf,
	stressRuns,
} from 'delphitools-v2/components/tools/ipa-transcriber/gloss';

module('Unit | Tool | ipa-transcriber', function () {
	test('glossOf: words and marks between slashes', function (assert) {
		const glyphs = glossOf([
			{ type: 'word', value: 'Hi', ipa: 'haɪ', guess: false },
			{ type: 'other', value: ', ' },
			{
				type: 'word',
				value: 'zorp',
				ipa: 'zɔːrp',
				guess: true,
			},
		]);
		assert.deepEqual(
			glyphs.map((g) => `${g.tone}:${g.ipa}`),
			[
				'mark:/',
				'word:haɪ',
				'mark:,',
				'space: ',
				'guess:zɔːrp',
				'mark:/',
			],
		);
		assert.strictEqual(glyphs[1]?.word, 'Hi');
	});

	test('glossOf: nothing without a word', function (assert) {
		assert.deepEqual(
			glossOf([{ type: 'other', value: '?! ' }]),
			[],
		);
	});

	test('stressRuns: each stress mark its own run', function (assert) {
		assert.deepEqual(stressRuns('ˌmæˈnkaɪnd'), [
			{ text: 'ˌ', stress: true },
			{ text: 'mæ', stress: false },
			{ text: 'ˈ', stress: true },
			{ text: 'nkaɪnd', stress: false },
		]);
	});
});
