import { module, test } from 'qunit';
import {
	adjustment,
	getLook,
	removeFilter,
	setAdjustment,
	setLook,
	setLookIntensity,
} from 'delphitools-v2/lib/substrata/develop-ops';
import { toneLift } from 'delphitools-v2/lib/substrata/filter-shaders';
import { createEmptyDoc } from 'delphitools-v2/lib/substrata/doc-model';
import type {
	Layer,
	RasterLayer,
	SubstrataDoc,
} from 'delphitools-v2/lib/substrata/doc-model';

function photo(): RasterLayer {
	return {
		id: 'p',
		name: 'Photo',
		visible: true,
		locked: false,
		opacity: 1,
		blendMode: 'source-over',
		transform: {
			x: 0,
			y: 0,
			scaleX: 1,
			scaleY: 1,
			angle: 0,
			flipX: false,
			flipY: false,
		},
		filters: [],
		effects: [],
		kind: 'raster',
		blobHash: 'blob',
		naturalWidth: 10,
		naturalHeight: 10,
	};
}

const docWith = (layer: Layer): SubstrataDoc => ({
	...createEmptyDoc('t'),
	layers: [layer],
});
const photoOf = (doc: SubstrataDoc) => doc.layers[0]!;
const types = (doc: SubstrataDoc) => photoOf(doc).filters.map((f) => f.type);

module('Unit | Substrata | develop-ops', function () {
	test('an adjustment is added ahead of the look and updated in place', function (assert) {
		let doc = setLook(docWith(photo()), 'p', 'sim-01');
		doc = setAdjustment(doc, 'p', 'exposure', 40);
		assert.deepEqual(types(doc), ['exposure', 'film-sim']);
		assert.strictEqual(adjustment(photoOf(doc), 'exposure'), 40);
		const id = photoOf(doc).filters[0]!.id;
		doc = setAdjustment(doc, 'p', 'exposure', -10);
		assert.strictEqual(photoOf(doc).filters[0]!.id, id);
		assert.strictEqual(adjustment(photoOf(doc), 'exposure'), -10);
		assert.strictEqual(adjustment(photoOf(doc), 'contrast'), 0);
	});

	test('a disabled filter comes back on; remove drops it', function (assert) {
		let doc = setAdjustment(docWith(photo()), 'p', 'tint', 20);
		doc = {
			...doc,
			layers: [
				{
					...photoOf(doc),
					filters: photoOf(doc).filters.map(
						(f) => ({
							...f,
							enabled: false,
						}),
					),
				},
			],
		};
		doc = setAdjustment(doc, 'p', 'tint', 30);
		assert.true(photoOf(doc).filters[0]!.enabled);
		doc = removeFilter(doc, 'p', 'tint');
		assert.deepEqual(types(doc), []);
	});

	test('a look keeps its intensity across presets; intensity needs a look', function (assert) {
		const bare = docWith(photo());
		assert.strictEqual(setLookIntensity(bare, 'p', 50), bare);
		let doc = setLook(bare, 'p', 'sim-01');
		assert.strictEqual(
			getLook(photoOf(doc))?.params['intensity'],
			100,
		);
		doc = setLookIntensity(doc, 'p', 40);
		doc = setLook(doc, 'p', 'sim-04');
		assert.deepEqual(getLook(photoOf(doc))?.params, {
			preset: 'sim-04',
			intensity: 40,
		});
	});

	test('unknown layers and types leave the doc as it was', function (assert) {
		const doc = docWith(photo());
		assert.strictEqual(setAdjustment(doc, 'x', 'exposure', 1), doc);
		assert.strictEqual(setAdjustment(doc, 'p', 'nonsense', 1), doc);
		assert.strictEqual(removeFilter(doc, 'p', 'exposure'), doc);
	});

	test('tones lift peaks at 2/3 and 1/3 and is 0 at black and white', function (assert) {
		assert.strictEqual(toneLift(0, 1, 1), 0);
		assert.strictEqual(toneLift(1, 1, 1), 0);
		assert.strictEqual(toneLift(2 / 3, 1, 0).toFixed(4), '0.2500');
		assert.strictEqual(toneLift(1 / 3, 0, 1).toFixed(4), '0.2500');
		assert.true(toneLift(0.5, -1, 0) < 0);
	});
});
