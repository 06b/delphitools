import Component from '@glimmer/component';
import type { ComponentLike } from '@glint/template';
import CanonMenu, {
	type CanonMenuEntry,
	type CanonMenuItem,
} from 'delphicanon/components/canon-menu';
import type { Alternative } from 'delphitools-v2/lib/shavian/alternatives';
import {
	SHAVIAN_LETTERS,
	getShavianLetter,
	type ShavianLetter,
} from 'delphitools-v2/lib/shavian/phoneme-map';
import type { Phoneme } from 'delphitools-v2/lib/shavian/transliterate';

export interface LetterEdits {
	pick: (alternative: Alternative) => void;
	insert: (after: boolean, letter: ShavianLetter) => void;
	/** None for the sole letter of a word. */
	remove?: () => void;
}

interface LetterSignature {
	Args: {
		phoneme: Phoneme;
		edits: LetterEdits;
	};
}

type Entry = CanonMenuEntry & { run?: () => void };

// the system font has no Shavian; a menu icon is the letter in the Shavian face
const glyphs = new Map<string, ComponentLike>();
function glyphIcon(letter: string): ComponentLike {
	let icon = glyphs.get(letter);
	if (!icon) {
		icon = <template>
			<span class="sh-menu-glyph">{{letter}}</span>
		</template>;
		glyphs.set(letter, icon);
	}
	return icon;
}

const titled = (letter: { name: string; ipa: string }) =>
	`${letter.name} /${letter.ipa}/`;

function alphabet(pick: (letter: ShavianLetter) => void): Entry[] {
	const entries = (category: ShavianLetter['category']) =>
		SHAVIAN_LETTERS.filter((l) => l.category === category).map(
			(letter): Entry => ({
				title: titled(letter),
				icon: glyphIcon(letter.shavian),
				run: () => pick(letter),
			}),
		);
	return [
		...entries('consonant'),
		{ kind: 'separator' },
		...entries('vowel'),
	];
}

/**
 * iOS ShavianLetterCell: one letter of the picked word, its name and sound
 * under it; its menu inserts a letter before or after, removes it, or swaps
 * it for one of its alternatives.
 */
export default class Letter extends Component<LetterSignature> {
	get name() {
		return getShavianLetter(this.args.phoneme.shavian)?.name ?? '';
	}

	get label() {
		return titled({ name: this.name, ipa: this.args.phoneme.ipa });
	}

	get items(): Entry[] {
		const { phoneme, edits } = this.args;
		return [
			{
				title: 'Insert before',
				items: alphabet((l) => edits.insert(false, l)),
			},
			{
				title: 'Insert after',
				items: alphabet((l) => edits.insert(true, l)),
			},
			{
				title: 'Remove',
				destructive: true,
				disabled: !edits.remove,
				run: edits.remove,
			},
			{ kind: 'separator' },
			{
				title: this.label,
				kind: 'radio',
				checked: true,
				icon: glyphIcon(phoneme.shavian),
			},
			...phoneme.alternatives.map((alternative): Entry => ({
				title: titled(alternative),
				kind: 'radio',
				checked: false,
				icon: glyphIcon(alternative.shavian),
				run: () => edits.pick(alternative),
			})),
		];
	}

	select = (item: CanonMenuItem) => (item as Entry).run?.();

	<template>
		<CanonMenu
			class="sh-letter-menu"
			@items={{this.items}}
			@onSelect={{this.select}}
			as |menu|
		>
			<button
				type="button"
				class="sh-letter"
				aria-label={{this.label}}
				{{menu.trigger}}
			>
				<span
					class="sh-letter-glyph"
					aria-hidden="true"
				>{{@phoneme.shavian}}</span>
				<span
					class="sh-letter-name"
					aria-hidden="true"
				>{{this.name}}</span>
				<span
					class="sh-letter-ipa"
					aria-hidden="true"
				>/{{@phoneme.ipa}}/</span>
			</button>
		</CanonMenu>
	</template>
}
