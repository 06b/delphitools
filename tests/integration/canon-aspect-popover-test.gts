import { module, test } from 'qunit';
import { setupRenderingTest } from 'delphitools-v2/tests/helpers';
import { click, render, triggerKeyEvent, waitUntil } from '@ember/test-helpers';
import { tracked } from '@glimmer/tracking';
import CanonAspectPopover, {
	fitRatio,
	ratioText,
	sameRatio,
	shapeOf,
} from 'delphicanon/components/canon-aspect-popover';

class Model {
	@tracked width = 16;
	@tracked height = 9;
	changes: [number, number][] = [];
	onChange = (width: number, height: number) => {
		this.changes.push([width, height]);
		this.width = width;
		this.height = height;
	};
}

const presets = [
	{ width: 1, height: 1 },
	{ width: 4, height: 3 },
	{ width: 16, height: 9, label: 'Wide' },
];

module('Integration | canon-aspect-popover', function (hooks) {
	setupRenderingTest(hooks);

	test('ratio maths', function (assert) {
		assert.strictEqual(ratioText(1920, 1080), '16:9');
		assert.strictEqual(ratioText(7, 5), '7:5');
		assert.strictEqual(ratioText(1.5, 1), '1.5:1');
		assert.true(
			sameRatio(
				{ width: 2, height: 1 },
				{ width: 4, height: 2 },
			),
		);
		assert.false(
			sameRatio(
				{ width: 2, height: 1 },
				{ width: 1, height: 2 },
			),
		);
		assert.deepEqual(fitRatio(16, 9, 96), {
			width: 96,
			height: 54,
		});
		assert.deepEqual(fitRatio(1, 2, 96), { width: 48, height: 96 });
		assert.deepEqual(fitRatio(0, 3, 96), { width: 32, height: 96 });
		assert.strictEqual(shapeOf(3, 3), 'Square');
		assert.strictEqual(shapeOf(4, 3), 'Landscape');
		assert.strictEqual(shapeOf(3, 4), 'Portrait');
	});

	test('opens, steps, swaps, takes a preset, gives focus back', async function (assert) {
		const model = new Model();
		await render(
			<template>
				<CanonAspectPopover
					@width={{model.width}}
					@height={{model.height}}
					@presets={{presets}}
					@label="Ratio"
					@onChange={{model.onChange}}
				/>
			</template>,
		);
		const trigger = document.querySelector<HTMLButtonElement>(
			'.canon-aspect-popover-trigger',
		)!;
		const panel = document.querySelector<HTMLElement>(
			'.canon-aspect-popover',
		)!;
		assert.dom(trigger).hasText('16:9');
		assert.dom(trigger).hasAttribute('aria-expanded', 'false');

		await click(trigger);
		assert.true(
			panel.matches(':popover-open'),
			'the cell opens it',
		);
		assert.dom(trigger).hasAttribute('aria-expanded', 'true');
		const width = panel.querySelector<HTMLInputElement>(
			'.canon-aspect-popover-width input',
		)!;
		assert.strictEqual(
			document.activeElement,
			width,
			'width has focus',
		);

		const shape = panel.querySelector<HTMLElement>(
			'.canon-aspect-popover-shape',
		)!;
		assert.strictEqual(shape.style.inlineSize, '96px');
		assert.strictEqual(shape.style.blockSize, '54px');

		await triggerKeyEvent(width, 'keydown', 'ArrowUp');
		assert.deepEqual(
			model.changes.at(-1),
			[17, 9],
			'arrow up steps',
		);
		assert.dom(trigger).hasText('17:9');

		await click('.canon-aspect-popover-swap');
		assert.deepEqual(model.changes.at(-1), [9, 17], 'swap');
		assert.dom(panel.querySelector('.canon-row-detail')).hasText(
			'Portrait',
		);
		assert.strictEqual(shape.style.blockSize, '96px');

		await click(
			panel.querySelectorAll<HTMLElement>(
				'.canon-aspect-popover-presets button',
			)[2]!,
		);
		assert.deepEqual(model.changes.at(-1), [16, 9], 'preset');
		assert.dom(
			'.canon-aspect-popover-presets [aria-checked="true"]',
		).hasText('Wide');

		width.focus();
		panel.hidePopover();
		await waitUntil(() => document.activeElement === trigger);
		assert.strictEqual(
			document.activeElement,
			trigger,
			'focus goes back to the cell',
		);
	});
});
