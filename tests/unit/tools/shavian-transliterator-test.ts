import { module, test } from 'qunit';
import {
	carryEdits,
	editWord,
	inserting,
	piecesOf,
	removing,
	swapping,
	tilesOf,
	withMarker,
} from 'delphitools-v2/components/tools/shavian-transliterator/gloss';
import { getShavianLetter } from 'delphitools-v2/lib/shavian/phoneme-map';
import {
	glossToText,
	tokenise,
	type GlossToken,
	type GlossWord,
} from 'delphitools-v2/lib/shavian/transliterate';

const letter = (char: string) => getShavianLetter(char)!;

function word(latin: string, marker: GlossWord['marker'] = 'none'): GlossToken {
	return {
		type: 'word',
		value: latin,
		gloss: {
			latin,
			phonemes: [],
			shavian: '',
			ipa: '',
			source: 'core',
			marker,
			userEdited: false,
		},
	};
}

const space: GlossToken = { type: 'whitespace', value: ' ' };
const markersOf = (tokens: GlossToken[]) =>
	tokens.flatMap((t) => (t.gloss ? [t.gloss.marker] : []));

module('Unit | Tool | shavian-transliterator', function () {
	test('carryEdits keeps the markers of words still in place', function (assert) {
		const old = [
			word('Shaw', 'namer'),
			space,
			word('wrote'),
			space,
			word('NATO', 'acroarc'),
		];
		const typed = [
			word('Shaw'),
			space,
			word('never'),
			space,
			word('wrote'),
			space,
			word('NATO'),
		];
		assert.deepEqual(markersOf(carryEdits(old, typed)), [
			'namer',
			'none',
			'none',
			'acroarc',
		]);
		const changed = [
			word('Shah'),
			space,
			word('wrote'),
			space,
			word('NATO'),
		];
		assert.deepEqual(markersOf(carryEdits(old, changed)), [
			'none',
			'none',
			'acroarc',
		]);
		assert.deepEqual(carryEdits(old, []), []);
	});

	test('inserting and removing respell the word', function (assert) {
		const shaw = inserting(
			word('Shaw', 'namer').gloss!,
			0,
			letter('𐑖'),
		);
		const shaws = inserting(
			inserting(shaw, 1, letter('𐑷')),
			2,
			letter('𐑟'),
		);
		assert.strictEqual(shaws.shavian, '·𐑖𐑷𐑟');
		assert.strictEqual(shaws.ipa, 'ʃɔːz');
		assert.true(shaws.userEdited);
		assert.strictEqual(
			inserting(shaws, 1, letter('𐑩')).shavian,
			'·𐑖𐑩𐑷𐑟',
		);
		assert.strictEqual(removing(shaws, 2)?.shavian, '·𐑖𐑷');
		assert.strictEqual(
			removing(shaw, 0),
			undefined,
			'not the sole letter',
		);
		const kept = carryEdits(
			[{ ...word('Shaw'), gloss: shaws }],
			[word('Shaw'), space, word('Shaw')],
		);
		assert.strictEqual(kept[0]?.gloss?.shavian, '·𐑖𐑷𐑟');
	});

	test('swapping and withMarker', function (assert) {
		const [cat] = tokenise('cat');
		const swapped = swapping(cat!.gloss!, 0, {
			shavian: '𐑜',
			name: 'gag',
			ipa: 'ɡ',
		})!;
		assert.strictEqual(swapped.shavian, '𐑜𐑨𐑑');
		assert.true(swapped.userEdited);
		const named = withMarker(swapped, 'acroring')!;
		assert.strictEqual(named.shavian, '⸰𐑜𐑨𐑑');
		assert.strictEqual(withMarker(named, 'acroring'), undefined);
		const tokens = editWord(tokenise('the cat'), 2, (w) =>
			withMarker(w, 'namer'),
		);
		assert.strictEqual(glossToText(tokens), '𐑞 ·𐑒𐑨𐑑');
	});

	test('piecesOf covers the text, or holds it plain when stale', function (assert) {
		const text = 'Hi, you.';
		const pieces = piecesOf(text, tokenise(text));
		assert.strictEqual(pieces.map((p) => p.text).join(''), text);
		assert.deepEqual(
			pieces.map((p) => p.kind),
			[
				'word',
				'punctuation',
				'whitespace',
				'word',
				'punctuation',
			],
		);
		assert.strictEqual(
			pieces[1]?.shavian,
			',',
			'a mark glosses as itself',
		);
		assert.deepEqual(
			piecesOf('Hi there', tokenise('Hi')).map((p) => p.text),
			['Hi there'],
		);
		assert.deepEqual(piecesOf('', []), []);
	});

	test('tilesOf counts words, letters and guesses', function (assert) {
		const [cat, , zorbly] = tokenise('cat zorbly');
		const guessed = {
			...zorbly!.gloss!,
			source: 'heuristic' as const,
		};
		const tokens = [
			{
				...cat!,
				gloss: {
					...cat!.gloss!,
					source: 'core' as const,
				},
			},
			space,
			{ ...zorbly!, gloss: guessed },
		];
		const letters =
			cat!.gloss!.phonemes.length + guessed.phonemes.length;
		assert.deepEqual(
			tilesOf(tokens).map((t) => t.value),
			['2', '1', '1', `9 → ${letters}`],
		);
		assert.strictEqual(
			tilesOf([
				...tokens.slice(0, 2),
				{
					...zorbly!,
					gloss: { ...guessed, userEdited: true },
				},
			])[2]?.value,
			'0',
			'an edited guess is no longer a guess',
		);
		assert.deepEqual(
			tilesOf([]).map((t) => t.value),
			['—', '—', '—', '—'],
		);
	});
});
