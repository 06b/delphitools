const TYPED = new Set([
	'text',
	'search',
	'email',
	'url',
	'tel',
	'password',
	'number',
]);

/** shortcuts skip these */
export function isTextEntry(target: EventTarget | null): boolean {
	return (
		target instanceof HTMLElement &&
		(target.isContentEditable ||
			target instanceof HTMLTextAreaElement ||
			target instanceof HTMLSelectElement ||
			(target instanceof HTMLInputElement &&
				TYPED.has(target.type)))
	);
}
