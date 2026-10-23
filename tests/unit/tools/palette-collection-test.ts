import { module, test } from 'qunit';
import { fanIn } from 'delphitools-v2/components/tools/palette-collection/fan';

const rad = Math.PI / 180;

/** The corners of every chip, after PaletteDeck.selfCheck on iOS. */
function corners(fan: ReturnType<typeof fanIn>) {
	return fan.angles.flatMap((deg) => {
		const a = deg * rad;
		return [
			[-fan.width / 2, -fan.length],
			[fan.width / 2, -fan.length],
			[-fan.width / 2, fan.tail],
			[fan.width / 2, fan.tail],
		].map(([x, y]) => [
			fan.x + x! * Math.cos(a) - y! * Math.sin(a),
			fan.y + x! * Math.sin(a) + y! * Math.cos(a),
		]);
	});
}

module('Unit | Tool | palette-collection', function () {
	test('the fan fits the room, the cover last, chips clockwise beneath it', function (assert) {
		for (const [w, h] of [
			[370, 290],
			[650, 980],
			[370, 150],
			[900, 420],
		] as const)
			for (const count of [1, 3, 6, 8, 13]) {
				const fan = fanIn(w, h, count);
				assert.strictEqual(fan.angles.length, count);
				assert.ok(
					corners(fan).every(
						([x, y]) =>
							x! >= -0.5 &&
							y! >= -0.5 &&
							x! <= w + 0.5 &&
							y! <= h + 0.5,
					),
					`${w}x${h} ${count}`,
				);
				assert.ok(
					Math.abs(fan.angles.at(-1)! - 97) <
						0.001,
				);
				const chips = fan.angles.slice(0, -1);
				assert.ok(
					chips.every(
						(a, i) =>
							a > 97 &&
							a < 180 &&
							(i === 0 ||
								a >
									chips[
										i -
											1
									]!),
					),
				);
			}
	});

	test('hug 0.5 centres the fan, 0.3 keeps it to the corner', function (assert) {
		const box = (hug: number) => {
			const points = corners(fanIn(400, 320, 6, hug));
			const xs = points.map(([x]) => x!);
			const ys = points.map(([, y]) => y!);
			return {
				x: (Math.min(...xs) + Math.max(...xs)) / 2,
				y: (Math.min(...ys) + Math.max(...ys)) / 2,
			};
		};
		const centred = box(0.5);
		assert.ok(Math.abs(centred.x - 200) < 0.5);
		assert.ok(Math.abs(centred.y - 160) < 0.5);
		const held = fanIn(400, 320, 6, 0.3);
		assert.ok(held.x < 100);
		assert.ok(held.y < 80);
	});
});
