import {
	FIELD_RULES,
	parseCron,
	parseField,
	type CronParse,
	type FieldKind,
	type FieldParse,
} from 'delphitools-v2/lib/cron';

export type Mode = 'every' | 'value' | 'range' | 'step';
export type SubKey = 'value' | 'lo' | 'hi' | 'step';
export type Subs = Record<SubKey, number>;

export const modes: Mode[] = ['every', 'value', 'range', 'step'];
export const modeTitles = ['Every', 'Value', 'Range', 'Step'];
/** iOS CronRails.names: the rails and field rows. */
export const fieldNames = ['Minute', 'Hour', 'Day', 'Month', 'Weekday'];

export interface CronState {
	/** The expression as typed; kept when it does not have five fields. */
	box: string;
	fields: Record<FieldKind, string>;
	subs: Record<FieldKind, Subs>;
}

export const ruleOf = (kind: FieldKind) =>
	FIELD_RULES.find((r) => r.kind === kind)!;

export function initialState(): CronState {
	return {
		box: '30 9 * * MON-FRI',
		fields: {
			minute: '30',
			hour: '9',
			dom: '*',
			month: '*',
			dow: 'MON-FRI',
		},
		subs: {
			minute: { value: 30, lo: 0, hi: 15, step: 5 },
			hour: { value: 9, lo: 9, hi: 17, step: 2 },
			dom: { value: 1, lo: 1, hi: 15, step: 2 },
			month: { value: 1, lo: 1, hi: 6, step: 2 },
			dow: { value: 1, lo: 1, hi: 5, step: 2 },
		},
	};
}

export function modeOf(parse: FieldParse): Mode | undefined {
	if (!parse.ok) return undefined;
	switch (parse.shape.kind) {
		case 'star':
			return 'every';
		case 'single':
			return 'value';
		case 'step':
			return 'step';
		case 'range':
			return parse.shape.step === 1 ? 'range' : undefined;
		default:
			return undefined;
	}
}

export const parseOf = (state: CronState, kind: FieldKind) =>
	parseField(state.fields[kind], ruleOf(kind));

export const parsedOf = (state: CronState): CronParse => parseCron(state.box);

function synced(fields: CronState['fields'], subs: CronState['subs']) {
	const next = { ...subs };
	for (const rule of FIELD_RULES) {
		const parse = parseField(fields[rule.kind], rule);
		if (!parse.ok) continue;
		const s = { ...next[rule.kind] };
		const { shape } = parse;
		if (shape.kind === 'single') s.value = shape.value;
		else if (shape.kind === 'range') {
			s.lo = shape.lo;
			s.hi = shape.hi;
			s.step = shape.step;
		} else if (shape.kind === 'step') s.step = shape.step;
		else continue;
		next[rule.kind] = s;
	}
	return next;
}

/** The expression typed; five fields also land in the field rows. */
export function withBox(state: CronState, box: string): CronState {
	const parts = box.trim().split(/\s+/).filter(Boolean);
	if (parts.length !== 5) return { ...state, box };
	const fields = Object.fromEntries(
		FIELD_RULES.map((rule, i) => [rule.kind, parts[i]!]),
	) as CronState['fields'];
	return { box, fields, subs: synced(fields, state.subs) };
}

export function withField(
	state: CronState,
	kind: FieldKind,
	source: string,
): CronState {
	const fields = { ...state.fields, [kind]: source };
	return {
		box: FIELD_RULES.map((rule) => fields[rule.kind]).join(' '),
		fields,
		subs: synced(fields, state.subs),
	};
}

export function withMode(
	state: CronState,
	kind: FieldKind,
	mode: Mode,
): CronState {
	const s = state.subs[kind];
	const source = {
		every: '*',
		value: String(s.value),
		range: `${s.lo}-${s.hi}`,
		step: `*/${Math.max(s.step, 2)}`,
	}[mode];
	return withField(state, kind, source);
}

// a step starts at 2, as a step of 1 reads as every; a weekday value is 0 to 6
export function boundsOf(kind: FieldKind, key: SubKey): [number, number] {
	const rule = ruleOf(kind);
	if (key === 'step') return [2, rule.rangeMax - rule.min + 1];
	return [rule.min, key === 'value' ? rule.rangeMax : rule.max];
}

export function withSub(
	state: CronState,
	kind: FieldKind,
	key: SubKey,
	raw: number,
): CronState {
	const [low, high] = boundsOf(kind, key);
	const s = {
		...state.subs[kind],
		[key]: Math.min(Math.max(raw, low), high),
	};
	if (key === 'lo' && s.lo > s.hi) s.hi = s.lo;
	if (key === 'hi' && s.hi < s.lo) s.lo = s.hi;
	const next = { ...state, subs: { ...state.subs, [kind]: s } };
	switch (modeOf(parseOf(state, kind))) {
		case 'value':
			return withField(next, kind, String(s.value));
		case 'range':
			return withField(next, kind, `${s.lo}-${s.hi}`);
		case 'step':
			return withField(next, kind, `*/${s.step}`);
		default:
			return next;
	}
}

/** Month and weekday values by name in the reader's language; nothing for the numeric fields. */
export function nameOf(value: number, kind: FieldKind): string | undefined {
	if (kind === 'month' && value >= 1 && value <= 12)
		return new Intl.DateTimeFormat(undefined, {
			month: 'long',
			timeZone: 'UTC',
		}).format(Date.UTC(2001, value - 1, 1));
	if (kind === 'dow')
		// 7 January 2001 was a Sunday
		return new Intl.DateTimeFormat(undefined, {
			weekday: 'long',
			timeZone: 'UTC',
		}).format(Date.UTC(2001, 0, 7 + (value % 7)));
	return undefined;
}

/** iOS CronFieldEditor.summary: the field in a few words. */
export function summaryOf(parse: FieldParse, kind: FieldKind): string {
	if (!parse.ok) return '—';
	const name = (v: number) => nameOf(v, kind);
	const { shape } = parse;
	switch (shape.kind) {
		case 'star':
			return 'Every';
		case 'single':
			return name(shape.value) ?? 'Value';
		case 'step':
			return 'Step';
		case 'range':
			if (shape.step === 1) {
				const first = name(shape.lo);
				const last = name(shape.hi);
				return first && last
					? `${first}–${last}`
					: 'Range';
			}
	}
	const names = parse.values.flatMap((v) => name(v) ?? []);
	return names.length === 0 || names.length > 3
		? 'List'
		: names.join(', ');
}

/** iOS CronRails.cells: every value a rail draws, weekdays from the locale's first day. */
export function cellsOf(kind: FieldKind, firstDay = 0): number[] {
	const rule = ruleOf(kind);
	if (kind !== 'dow')
		return Array.from(
			{ length: rule.rangeMax - rule.min + 1 },
			(_, i) => rule.min + i,
		);
	return Array.from({ length: 7 }, (_, i) => (i + firstDay) % 7);
}

/** The locale's first weekday, 0 for Sunday. */
export function firstWeekday(): number {
	try {
		const locale = new Intl.Locale(
			navigator.language,
		) as Intl.Locale & {
			getWeekInfo?: () => { firstDay: number };
			weekInfo?: { firstDay: number };
		};
		const first = (locale.getWeekInfo?.() ?? locale.weekInfo)
			?.firstDay;
		return first === undefined ? 0 : first % 7;
	} catch {
		return 0;
	}
}

const spanUnits = [
	['day', 86_400],
	['hour', 3_600],
	['minute', 60],
	['second', 1],
] as const;

/**
 * Time left in its largest whole unit, rounded down, as the number and the
 * narrow unit: a run two and a half days away reads 2 d.
 */
export function spanOf(seconds: number): [string, string] {
	const [unit, size] =
		spanUnits.find(([, s]) => seconds >= s) ?? spanUnits[3];
	const count = Math.floor(seconds / size);
	const parts = new Intl.NumberFormat(undefined, {
		style: 'unit',
		unit,
		unitDisplay: 'narrow',
	}).formatToParts(count);
	const number = parts
		.filter((p) => p.type === 'integer' || p.type === 'group')
		.map((p) => p.value)
		.join('');
	const label = parts
		.filter((p) => p.type === 'unit')
		.map((p) => p.value)
		.join('');
	return [number, label];
}

/** The values of a run in rail order: minute, hour, day, month, weekday. */
export const valuesAt = (date: Date) => [
	date.getMinutes(),
	date.getHours(),
	date.getDate(),
	date.getMonth() + 1,
	date.getDay(),
];

export const issueText = (issue: { text: string; data?: string }) =>
	issue.data ? `${issue.text}: ${issue.data}` : issue.text;
