export type MorseKey = 'dit' | 'dah' | 'letter' | 'word' | 'back';

/** The keys the keypad takes from the keyboard while it has focus. */
export const keyOfEvent: Record<string, MorseKey> = {
	'.': 'dit',
	'-': 'dah',
	' ': 'letter',
	'/': 'word',
	Backspace: 'back',
};

/** The Morse text after one key press; a gap never doubles or leads. */
export function pressKey(morse: string, key: MorseKey): string {
	const bare = morse.replace(/[\s/]+$/, '');
	switch (key) {
		case 'dit':
			return `${morse}.`;
		case 'dah':
			return `${morse}-`;
		case 'letter':
			return /[^\s/]$/.test(morse) ? `${morse} ` : morse;
		case 'word':
			return bare ? `${bare} / ` : morse;
		case 'back':
			return /[\s/]$/.test(morse) ? bare : morse.slice(0, -1);
	}
}
