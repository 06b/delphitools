import { module, test } from 'qunit';
import { setupRenderingTest } from 'delphitools-v2/tests/helpers';
import { render, settled } from '@ember/test-helpers';
import TimecodeField from 'delphitools-v2/components/tools/timecode-calc/field';

function type(input: HTMLInputElement, inputType: string, data?: string) {
	input.focus();
	const event = new InputEvent('beforeinput', {
		inputType,
		data: data ?? null,
		bubbles: true,
		cancelable: true,
	});
	input.dispatchEvent(event);
}

module('Integration | Tool | timecode-calc field', function (hooks) {
	setupRenderingTest(hooks);

	test('digits come in from the right, backspace takes the last', async function (assert) {
		const seen: string[] = [];
		const change = (text: string) => seen.push(text);
		await render(
			<template>
				<TimecodeField
					@dropFrame={{true}}
					@label="A"
					@onChange={{change}}
				/>
			</template>,
		);
		const input =
			document.querySelector<HTMLInputElement>('.tcc-field')!;
		assert.strictEqual(input.placeholder, '00:00:00;00');
		// focus selects on the next frame
		input.focus();
		await new Promise(requestAnimationFrame);
		for (const digit of ['1', '2', 'x', '3'])
			type(input, 'insertText', digit);
		await settled();
		assert.strictEqual(input.value, '00:00:01;23');
		type(input, 'deleteContentBackward');
		await settled();
		assert.strictEqual(input.value, '00:00:00;12');
		type(input, 'deleteContentBackward');
		type(input, 'deleteContentBackward');
		await settled();
		assert.strictEqual(
			input.value,
			'',
			'the last digit out empties the field',
		);
		assert.deepEqual(seen.at(-1), '');
	});

	test('a paste takes the digits, a full selection is replaced', async function (assert) {
		const change = () => {};
		await render(
			<template>
				<TimecodeField
					@value="00:10:00:02"
					@dropFrame={{false}}
					@label="A"
					@onChange={{change}}
				/>
			</template>,
		);
		const input =
			document.querySelector<HTMLInputElement>('.tcc-field')!;
		assert.strictEqual(input.value, '00:10:00:02');
		input.select();
		type(input, 'insertFromPaste', '1:00:00;00');
		await settled();
		assert.strictEqual(input.value, '01:00:00:00');
	});
});
