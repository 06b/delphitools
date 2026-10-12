import { module, test } from 'qunit';
import { hex, parseHex } from 'delphicanon/lib/colour';
import {
	contrastRows,
	gamutTiles,
	harmonies,
	harmony,
	kitFormat,
	launchFlags,
	notationLines,
	readColour,
	scale,
	visionCards,
} from 'delphitools-v2/components/tools/colour-atlas/atlas';

const blue = parseHex('3B82F6')!;
const white = parseHex('FFFFFF')!;

module('Unit | Tool | colour-atlas', function () {
	test('notations follow ColourAtlasEngine', function (assert) {
		const lines = notationLines(blue);
		assert.strictEqual(lines.length, 10);
		assert.deepEqual(
			lines.slice(0, 2).map((line) => line.value),
			['#3B82F6', 'rgb(59, 130, 246)'],
		);
		assert.strictEqual(lines[8]!.value, 'ycbcr(121, 189, 89)');
		assert.strictEqual(notationLines(white)[9]!.value, '1.000');
	});

	test('gamut: chroma against the most at this hue', function (assert) {
		const [chroma, most, used] = gamutTiles(blue);
		assert.strictEqual(chroma!.value, '0.188');
		assert.strictEqual(most!.value, '0.204');
		assert.strictEqual(used!.value, '92 %');
		assert.strictEqual(
			gamutTiles([0, 0, 0])[2]!.level,
			0,
			'black uses none',
		);
	});

	test('contrast rows light the levels they pass', function (assert) {
		const [onWhite, onBlack] = contrastRows(blue);
		assert.strictEqual(onWhite!.ratio, '3.67:1');
		assert.strictEqual(onWhite!.passed, 'Large');
		assert.strictEqual(onBlack!.ratio, '5.7:1');
		assert.strictEqual(onBlack!.passed, 'AA, Large');
	});

	test('harmonies rotate the HSL hue', function (assert) {
		const complement = harmony(blue, harmonies[0]!.offsets);
		assert.deepEqual(complement.map(hex), ['#3B82F6', '#F6AF3B']);
		assert.strictEqual(
			harmony(blue, harmonies[2]!.offsets).length,
			3,
			'analogous turns both ways',
		);
	});

	test('tints and shades: the colour and eight mixes', function (assert) {
		const tints = scale(blue, 1);
		const shades = scale(blue, 0);
		assert.strictEqual(tints.length, 9);
		assert.strictEqual(hex(tints[0]!), '#3B82F6');
		assert.strictEqual(hex(tints[8]!), '#E9F1FE');
		assert.strictEqual(hex(shades[8]!), '#070E1B');
	});

	test('vision cards simulate four types', function (assert) {
		const cards = visionCards(blue);
		assert.deepEqual(
			cards.map((card) => card.name),
			[
				'Protanopia',
				'Deuteranopia',
				'Tritanopia',
				'Achromatopsia',
			],
		);
		assert.strictEqual(hex(cards[3]!.colour), '#7A7A7A');
	});

	test('readColour takes what the web field took', function (assert) {
		assert.strictEqual(hex(readColour('tomato')!), '#FF6347');
		assert.strictEqual(
			hex(readColour('oklch(0.6231 0.188 259.8)')!),
			'#3B82F6',
		);
		assert.strictEqual(readColour('nonsense'), undefined);
	});

	test('header notations the kit lacks fall back to hex', function (assert) {
		assert.strictEqual(kitFormat('oklch'), 'oklch');
		assert.strictEqual(kitFormat('hsv'), 'hex');
		assert.strictEqual(kitFormat('ycbcr'), 'hex');
	});

	test('launch flags', function (assert) {
		const flags = launchFlags(
			'?atlasColour=%23ff0000&atlasHarmony=1&atlasSpace=1&atlasRow=0&atlasOrtho=1',
		);
		assert.strictEqual(hex(flags.colour!), '#FF0000');
		assert.strictEqual(flags.harmony, 1);
		assert.strictEqual(flags.space, 'hsl');
		assert.strictEqual(flags.row, 0);
		assert.true(flags.ortho);
		assert.false(flags.orthoLater);
		assert.strictEqual(
			hex(launchFlags('?color=00ff00').colour!),
			'#00FF00',
			'the carried colour',
		);
		assert.strictEqual(
			hex(
				launchFlags('?color=00ff00&atlasColour=blue')
					.colour!,
			),
			'#0000FF',
			'the typed flag wins',
		);
		assert.strictEqual(
			launchFlags('?atlasHarmony=9').harmony,
			undefined,
		);
		assert.strictEqual(launchFlags('').colour, undefined);
	});
});
