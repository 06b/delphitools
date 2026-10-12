import { module, test } from 'qunit';
import {
	byteSize,
	wireLines,
} from 'delphitools-v2/components/tools/request-builder/wire';

module('Unit | Tool | request-builder', function () {
	test('wireLines: CRLF head, blank line, body as typed', function (assert) {
		const { lines, bytes } = wireLines(
			'POST /a HTTP/1.1\nHost: x.test\nContent-Length: 7\n\n{"x":1}',
		);
		assert.deepEqual(
			lines.map((line) => line.part),
			['start', 'headers', 'headers', 'headers', 'body'],
		);
		assert.deepEqual(bytes, {
			start: 18,
			headers: 14 + 19 + 2,
			body: 7,
		});
		assert.strictEqual(lines[1]!.offset, 18);
		assert.strictEqual(lines[3]!.text, '');
		assert.strictEqual(lines[4]!.offset, 18 + 35);
	});

	test('wireLines: a bare request and a body of several lines', function (assert) {
		const bare = wireLines('GET / HTTP/1.1\n');
		assert.strictEqual(bare.lines.length, 2);
		assert.deepEqual(bare.bytes, {
			start: 16,
			headers: 2,
			body: 0,
		});
		const multi = wireLines('PUT / HTTP/1.1\n\na\nb');
		assert.deepEqual(
			multi.lines.slice(-2).map((line) => line.ending),
			['\n', ''],
		);
		assert.strictEqual(multi.bytes.body, 3);
	});

	test('wireLines counts UTF-8 bytes', function (assert) {
		assert.strictEqual(
			wireLines('GET / HTTP/1.1\n\né').bytes.body,
			2,
		);
	});

	test('byteSize: bytes, then KB and MB in thousands', function (assert) {
		assert.deepEqual(byteSize(184), ['184', 'bytes']);
		assert.deepEqual(byteSize(1499), ['1', 'KB']);
		assert.deepEqual(byteSize(2_500_000), ['2.5', 'MB']);
	});
});
