import { module, test } from 'qunit';
import {
	frequencies,
	label,
	step,
	ticks,
} from 'delphitools-v2/components/tools/audio-atlas/ruler';
import {
	levelShare,
	loudnessTiles,
	rmsDb,
} from 'delphitools-v2/components/tools/audio-atlas/loudness';

module('Unit | Tool | audio-atlas', function () {
	test('step keeps 64 px between labels (iOS selfCheck)', function (assert) {
		assert.strictEqual(step(10, 640), 1);
		assert.strictEqual(step(0.05, 320), 0.01);
		assert.strictEqual(step(100_000, 320), 3600);
		assert.strictEqual(step(0, 320), 0.01);
	});

	test('label reads seconds, then m:ss (iOS selfCheck)', function (assert) {
		assert.strictEqual(label(1.5, 0.5), '1.5');
		assert.strictEqual(label(75, 15), '1:15');
		assert.strictEqual(label(61.25, 0.05), '1:01.25');
		assert.strictEqual(label(0, 0.01), '0.00');
	});

	test('ticks: a minor tick each fifth step, labels on the steps', function (assert) {
		const all = ticks(0, 10, 640);
		assert.strictEqual(all.length, 51);
		assert.deepEqual(
			all.filter((t) => t.text).map((t) => t.text),
			[
				'0',
				'1',
				'2',
				'3',
				'4',
				'5',
				'6',
				'7',
				'8',
				'9',
				'10',
			],
		);
		assert.strictEqual(all[25]!.at, 0.5);
		assert.deepEqual(ticks(5, 5, 640), [], 'no span, no ticks');
		assert.deepEqual(ticks(0, 1e6, 1e6), [], 'too many to read');
	});

	test('frequencies: a quarter, half and three quarters of Nyquist', function (assert) {
		assert.deepEqual(frequencies(48000), [
			'6 kHz',
			'12 kHz',
			'18 kHz',
		]);
		assert.deepEqual(frequencies(44100), [
			'5.5 kHz',
			'11 kHz',
			'16.5 kHz',
		]);
		assert.deepEqual(frequencies(0), []);
	});

	test('rmsDb: a half-scale square wave is -6 dBFS, silence -Infinity', function (assert) {
		const square = Float32Array.from({ length: 100 }, (_, i) =>
			i % 2 ? 0.5 : -0.5,
		);
		assert.strictEqual(rmsDb([square]).toFixed(1), '-6.0');
		assert.strictEqual(rmsDb([new Float32Array(8)]), -Infinity);
	});

	test('loudnessTiles: Peak, RMS and Loudness over level bars', function (assert) {
		const tiles = loudnessTiles(-6.02, -9.03, -12.34);
		assert.deepEqual(
			tiles.map((t) => [t.label, t.value]),
			[
				['Peak', '-6.0 dBFS'],
				['RMS', '-9.0 dBFS'],
				['Loudness', '-12.3 LUFS'],
			],
		);
		assert.strictEqual(tiles[0]!.level, levelShare(-6.02));
		assert.strictEqual(levelShare(-60), 0);
		assert.strictEqual(levelShare(3), 1);
		assert.strictEqual(
			loudnessTiles(-Infinity, -Infinity, null)[0]!.value,
			'-∞ dBFS',
		);
		assert.strictEqual(
			loudnessTiles(0, 0, null)[2]!.value,
			'…',
			'measuring',
		);
		assert.strictEqual(
			loudnessTiles(0, 0, NaN)[2]!.value,
			'—',
			'too short to gate',
		);
	});
});
