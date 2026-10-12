import { module, test } from 'qunit';
import { decodeJwt } from 'delphitools-v2/lib/jwt';
import {
	duration,
	jwtState,
	marks,
	sampleToken,
	timeline,
} from 'delphitools-v2/components/tools/jwt-decoder/anatomy';

const now = new Date('2026-10-13T12:00:00Z');
const decoded = (token: string) => {
	const result = decodeJwt(token, now);
	if (result.kind !== 'decoded') throw new Error(result.kind);
	return result;
};

module('Unit | Tool | jwt-decoder', function () {
	test('duration: the largest whole unit', function (assert) {
		assert.deepEqual(duration(86_400 * 3 + 60), ['3', 'd']);
		assert.deepEqual(duration(59), ['59', 's']);
		assert.deepEqual(duration(-7_200), ['2', 'h']);
		assert.deepEqual(duration(400 * 86_400), ['1', 'y']);
		assert.deepEqual(duration(0.4), ['0', 's']);
	});

	test('the samples read valid, expired and early', function (assert) {
		for (const kind of ['valid', 'expired', 'early'] as const)
			assert.strictEqual(
				jwtState(decoded(sampleToken(kind, now)), now),
				kind,
			);
	});

	test('no exp and no future nbf: no state', function (assert) {
		const token = ['{"alg":"none"}', '{"sub":"x"}']
			.map((part) => btoa(part).replaceAll('=', ''))
			.join('.');
		assert.strictEqual(jwtState(decoded(`${token}.`), now), null);
	});

	test('marks: segments, dots and the space around them', function (assert) {
		assert.deepEqual(marks(' ab.cd.ef '), [
			{ text: ' ', part: null },
			{ text: 'ab', part: 0 },
			{ text: '.', part: 'dot' },
			{ text: 'cd', part: 1 },
			{ text: '.', part: 'dot' },
			{ text: 'ef', part: 2 },
			{ text: ' ', part: null },
		]);
		assert.deepEqual(
			marks('a.b.c.d').map((m) => m.part),
			[0, 'dot', 1, 'dot', 2, 'dot', null],
		);
		assert.strictEqual(
			marks(' x.y\n')
				.map((m) => m.text)
				.join(''),
			' x.y\n',
			'the runs rebuild the text',
		);
	});

	test('timeline: claims and now as shares of one axis', function (assert) {
		const line = timeline(
			decoded(sampleToken('valid', now)).timeClaims,
			now,
		);
		assert.strictEqual(
			line.ticks.length,
			2,
			'iat and nbf share a tick',
		);
		assert.strictEqual(line.ticks[0]!.at, 0);
		assert.strictEqual(line.ticks.at(-1)!.at, 1);
		assert.ok(
			line.ticks[0]!.label.startsWith('Issued · Not before'),
		);
		assert.deepEqual(line.band, { from: 0, to: 1 });
		assert.ok(line.now > 0);
		assert.ok(line.now < 1);
	});
});
