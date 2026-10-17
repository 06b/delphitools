import { module, test } from 'qunit';
import {
	landPath,
	locationLabel,
	mapAspect,
	mapPoint,
} from 'delphitools-v2/lib/world-map';

module('Unit | Lib | world-map', function () {
	test('mapPoint and locationLabel (iOS selfCheck)', function (assert) {
		assert.deepEqual(mapPoint(0, 0), { x: 180, y: 80 });
		assert.deepEqual(mapPoint(-89, 180), { x: 360, y: 140 });
		assert.strictEqual(mapAspect, 360 / 140);
		assert.strictEqual(
			locationLabel({ lat: 51.5, lon: -0.12667 }),
			'51.5000° N, 0.1267° W',
		);
	});

	test('landPath draws closed rings and skips slivers', function (assert) {
		assert.strictEqual(
			landPath([
				[
					[0, 0],
					[10, 0],
					[10, 10],
				],
				[[1, 1]],
			]),
			'M180.0 80.0L190.0 80.0L190.0 70.0Z',
		);
	});
});
