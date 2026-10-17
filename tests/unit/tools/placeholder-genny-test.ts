import { module, test } from 'qunit';
import {
	aspect,
	base64Utf8,
	baseName,
	placeholderFontSize,
	placeholderLabel,
	placeholderSvg,
} from 'delphitools-v2/components/tools/placeholder-genny/placeholder';

const spec = {
	width: 800,
	height: 600,
	background: '#e2e2e2',
	foreground: '#666666',
	text: '',
};

module('Unit | Tool | placeholder-genny', function () {
	test('the label and its size', function (assert) {
		assert.strictEqual(placeholderLabel('', 800, 600), '800 × 600');
		assert.strictEqual(placeholderLabel('Hi', 800, 600), 'Hi');
		assert.strictEqual(placeholderFontSize(800, 600), 75);
	});

	test('the SVG is the web export', function (assert) {
		const svg = placeholderSvg(spec);
		assert.true(svg.includes('font-size="75"'));
		assert.true(svg.includes('font-family="Iosevka, monospace"'));
		assert.true(svg.includes('<rect fill="#e2e2e2"'));
		assert.true(svg.includes('>800 × 600</text>'));
		assert.true(
			placeholderSvg({ ...spec, text: 'a<b & "c"' }).includes(
				'>a&lt;b &amp; &quot;c&quot;</text>',
			),
		);
	});

	test('aspect in lowest terms or against 1', function (assert) {
		assert.strictEqual(aspect(1920, 1080), '16:9');
		assert.strictEqual(aspect(1200, 630), '40:21');
		assert.strictEqual(aspect(4096, 4095), '1.00:1');
	});

	test('names and data', function (assert) {
		assert.strictEqual(baseName(spec), 'placeholder-800x600');
		assert.strictEqual(atob(base64Utf8('×')), 'Ã\u0097');
	});
});
