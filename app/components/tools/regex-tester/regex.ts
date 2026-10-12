/** UTF-16 offsets into the test string, end exclusive. */
export type Span = [start: number, end: number];

export interface RegexMatch {
	start: number;
	end: number;
	/** One per capture group; null for a group that took no part. */
	groups: (Span | null)[];
}

export type RegexOutcome =
	| { kind: 'empty' }
	| { kind: 'invalid'; message: string }
	| { kind: 'timedOut' }
	| {
			kind: 'matched';
			matches: RegexMatch[];
			truncated: boolean;
			groups: number;
	  };

// stringified into a worker; no module-scope refs allowed
export function runRegex(
	pattern: string,
	flags: string,
	text: string,
	limit = 1000,
): RegexOutcome {
	if (!pattern) return { kind: 'empty' };

	try {
		new RegExp(pattern, flags);
	} catch (error) {
		return {
			kind: 'invalid',
			message:
				error instanceof Error
					? error.message
					: 'Invalid regex',
		};
	}

	// d gives each group's indices
	const regex = new RegExp(pattern, flags + 'd');
	// an empty alternative always matches, so exec reports every group
	const groups =
		new RegExp('(?:' + pattern + ')|', flags.replace('g', '')).exec(
			'',
		)!.length - 1;
	const matches: RegexMatch[] = [];
	let truncated = false;
	const global = flags.includes('g');

	for (
		let match = regex.exec(text);
		match !== null;
		match = global ? regex.exec(text) : null
	) {
		if (matches.length >= limit) {
			truncated = true;
			break;
		}
		const indices = match.indices ?? [];
		const found: (Span | null)[] = [];
		for (let i = 1; i < indices.length; i++) {
			const range = indices[i];
			found.push(range ? [range[0], range[1]] : null);
		}
		matches.push({
			start: match.index,
			end: match.index + match[0].length,
			groups: found,
		});
		// zero-width match would loop forever; bump lastIndex
		if (match[0].length === 0) regex.lastIndex++;
	}

	return { kind: 'matched', matches, truncated, groups };
}

export function failed(outcome: RegexOutcome) {
	return outcome.kind === 'invalid' || outcome.kind === 'timedOut';
}

/** Group rails drawn under the text; later groups show in the list only. */
export const railLevels = 4;

export interface Rail {
	level: number;
	starts: boolean;
	ends: boolean;
}

/** A run of the test string, or a caret where a zero-width match or group sits. */
export interface Piece {
	text: string;
	/** Neighbouring matches alternate 1 and 2; 0 outside a match. */
	shade: 0 | 1 | 2;
	rails: Rail[];
	/** For a caret: 0 for a match, else the group level. */
	caret?: number;
}

/** The test string cut at every match and group edge, for the picture. */
export function pieces(text: string, matches: RegexMatch[]): Piece[] {
	const cuts = new Set([0, text.length]);
	const carets = new Map<number, number[]>();
	const caret = (at: number, level: number) => {
		const list = carets.get(at) ?? [];
		list.push(level);
		carets.set(at, list);
	};
	for (const m of matches) {
		cuts.add(m.start).add(m.end);
		if (m.start === m.end) caret(m.start, 0);
		m.groups.slice(0, railLevels).forEach((g, i) => {
			if (!g) return;
			cuts.add(g[0]).add(g[1]);
			if (g[0] === g[1]) caret(g[0], i + 1);
		});
	}
	const sorted = [...cuts].sort((a, b) => a - b);

	const out: Piece[] = [];
	let next = 0;
	for (let i = 0; i < sorted.length; i++) {
		const from = sorted[i]!;
		for (const level of carets.get(from) ?? [])
			out.push({
				text: '',
				shade: 0,
				rails: [],
				caret: level,
			});
		const to = sorted[i + 1];
		if (to === undefined) break;

		while (next < matches.length && matches[next]!.end <= from)
			next++;
		const m = matches[next];
		const inside =
			m !== undefined && m.start <= from && to <= m.end;
		const rails: Rail[] = [];
		if (inside)
			m.groups.slice(0, railLevels).forEach((g, gi) => {
				if (
					g &&
					g[0] < g[1] &&
					g[0] <= from &&
					to <= g[1]
				)
					rails.push({
						level: gi + 1,
						starts: g[0] === from,
						ends: g[1] === to,
					});
			});
		out.push({
			text: text.slice(from, to),
			shade: inside ? (next % 2 === 0 ? 1 : 2) : 0,
			rails,
		});
	}
	return out;
}

/** Matches listed under the picture; the picture marks all of them. */
export const listLimit = 100;

export interface MatchLine {
	label: string;
	/** Null shows a dash: a zero-width match, or a group that took no part. */
	value: string | null;
	/** 0 for the match itself, else the group colour, 1 to railLevels. */
	tint: number;
}

export function matchLines(text: string, matches: RegexMatch[]): MatchLine[] {
	const lines: MatchLine[] = [];
	matches.slice(0, listLimit).forEach((m, i) => {
		lines.push({
			label: String(i + 1),
			value:
				m.end > m.start
					? text.slice(m.start, m.end)
					: null,
			tint: 0,
		});
		m.groups.forEach((g, gi) =>
			lines.push({
				label: `$${gi + 1}`,
				value: g ? text.slice(g[0], g[1]) : null,
				tint: (gi % railLevels) + 1,
			}),
		);
	});
	return lines;
}

/** Matches · 3, Matches · 100 / 1,000+ */
export function matchesHeading(count: number, truncated: boolean): string {
	const total = count.toLocaleString('en') + (truncated ? '+' : '');
	const listed = Math.min(count, listLimit);
	return `Matches · ${listed < count ? `${listed.toLocaleString('en')} / ${total}` : total}`;
}
