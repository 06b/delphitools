import { module, test } from 'qunit';
import { setupRenderingTest } from 'delphitools-v2/tests/helpers';
import { blur, click, fillIn, render } from '@ember/test-helpers';
import CueRow, { retimed } from 'delphitools-v2/components/tools/media/cue-row';
import type { Cue } from 'delphitools-v2/lib/subtitles';

const cue: Cue = { start: 1000, end: 2500, text: 'Two\nlines' };

module('Integration | Tool | media cue row', function (hooks) {
	setupRenderingTest(hooks);

	test('a typed time parses or is refused', function (assert) {
		assert.deepEqual(retimed(cue, 'start', '00:00:02.000'), {
			...cue,
			start: 2000,
		});
		assert.deepEqual(retimed(cue, 'end', '01:02.5'), {
			...cue,
			end: 62500,
		});
		assert.strictEqual(retimed(cue, 'start', 'soon'), null);
	});

	test('display: number, times and text', async function (assert) {
		await render(
			<template>
				<CueRow
					@index={{2}}
					@cue={{cue}}
					@marked={{true}}
				/>
			</template>,
		);
		assert.dom('.cue-row-index').hasText('3');
		assert.dom('.cue-row-time')
			.exists({ count: 2 })
			.hasText('00:00:01.000');
		assert.dom('.cue-row-time--end').hasText('00:00:02.500');
		assert.dom('.cue-row-text').hasText('Two lines');
		assert.dom('.cue-row').hasClass('cue-row--marked');
		assert.dom('input, textarea, button').doesNotExist();
	});

	test('display with onSelect is a button', async function (assert) {
		let selected = 0;
		const select = () => selected++;
		await render(
			<template>
				<CueRow
					@index={{0}}
					@cue={{cue}}
					@onSelect={{select}}
				/>
			</template>,
		);
		await click('button.cue-row');
		assert.strictEqual(selected, 1);
	});

	test('editable: text on every edit, a time on blur when it parses', async function (assert) {
		const seen: Cue[] = [];
		const change = (next: Cue) => seen.push(next);
		await render(
			<template>
				<CueRow
					@index={{0}}
					@cue={{cue}}
					@editable={{true}}
					@onChange={{change}}
				/>
			</template>,
		);
		assert.dom('[aria-label="Start"]').hasValue('00:00:01.000');
		assert.dom('[aria-label="Text"]').hasValue('Two\nlines');

		await fillIn('[aria-label="Text"]', 'One');
		assert.deepEqual(seen.at(-1), { ...cue, text: 'One' });

		await fillIn('[aria-label="End"]', '00:00:03.25');
		await blur('[aria-label="End"]');
		assert.deepEqual(seen.at(-1), { ...cue, end: 3250 });
		assert.dom('[aria-label="End"]').hasValue('00:00:03.250');

		await fillIn('[aria-label="Start"]', 'nonsense');
		await blur('[aria-label="Start"]');
		assert.strictEqual(
			seen.length,
			2,
			'a refused time sends nothing',
		);
		assert.dom('[aria-label="Start"]').hasValue('00:00:01.000');
	});
});
