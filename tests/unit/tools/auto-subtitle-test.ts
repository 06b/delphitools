import { module, test } from 'qunit';
import {
	altered,
	failure,
	output,
	outputName,
	stats,
} from 'delphitools-v2/components/tools/auto-subtitle/result';

const cues = [
	{ start: 100, end: 1800, text: 'One' },
	{ start: 2000, end: 3500, text: 'Two' },
];

module('Unit | Tool | auto-subtitle', function () {
	test('a cue is altered when any field differs or it is new', function (assert) {
		assert.false(altered(cues, { ...cues[0]! }, 0));
		assert.true(altered(cues, { ...cues[0]!, text: 'Uno' }, 0));
		assert.true(altered(cues, { ...cues[1]!, end: 3600 }, 1));
		assert.true(altered(cues, { ...cues[1]! }, 2));
	});

	test('output writes SRT, or VTT with the captions kind', function (assert) {
		assert.strictEqual(output([], 'srt'), '');
		assert.true(
			output(cues, 'srt').startsWith(
				'1\n00:00:00,100 --> 00:00:01,800\nOne',
			),
		);
		const vtt = output(cues, 'vtt');
		assert.true(vtt.startsWith('WEBVTT\nKind: captions'));
		assert.true(vtt.includes('00:00:02.000 --> 00:00:03.500\nTwo'));
	});

	test('stats count the cues up to the last end', function (assert) {
		assert.strictEqual(stats([]), '');
		assert.strictEqual(stats(cues), '2 cues · 00:00:03.500');
	});

	test('the download takes the source name and the format', function (assert) {
		assert.strictEqual(
			outputName('talk.final.mp4', 'vtt'),
			'talk.final.vtt',
		);
		assert.strictEqual(outputName('', 'srt'), 'subtitles.srt');
	});

	test('failures map to the web messages', function (assert) {
		assert.strictEqual(
			failure(new Error('webgpu-required')),
			'webgpu',
		);
		assert.strictEqual(
			failure(new DOMException('bad', 'EncodingError')),
			'decode',
		);
		assert.strictEqual(failure(new Error('boom')), 'generic');
		assert.strictEqual(failure(null), 'generic');
	});
});
