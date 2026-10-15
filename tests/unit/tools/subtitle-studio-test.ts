import { module, test } from 'qunit';
import {
	clampPosition,
	jumpTarget,
	placement,
	shown,
	snap,
} from 'delphitools-v2/components/tools/subtitle-studio/board';
import {
	DEFAULT_STYLE,
	drawSubtitle,
	growsDown,
} from 'delphitools-v2/lib/subtitle-burn';

const cues = [
	{ start: 1000, end: 2000, text: 'a' },
	{ start: 3000, end: 4000, text: 'b' },
];

module('Unit | Tool | subtitle-studio', function () {
	test('shown: the playing cue, else the next as a ghost (iOS selfCheck)', function (assert) {
		assert.deepEqual(shown(cues, 1500), { index: 0, ghost: false });
		assert.deepEqual(shown(cues, 2500), { index: 1, ghost: true });
		assert.deepEqual(shown(cues, 500), { index: 0, ghost: true });
		assert.deepEqual(shown(cues, 9000), { index: 1, ghost: true });
		assert.strictEqual(shown([], 0), null);
	});

	test('placement: Bottom is the default, Top above Middle (iOS selfCheck)', function (assert) {
		assert.strictEqual(placement(2, 0.05), 0);
		assert.true(placement(0, 0.05) < placement(1, 0.05));
		assert.true(placement(1, 0.05) < 0);
		assert.true(growsDown(placement(0, 0.14)));
		assert.false(growsDown(placement(1, 0.02)));
	});

	test('a drag clamps to the iOS ranges and snaps within 10 px', function (assert) {
		assert.deepEqual(clampPosition(1, -2), { x: 0.45, y: -0.9 });
		assert.deepEqual(snap(0.01, -0.5, 640, 360), { x: 0, y: -0.5 });
		assert.deepEqual(snap(0.02, 0.02, 640, 360), { x: 0.02, y: 0 });
	});

	test('Previous and Next cue', function (assert) {
		assert.strictEqual(jumpTarget(cues, 0, 1), 0);
		assert.strictEqual(jumpTarget(cues, 1000, 1), 1);
		assert.strictEqual(jumpTarget(cues, 3500, 1), null);
		assert.strictEqual(jumpTarget(cues, 3100, -1), 0);
		assert.strictEqual(jumpTarget(cues, 3500, -1), 1);
		assert.strictEqual(jumpTarget(cues, 1100, -1), null);
	});

	test('drawSubtitle answers the text box; the top half grows down', function (assert) {
		const ctx = new OffscreenCanvas(640, 360).getContext('2d')!;
		const two = 'one\ntwo';
		const bottom = drawSubtitle(ctx, two, 640, 360, DEFAULT_STYLE)!;
		assert.true(bottom.y + bottom.height <= 360);
		assert.true(bottom.y > 280, `${bottom.y}`);
		const topped = drawSubtitle(ctx, two, 640, 360, {
			...DEFAULT_STYLE,
			y: placement(0, DEFAULT_STYLE.size),
		})!;
		assert.true(topped.y < 40, `${topped.y}`);
		assert.strictEqual(
			drawSubtitle(ctx, '  ', 640, 360, DEFAULT_STYLE),
			null,
		);
	});
});
