import { module, test } from 'qunit';
import {
	allBases,
	apply,
	format,
	highestDigit,
	layout,
	operations,
	radixes,
	read,
	wordFitting,
	type Radix,
} from 'delphitools-v2/components/tools/base-converter/base-number';

const [dec, hex, bin, oct] = radixes as [Radix, Radix, Radix, Radix];
const op = (title: string) => operations.find((o) => o.title === title)!;

module('Unit | Tool | base-converter', function () {
	test('read takes prefixes and separators, as BaseNumber.read', function (assert) {
		assert.deepEqual(read('0xff', dec), {
			kind: 'value',
			value: 255n,
		});
		assert.deepEqual(read('ff', hex), {
			kind: 'value',
			value: 255n,
		});
		assert.deepEqual(
			read('0b12', hex),
			{ kind: 'value', value: 0xb12n },
			'in hex, 0b is digits',
		);
		assert.deepEqual(read('0b101', dec), {
			kind: 'value',
			value: 5n,
		});
		assert.deepEqual(read("1_000 0'00", dec), {
			kind: 'value',
			value: 1_000_000n,
		});
		assert.deepEqual(read('0o17', bin), {
			kind: 'value',
			value: 15n,
		});
		assert.deepEqual(read('9', oct), {
			kind: 'invalid',
			character: '9',
		});
		assert.deepEqual(read('0x', dec), { kind: 'empty' });
		assert.deepEqual(read('', dec), { kind: 'empty' });
		assert.deepEqual(read('-1', dec), {
			kind: 'invalid',
			character: '-',
		});
		assert.deepEqual(read('18446744073709551615', dec), {
			kind: 'value',
			value: (1n << 64n) - 1n,
		});
		assert.deepEqual(read('18446744073709551616', dec), {
			kind: 'tooLarge',
		});
	});

	test('format, highest digits and word sizes', function (assert) {
		assert.strictEqual(format(255n, hex, true), '0xFF');
		assert.strictEqual(format(5n, bin), '101');
		assert.deepEqual(radixes.map(highestDigit), [
			'9',
			'F',
			'1',
			'7',
		]);
		assert.strictEqual(wordFitting(0n), 8);
		assert.strictEqual(wordFitting(255n), 8);
		assert.strictEqual(wordFitting(256n), 16);
		assert.strictEqual(wordFitting((1n << 64n) - 1n), 64);
		assert.strictEqual(
			allBases(123456n).join(' · '),
			'123456 · 0x1E240 · 0b11110001001000000 · 0o361100',
		);
	});

	test('operations stay within the word', function (assert) {
		assert.strictEqual(apply(op('NOT'), 0n, undefined, 0, 8), 255n);
		assert.strictEqual(
			apply(op('NOT'), 0n, undefined, 0, 64),
			(1n << 64n) - 1n,
		);
		assert.strictEqual(apply(op('<<'), 0x80n, undefined, 1, 8), 0n);
		assert.strictEqual(apply(op('<<'), 1n, undefined, 8, 8), 0n);
		assert.strictEqual(
			apply(op('>>'), 0xf0n, undefined, 4, 8),
			0xfn,
		);
		assert.strictEqual(
			apply(op('AND'), 12n, undefined, 0, 8),
			undefined,
			'waits for B',
		);
		assert.strictEqual(apply(op('XOR'), 12n, 10n, 0, 8), 6n);
		assert.strictEqual(apply(op('OR'), 12n, 10n, 0, 8), 14n);
		assert.strictEqual(apply(op('AND'), 12n, 10n, 0, 8), 8n);
	});

	test('layout picks the longest comfortable line', function (assert) {
		const tall = layout(64, [true], false, 340, 400);
		assert.strictEqual(tall.perLine, 16);
		assert.true(tall.cell > 16);
		assert.strictEqual(
			layout(32, [true], false, 900, 200).perLine,
			32,
		);
		assert.true(layout(16, [true], false, 2000, 2000).cell <= 40);
	});
});
