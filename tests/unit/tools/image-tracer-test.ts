import { module, test } from 'qunit';
import tracer from 'imagetracerjs';
import {
	DEFAULT_OPTIONS,
	OUTLINE_LINE_LIMIT,
	PRESETS,
	fromPreset,
	outline,
	palette,
	parseTrace,
	smoothing,
	svgSize,
	totals,
	traceOptions,
} from 'delphitools-v2/components/tools/image-tracer/trace';

const SVG =
	'<svg width="20" height="10" version="1.1" xmlns="http://www.w3.org/2000/svg" desc="Created with imagetracer.js version 1.2.6" >' +
	'<path fill="rgb(255,0,0)" stroke="rgb(255,0,0)" stroke-width="1" opacity="1" d="M 0 0 L 10 0 Q 10 5 5 10 L 0 0 Z " />' +
	'<path fill="rgb(255,0,0)" stroke="rgb(255,0,0)" stroke-width="1" opacity="1" d="M 12 0 L 14 0 L 12 2 Z " />' +
	'<circle cx="1" cy="1" r="0.5" fill="cyan" />' +
	'<path fill="rgb(0,0,255)" stroke="rgb(0,0,255)" stroke-width="1" opacity="0" d="M 0 0 L 1 1 Z " />' +
	'</svg>';

module('Unit | Tool | image-tracer', function () {
	test('parseTrace reads paths by colour and skips control point circles', function (assert) {
		const vectors = parseTrace(SVG)!;
		assert.deepEqual([vectors.width, vectors.height], [20, 10]);
		assert.strictEqual(vectors.layers.length, 2);
		const [red, blue] = vectors.layers;
		assert.deepEqual(red!.rgb, [255, 0, 0]);
		assert.strictEqual(red!.paths, 2);
		assert.strictEqual(red!.lineCount, 4);
		assert.strictEqual(red!.curveCount, 1);
		assert.deepEqual(red!.curves, [10, 0, 10, 5, 5, 10]);
		assert.deepEqual(red!.lines.slice(0, 4), [0, 0, 10, 0]);
		assert.strictEqual(blue!.opacity, 0);
		assert.deepEqual(totals(vectors), {
			paths: 3,
			lines: 5,
			curves: 1,
		});
		assert.deepEqual(
			palette(vectors),
			[[1, 0, 0]],
			'a clear layer draws nothing',
		);
	});

	test('svgSize prefers the viewBox', function (assert) {
		assert.deepEqual(
			svgSize(
				'<svg viewBox="0 0 30 40" width="3" height="4">',
			),
			{
				width: 30,
				height: 40,
			},
		);
		assert.strictEqual(svgSize('<svg width="100%">'), undefined);
		assert.strictEqual(parseTrace('<p>no</p>'), undefined);
	});

	test('a real trace parses to its own counts', function (assert) {
		const data = new ImageData(8, 8);
		for (let i = 0; i < 64; i++) {
			const left = i % 8 < 4;
			data.data.set(
				left ? [200, 30, 30, 255] : [30, 30, 200, 255],
				i * 4,
			);
		}
		const svg = tracer.imagedataToSVG(
			data,
			traceOptions(
				{
					...DEFAULT_OPTIONS,
					numberofcolors: 2,
					pathomit: 0,
				},
				{},
			),
		);
		const vectors = parseTrace(svg)!;
		assert.deepEqual([vectors.width, vectors.height], [8, 8]);
		assert.strictEqual(
			totals(vectors).paths,
			(svg.match(/<path /g) ?? []).length,
		);
		assert.ok(palette(vectors).length >= 2);
	});

	test('fromPreset keeps the scale and sets extras aside', function (assert) {
		const powders = tracer.optionpresets.posterized3!;
		const { options, extras } = fromPreset(powders, 3);
		assert.strictEqual(options.scale, 3);
		assert.strictEqual(options.numberofcolors, 3);
		assert.strictEqual(options.strokewidth, 0);
		assert.ok(
			Array.isArray(extras.pal),
			'the fixed palette rides along',
		);
		const plain = fromPreset(tracer.optionpresets.default!, 2);
		assert.strictEqual(
			plain.options.scale,
			2,
			'default sets scale 1; ignored',
		);
		assert.deepEqual(
			{ ...plain.options, scale: 1 },
			DEFAULT_OPTIONS,
		);
	});

	test('every preset exists in imagetracerjs', function (assert) {
		for (const { id } of PRESETS)
			assert.ok(tracer.optionpresets[id], id);
	});

	test('traceOptions never sends a zero threshold', function (assert) {
		const opts = traceOptions(
			{ ...DEFAULT_OPTIONS, ltres: 0, qtres: 0 },
			{ pal: 1 },
		);
		assert.strictEqual(opts.ltres, 0.01);
		assert.strictEqual(opts.qtres, 0.01);
		assert.strictEqual(opts.pal, 1);
		assert.strictEqual(smoothing(0), '0.01');
		assert.strictEqual(smoothing(2.5), '2.5');
	});

	test('outline indents a line per tag and cuts long values', function (assert) {
		const lines = outline(SVG).split('\n');
		assert.ok(lines[0]!.startsWith('<svg width="20"'));
		assert.ok(lines[1]!.startsWith('  <path fill="rgb(255,0,0)"'));
		assert.strictEqual(lines.at(-1), '</svg>');
		assert.strictEqual(
			outline(`<svg d="${'x'.repeat(60)}"/>`),
			`<svg d="${'x'.repeat(40)}…"/>`,
		);
		const many = `<svg>${'<path d="M 0 0" />'.repeat(300)}</svg>`;
		const cut = outline(many).split('\n');
		assert.strictEqual(cut.length, OUTLINE_LINE_LIMIT + 1);
		assert.strictEqual(cut.at(-1), '<!-- 62 more -->');
	});
});
