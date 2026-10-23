import { module, test } from 'qunit';
import Drop from 'delphitools-v2/components/tools/media/drop';
import { spread } from 'delphitools-v2/components/tools/media/frames';
import {
	blocks,
	cueAt,
} from 'delphitools-v2/components/tools/media/cue-timeline';

module('Unit | Tool | media', function () {
	test('spread picks evenly spaced thumbnails (iOS selfCheck)', function (assert) {
		assert.deepEqual(spread(3, 24), [4, 12, 20]);
		assert.deepEqual(
			spread(24, 24),
			Array.from({ length: 24 }, (_, i) => i),
		);
		assert.deepEqual(spread(5, 0), []);
		assert.strictEqual(spread(30, 24).length, 30);
		assert.strictEqual(spread(30, 24).at(-1), 23);
	});

	test('cue timeline blocks are shares of the span', function (assert) {
		const [style] = blocks(
			[{ start: 250, end: 750, text: '' }],
			1000,
		);
		assert.strictEqual(
			style?.toString(),
			'inset-inline-start: 25%; inline-size: 50%',
		);
	});

	test('cueAt finds the playing cue, end exclusive', function (assert) {
		const cues = [
			{ start: 0, end: 1000, text: 'a' },
			{ start: 1500, end: 2000, text: 'b' },
		];
		assert.strictEqual(cueAt(cues, 999), 0);
		assert.strictEqual(cueAt(cues, 1000), -1);
		assert.strictEqual(cueAt(cues, 1500), 1);
		assert.strictEqual(cueAt([], 0), -1);
	});

	test('Drop loads the first accepted file, or every one with multiple', function (assert) {
		const dropOf = (taken = false) => {
			const data = new DataTransfer();
			data.items.add(
				new File(['x'], 'a.txt', {
					type: 'text/plain',
				}),
			);
			data.items.add(
				new File(['x'], 'b.png', { type: 'image/png' }),
			);
			data.items.add(
				new File(['x'], 'c.png', { type: 'image/png' }),
			);
			const event = new DragEvent('drop', {
				dataTransfer: data,
				cancelable: true,
			});
			if (taken) event.preventDefault();
			return event;
		};
		const one: string[] = [];
		const single = new Drop('image/*', (file) =>
			one.push(file.name),
		);
		single.over = true;
		const event = dropOf();
		single.drop(event);
		assert.deepEqual(one, ['b.png']);
		assert.true(event.defaultPrevented);
		assert.false(single.over);
		single.drop(dropOf(true));
		assert.deepEqual(
			one,
			['b.png', 'b.png'],
			'single ignores a taken drop flag',
		);

		const many: string[][] = [];
		const multiple = new Drop(
			'image/*',
			(files) => many.push(files.map((f) => f.name)),
			true,
		);
		multiple.drop(dropOf());
		multiple.drop(dropOf(true));
		assert.deepEqual(
			many,
			[['b.png', 'c.png']],
			'multiple skips a taken drop',
		);
	});
});
