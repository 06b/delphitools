import { module, test } from 'qunit';
import {
	base64Outcome,
	decodeBase64,
	decoding,
	digestGrid,
	digests,
	encodeBase64,
	encoding,
	fitPitch,
	flippedBits,
	hex,
	labels,
	urlDecodePairs,
	urlEncodePairs,
	urlOutcome,
} from 'delphitools-v2/components/tools/encoder/engine';

const bytes = (text: string) => [...new TextEncoder().encode(text)];

module('Unit | Tool | encoder', function () {
	test('Base64 takes missing padding, whitespace and the URL-safe alphabet', function (assert) {
		assert.strictEqual(encodeBase64('Man'), 'TWFu');
		assert.strictEqual(encodeBase64('€'), '4oKs');
		assert.strictEqual(decodeBase64('TWFu'), 'Man');
		assert.strictEqual(decodeBase64('TWE'), 'Ma');
		assert.strictEqual(decodeBase64(' TW\nFu '), 'Man');
		assert.strictEqual(decodeBase64('4oKs'), '€');
		assert.strictEqual(decodeBase64('_-8='), '��');
		assert.deepEqual(base64Outcome('T', true), {
			error: 'Invalid Base64.',
		});
		assert.deepEqual(base64Outcome('', true), { text: '' });
	});

	test('URL escapes as encodeURIComponent', function (assert) {
		assert.deepEqual(urlOutcome('a b€&', false), {
			text: 'a%20b%E2%82%AC%26',
		});
		assert.deepEqual(urlOutcome('a%20b%E2%82%AC', true), {
			text: 'a b€',
		});
		assert.deepEqual(urlOutcome('100%', true), {
			error: 'Invalid escape',
		});
	});

	test('URL pairs: a symbol over its escapes, runs read as characters', function (assert) {
		const encoded = urlEncodePairs('a€ \n');
		assert.deepEqual(
			encoded.map((p) => p.changes),
			[false, true, true, false],
		);
		assert.strictEqual(encoded[2]!.top, '␣');
		assert.true(encoded[3]!.newline);
		const decoded = urlDecodePairs('x%E2%82%ACy%20');
		assert.strictEqual(decoded.length, 4);
		assert.strictEqual(decoded[1]!.top, '%E2%82%AC');
		assert.strictEqual(decoded[1]!.bottom, '€');
		assert.strictEqual(decoded[3]!.bottom, '␣');
		assert.strictEqual(urlDecodePairs('%FF')[0]!.bottom, '�');
		assert.strictEqual(urlDecodePairs('100%').length, 4);
	});

	test('regrouping, as BitRegroup.selfCheck', function (assert) {
		const ma = encoding(bytes('Ma')).groups(0, 1);
		assert.strictEqual(ma.length, 1);
		assert.deepEqual(
			ma[0]!.bottom.map((u) => u.label),
			['T', 'W', 'E', '='],
		);
		assert.strictEqual(
			ma[0]!.slots.filter((s) => s === 'pad').length,
			2,
		);
		assert.strictEqual(
			ma[0]!.slots.filter((s) => s === 'absent').length,
			6,
		);
		assert.deepEqual(
			ma[0]!.top.map((u) => u.label),
			['M', 'a', ''],
		);
		assert.true(ma[0]!.top[2]!.faint);
		const back = decoding('TWE=').groups(0, 1);
		assert.deepEqual(
			back[0]!.bottom.map((u) => u.label),
			['M', 'a', ''],
		);
		assert.strictEqual(
			back[0]!.slots.filter((s) => s === 'pad').length,
			2,
		);
		assert.strictEqual(
			decoding('_w').groups(0, 1)[0]!.bottom[0]!.label,
			'FF',
		);
		assert.deepEqual(labels(bytes('é ')), ['é', '', '␣']);
		assert.strictEqual(
			decoding('TW!E')
				.groups(0, 1)[0]!
				.top.filter((u) => !u.faint).length,
			2,
			'stops at a foreign character',
		);
		assert.strictEqual(decoding('TWFu====').count, 2);

		const text = bytes('a€😀b€é');
		const whole = encoding(text);
		const all = whole.groups(0, whole.count);
		assert.deepEqual(
			whole.groups(2, whole.count),
			all.slice(2),
			'a range is the tail of the whole',
		);
		const back64 = decoding(encodeBase64('a€😀b€é'));
		assert.deepEqual(
			back64.groups(0, back64.count).map((g) => g.bottom),
			all.map((g) => g.top),
		);
	});

	test('pitch, grid and flips', function (assert) {
		const pitch = fitPitch(2000, 12);
		const groups = (2000 + 12) / (24 * pitch + 12);
		assert.true(pitch <= 7, 'at most 7 px a bit');
		assert.true(
			Math.abs(groups - Math.round(groups)) < 1e-9,
			'whole groups fill the row',
		);
		assert.true(fitPitch(300, 12) >= 3.6);
		const wide = digestGrid(128, 640, 160);
		assert.strictEqual(wide.columns, 32);
		assert.strictEqual(wide.height, 20);
		assert.deepEqual(digestGrid(64, 320, 200), {
			columns: 16,
			width: 20,
			height: 20,
		});
		assert.strictEqual(digestGrid(128, 320, 80).height, 10);
		assert.strictEqual(
			flippedBits(
				new Uint8Array([0xff, 0]),
				new Uint8Array([0x0f, 1]),
			),
			5,
		);
	});

	test('digests of the UTF-8 bytes', async function (assert) {
		const [sha1, sha256] = await digests('abc');
		assert.strictEqual(
			hex(sha1!),
			'a9993e364706816aba3e25717850c26c9cd0d89d',
		);
		assert.strictEqual(
			hex(sha256!),
			'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
		);
	});
});
