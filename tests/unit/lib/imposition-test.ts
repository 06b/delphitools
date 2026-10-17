import { module, test } from 'qunit';
import {
	DEFAULT_IMPOSITION_CONFIG,
	effectiveSheetH,
	effectiveSheetW,
	getLayoutById,
	placeInCell,
	turnsTopOverBottom,
	type ImpositionConfig,
} from 'delphitools-v2/lib/imposition';

const bind = (pages: number, signaturePages = 16) =>
	getLayoutById('perfect-bind')!.calculate(pages, {
		...DEFAULT_IMPOSITION_CONFIG,
		layoutId: 'perfect-bind',
		signaturePages,
	});

const round = (box: Record<string, number>) =>
	Object.fromEntries(
		Object.entries(box).map(([k, v]) => [
			k,
			Math.round(v * 1000) / 1000,
		]),
	);

module('Unit | Lib | imposition', function () {
	test('placeInCell fits, fills and keeps the actual size', function (assert) {
		const tall = { x: 0, y: 0, width: 100, height: 200 };
		const square = { width: 50, height: 50 };
		assert.deepEqual(round(placeInCell(tall, square, 0, 'fit')), {
			x: 0,
			y: 50,
			width: 100,
			height: 100,
		});
		assert.deepEqual(round(placeInCell(tall, square, 0, 'fill')), {
			x: -50,
			y: 0,
			width: 200,
			height: 200,
		});
	});

	test('placeInCell centres a turned page', function (assert) {
		const wide = { x: 0, y: 0, width: 200, height: 100 };
		assert.deepEqual(
			round(
				placeInCell(
					wide,
					{ width: 50, height: 100 },
					90,
					'fit',
				),
			),
			{ x: 200, y: 0, width: 100, height: 200 },
		);
		const square = { x: 0, y: 0, width: 100, height: 100 };
		assert.deepEqual(
			round(
				placeInCell(
					square,
					{ width: 40, height: 60 },
					180,
					'actual',
				),
			),
			{ x: 70, y: 80, width: 40, height: 60 },
		);
	});

	// ios ImposerViewController.selfCheck
	test('perfect bind folds 38 pages into three 16-page signatures', function (assert) {
		const bound = bind(38);
		assert.deepEqual(
			bound.sheets.map((s) => s.signature),
			[0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2],
		);
		assert.strictEqual(bound.totalPages, 48);
		assert.strictEqual(bound.blanksAdded, 10);
		const front = (i: number) =>
			bound.sheets[i]!.front.map((p) => p.pageNumber).sort(
				(a, b) => a - b,
			);
		assert.deepEqual(front(4), [17, 32]);
		assert.deepEqual(front(8), [0, 33]);
		const placed = bound.sheets.flatMap((sheet) =>
			[...sheet.front, ...sheet.back].map((p) => ({
				signature: sheet.signature,
				page: p.pageNumber,
			})),
		);
		const blanks = placed.filter((p) => p.page === 0);
		assert.strictEqual(blanks.length, 10);
		assert.true(blanks.every((p) => p.signature === 2));
		assert.deepEqual(
			[
				...new Set(
					placed
						.map((p) => p.page)
						.filter((n) => n > 0),
				),
			]
				.sort((a, b) => a - b)
				.join(),
			Array.from({ length: 38 }, (_, i) => i + 1).join(),
		);
	});

	test('perfect bind numbers sheets across signatures and pads the size to 4', function (assert) {
		const bound = bind(10, 6);
		assert.deepEqual(
			bound.sheets.map((s) => s.sheetNumber),
			[1, 2, 3, 4],
		);
		assert.strictEqual(bound.totalPages, 16);
	});

	test('backs register behind fronts', function (assert) {
		for (const layoutId of ['saddle-stitch', 'perfect-bind'])
			for (const orientation of [
				'portrait',
				'landscape',
			] as const)
				for (const duplexFlip of [
					'long-edge',
					'short-edge',
				] as const) {
					const config: ImpositionConfig = {
						...DEFAULT_IMPOSITION_CONFIG,
						layoutId,
						orientation,
						duplexFlip,
						signaturePages: 8,
					};
					const width = effectiveSheetW(
						config.paperSize,
						orientation,
					);
					const height = effectiveSheetH(
						config.paperSize,
						orientation,
					);
					const tumble =
						turnsTopOverBottom(config);
					const sheets = getLayoutById(
						layoutId,
					)!.calculate(24, config).sheets;
					const ok = sheets.every((sheet) =>
						sheet.front.every((page) => {
							const x =
								page.x +
								page.width / 2;
							const y =
								page.y +
								page.height / 2;
							const [sx, sy] = tumble
								? [
										x,
										height -
											y,
									]
								: [
										width -
											x,
										y,
									];
							const reverse =
								sheet.back.find(
									(b) =>
										sx >
											b.x &&
										sx <
											b.x +
												b.width &&
										sy >
											b.y &&
										sy <
											b.y +
												b.height,
								);
							if (!reverse)
								return false;
							const turn =
								(tumble
									? reverse.rotation +
										180
									: reverse.rotation) %
								360;
							const partner =
								page.pageNumber %
									2 ===
								1
									? page.pageNumber +
										1
									: page.pageNumber -
										1;
							return (
								reverse.pageNumber ===
									partner &&
								turn ===
									page.rotation
							);
						}),
					);
					assert.true(
						ok,
						`${layoutId} ${orientation} ${duplexFlip}`,
					);
				}
	});

	test('long edge on a landscape sheet turns top over bottom', function (assert) {
		const landscape = {
			...DEFAULT_IMPOSITION_CONFIG,
			orientation: 'landscape' as const,
		};
		assert.true(
			turnsTopOverBottom({
				...landscape,
				duplexFlip: 'long-edge',
			}),
		);
		assert.false(
			turnsTopOverBottom({
				...landscape,
				duplexFlip: 'short-edge',
			}),
		);
	});
});
