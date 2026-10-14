import { module, test } from 'qunit';
import {
	evalField,
	formatField,
	inspectorSection,
	patchTransform,
	renameLayer,
	setBlendModes,
	setOpacities,
} from 'delphitools-v2/components/substrata/panels/inspector/logic';
import {
	DEFAULT_ARTBOARD,
	SCHEMA_VERSION,
} from 'delphitools-v2/lib/substrata/doc-model';
import type {
	GroupLayer,
	Layer,
	RasterLayer,
	SubstrataDoc,
} from 'delphitools-v2/lib/substrata/doc-model';
import {
	beginTransient,
	commitTransient,
	getSnapshot,
	setDoc,
	undo,
} from 'delphitools-v2/lib/substrata/doc-store';
import { findLayer } from 'delphitools-v2/lib/substrata/layer-tree';

function raster(id: string): RasterLayer {
	return {
		id,
		name: id,
		visible: true,
		locked: false,
		opacity: 1,
		blendMode: 'source-over',
		transform: {
			x: 10,
			y: 20,
			scaleX: 1,
			scaleY: 1,
			angle: 0,
			flipX: false,
			flipY: false,
		},
		filters: [],
		effects: [],
		kind: 'raster',
		blobHash: id,
		naturalWidth: 100,
		naturalHeight: 80,
	};
}

function load(layers: Layer[]): SubstrataDoc {
	const doc: SubstrataDoc = {
		id: 'doc',
		schemaVersion: SCHEMA_VERSION,
		name: 'test',
		artboard: { ...DEFAULT_ARTBOARD },
		layers,
		guides: [],
		createdAt: 1,
		updatedAt: 1,
	};
	setDoc(doc);
	return doc;
}

const layer = (id: string) => findLayer(getSnapshot()!.layers, id)!;

module('Unit | Substrata | inspector', function () {
	test('evalField takes numbers, relative edits and sums', function (assert) {
		assert.strictEqual(evalField('120', 50), 120);
		assert.strictEqual(evalField(' 1,5 ', 0), 1.5);
		assert.strictEqual(evalField('+100', 50), 150);
		assert.strictEqual(evalField('-20', 50), 30);
		assert.strictEqual(evalField('*2', 50), 100);
		assert.strictEqual(evalField('/0', 50), 50);
		assert.strictEqual(evalField('100+50', 0), 150);
		assert.strictEqual(evalField('-5', 0), -5);
		assert.strictEqual(evalField('', 50), null);
		assert.strictEqual(evalField('abc', 50), null);
	});

	test('formatField drops trailing zeros', function (assert) {
		assert.strictEqual(formatField(810.66, 1), '810.7');
		assert.strictEqual(formatField(240, 1), '240');
		assert.strictEqual(formatField(1.16, 2), '1.16');
	});

	test('inspectorSection follows the selection', function (assert) {
		const g: GroupLayer = {
			...raster('g'),
			kind: 'group',
			children: [raster('c')],
		} as unknown as GroupLayer;
		const doc = load([raster('a'), raster('b'), g]);
		assert.strictEqual(inspectorSection(doc, []), 'artboard');
		assert.strictEqual(inspectorSection(doc, ['gone']), 'artboard');
		assert.strictEqual(inspectorSection(doc, ['a']), 'raster');
		assert.strictEqual(inspectorSection(doc, ['a', 'b']), 'shared');
		assert.strictEqual(inspectorSection(doc, ['g']), 'group');
		assert.strictEqual(inspectorSection(doc, ['c']), 'raster');
	});

	test('shared opacity and blend are one undo step', function (assert) {
		load([raster('a'), raster('b')]);
		setOpacities(['a', 'b'], 0.4);
		setBlendModes(['a', 'b'], 'multiply');
		assert.deepEqual(
			[layer('a').opacity, layer('b').blendMode],
			[0.4, 'multiply'],
		);
		undo();
		assert.strictEqual(layer('b').blendMode, 'source-over');
		undo();
		assert.strictEqual(layer('a').opacity, 1);
	});

	test('a transient opacity drag commits once', function (assert) {
		load([raster('a')]);
		beginTransient();
		setOpacities(['a'], 0.8, true);
		setOpacities(['a'], 0.3, true);
		commitTransient();
		assert.strictEqual(layer('a').opacity, 0.3);
		undo();
		assert.strictEqual(layer('a').opacity, 1);
	});

	test('rename and patchTransform', function (assert) {
		load([raster('a')]);
		renameLayer('a', 'Photo');
		patchTransform('a', { x: 99 });
		assert.strictEqual(layer('a').name, 'Photo');
		assert.deepEqual(
			[layer('a').transform.x, layer('a').transform.y],
			[99, 20],
		);
		const before = getSnapshot();
		renameLayer('a', 'Photo');
		assert.strictEqual(getSnapshot(), before, 'same name: no step');
	});
});
