/** Text and background for the display, with the colours that set digits and symbols apart (LargeTypeTheme). */
export interface Theme {
	name: string;
	text: string;
	background: string;
	digit: string;
	special: string;
}

const rgb = (red: number, green: number, blue: number) =>
	`rgb(${Math.round(red * 255)} ${Math.round(green * 255)} ${Math.round(blue * 255)})`;

/**
 * The app's own colours first, then fixed pairs that read the same in light
 * and dark: black on white, white on black, a yellow LED sign and a green
 * terminal. The default's digit and symbol colours change with the mode.
 */
export const themes: Theme[] = [
	{
		name: 'Default',
		text: 'var(--canon-foreground)',
		background: 'var(--canon-background)',
		digit: 'var(--lt-digit)',
		special: 'var(--lt-special)',
	},
	{
		name: 'Paper',
		text: rgb(0.07, 0.07, 0.07),
		background: 'white',
		digit: rgb(0.01, 0.45, 0.72),
		special: rgb(0.8, 0.36, 0),
	},
	{
		name: 'Night',
		text: rgb(0.96, 0.96, 0.96),
		background: 'black',
		digit: rgb(0.22, 0.74, 0.97),
		special: rgb(0.98, 0.75, 0.14),
	},
	{
		name: 'Sign',
		text: rgb(1, 0.82, 0.04),
		background: 'black',
		digit: 'white',
		special: rgb(1, 0.42, 0.1),
	},
	{
		name: 'Terminal',
		text: rgb(0.24, 1, 0.42),
		background: rgb(0.02, 0.06, 0.03),
		digit: rgb(0.45, 0.9, 1),
		special: rgb(1, 0.78, 0.25),
	},
];

/** The theme as custom properties for a style attribute. */
export function themeStyle(theme: Theme): string {
	return `--lt-text: ${theme.text}; --lt-background: ${theme.background}; --lt-digit-colour: ${theme.digit}; --lt-special-colour: ${theme.special}`;
}
