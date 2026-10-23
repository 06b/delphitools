export type SyntaxKind =
	| 'meta'
	| 'value'
	| 'note'
	| 'step'
	| 'ingredient'
	| 'quantity'
	| 'detail'
	| 'name'
	| 'discard'
	| 'mark';

export interface Run {
	text: string;
	kind: SyntaxKind | null;
}

const META = /^(\s*)(title|serves|units)(\s*:)(.*)$/i;
const DISCARD = /^x(\s|$)/;
const PREP = ' / ';

/** `head` in `kind`, then each `| part` as detail, pipes as marks. */
function fielded(text: string, kind: SyntaxKind): Run[] {
	const [head = '', ...rest] = text.split('|');
	const runs: Run[] = [{ text: head, kind }];
	for (const part of rest)
		runs.push(
			{ text: '|', kind: 'mark' },
			{ text: part, kind: 'detail' },
		);
	return runs;
}

function ingredient(text: string): Run[] {
	const cut = text.indexOf(PREP);
	const own = cut < 0 ? text : text.slice(0, cut);
	const [head = '', ...rest] = own.split('|');
	const colon = head.indexOf(':');
	const runs: Run[] =
		colon < 0
			? [{ text: head, kind: 'ingredient' }]
			: [
					{
						text: head.slice(0, colon),
						kind: 'ingredient',
					},
					{ text: ':', kind: 'mark' },
					{
						text: head.slice(colon + 1),
						kind: 'quantity',
					},
				];
	for (const part of rest)
		runs.push(
			{ text: '|', kind: 'mark' },
			{ text: part, kind: 'detail' },
		);
	if (cut >= 0)
		runs.push(
			{ text: PREP, kind: 'mark' },
			...fielded(text.slice(cut + PREP.length), 'step'),
		);
	return runs;
}

function line(raw: string, started: boolean): [Run[], boolean] {
	const body = raw.trim();
	if (!body) return [[{ text: raw, kind: null }], started];
	const at = raw.indexOf(body[0]!);
	const lead: Run = { text: raw.slice(0, at), kind: null };
	const rest = raw.slice(at + 1);
	const sigil = (runs: Run[]): Run[] => [
		lead,
		{ text: raw[at]!, kind: 'mark' },
		...runs,
	];
	if (body.startsWith('>'))
		return [[lead, { text: raw.slice(at), kind: 'note' }], started];
	const meta = !started && raw.match(META);
	if (meta)
		return [
			[
				{ text: meta[1]!, kind: null },
				{ text: meta[2]! + meta[3]!, kind: 'meta' },
				{ text: meta[4]!, kind: 'value' },
			],
			started,
		];
	if (body.startsWith('-')) return [sigil(ingredient(rest)), started];
	if (body.startsWith('@'))
		return [sigil(fielded(rest, 'name')), started];
	if (DISCARD.test(body))
		return [sigil([{ text: rest, kind: 'discard' }]), started];
	if (body.startsWith('='))
		return [sigil([{ text: rest, kind: 'name' }]), started];
	return [[lead, ...fielded(raw.slice(at), 'step')], true];
}

/**
 * ClaraScript coloured by role, one run list a line, as `parse` reads it:
 * metadata only before the first step. The runs of a line join to the line.
 */
export function syntaxLines(text: string): Run[][] {
	let started = false;
	return text.split('\n').map((raw) => {
		const [runs, next] = line(raw, started);
		started = next;
		return runs.filter((run) => run.text);
	});
}
