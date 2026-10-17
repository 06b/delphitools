import { module, test } from 'qunit';
import {
	compositeFrame,
	drop,
	exportSize,
	imageFrame,
	layoutBatch,
	layoutTree,
	leaf,
	moveLeafNode,
	nearest,
	removeLeafNode,
	seamCentres,
	swapLeafContent,
	wrapNode,
	type Src,
	type TreeNode,
} from 'delphitools-v2/components/tools/image-stitcher/stitch';

const src = (id: string, w: number, h: number): Src => ({
	id,
	name: id,
	el: {} as CanvasImageSource,
	url: '',
	w,
	h,
});

module('Unit | Tool | image-stitcher', function () {
	test('a row pins the composite to the base pixels', function (assert) {
		const a = src('a', 800, 600);
		const b = src('b', 600, 600);
		const byId = new Map([
			['a', a],
			['b', b],
		]);
		const root: TreeNode = {
			kind: 'split',
			key: 'r',
			dir: 'row',
			children: [leaf('a'), leaf('b')],
		};
		const layout = layoutTree(root, byId, 'a')!;
		assert.deepEqual(
			[Math.round(layout.width), Math.round(layout.height)],
			[1400, 600],
		);
		assert.strictEqual(layout.seams.length, 1);
		assert.true(layout.seams[0]!.vertical);
		assert.strictEqual(Math.round(layout.seams[0]!.x), 800);
	});

	test('match and matte take the base aspect', function (assert) {
		const a = src('a', 800, 600);
		const c = src('c', 400, 800);
		const byId = new Map([
			['a', a],
			['c', c],
		]);
		const root: TreeNode = {
			kind: 'split',
			key: 'r',
			dir: 'row',
			children: [leaf('a'), leaf('c', 'match')],
		};
		const layout = layoutTree(root, byId, 'a')!;
		assert.deepEqual(
			[Math.round(layout.width), Math.round(layout.height)],
			[1600, 600],
		);
		const crop = layout.ops[1]!.source;
		assert.deepEqual(
			[
				crop.x,
				Math.round(crop.y),
				crop.width,
				Math.round(crop.height),
			],
			[0, 250, 400, 300],
		);
	});

	test('tree edits: wrap, swap, move, remove', function (assert) {
		const a = leaf('a');
		const b = leaf('b');
		let root: TreeNode = wrapNode(a, null, 'right', [b]);
		assert.strictEqual(root.kind, 'split');
		root = wrapNode(root, b.key, 'bottom', [leaf('c')]);
		root = swapLeafContent(root, a.key, b.key);
		const ids = (node: TreeNode): string =>
			node.kind === 'img'
				? node.srcId
				: `${node.dir}(${node.children.map(ids).join(',')})`;
		assert.strictEqual(ids(root), 'row(b,col(a,c))');
		root = moveLeafNode(root, a.key, b.key, 'left');
		assert.strictEqual(ids(root), 'col(row(b,a),c)');
		root = removeLeafNode(root, a.key)!;
		assert.strictEqual(ids(root), 'col(a,c)');
		assert.strictEqual(
			removeLeafNode(leaf('x'), 'nope')?.kind,
			'img',
		);
	});

	test('batch: a near-square grid of first-image cells', function (assert) {
		const layout = layoutBatch([
			src('a', 100, 50),
			src('b', 50, 50),
			src('c', 10, 10),
		])!;
		assert.deepEqual([layout.width, layout.height], [200, 100]);
		assert.deepEqual(layout.ops[2]!.dest, {
			x: 0,
			y: 50,
			width: 100,
			height: 50,
		});
		assert.strictEqual(layoutBatch([]), null);
	});

	test('export size keeps both caps', function (assert) {
		assert.deepEqual(exportSize(1000, 500), {
			width: 1000,
			height: 500,
		});
		assert.deepEqual(exportSize(32768, 100), {
			width: 16384,
			height: 50,
		});
		const big = exportSize(16000, 16000);
		assert.true(big.width * big.height <= 64_000_000);
	});

	test('the iOS ImageStitcherPicture self-check', function (assert) {
		const tiles = [
			{
				key: 'a',
				rect: { x: 0, y: 0, width: 100, height: 100 },
			},
			{
				key: 'b',
				rect: { x: 100, y: 0, width: 200, height: 100 },
			},
		];
		assert.deepEqual(drop(200, 50, tiles, 'a'), {
			kind: 'swap',
			key: 'b',
		});
		assert.deepEqual(drop(105, 50, tiles, 'a'), {
			kind: 'place',
			key: 'b',
			side: 'left',
		});
		assert.deepEqual(drop(200, 95, tiles, 'a'), {
			kind: 'place',
			key: 'b',
			side: 'bottom',
		});
		assert.strictEqual(drop(50, 50, tiles, 'a'), undefined);
		assert.strictEqual(nearest(90, 50, tiles[0]!.rect)[0], 'right');
		const centres = seamCentres(
			[
				{
					id: 'a',
					line: {
						x: 100,
						y: 0,
						width: 0,
						height: 200,
					},
				},
				{
					id: 'b',
					line: {
						x: 60,
						y: 100,
						width: 100,
						height: 0,
					},
				},
			],
			26,
		);
		assert.deepEqual(centres, [
			{ id: 'b', x: 110, y: 100 },
			{ id: 'a', x: 100, y: 130 },
		]);
		assert.deepEqual(
			compositeFrame(
				{ width: 2000, height: 1000 },
				{ x: 0, y: 0, width: 440, height: 300 },
				true,
			),
			{ x: 70, y: 84.5, width: 338, height: 169 },
		);
		const op = {
			fit: 'match' as const,
			source: { x: 100, y: 0, width: 200, height: 300 },
			src: src('s', 400, 300),
		};
		assert.deepEqual(imageFrame(op, { width: 20, height: 30 }), {
			x: -10,
			y: -0,
			width: 40,
			height: 30,
		});
		assert.deepEqual(
			imageFrame(
				{
					...op,
					fit: 'matte',
					src: src('m', 400, 200),
				},
				{ width: 100, height: 100 },
			),
			{ x: 0, y: 25, width: 100, height: 50 },
		);
	});
});
