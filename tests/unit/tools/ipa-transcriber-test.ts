import { module, test } from 'qunit';
import {
	alternativesOf,
	carryEdits,
	inserting,
	isGuess,
	piecesOf,
	removing,
	soundOf,
	stressRuns,
	swapping,
} from 'delphitools-v2/components/tools/ipa-transcriber/gloss';
import { transcribe, wordOf, type IpaWord } from 'delphitools-v2/lib/ipa';

const lookup = (word: string) =>
	({ hi: ['HH', 'AY1'], there: ['DH', 'EH1', 'R'] })[word];

module('Unit | Tool | ipa-transcriber', function () {
	test('stressRuns: each stress mark its own run', function (assert) {
		assert.deepEqual(stressRuns('ˌmæˈnkaɪnd'), [
			{ text: 'ˌ', stress: true },
			{ text: 'mæ', stress: false },
			{ text: 'ˈ', stress: true },
			{ text: 'nkaɪnd', stress: false },
		]);
	});

	test('piecesOf: words glossed, marks as themselves, spaces bare', function (assert) {
		const text = 'Hi, there';
		const pieces = piecesOf(text, transcribe(text, lookup));
		assert.deepEqual(
			pieces.map((p) => `${p.kind}:${p.text}:${p.gloss}`),
			[
				'word:Hi:haɪ',
				'punctuation:,:,',
				'whitespace: :',
				'word:there:ðɛr',
			],
		);
		assert.deepEqual(
			piecesOf('Hi there', transcribe('Hi', lookup)).map(
				(p) => p.kind,
			),
			['whitespace'],
			'stale tokens leave the text plain',
		);
	});

	test('editing a word respells it and clears the guess', function (assert) {
		const word = wordOf('zorp', ['z', 'ɔː', 'p'], true);
		assert.true(isGuess(word));
		const swapped = swapping(word, 2, 'b');
		assert.strictEqual(swapped.ipa, 'zɔːb');
		assert.false(isGuess(swapped));
		assert.strictEqual(inserting(swapped, 0, 'ˈ').ipa, 'ˈzɔːb');
		assert.strictEqual(removing(swapped, 1)?.ipa, 'zb');
		assert.strictEqual(
			removing(wordOf('a', ['ə'], false), 0),
			undefined,
			'the sole symbol stays',
		);
	});

	test('carryEdits keeps edited words still in place', function (assert) {
		const old = transcribe('hi there', lookup);
		const edited = swapping(old[0] as IpaWord, 1, 'iː');
		const next = carryEdits(
			[edited, ...old.slice(1)],
			transcribe('hi there you', lookup),
		);
		assert.strictEqual((next[0] as IpaWord).ipa, 'hiː');
	});

	test('symbols are named and have alternatives', function (assert) {
		assert.deepEqual(soundOf('v'), {
			glyph: 'v',
			name: 'vow',
			ipa: 'v',
		});
		assert.deepEqual(
			alternativesOf('v').map((s) => s.glyph),
			['f'],
		);
		assert.deepEqual(
			alternativesOf('ˈ').map((s) => s.glyph),
			['ˌ'],
		);
		assert.true(alternativesOf('ɪ').some((s) => s.glyph === 'ə'));
		assert.strictEqual(soundOf('?').name, '');
	});
});
