import { module, test } from 'qunit';
import {
	RING,
	RingGeometry,
	SwatchRows,
	SwatchSet,
	relativeLuminance,
	toHex,
	type Swatch,
} from 'delphitools-v2/lib/substrata/colour-ring/geometry';
import {
	ColourLibrary,
	namedSwatches,
	swatchFor,
} from 'delphitools-v2/lib/substrata/colour-ring/library';
import {
	HexDigits,
	SLIDER_MODES,
	channels,
	colourFromHex,
	figures,
	fromChannels,
	hexOf,
	usedColours,
	wheelHue,
} from 'delphitools-v2/lib/substrata/colour-ring/model';
import {
	ARRIVAL_TOTAL,
	DEPARTURE_TOTAL,
	arrival,
	coast,
	departure,
	flingSpeed,
} from 'delphitools-v2/lib/substrata/colour-ring/motion';
import {
	createEmptyDoc,
	type Layer,
} from 'delphitools-v2/lib/substrata/doc-model';

const swatch = (code: string, hex: string): Swatch => ({
	code,
	name: code,
	hex,
});

const near = (a: number, b: number, tolerance = 1e-9) =>
	Math.abs(a - b) < tolerance;

const label = (set: SwatchSet) =>
	set.columns.map(
		(c) => c.label ?? c.swatches.map((s) => s.code).join(' '),
	);

const markers = [
	swatch('A00', '#804040'),
	swatch('A01', '#ff8080'),
	swatch('A90', '#ffeeee'),
	swatch('A91', '#ffe0e0'),
	swatch('B00', '#203040'),
	swatch('B0A', '#d0e0f0'),
];

module('Unit | Substrata | colour ring sets', function () {
	test('families group by the key character, lightest first', function (assert) {
		const set = SwatchSet.families(markers, 2, 7, 34);
		assert.deepEqual(label(set), [
			'A',
			'A90 A00',
			'A91 A01',
			'B',
			'B00',
			'B0A',
		]);
		assert.deepEqual(
			set.columns.map((c) => Math.round(c.start * 10) / 10),
			[0, 4.2, 11.2, 18.2, 22.4, 29.4],
		);
		assert.ok(near(set.columns[0]!.width, 4.2));
		assert.strictEqual(set.columns[1]!.width, 7);
		assert.ok(near(set.total, 36.4));
	});

	test('spot columns group by the first digit', function (assert) {
		const spot = [
			swatch('A00', '#ff0000'),
			swatch('A01', '#800000'),
			swatch('A10', '#00ff00'),
		];
		assert.deepEqual(label(SwatchSet.families(spot, 1, 8, 44)), [
			'A',
			'A00 A01',
			'A10',
		]);
	});

	test('groups override codes', function (assert) {
		const freetone: Swatch[] = [
			{ code: '654', name: '', hex: '#003a70', group: 'Q8' },
			{ code: '653', name: '', hex: '#34657f', group: 'Q8' },
			{
				code: 'CG11',
				name: 'Cool Gray 11',
				hex: '#53565a',
				group: 'N7',
			},
		];
		assert.deepEqual(
			label(SwatchSet.families(freetone, 1, 8, 40)),
			['Q', '653 654', 'N', 'CG11'],
		);
	});

	test('palettes head each category', function (assert) {
		const set = SwatchSet.palettes(
			[
				{
					name: 'Mayfair',
					category: 'Classic',
					colours: ['#1A2634', '#f5f0e6'],
				},
				{
					name: 'Moss',
					category: 'Nature',
					colours: ['#2d4a3e'],
				},
			],
			7,
			44,
		);
		assert.deepEqual(label(set), [
			'Classic',
			'1a2634 f5f0e6',
			'Nature',
			'2d4a3e',
		]);
		assert.deepEqual(set.columns[1]!.swatches[0], {
			code: '1a2634',
			name: 'Mayfair',
			hex: '#1a2634',
		});
		assert.strictEqual(set.columns[2]!.width, 7);
	});

	test('finds the swatch under an angle and depth, looping', function (assert) {
		const set = SwatchSet.families(markers, 2, 7, 34);
		assert.deepEqual(set.index(5, 10), { column: 1, row: 0 });
		assert.deepEqual(set.index(12, 40), { column: 2, row: 1 });
		assert.strictEqual(set.index(2, 10), null);
		assert.strictEqual(set.index(23, 40), null);
		assert.deepEqual(set.index(-1, 10), { column: 5, row: 0 });
		assert.deepEqual(set.index(36.4 + 5, 10), {
			column: 1,
			row: 0,
		});
		assert.strictEqual(set.index(5, -1), null);
		assert.strictEqual(set.at({ column: 2, row: 1 }).code, 'A01');
	});

	test('wraps angles into one turn of the set', function (assert) {
		const set = SwatchSet.families(markers, 2, 7, 34);
		assert.ok(near(set.wrapped(40), 3.6));
		assert.ok(near(set.wrapped(-1), 35.4));
		assert.ok(near(set.wrapped(-71.8), 1));
		assert.strictEqual(set.deepest, 2);
	});
});

module('Unit | Substrata | colour ring geometry', function () {
	const right = new RingGeometry({ x: 1140, y: 780 }, false);
	const left = new RingGeometry({ x: 40, y: 780 }, true);

	test('angles run from into the screen to straight up', function (assert) {
		const into = right.polar({ x: 1040, y: 780 });
		assert.ok(near(into.radius, 100));
		assert.ok(near(into.angle, 0));
		assert.ok(near(right.polar({ x: 1140, y: 680 }).angle, 90));
		assert.ok(near(left.polar({ x: 140, y: 780 }).angle, 0));
		assert.ok(near(left.polar({ x: 40, y: 680 }).angle, 90));
		assert.ok(near(right.polar({ x: 1240, y: 780 }).angle, 180));
		assert.ok(near(right.polar({ x: 1140, y: 880 }).angle, -90));
		assert.ok(near(right.polar({ x: 1240, y: 880 }).angle, -135));
		const behind = right.polar({ x: 1240, y: 870 }).angle;
		assert.ok(near(behind, 222, 0.1), String(behind));
	});

	test('a turned ring opens where it is turned', function (assert) {
		const flat = new RingGeometry({ x: 500, y: 400 }, true, -45);
		const up = new RingGeometry({ x: 500, y: 400 }, true, 45);
		assert.ok(near(flat.point(100, 45).x, 600));
		assert.ok(near(flat.point(100, 45).y, 400));
		assert.ok(near(up.point(100, 45).x, 500));
		assert.ok(near(up.point(100, 45).y, 300));
		for (const geometry of [
			flat,
			up,
			new RingGeometry({ x: 0, y: 0 }, false, 30),
		]) {
			for (let angle = -120; angle <= 200; angle += 20) {
				const back = geometry.polar(
					geometry.point(150, angle),
				);
				assert.ok(near(back.radius, 150));
				assert.ok(near(back.angle, angle, 1e-6));
			}
		}
	});

	test('point inverts polar', function (assert) {
		for (const geometry of [right, left]) {
			const back = geometry.polar(geometry.point(200, 30));
			assert.ok(near(back.radius, 200));
			assert.ok(near(back.angle, 30));
		}
	});

	test('targets the hub, the round buttons and the types', function (assert) {
		const at = (r: number, a: number) =>
			right.target(right.point(r, a), 6, 400);
		assert.deepEqual(at(10, 40), { kind: 'close' });
		assert.deepEqual(at(RING.buttonOrbit, RING.eyedropperAngle), {
			kind: 'eyedropper',
		});
		assert.deepEqual(
			at(RING.buttonOrbit + 12, RING.eyedropperAngle + 4),
			{ kind: 'eyedropper' },
		);
		assert.deepEqual(at(RING.buttonOrbit, RING.starAngle), {
			kind: 'star',
		});
		assert.deepEqual(at(RING.buttonOrbit, RING.hexAngle), {
			kind: 'hex',
		});
		assert.deepEqual(at(RING.buttonOrbit, RING.hueWheelAngle), {
			kind: 'hueWheel',
		});
		assert.deepEqual(at(RING.buttonOrbit, 21), { kind: 'nothing' });
		assert.deepEqual(at(RING.buttonOrbit, 73), { kind: 'nothing' });
		assert.ok(
			RING.buttonOrbit + RING.buttonRadius < RING.typesInner,
		);
		assert.deepEqual(at(90, 4), { kind: 'type', index: 0 });
		assert.deepEqual(at(90, 32), { kind: 'type', index: 2 });
		assert.deepEqual(at(90, 86), { kind: 'type', index: 5 });
		assert.deepEqual(at(90, 120), { kind: 'nothing' });
		const band = at(240, 45) as {
			kind: string;
			radius?: number;
			angle?: number;
		};
		assert.deepEqual(
			[
				band.kind,
				band.radius?.toFixed(6),
				band.angle?.toFixed(6),
			],
			['band', '240.000000', '45.000000'],
		);
		assert.deepEqual(at(420, 45), { kind: 'close' });
	});

	test('sliders span the quarter', function (assert) {
		const [low, high] = RING.sliderArc;
		assert.strictEqual(RingGeometry.sliderValue(low), 0);
		assert.strictEqual(RingGeometry.sliderValue(high), 1);
		assert.strictEqual(RingGeometry.sliderValue(-20), 0);
		assert.strictEqual(RingGeometry.sliderValue(120), 1);
		assert.ok(
			near(RingGeometry.sliderAngle(0.5), (low + high) / 2),
		);
	});

	test('rows fill the quarter in order', function (assert) {
		assert.strictEqual(SwatchRows.perRow, 9);
		const first = SwatchRows.cell(0, 0);
		assert.deepEqual(
			SwatchRows.index(
				(first.inner + first.outer) / 2,
				first.start + 1,
			),
			{ row: 0, column: 0 },
		);
		assert.strictEqual(
			SwatchRows.index(first.outer + 1, first.start + 1),
			null,
		);
		const second = SwatchRows.cell(1, 3);
		assert.deepEqual(
			SwatchRows.index(second.inner + 1, second.start + 1),
			{ row: 1, column: 3 },
		);
		assert.strictEqual(SwatchRows.index(second.inner + 1, 2), null);
	});
});

module('Unit | Substrata | colour ring model', function () {
	test('the bundled libraries, whole', function (assert) {
		const count = (set: SwatchSet) =>
			set.columns.reduce((n, c) => n + c.swatches.length, 0);
		assert.strictEqual(count(ColourLibrary.markers), 349);
		assert.strictEqual(
			ColourLibrary.markers.columns[0]!.label,
			'A',
		);
		assert.strictEqual(count(ColourLibrary.freetone), 1310);
		assert.strictEqual(ColourLibrary.freetone.deepest, 18);
		assert.strictEqual(
			ColourLibrary.palettes.columns.filter(
				(c) => c.label === null,
			).length,
			284,
		);
		assert.strictEqual(
			ColourLibrary.palettes.columns[0]!.label,
			'Classic',
		);
		assert.strictEqual(namedSwatches.get('#f46d57')?.code, 'A00');
		assert.strictEqual(namedSwatches.get('#35377c')?.code, 'IKB');
		assert.deepEqual(swatchFor('#123456ff'), {
			code: '123456',
			name: '',
			hex: '#123456',
		});
	});

	test('luminance and hex', function (assert) {
		assert.strictEqual(relativeLuminance('#ffffff'), 1);
		assert.strictEqual(relativeLuminance('#000000'), 0);
		assert.strictEqual(toHex(1, 0.5, 0), '#ff8000');
		assert.strictEqual(toHex(0, 0, 1, 0.5), '#0000ff80');
		assert.strictEqual(
			hexOf(colourFromHex('#0000ff80')!),
			'#0000ff80',
		);
	});

	test('each slider mode reads back what it writes', function (assert) {
		const green = colourFromHex('#1e6626')!;
		for (const mode of SLIDER_MODES) {
			const back = fromChannels(
				mode,
				channels(mode, green),
				0.5,
			);
			assert.strictEqual(hexOf(back), '#1e662680', mode);
		}
		assert.deepEqual(figures('rgb', channels('rgb', green)), [
			'30',
			'102',
			'38',
		]);
		assert.deepEqual(figures('hsl', [0.5, 0.25, 1]), [
			'180°',
			'25 %',
			'100 %',
		]);
		assert.deepEqual(figures('lab', [0.5, 0, 1]), [
			'50',
			'-100',
			'100',
		]);
		const grey = channels('lab', colourFromHex('#808080')!);
		assert.ok(near(grey[0]!, 0.536, 0.01));
		assert.ok(near(grey[1]!, 0.5, 0.01));
		assert.ok(near(grey[2]!, 0.5, 0.01));
	});

	test('hex digits: hex only, eight at most, a colour at three, six or eight', function (assert) {
		const pad = new HexDigits();
		pad.show(colourFromHex('#1e6626')!);
		assert.strictEqual(pad.digits, '1e6626');
		pad.insert('a');
		assert.strictEqual(
			pad.digits,
			'a',
			'the first digit typed replaces the shown ones',
		);
		pad.clear();
		assert.strictEqual(pad.colour, null);
		pad.insert('F0g0#Z');
		assert.strictEqual(pad.digits, 'f00');
		assert.strictEqual(hexOf(pad.colour!), '#ff0000');
		pad.insert('0000c08');
		assert.strictEqual(pad.digits, 'f000000c');
		assert.strictEqual(hexOf(pad.colour!), '#f000000c');
		pad.deleteBackward();
		assert.strictEqual(pad.colour, null);
		pad.paste('rgb(0, 0, 255)');
		assert.strictEqual(pad.digits, '0000ff');
		pad.paste('#11223380');
		assert.strictEqual(pad.digits, '11223380');
		assert.false(pad.paste('not a colour'));
		assert.strictEqual(pad.digits, '11223380');
	});

	test('used colours list each once in document order', function (assert) {
		const doc = createEmptyDoc('t');
		doc.artboard.background = '#f5f0e6';
		const base = {
			visible: true,
			locked: false,
			opacity: 1,
			blendMode: 'normal',
			transform: {},
			filters: [],
			effects: [],
		};
		doc.layers = [
			{
				...base,
				id: 'g',
				name: 'g',
				kind: 'group',
				children: [
					{
						...base,
						id: 'a',
						name: 'a',
						kind: 'shape',
						fill: 'transparent',
						stroke: null,
					},
					{
						...base,
						id: 's',
						name: 's',
						kind: 'shape',
						fill: {
							type: 'linear',
							stops: [
								{
									offset: 0,
									colour: '#000000',
								},
								{
									offset: 1,
									colour: '#FFFFFF',
								},
							],
						},
						stroke: {
							colour: '#1e6626',
							width: 2,
						},
					},
				],
			},
			{
				...base,
				id: 't',
				name: 't',
				kind: 'text',
				fill: '#ffffff',
				stroke: null,
				plate: {
					shape: 'pill',
					colour: '#1e6626',
					padding: 4,
				},
			},
		] as unknown as Layer[];
		assert.deepEqual(usedColours(doc), [
			'#f5f0e6',
			'#000000',
			'#ffffff',
			'#1e6626',
		]);
	});

	test('the hue wheel turns red at the top, clockwise', function (assert) {
		assert.ok(near(wheelHue(0, -10), 0));
		assert.ok(near(wheelHue(10, 0), 0.25));
		assert.ok(near(wheelHue(0, 10), 0.5));
		assert.ok(near(wheelHue(-10, 0), 0.75));
	});
});

module('Unit | Substrata | colour ring motion', function () {
	test('swatches fly in and out on the stagger', function (assert) {
		assert.strictEqual(arrival(0, -25, 0), 0);
		assert.strictEqual(arrival(ARRIVAL_TOTAL, 115, 18), 1);
		assert.ok(arrival(0.1, -25, 0) > arrival(0.1, 100, 0));
		assert.strictEqual(departure(0, 50, 2, false), 1);
		assert.strictEqual(departure(DEPARTURE_TOTAL, 50, 2, false), 0);
		// the picked swatch lingers until the others are gone
		assert.strictEqual(departure(0.25, 50, 2, true), 1);
		assert.strictEqual(departure(DEPARTURE_TOTAL, 50, 2, true), 0);
	});

	test('a flick coasts at the speed of its last moments', function (assert) {
		assert.strictEqual(flingSpeed([]), 0);
		const trail = [
			{ time: 0, offset: 0 },
			{ time: 0.05, offset: 10 },
			{ time: 0.1, offset: 30 },
		];
		assert.ok(near(flingSpeed(trail), 400));
		assert.strictEqual(
			flingSpeed([
				{ time: 0, offset: 0 },
				{ time: 0.05, offset: 0.1 },
			]),
			0,
		);
		assert.strictEqual(
			flingSpeed([
				{ time: 0, offset: 0 },
				{ time: 0.01, offset: 100 },
			]),
			1440,
		);
		assert.ok(near(coast(400, 1), 160));
		assert.strictEqual(coast(3, 1), 0);
	});
});
