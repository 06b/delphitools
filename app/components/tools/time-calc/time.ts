/** Reading, writing and naming times for the time calculator (iOS TimeCalcViewModel, TimeCalcZones, TimeCalcAxis, TimeCalcWorld). */

export type Format = 'unix' | 'unixMs' | 'iso' | 'rfc822' | 'human';

export const formatNames: Record<Format, string> = {
	unix: 'Unix (seconds)',
	unixMs: 'Unix (milliseconds)',
	iso: 'ISO 8601',
	rfc822: 'RFC 822',
	human: 'Date & Time',
};

export interface Reading {
	date: Date;
	format: Format;
	/** Typed with no zone: a wall-clock time, read in the zone given. */
	floating: boolean;
}

export const localZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

const second = 1000;
const minute = 60 * second;
const hour = 60 * minute;
const day = 24 * hour;

const numeric = /^[-+]?\d+(\.\d+)?$/;
const wallClock =
	/^([-+]?\d{4,6})-(\d{2})-(\d{2})(?:([ T])(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?)?$/;
const rfcShape = /^[A-Za-z]{3}, /;
const isoShape = /^[-+]?\d{4,6}-\d{2}-\d{2}T/;

/** Milliseconds since 1970 for a UTC wall time, years below 100 included. */
function utc(
	year: number,
	month: number,
	date: number,
	hours = 0,
	minutes = 0,
	seconds = 0,
	ms = 0,
) {
	const at = new Date(
		Date.UTC(2000, month, date, hours, minutes, seconds, ms),
	);
	at.setUTCFullYear(year);
	return at.getTime();
}

const partFormatters = new Map<string, Intl.DateTimeFormat>();

function partsIn(date: Date, zone: string) {
	let formatter = partFormatters.get(zone);
	if (!formatter) {
		formatter = new Intl.DateTimeFormat('en-US', {
			timeZone: zone,
			era: 'short',
			year: 'numeric',
			month: 'numeric',
			day: 'numeric',
			hour: 'numeric',
			minute: 'numeric',
			second: 'numeric',
			hourCycle: 'h23',
		});
		partFormatters.set(zone, formatter);
	}
	const parts: Record<string, string> = {};
	for (const part of formatter.formatToParts(date))
		parts[part.type] = part.value;
	const year = Number(parts['year']);
	return {
		year: parts['era'] === 'BC' ? 1 - year : year,
		month: Number(parts['month']) - 1,
		day: Number(parts['day']),
		hour: Number(parts['hour']),
		minute: Number(parts['minute']),
		second: Number(parts['second']),
	};
}

/** Seconds east of UTC in `zone` at `date`. */
export function offsetSeconds(date: Date, zone: string): number {
	if (Number.isNaN(date.getTime())) return 0;
	const p = partsIn(date, zone);
	const wall = utc(p.year, p.month, p.day, p.hour, p.minute, p.second);
	return Math.round(
		(wall - Math.floor(date.getTime() / 1000) * 1000) / 1000,
	);
}

/** The instant a wall-clock time names in `zone`; a time a DST gap skips moves forward. */
export function wallInZone(
	zone: string,
	...parts: Parameters<typeof utc>
): Date {
	const guess = utc(...parts);
	const first = offsetSeconds(new Date(guess), zone);
	const second = offsetSeconds(new Date(guess - first * 1000), zone);
	return new Date(guess - second * 1000);
}

function valid(reading: Reading): Reading | null {
	return Number.isNaN(reading.date.getTime()) ? null : reading;
}

/**
 * A typed timestamp or date. Numbers are Unix seconds, or milliseconds from
 * twelve digits up; a date with no zone is a wall-clock time in `zone`.
 */
export function read(text: string, zone = localZone): Reading | null {
	const typed = text.trim().replace(/−/g, '-');
	if (!typed) return null;
	const number = typed.replace(',', '.');
	if (numeric.test(number)) {
		const value = Number(number);
		// ponytail: 12+ digits read as ms, so ms before 1973-03 read as seconds
		const ms = Math.abs(value) >= 1e11;
		return valid({
			date: new Date(ms ? value : value * second),
			format: ms ? 'unixMs' : 'unix',
			floating: false,
		});
	}
	const wall = wallClock.exec(typed);
	if (wall) {
		const [, y, mo, d, sep, h, mi, s, frac] = wall;
		const month = Number(mo) - 1;
		const date = Number(d);
		const days = new Date(
			Date.UTC(Number(y), month + 1, 0),
		).getUTCDate();
		if (month > 11 || date < 1 || date > days) return null;
		return valid({
			date: wallInZone(
				zone,
				Number(y),
				month,
				date,
				Number(h ?? 0),
				Number(mi ?? 0),
				Number(s ?? 0),
				Number((frac ?? '0').padEnd(3, '0')),
			),
			format: sep === 'T' ? 'iso' : 'human',
			floating: true,
		});
	}
	// browsers accept non-ecma-262 rfc 822
	return valid({
		date: new Date(typed),
		format: rfcShape.test(typed)
			? 'rfc822'
			: isoShape.test(typed)
				? 'iso'
				: 'human',
		floating: false,
	});
}

const pad = (value: number, size = 2) =>
	String(Math.abs(value)).padStart(size, '0');

/** "2024-01-01 09:30:00" as the wall clock shows it in `zone`. */
export function wallText(date: Date, zone = localZone): string {
	const p = partsIn(date, zone);
	const year = p.year < 0 ? `-${pad(p.year, 4)}` : pad(p.year, 4);
	return `${year}-${pad(p.month + 1)}-${pad(p.day)} ${pad(p.hour)}:${pad(p.minute)}:${pad(p.second)}`;
}

/** `date` written the way `reading` was typed, for the step buttons. */
export function rewrite(date: Date, reading: Reading, zone = localZone) {
	if (reading.format === 'unix')
		return String(Math.floor(date.getTime() / second));
	if (reading.format === 'unixMs') return String(date.getTime());
	if (reading.floating) return wallText(date, zone);
	return reading.format === 'rfc822'
		? date.toUTCString()
		: date.toISOString();
}

export function formats(date: Date): Record<Format, string> {
	return {
		unix: String(Math.floor(date.getTime() / second)),
		unixMs: String(date.getTime()),
		iso: date.toISOString(),
		// ecma-262 fixes rfc 822 shape
		rfc822: date.toUTCString(),
		human: wallText(date),
	};
}

const formatters = new Map<string, Intl.DateTimeFormat>();

/** A cached formatter in the user's locale. */
export function formatter(
	options: Intl.DateTimeFormatOptions,
	zone = localZone,
): Intl.DateTimeFormat {
	const key = JSON.stringify(options) + zone;
	let made = formatters.get(key);
	if (!made) {
		made = new Intl.DateTimeFormat(undefined, {
			...options,
			timeZone: zone,
		});
		formatters.set(key, made);
	}
	return made;
}

/** iOS DateFormatter dateStyle .full, timeStyle .long. */
export function full(date: Date, zone = localZone) {
	return formatter({ dateStyle: 'full', timeStyle: 'long' }, zone).format(
		date,
	);
}

/** iOS dateStyle .medium, timeStyle .short. */
export function medium(date: Date, zone = localZone) {
	return formatter(
		{ dateStyle: 'medium', timeStyle: 'short' },
		zone,
	).format(date);
}

/** "datetime-local" input value for `date` in `zone`. */
export function pickerValue(date: Date, zone = localZone) {
	return wallText(date, zone).replace(' ', 'T');
}

export function relativeTime(date: Date, now: Date): string {
	const difference = date.getTime() - now.getTime();
	const distance = Math.abs(difference);

	const minutes = Math.floor(distance / minute);
	const hours = Math.floor(distance / hour);
	const days = Math.floor(distance / day);
	const weeks = Math.floor(days / 7);
	const months = Math.floor(days / 30);
	const years = Math.floor(days / 365);

	let value: string;
	if (years > 0) value = `${years} year${years > 1 ? 's' : ''}`;
	else if (months > 0) value = `${months} month${months > 1 ? 's' : ''}`;
	else if (weeks > 0) value = `${weeks} week${weeks > 1 ? 's' : ''}`;
	else if (days > 0) value = `${days} day${days > 1 ? 's' : ''}`;
	else if (hours > 0) value = `${hours} hour${hours > 1 ? 's' : ''}`;
	else if (minutes > 0)
		value = `${minutes} minute${minutes > 1 ? 's' : ''}`;
	else return 'just now';

	return difference < 0 ? `${value} ago` : `in ${value}`;
}

// arithmetic

export type Unit = 'minutes' | 'hours' | 'days' | 'weeks' | 'months' | 'years';

export const units: { value: Unit; label: string }[] = [
	{ value: 'minutes', label: 'Minutes' },
	{ value: 'hours', label: 'Hours' },
	{ value: 'days', label: 'Days' },
	{ value: 'weeks', label: 'Weeks' },
	{ value: 'months', label: 'Months' },
	{ value: 'years', label: 'Years' },
];

/** The iOS quick offsets: −1 day … +1 year. */
export const offsets: { title: string; unit: Unit; amount: number }[] = [
	{ title: '−1 day', unit: 'days', amount: -1 },
	{ title: '−1 week', unit: 'weeks', amount: -1 },
	{ title: '−1 month', unit: 'months', amount: -1 },
	{ title: '−1 year', unit: 'years', amount: -1 },
	{ title: '+1 day', unit: 'days', amount: 1 },
	{ title: '+1 week', unit: 'weeks', amount: 1 },
	{ title: '+1 month', unit: 'months', amount: 1 },
	{ title: '+1 year', unit: 'years', amount: 1 },
];

/**
 * `date` moved by `amount` units on the local calendar: minutes and hours
 * as elapsed time, days and up on the wall clock, a month end clamped
 * (31 Jan + 1 month is 28 or 29 Feb).
 */
export function shift(date: Date, amount: number, unit: Unit): Date {
	if (unit === 'minutes')
		return new Date(date.getTime() + amount * minute);
	if (unit === 'hours') return new Date(date.getTime() + amount * hour);
	const moved = new Date(date.getTime());
	if (unit === 'days' || unit === 'weeks') {
		moved.setDate(
			moved.getDate() + amount * (unit === 'weeks' ? 7 : 1),
		);
		return moved;
	}
	const months = amount * (unit === 'years' ? 12 : 1);
	const target = date.getMonth() + months;
	moved.setDate(1);
	moved.setMonth(target);
	const last = new Date(
		moved.getFullYear(),
		moved.getMonth() + 1,
		0,
	).getDate();
	moved.setDate(Math.min(date.getDate(), last));
	return moved;
}

/** Whole days, hours, minutes and seconds between two times. */
export function difference(a: Date, b: Date) {
	const total = Math.floor(Math.abs(b.getTime() - a.getTime()) / second);
	return {
		days: Math.floor(total / 86_400),
		hours: Math.floor((total % 86_400) / 3600),
		minutes: Math.floor((total % 3600) / 60),
		seconds: total % 60,
	};
}

/** iOS DateComponentsFormatter, abbreviated, zeros dropped: "7d 3h". */
export function breakdown(parts: ReturnType<typeof difference>) {
	const text = (
		[
			[parts.days, 'd'],
			[parts.hours, 'h'],
			[parts.minutes, 'm'],
			[parts.seconds, 's'],
		] as const
	)
		.filter(([value]) => value > 0)
		.map(([value, unit]) => `${value.toLocaleString()}${unit}`)
		.join(' ');
	return text || '0s';
}

/** The largest whole unit in a span, as figure and unit: "3", "d". */
export function span(seconds: number): [string, string] {
	const ladder = [
		[31_556_952, 'y'],
		[86_400, 'd'],
		[3600, 'h'],
		[60, 'm'],
	] as const;
	for (const [size, unit] of ladder)
		if (seconds >= size)
			return [
				Math.floor(seconds / size).toLocaleString(),
				unit,
			];
	return [String(Math.floor(seconds)), 's'];
}

// zones

/** The iOS list, with UTC first. */
export const commonZones = [
	'UTC',
	'Pacific/Honolulu',
	'America/Anchorage',
	'America/Los_Angeles',
	'America/Denver',
	'America/Chicago',
	'America/New_York',
	'America/Sao_Paulo',
	'Atlantic/Reykjavik',
	'Europe/London',
	'Europe/Paris',
	'Europe/Berlin',
	'Europe/Moscow',
	'Africa/Cairo',
	'Asia/Dubai',
	'Asia/Kolkata',
	'Asia/Shanghai',
	'Asia/Tokyo',
	'Australia/Sydney',
	'Pacific/Auckland',
];

export function knownZone(zone: string) {
	try {
		new Intl.DateTimeFormat('en', { timeZone: zone });
		return true;
	} catch {
		return false;
	}
}

/** Every zone the browser knows, sorted; empty where the API is missing. */
export function allZones(): string[] {
	const intl = Intl as { supportedValuesOf?: (key: string) => string[] };
	return (intl.supportedValuesOf?.('timeZone') ?? []).slice().sort();
}

/** Last part of the identifier: "Los Angeles". */
export function city(zone: string) {
	return (zone.split('/').pop() ?? zone).replace(/_/g, ' ');
}

function zoneName(date: Date, zone: string, style: string) {
	try {
		return (
			new Intl.DateTimeFormat(undefined, {
				timeZone: zone,
				timeZoneName:
					style as Intl.DateTimeFormatOptions['timeZoneName'],
			})
				.formatToParts(date)
				.find((part) => part.type === 'timeZoneName')
				?.value ?? ''
		);
	} catch {
		return '';
	}
}

export function abbreviation(zone: string, date: Date) {
	return zoneName(date, zone, 'short');
}

/** Whole hours, or hours and minutes, with a true minus: "+9", "−3:30", "0". */
export function signed(seconds: number) {
	if (seconds === 0) return '0';
	const hours = Math.floor(Math.abs(seconds) / 3600);
	const minutes = Math.floor((Math.abs(seconds) % 3600) / 60);
	return (
		(seconds < 0 ? '−' : '+') +
		(minutes === 0 ? String(hours) : `${hours}:${pad(minutes)}`)
	);
}

/** "UTC+5:30", "UTC−8" or "UTC". */
export function offset(zone: string, date: Date) {
	const seconds = offsetSeconds(date, zone);
	return seconds === 0 ? 'UTC' : `UTC${signed(seconds)}`;
}

/** The zone's name in the user's language and its offset. */
export function detail(zone: string, date: Date) {
	const generic = zoneName(date, zone, 'longGeneric');
	// Intl has no generic name for UTC and fixed zones
	const name = /^GMT[+-]/.test(generic)
		? zoneName(date, zone, 'long')
		: generic;
	return [name, offset(zone, date)].filter(Boolean).join(' · ');
}

/** "Berlin · CEST", for cells and result rows. */
export function title(zone: string, date: Date) {
	return `${city(zone)} · ${abbreviation(zone, date)}`;
}

/** Zones by region for the full menu: "America" → New York, Argentina/Buenos Aires… */
export function regions(zones: string[]) {
	const groups = new Map<string, { zone: string; name: string }[]>();
	for (const zone of zones) {
		const [region, ...rest] = zone.split('/');
		const key = rest.length ? region! : '';
		const name = (rest.length ? rest.join('/') : zone).replace(
			/_/g,
			' ',
		);
		groups.set(key, [...(groups.get(key) ?? []), { zone, name }]);
	}
	return [...groups]
		.sort(([a], [b]) =>
			a === '' ? 1 : b === '' ? -1 : a.localeCompare(b),
		)
		.map(([region, entries]) => ({ region, entries }));
}

// world

/** Latitudes drawn: Antarctica's interior and the high Arctic have no cities to mark. */
export const north = 80;
export const south = -60;
export const mapAspect = 360 / (north - south);

/** Where a city of each common zone sits, as [lat, lon]. */
export const places: Record<string, [number, number]> = {
	'Europe/Paris': [48.9, 2.3],
	'Europe/Berlin': [52.5, 13.4],
	'Europe/Moscow': [55.8, 37.6],
	'Europe/London': [51.5, -0.1],
	'Africa/Cairo': [30.0, 31.2],
	'Africa/Lagos': [6.5, 3.4],
	'Africa/Nairobi': [-1.3, 36.8],
	'Africa/Johannesburg': [-26.2, 28.0],
	'Africa/Casablanca': [33.6, -7.6],
	'Asia/Dubai': [25.3, 55.3],
	'Asia/Kolkata': [19.1, 72.9],
	'Asia/Calcutta': [19.1, 72.9],
	'Asia/Singapore': [1.3, 103.8],
	'Asia/Shanghai': [39.9, 116.4],
	'Asia/Tokyo': [35.7, 139.7],
	'Australia/Sydney': [-33.9, 151.2],
	'Pacific/Auckland': [-36.8, 174.8],
	'America/New_York': [40.7, -74.0],
	'America/Chicago': [41.9, -87.6],
	'America/Denver': [39.7, -105.0],
	'America/Los_Angeles': [34.1, -118.2],
	'America/Anchorage': [61.2, -149.9],
	'Pacific/Honolulu': [21.3, -157.8],
	'America/Sao_Paulo': [-23.5, -46.6],
	'America/Argentina/Buenos_Aires': [-34.6, -58.4],
	'America/Buenos_Aires': [-34.6, -58.4],
	'America/Lima': [-12.0, -77.0],
	'America/Bogota': [4.7, -74.1],
	'America/Santiago': [-33.4, -70.7],
	'Atlantic/Reykjavik': [64.1, -21.9],
	UTC: [51.5, 0],
	GMT: [51.5, 0],
};

/** The point with the sun overhead, as [lat, lon]: declination by day of year, longitude by UTC time. */
export function subsolar(date: Date): [number, number] {
	const start = utc(date.getUTCFullYear(), 0, 1);
	const dayOfYear = Math.floor((date.getTime() - start) / day) + 1;
	const hours =
		date.getUTCHours() +
		date.getUTCMinutes() / 60 +
		date.getUTCSeconds() / 3600;
	const declination =
		-23.44 * Math.cos(((2 * Math.PI) / 365) * (dayOfYear + 10));
	return [declination, -15 * (hours - 12)];
}

/** Latitude of the day and night line at `lon`, for the sun over `sun`. */
export function terminator(lon: number, sun: [number, number]) {
	const declination =
		(Math.max(Math.abs(sun[0]), 0.1) *
			(sun[0] < 0 ? -1 : 1) *
			Math.PI) /
		180;
	const angle = ((lon - sun[1]) * Math.PI) / 180;
	return (
		(Math.atan(-Math.cos(angle) / Math.tan(declination)) * 180) /
		Math.PI
	);
}

// axis

export type Component = 'minute' | 'hour' | 'day' | 'week' | 'month' | 'year';

export interface Rung {
	component: Component;
	count: number;
	/** Typical length, for choosing a rung. */
	seconds: number;
	/** Rung of the finer ticks between these. */
	minor?: number;
}

export const rungs: Rung[] = (() => {
	const m = 60;
	const h = 3600;
	const d = 86_400;
	const month = 2_629_746;
	const year = 31_556_952;
	const list: Rung[] = [
		{ component: 'minute', count: 1, seconds: m },
		{ component: 'minute', count: 5, seconds: 5 * m, minor: 0 },
		{ component: 'minute', count: 15, seconds: 15 * m, minor: 1 },
		{ component: 'minute', count: 30, seconds: 30 * m, minor: 1 },
		{ component: 'hour', count: 1, seconds: h, minor: 2 },
		{ component: 'hour', count: 3, seconds: 3 * h, minor: 4 },
		{ component: 'hour', count: 6, seconds: 6 * h, minor: 4 },
		{ component: 'hour', count: 12, seconds: 12 * h, minor: 5 },
		{ component: 'day', count: 1, seconds: d, minor: 6 },
		{ component: 'day', count: 2, seconds: 2 * d, minor: 8 },
		{ component: 'week', count: 1, seconds: 7 * d, minor: 8 },
		{ component: 'month', count: 1, seconds: month, minor: 8 },
		{ component: 'month', count: 3, seconds: 3 * month, minor: 11 },
		{ component: 'month', count: 6, seconds: 6 * month, minor: 11 },
		{ component: 'year', count: 1, seconds: year, minor: 11 },
	];
	// 1-2-5 years upwards
	for (let power = 1; power <= 100_000; power *= 10) {
		for (const mantissa of [2, 5, 10]) {
			if (power === 100_000 && mantissa > 2) continue;
			const count = mantissa * power;
			let finer = 14;
			list.forEach((rung, index) => {
				if (
					rung.component === 'year' &&
					count / rung.count >= 5
				)
					finer = index;
			});
			list.push({
				component: 'year',
				count,
				seconds: count * year,
				minor: finer,
			});
		}
	}
	return list;
})();

/** Index of the finest rung whose ticks sit at least `gap` px apart. */
export function rung(span: number, width: number, gap: number) {
	if (span <= 0 || width <= 0) return 0;
	const index = rungs.findIndex((r) => (r.seconds / span) * width >= gap);
	return index < 0 ? rungs.length - 1 : index;
}

/** First weekday of the user's locale, 0 Sunday … 6 Saturday. */
const firstWeekday = (() => {
	try {
		const locale = new Intl.Locale(
			navigator.language,
		) as Intl.Locale & {
			getWeekInfo?: () => { firstDay: number };
			weekInfo?: { firstDay: number };
		};
		const info = locale.getWeekInfo?.() ?? locale.weekInfo;
		return info ? info.firstDay % 7 : 1;
	} catch {
		return 1;
	}
})();

function add(date: Date, component: Component, value: number) {
	if (component === 'minute')
		return new Date(date.getTime() + value * minute);
	if (component === 'hour')
		return new Date(date.getTime() + value * hour);
	const moved = new Date(date.getTime());
	if (component === 'day') moved.setDate(moved.getDate() + value);
	else if (component === 'week')
		moved.setDate(moved.getDate() + value * 7);
	else
		moved.setMonth(
			moved.getMonth() +
				value * (component === 'year' ? 12 : 1),
		);
	return moved;
}

function anchor(lo: Date, r: Rung) {
	const at = new Date(lo.getTime());
	if (r.component === 'year') {
		const year = Math.floor(lo.getFullYear() / r.count) * r.count;
		at.setFullYear(year, 0, 1);
		at.setHours(0, 0, 0, 0);
		return at;
	}
	if (r.component === 'minute') at.setMinutes(0, 0, 0);
	else if (r.component === 'hour') at.setHours(0, 0, 0, 0);
	else if (r.component === 'day') {
		at.setDate(1);
		at.setHours(0, 0, 0, 0);
	} else if (r.component === 'week') {
		at.setDate(
			at.getDate() - ((at.getDay() - firstWeekday + 7) % 7),
		);
		at.setHours(0, 0, 0, 0);
	} else {
		at.setMonth(0, 1);
		at.setHours(0, 0, 0, 0);
	}
	return at;
}

/** Ticks from `lo` to `hi`, counted from the start of the enclosing unit so they land on round values. */
export function ticks(lo: Date, hi: Date, r: Rung): Date[] {
	const start = anchor(lo, r);
	const list: Date[] = [];
	for (let step = 0; list.length < 400 && step < 1000; step += 1) {
		const tick = add(start, r.component, step * r.count);
		if (Number.isNaN(tick.getTime()) || tick > hi) break;
		if (tick >= lo) list.push(tick);
	}
	return list;
}

export function startOfDay(date: Date) {
	const at = new Date(date.getTime());
	at.setHours(0, 0, 0, 0);
	return at;
}

const sameMonth = (a: Date, b: Date) =>
	a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();

/**
 * Label options for a tick, and whether it opens a larger unit (a new day
 * under hours, a new year under months).
 */
export function template(
	tick: Date,
	previous: Date | undefined,
	r: Rung,
): [Intl.DateTimeFormatOptions, boolean] {
	switch (r.component) {
		case 'minute':
		case 'hour':
			return startOfDay(tick).getTime() === tick.getTime()
				? [{ month: 'short', day: 'numeric' }, true]
				: [
						{
							hour: 'numeric',
							minute: '2-digit',
						},
						false,
					];
		case 'day':
		case 'week':
			return previous && sameMonth(previous, tick)
				? [{ day: 'numeric' }, false]
				: [{ month: 'short', day: 'numeric' }, true];
		case 'month':
			return tick.getMonth() === 0
				? [{ year: 'numeric' }, true]
				: [{ month: 'short' }, false];
		default:
			return [{ year: 'numeric' }, false];
	}
}

export const isWeekend = (date: Date) =>
	date.getDay() === 0 || date.getDay() === 6;
