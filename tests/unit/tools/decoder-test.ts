import { module, test } from 'qunit';
import {
	SAMPLES,
	base64Decode,
	classifyAndDecode,
	isReadable,
	railFenceDecode,
	railFenceEncode,
	runManual,
	type ManualParams,
} from 'delphitools-v2/components/tools/decoder/engine';
import {
	codes,
	decoding,
	encoded,
	encoding,
} from 'delphitools-v2/components/tools/decoder/bits';
import {
	caption,
	morseWords,
	pairs,
	railPattern,
} from 'delphitools-v2/components/tools/decoder/scene';

const params: ManualParams = {
	caesarShift: 3,
	vigenereKey: 'lemon',
	affineA: 5,
	affineB: 8,
	rails: 3,
};

const faces = (list: ReturnType<typeof pairs>, side: 'top' | 'bottom') =>
	list.map((pair) => pair[side].value);

module('Unit | Tool | decoder', function () {
	test('samples rank their own cipher first', function (assert) {
		const first = (index: number) =>
			classifyAndDecode(SAMPLES[index]!.text)[0];
		assert.strictEqual(first(0)?.cipherId, 'caesar');
		assert.strictEqual(first(1)?.cipherId, 'rot13');
		assert.strictEqual(first(2)?.cipherId, 'vigenere');
		assert.strictEqual(first(3)?.output, 'HELLO WORLD');
		assert.strictEqual(first(4)?.output, 'Privacy is power.');
		assert.strictEqual(
			first(5)?.output,
			'The crow flies at midnight.',
		);
	});

	test('unreadable bytes are no candidate (iOS isReadable)', function (assert) {
		assert.true(isReadable('Hello\n\tworld'));
		assert.false(isReadable('a\u0001b'));
		assert.false(isReadable('a�b'));
		const ids = classifyAndDecode(SAMPLES[2]!.text).map(
			(c) => c.cipherId,
		);
		assert.false(ids.includes('base64'), ids.join());
	});

	test('manual: errors carry the iOS text', function (assert) {
		assert.throws(() => base64Decode('!!!!'), /Invalid Base64\./);
		assert.throws(
			() => runManual('abc', 'hex', false, params),
			/Hex must have even length\./,
		);
		assert.strictEqual(
			runManual('attack', 'vigenere', true, params),
			'lxfopv',
		);
		const fence = railFenceEncode('WEAREDISCOVERED', 3);
		assert.strictEqual(
			railFenceDecode(fence, 3),
			'WEAREDISCOVERED',
		);
	});

	test('caption names the settings', function (assert) {
		assert.deepEqual(caption('caesar', params), {
			name: 'Caesar (shift 3)',
			detail: '',
		});
		assert.strictEqual(
			caption('vigenere', params).detail,
			'key: LEMON',
		);
		assert.strictEqual(
			caption('affine', params).detail,
			'a=5, b=8',
		);
		assert.strictEqual(
			caption('rail-fence', params).detail,
			'3 rails',
		);
	});

	test('pairs: the iOS self-check', function (assert) {
		const vigenere = pairs(
			'vigenere',
			true,
			params,
			'at tack',
			'lx fopv',
		);
		assert.deepEqual(vigenere.map((p) => p.key).filter(Boolean), [
			'L',
			'E',
			'M',
			'O',
			'N',
			'L',
		]);
		assert.strictEqual(vigenere[2]!.kind, 'space');
		const morse = pairs(
			'morse',
			false,
			params,
			'... --- / ...',
			'',
		);
		assert.strictEqual(morse.length, 4);
		assert.strictEqual(morse[2]!.kind, 'space');
		assert.strictEqual(morse[1]!.bottom.value, 'O');
		assert.strictEqual(morse[0]!.top.kind, 'morse');
		assert.deepEqual(
			faces(
				pairs('a1z26', false, params, '8-9', ''),
				'bottom',
			),
			['H', 'I'],
		);
		assert.deepEqual(
			faces(
				pairs(
					'bacon',
					false,
					params,
					'AAAAB AAABA',
					'',
				),
				'bottom',
			),
			['B', 'C'],
		);
		assert.deepEqual(
			pairs('caesar', true, params, 'a!', 'd!').map(
				(p) => p.changes,
			),
			[true, false],
		);
		assert.deepEqual(morseWords('...   ---   ...'), [
			['...'],
			['---'],
			['...'],
		]);
		assert.deepEqual(railPattern(6, 3), [0, 1, 2, 1, 0, 1]);
	});

	test('bits: the iOS BitRegroup self-check', function (assert) {
		const all = (r: ReturnType<typeof encoding>) =>
			r.groups(0, r.count);
		const labels = (units: { label: string }[]) =>
			units.map((u) => u.label);
		const ma = all(
			encoding(
				[...new TextEncoder().encode('Ma')],
				codes.base64,
			),
		);
		assert.deepEqual(labels(ma[0]!.bottom), ['T', 'W', 'E', '=']);
		assert.strictEqual(
			ma[0]!.slots.filter((s) => s === 'pad').length,
			2,
		);
		const back = all(decoding(Array.from('TWE='), codes.base64));
		assert.deepEqual(labels(back[0]!.bottom), ['M', 'a', '']);
		assert.strictEqual(
			all(decoding(Array.from('_w'), codes.base64))[0]!
				.bottom[0]!.label,
			'FF',
		);
		assert.deepEqual(
			labels(all(encoding([0x66], codes.base32))[0]!.bottom),
			['M', 'Y', '=', '=', '=', '=', '=', '='],
		);
		assert.deepEqual(
			labels(all(encoding([0x48], codes.hex))[0]!.bottom),
			['4', '8'],
		);
		assert.deepEqual(
			labels(all(encoding([0x48], codes.binary))[0]!.bottom),
			['01001000'],
		);
		assert.strictEqual(
			all(decoding(Array.from('4A'), codes.hex))[0]!
				.bottom[0]!.label,
			'J',
		);
		assert.deepEqual(encoded('0x4a 4b', 'hex'), [
			'4',
			'a',
			'4',
			'b',
		]);
	});
});
