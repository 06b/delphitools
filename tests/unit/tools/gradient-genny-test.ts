import { module, test } from 'qunit';
import { oklch, parseHex } from 'delphicanon/lib/colour';
import { GradientModel } from 'delphitools-v2/components/tools/gradient-genny/model';
import {
	canBlend,
	colourAt,
	cssLine,
	gradientCss,
	launchFlags,
	mix,
	pigmentBlend,
	railProject,
	ramp,
	seedGrid,
	snapAngle,
	stopForWidestGap,
	type Stop,
} from 'delphitools-v2/components/tools/gradient-genny/paint';

const stops: Stop[] = [
	{ id: 'a', colour: '#FF0000', position: 0 },
	{ id: 'b', colour: '#0000FF', position: 100 },
];
const same = (code: string) => code;

module('Unit | Tool | gradient-genny', function () {
	test('colours blend in the chosen space', function (assert) {
		assert.strictEqual(colourAt(stops, 50, 'srgb'), '#800080');
		assert.strictEqual(colourAt(stops, -5, 'srgb'), '#FF0000');
		assert.strictEqual(colourAt(stops, 120, 'srgb'), '#0000FF');
		const yellow = parseHex('FFFF00')!;
		const blue = parseHex('0000FF')!;
		assert.true(
			oklch(mix(yellow, blue, 0.5, 'oklch'))[1] >
				oklch(mix(yellow, blue, 0.5, 'srgb'))[1] + 0.05,
			'oklch keeps chroma',
		);
	});

	test('the ramp pads to the ends and samples outside sRGB', function (assert) {
		const inner: Stop[] = [
			{ id: 'a', colour: '#FF0000', position: 30 },
		];
		assert.strictEqual(ramp(inner, 'srgb').length, 3);
		assert.strictEqual(ramp(stops, 'oklab', 4).length, 5);
		assert.strictEqual(ramp(stops, 'srgb').length, 2);
	});

	test('css follows the iOS shape and the web corner and freeform text', function (assert) {
		const model = new GradientModel();
		model.stops = stops;
		assert.strictEqual(
			gradientCss(model, same),
			'background: linear-gradient(90deg,\n  #FF0000 0%,\n  #0000FF 100%);',
		);
		model.mode = 'conic';
		model.angle = 45;
		model.space = 'oklch';
		model.centre = { x: 0.25, y: 0.5 };
		assert.strictEqual(
			gradientCss(model, same),
			'background: conic-gradient(from 45deg at 25% 50% in oklch,\n  #FF0000 0%,\n  #0000FF 100%);',
		);
		model.mode = 'radial';
		assert.true(
			gradientCss(model, same).startsWith(
				'background: radial-gradient(circle at 25% 50% in oklch,',
			),
		);
		model.mode = 'corners';
		assert.true(
			gradientCss(model, same).includes(
				'ellipse at top left',
			),
		);
		model.mode = 'freeform';
		assert.true(
			gradientCss(model, same).startsWith(
				'/* Freeform gradients',
			),
		);
	});

	test('the css line spans the box along the angle', function (assert) {
		const right = cssLine(90, 200, 100);
		const rounded = (line: typeof right) =>
			[
				line.start.x,
				line.start.y,
				line.end.x,
				line.end.y,
			].map((v) => Math.round(v * 1e6) / 1e6 + 0);
		assert.deepEqual(rounded(right), [0, 50, 200, 50]);
		assert.deepEqual(
			rounded(cssLine(180, 200, 100)),
			[100, 0, 100, 100],
		);
	});

	test('rails project points to a position and an offset', function (assert) {
		const line = railProject(
			{
				kind: 'line',
				from: { x: 0, y: 0 },
				to: { x: 100, y: 0 },
			},
			{ x: 25, y: 10 },
		);
		assert.strictEqual(line.t, 0.25);
		assert.strictEqual(line.off, 10);
		const ring = railProject(
			{
				kind: 'ring',
				centre: { x: 0, y: 0 },
				radius: 10,
				start: 0,
			},
			{ x: 20, y: 0 },
		);
		assert.true(Math.abs(ring.t - 0.25) < 1e-9);
		assert.true(Math.abs(ring.off - 10) < 1e-9);
	});

	test('angles snap to 45 within 4 degrees', function (assert) {
		assert.deepEqual(snapAngle(43), { degrees: 45, snapped: true });
		assert.deepEqual(snapAngle(40), {
			degrees: 40,
			snapped: false,
		});
		assert.deepEqual(snapAngle(-2), { degrees: 0, snapped: true });
		assert.deepEqual(snapAngle(358.6), {
			degrees: 0,
			snapped: true,
		});
	});

	test('a new stop takes the widest gap in the colour already there', function (assert) {
		const stop = stopForWidestGap(
			[
				...stops,
				{ id: 'c', colour: '#00FF00', position: 20 },
			],
			'srgb',
		);
		assert.strictEqual(stop.position, 60);
		assert.strictEqual(
			stop.colour,
			colourAt(
				[
					...stops,
					{
						id: 'c',
						colour: '#00FF00',
						position: 20,
					},
				],
				60,
				'srgb',
			),
		);
	});

	test('pigment blend adds three steps a gap up to the limit', function (assert) {
		const once = pigmentBlend(stops);
		assert.strictEqual(once.length, 5);
		assert.deepEqual(
			once.map((stop) => stop.position),
			[0, 25, 50, 75, 100],
		);
		const twice = pigmentBlend(once);
		assert.strictEqual(twice.length, 17);
		assert.true(canBlend(once));
		assert.false(canBlend(twice));
	});

	test('the grid seeds sit inset on the image', function (assert) {
		const grid = seedGrid(3);
		assert.strictEqual(grid.length, 9);
		assert.strictEqual(grid[0]!.x, 0.15);
		assert.true(Math.abs(grid[8]!.y - 0.85) < 1e-9);
	});

	test('the model removes down to two and moves the selection', function (assert) {
		const model = new GradientModel({ carried: '#FF0000' });
		assert.strictEqual(model.selectedColour, '#FF0000');
		model.addStop();
		assert.strictEqual(model.stops.length, 3);
		assert.strictEqual(model.selectedStop?.position, 50);
		model.removeSelected();
		assert.strictEqual(model.stops.length, 2);
		assert.notStrictEqual(model.selected, '');
		model.removeSelected();
		assert.strictEqual(model.stops.length, 2, 'two stay');
		model.setMode('corners');
		assert.strictEqual(model.selected, 'topLeft');
		model.setColour('#00FF00');
		assert.strictEqual(model.corners.topLeft, '#00FF00');
	});

	test('launch flags read the iOS arguments', function (assert) {
		const flags = launchFlags(
			'?gradType=2&gradSpace=2&gradAngle=405&gradCentre=30,40&gradStops=ffd400@0,0033ff@100&gradAutoStep=1&gradSize=1080x1920&gradNoise=20&gradSelect=1',
		);
		assert.strictEqual(flags.mode, 'conic');
		assert.strictEqual(flags.space, 'oklch');
		assert.strictEqual(flags.angle, 45);
		assert.deepEqual(flags.centre, { x: 0.3, y: 0.4 });
		assert.deepEqual(
			flags.stops?.map((stop) => [
				stop.colour,
				stop.position,
			]),
			[
				['#FFD400', 0],
				['#0033FF', 100],
			],
		);
		assert.strictEqual(flags.blends, 1);
		assert.deepEqual(flags.size, { width: 1080, height: 1920 });
		assert.strictEqual(flags.noise, 20);
		assert.strictEqual(flags.select, 1);
		assert.strictEqual(
			launchFlags('?gradType=corners').mode,
			'corners',
		);
		assert.strictEqual(launchFlags('').mode, undefined);
	});
});
