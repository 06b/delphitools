import { module, test } from 'qunit';
import {
	bitCounts,
	columns,
	stamp,
} from 'delphitools-v2/components/tools/uuid-genny/anatomy';

// UUIDAnatomy.selfCheck
module('Unit | Tool | uuid-genny', function () {
	test('v7 columns: time, version and variant in RFC 9562 places', function (assert) {
		const v7 = columns(
			'018f1234-5678-7abc-9def-0123456789ab',
			'uuid7',
		);
		assert.strictEqual(v7.length, 36);
		assert.strictEqual(v7[8], null);
		assert.strictEqual(v7.filter(Boolean).length, 32);
		assert.deepEqual(v7[0]!.fields, [
			'time',
			'time',
			'time',
			'time',
		]);
		assert.deepEqual(v7[14]!.fields, [
			'version',
			'version',
			'version',
			'version',
		]);
		assert.deepEqual(v7[14]!.bits, [false, true, true, true]);
		assert.deepEqual(v7[19]!.fields, [
			'variant',
			'variant',
			'random',
			'random',
		]);
		assert.deepEqual(v7[19]!.bits, [true, false, false, true]);
		const fieldBits = v7.flatMap((column) => column?.fields ?? []);
		for (const [field, count] of bitCounts('uuid7'))
			assert.strictEqual(
				fieldBits.filter((f) => f === field).length,
				count,
				field,
			);
	});

	test('v4 columns read upper case and no hyphens', function (assert) {
		const v4 = columns('0123456789ABCDEF0123456789ABCDEF', 'uuid4');
		assert.strictEqual(v4.length, 32);
		assert.strictEqual(v4[0]!.fields[0], 'random');
		assert.strictEqual(v4[12]!.fields[0], 'version');
		assert.deepEqual(v4[15]!.bits, [true, true, true, true]);
	});

	test('nano id columns are six bits of the alphabet index', function (assert) {
		const nano = columns('_-A', 'nanoid');
		assert.deepEqual(nano[0]!.bits, [
			true,
			true,
			true,
			true,
			true,
			false,
		]);
		assert.deepEqual(nano[1]!.bits, Array<boolean>(6).fill(true));
		assert.deepEqual(nano[2]!.bits, Array<boolean>(6).fill(false));
	});

	test('the legend counts every bit', function (assert) {
		assert.strictEqual(
			bitCounts('uuid4').reduce((sum, [, n]) => sum + n, 0),
			128,
		);
		assert.strictEqual(
			bitCounts('uuid7').reduce((sum, [, n]) => sum + n, 0),
			128,
		);
		assert.strictEqual(
			bitCounts('nanoid').reduce((sum, [, n]) => sum + n, 0),
			126,
		);
	});

	test('the v7 stamp', function (assert) {
		assert.strictEqual(
			stamp(1_000_000_000_123),
			'2001-09-09T01:46:40.123Z',
		);
	});
});
