import { module, test } from 'qunit';
import {
	clock,
	format,
	frames,
	parse,
	parts,
	rates,
	register,
	type ParseResult,
	type Rate,
} from 'delphitools-v2/components/tools/timecode-calc/smpte';

const rate = (id: string) => rates.find((r) => r.id === id)!;
const df30 = rate('29.97df');
const df60 = rate('59.94df');
const ndf25 = rate('25');

const framesOf = (text: string, r: Rate) => {
	const parsed = parse(text, r);
	return parsed.ok ? parsed.frames : undefined;
};

module('Unit | Tool | timecode-calc', function () {
	test('drop frame counts skip two or four frames a minute, except every tenth', function (assert) {
		assert.strictEqual(
			frames({ h: 1, m: 0, s: 0, f: 0 }, df30),
			107892,
		);
		assert.deepEqual(parts(107892, df30), {
			h: 1,
			m: 0,
			s: 0,
			f: 0,
			negative: false,
		});
		assert.strictEqual(
			frames({ h: 0, m: 1, s: 0, f: 2 }, df30),
			1800,
		);
		assert.strictEqual(
			format(parts(1800, df30), df30),
			'00:01:00;02',
		);
		assert.strictEqual(
			frames({ h: 1, m: 0, s: 0, f: 0 }, df60),
			215784,
		);
		assert.strictEqual(
			format(parts(17982, df30), df30),
			'00:10:00;00',
		);
		assert.strictEqual(
			format(
				parts(framesOf('00:00:59;29', df30)! + 1, df30),
				df30,
			),
			'00:01:00;02',
		);
	});

	test('frames and parts round-trip for twenty minutes', function (assert) {
		for (const r of [df30, df60, ndf25]) {
			const limit = Math.round(r.exact * 1200);
			let broken: number | undefined;
			for (
				let frame = 0;
				frame <= limit && broken === undefined;
				frame++
			)
				if (frames(parts(frame, r), r) !== frame)
					broken = frame;
			assert.strictEqual(broken, undefined, r.id);
		}
		assert.strictEqual(frames(parts(-1800, df30), df30), -1800);
		assert.strictEqual(
			format(parts(-262, ndf25), ndf25),
			'-00:00:10:12',
		);
	});

	test('parse right-aligns fields, snaps dropped numbers and names errors', function (assert) {
		assert.strictEqual(framesOf('10:12', ndf25), 262);
		const snapped = parse('00:01:00;00', df30) as Extract<
			ParseResult,
			{ ok: true }
		>;
		assert.true(snapped.ok);
		assert.strictEqual(snapped.snappedFrom, '00:01:00;00');
		assert.strictEqual(snapped.parts.f, 2);
		const tenth = parse('00:10:00;00', df30) as Extract<
			ParseResult,
			{ ok: true }
		>;
		assert.true(tenth.ok);
		assert.strictEqual(tenth.snappedFrom, undefined);
		assert.deepEqual(parse('', ndf25), {
			ok: false,
			error: { kind: 'empty' },
		});
		assert.deepEqual(parse('1:2:3:4:5', ndf25), {
			ok: false,
			error: { kind: 'too-many' },
		});
		assert.deepEqual(parse('ab:cd', ndf25), {
			ok: false,
			error: { kind: 'not-numeric' },
		});
		assert.deepEqual(parse('00:00:00:25', ndf25), {
			ok: false,
			error: { kind: 'frame-range', max: 24 },
		});
		assert.deepEqual(parse('00:00:60:00', ndf25), {
			ok: false,
			error: { kind: 'seconds-range' },
		});
		assert.deepEqual(parse('00:60:00:00', ndf25), {
			ok: false,
			error: { kind: 'minutes-range' },
		});
	});

	test('clock rounds to the millisecond before splitting', function (assert) {
		assert.strictEqual(clock(1.9999), '00:00:02.000');
		assert.strictEqual(clock(3661.5), '01:01:01.500');
		assert.strictEqual(clock(-1.25), '-00:00:01.250');
		assert.strictEqual(clock(Infinity), '—');
	});

	test('the register fills from the right with the separators put in', function (assert) {
		assert.strictEqual(register('', false), '');
		assert.strictEqual(register('1', false), '00:00:00:01');
		assert.strictEqual(register('123', true), '00:00:01;23');
		assert.strictEqual(register('123456789', false), '23:45:67:89');
	});
});
