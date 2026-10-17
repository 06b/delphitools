/** TimeCalcPicture's draw(_:), as SVG markup. */
import {
	abbreviation,
	city,
	formatter,
	isWeekend,
	offset,
	offsetSeconds,
	places,
	rung,
	rungs,
	startOfDay,
	subsolar,
	template,
	terminator,
	ticks,
} from 'delphitools-v2/components/tools/time-calc/time';
import { mapAspect, mapHeight, mapPoint } from 'delphitools-v2/lib/world-map';

export type Scene =
	| { kind: 'epoch'; date?: Date }
	| { kind: 'span'; a: Date; b: Date; blank?: boolean }
	| { kind: 'zones'; instant: Date; from: string; to: string };

export type Kind = Scene['kind'];

/** Axis ends and the marked times, in seconds since 1970; what animates. */
export interface Pose {
	lo: number;
	hi: number;
	a: number;
	b: number;
}

export type Measure = (
	text: string,
	size: number,
	weight: number,
	mono?: boolean,
) => number;

/** 2038-01-19 03:14:07 UTC, the last second a signed 32-bit count holds. */
export const limit = 2 ** 31 - 1;
/** The ends of the JavaScript date range, about 275,000 years either way. */
export const reach = 8.64e12;
export const padding = 16;
export const figureRow = 40;
const frame = 2;
const line = 14;
const strip = 24;
const small = 11;
/** Share of a day strip before the instant. */
const lead = 0.3;
/** Room from which the map may sit beside the day strips instead of above them. */
const besideRoom = 560;
/** Tallest the map gets above the strips. */
const mapCap = 190;
/** Two zone captions and their strips. */
const strips = (line + 4 + strip) * 2 + 10;

const fg = 'var(--canon-foreground)';
const primary = 'var(--canon-primary)';
const mutedFg = 'var(--canon-muted-foreground)';
const muted = 'var(--canon-muted)';
const border = 'var(--canon-border)';
const card = 'var(--canon-card)';
const sans = 'var(--canon-font)';
const mono = 'var(--canon-mono-font)';

const n = (v: number) => (Number.isFinite(v) ? Math.round(v * 100) / 100 : 0);
const esc = (text: string) =>
	text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const mix = (colour: string, percent: number) =>
	`color-mix(in srgb, ${colour} ${percent}%, transparent)`;

function rect(x: number, y: number, w: number, h: number, fill: string) {
	return `<rect x="${n(x)}" y="${n(y)}" width="${n(Math.max(0, w))}" height="${n(Math.max(0, h))}" style="fill: ${fill}"/>`;
}

function text(
	value: string,
	x: number,
	y: number,
	colour: string,
	{ weight = 600, size = small, family = sans, halo = false } = {},
) {
	const outline = halo
		? `stroke: ${card}; stroke-width: 3px; paint-order: stroke; stroke-linejoin: round;`
		: '';
	return `<text x="${n(x)}" y="${n(y)}" dominant-baseline="hanging" style="fill: ${colour}; font-family: ${family}; font-size: ${size}px; font-weight: ${weight}; ${outline}">${esc(value)}</text>`;
}

/** Band height for a kind at a width, frame included. */
export function bandHeight(kind: Kind, width: number, windowHeight: number) {
	const body =
		kind === 'epoch'
			? figureRow + 6 + line + 12 + 10 + line + 2 + line
			: kind === 'span'
				? figureRow +
					6 +
					line * 2 +
					14 +
					12 +
					line +
					2 +
					line
				: zoneLayout(width, windowHeight, 0).stripsTop +
					strips -
					10;
	return Math.ceil(2 + body + 14) + frame * 2;
}

/**
 * The map above the strips, or beside them on the trailing side when the
 * band would otherwise take more than 40 % of a wide window's height.
 */
export function zoneLayout(width: number, windowHeight: number, top: number) {
	const room = width > 0 ? Math.max(0, width - padding * 2) : 358;
	const above = Math.min(room / mapAspect, mapCap) + 6 + strips + 16;
	if (room >= besideRoom && above > windowHeight * 0.4) {
		const height = figureRow + 4 + strips - 10;
		const w = height * mapAspect;
		return {
			map: {
				x: padding + room - w,
				y: top,
				width: w,
				height,
			},
			stripsTop: top + figureRow + 4,
			stripsWidth: room - w - 20,
		};
	}
	const height = Math.round(Math.min(room / mapAspect, mapCap));
	const w = height * mapAspect;
	return {
		map: { x: padding + (room - w) / 2, y: top, width: w, height },
		stripsTop: top + height + 6,
		stripsWidth: room,
	};
}

export function pose(scene: Scene, now: Date): Pose {
	const nowSeconds = now.getTime() / 1000;
	if (scene.kind === 'epoch') {
		const seconds = scene.date
			? Math.min(
					Math.max(
						scene.date.getTime() / 1000,
						-reach,
					),
					reach,
				)
			: nowSeconds;
		const lo = Math.min(0, seconds);
		const hi = Math.max(limit, seconds, nowSeconds);
		// 1970 tick, local time
		return {
			lo: lo - (hi - lo) * 0.01,
			hi: hi + (hi - lo) * 0.01,
			a: seconds,
			b: 0,
		};
	}
	if (scene.kind === 'span') {
		const a = scene.a.getTime() / 1000;
		const b = scene.b.getTime() / 1000;
		// label room either side
		const half = (Math.max(Math.abs(b - a), 3600) / 2) * 1.45;
		return { lo: (a + b) / 2 - half, hi: (a + b) / 2 + half, a, b };
	}
	const t = scene.instant.getTime() / 1000;
	return {
		lo: t - lead * 86_400,
		hi: t + (1 - lead) * 86_400,
		a: t,
		b: 0,
	};
}

export interface Drawing {
	width: number;
	height: number;
	windowHeight: number;
	scene: Scene;
	shown: Pose;
	/** Where the animation lands; labels name it, not the moving pose. */
	target: Pose;
	now: Date;
	measure: Measure;
	/** Land rings as one path in map units (x 0…360, y 0…north − south). */
	land: string;
	id: string;
}

class Painter {
	out: string[] = [];
	left = padding;
	room: number;
	axisRoom?: number;

	constructor(
		readonly d: Drawing,
		readonly top: number,
	) {
		this.room = Math.max(0, d.width - padding * 2);
	}

	x(seconds: number) {
		const inset = 6;
		const { lo, hi } = this.d.shown;
		const share = (seconds - lo) / Math.max(hi - lo, 1);
		return (
			this.left +
			inset +
			share * ((this.axisRoom ?? this.room) - inset * 2)
		);
	}

	width(value: string, weight = 600, size = small, isMono = false) {
		return this.d.measure(value, size, weight, isMono);
	}

	mark(x: number, from: number, to: number, colour: string, w: number) {
		this.out.push(rect(x - w / 2, from, w, to - from, colour));
	}

	dashed(x: number, from: number, to: number, colour: string) {
		this.out.push(
			`<line x1="${n(x)}" x2="${n(x)}" y1="${n(from)}" y2="${n(to)}" style="stroke: ${colour}; stroke-width: 1; stroke-dasharray: 2 2"/>`,
		);
	}

	/** Text centred on `centre`, kept inside the picture; returns its box. */
	place(
		value: string,
		centre: number,
		y: number,
		colour: string,
		weight = 600,
	) {
		const w = this.width(value, weight);
		const x = Math.min(
			Math.max(centre - w / 2, this.left),
			this.left + this.room - w,
		);
		this.out.push(text(value, x, y, colour, { weight }));
		return { x, y, width: w, height: line };
	}

	/** Calendar ticks under an axis at the unit its span calls for, finer ticks between, labels that fit. */
	ticks(axis: number, labels: number) {
		const { lo, hi } = this.d.shown;
		const span = hi - lo;
		const from = new Date(lo * 1000);
		const to = new Date(hi * 1000);
		const main = rungs[rung(span, this.room, 44)]!;
		const minor =
			main.minor === undefined
				? undefined
				: rungs[main.minor];
		if (minor && (minor.seconds / span) * this.room >= 4)
			for (const tick of ticks(from, to, minor))
				this.out.push(
					rect(
						this.x(tick.getTime() / 1000),
						axis,
						1,
						3,
						mutedFg,
					),
				);
		let lastRight = -Infinity;
		let labelled: Date | undefined;
		for (const tick of ticks(from, to, main)) {
			const at = this.x(tick.getTime() / 1000);
			this.out.push(rect(at, axis, 1, 7, mutedFg));
			const [options, strong] = template(
				tick,
				labelled,
				main,
			);
			const value = formatter(options).format(tick);
			const weight = strong ? 600 : 400;
			const w = this.width(value, weight);
			const x = Math.min(
				Math.max(at - w / 2, this.left),
				this.left + this.room - w,
			);
			if (x <= lastRight + 6) continue;
			this.out.push(
				text(value, x, labels, strong ? fg : mutedFg, {
					weight,
				}),
			);
			lastRight = x + w;
			labelled = tick;
		}
	}

	epoch(marked: boolean) {
		const { shown, target, now } = this.d;
		const labelY = this.top + 6;
		const axis = labelY + line + 12;
		const right = this.left + this.room;
		this.out.push(rect(this.left, axis - 3, this.room, 6, muted));
		if (marked) {
			const from = this.x(Math.min(0, shown.a));
			const to = this.x(Math.max(0, shown.a));
			this.out.push(
				rect(
					from,
					axis - 3,
					Math.max(2, to - from),
					6,
					shown.a < 0
						? mix(primary, 50)
						: primary,
				),
			);
		}
		this.ticks(axis + 3, axis + 10);

		const end = this.x(limit);
		this.dashed(end, axis - 12, axis + 3, mutedFg);
		const limitText = '2³¹';
		const limitWidth = this.width(limitText);
		let limitBox:
			{ x: number; y: number; width: number } | undefined = {
			x: end - limitWidth - 3,
			y: axis - 12 - line + 2,
			width: limitWidth,
		};

		const nowAt = this.x(now.getTime() / 1000);
		this.mark(nowAt, axis - 7, axis + 7, fg, 1.5);
		this.place('Now', nowAt, axis + 10 + line + 2, fg);

		if (marked) {
			const at = this.x(shown.a);
			this.mark(at, labelY + line + 2, axis + 7, primary, 2);
			const label = formatter({
				year: 'numeric',
				month: 'short',
				day: 'numeric',
			}).format(new Date(target.a * 1000));
			const box = this.place(label, at, labelY, primary);
			if (
				box.x - 4 < limitBox.x + limitBox.width &&
				box.x + box.width + 4 > limitBox.x &&
				box.y < limitBox.y + line &&
				box.y + line > limitBox.y
			)
				limitBox = undefined;
		}
		if (
			limitBox &&
			limitBox.x > this.left &&
			limitBox.x + limitBox.width < right
		)
			this.out.push(
				text(
					limitText,
					limitBox.x,
					limitBox.y,
					mutedFg,
				),
			);
	}

	span() {
		const { shown, target, now } = this.d;
		const labelY = this.top + 6;
		const axis = labelY + line * 2 + 14;
		const span = shown.hi - shown.lo;
		// weekends at day scale
		if ((86_400 / span) * this.room >= 6) {
			let day = startOfDay(new Date(shown.lo * 1000));
			for (
				let count = 0;
				day.getTime() / 1000 < shown.hi && count < 500;
				count += 1
			) {
				const next = new Date(day.getTime());
				next.setDate(next.getDate() + 1);
				if (isWeekend(day)) {
					const from = Math.max(
						this.x(day.getTime() / 1000),
						this.left,
					);
					const to = Math.min(
						this.x(next.getTime() / 1000),
						this.left + this.room,
					);
					if (to > from)
						this.out.push(
							rect(
								from,
								axis - 10,
								to - from,
								20,
								muted,
							),
						);
				}
				day = next;
			}
		}
		this.out.push(
			rect(this.left, axis - 0.5, this.room, 1, border),
		);
		this.ticks(axis + 1, axis + 12);

		const nowSeconds = now.getTime() / 1000;
		if (nowSeconds >= shown.lo && nowSeconds <= shown.hi) {
			const at = this.x(nowSeconds);
			this.mark(at, axis - 10, axis + 10, fg, 1.5);
			this.place('Now', at, axis + 12 + line + 2, fg);
		}

		if (this.d.scene.kind === 'span' && this.d.scene.blank) return;
		const early = Math.min(shown.a, shown.b);
		const late = Math.max(shown.a, shown.b);
		this.out.push(
			rect(
				this.x(early),
				axis - 3,
				Math.max(2, this.x(late) - this.x(early)),
				6,
				primary,
			),
		);
		for (const seconds of [shown.a, shown.b])
			this.mark(
				this.x(seconds),
				labelY + line * 2 + 2,
				axis + 8,
				primary,
				2,
			);

		// earlier label leans left
		const middle = (this.x(early) + this.x(late)) / 2;
		const startFirst = shown.a <= shown.b;
		const names = ['Start', 'End'];
		const dates = [target.a, target.b].map((s) =>
			formatter({
				year: 'numeric',
				month: 'short',
				day: 'numeric',
				hour: 'numeric',
				minute: '2-digit',
			}).format(new Date(s * 1000)),
		);
		[early, late].forEach((seconds, index) => {
			const which = (index === 0) === startFirst ? 0 : 1;
			const name = names[which]!;
			const date = dates[which]!;
			const nameWidth = this.width(name);
			const dateWidth = this.width(date, 400);
			const w = Math.max(nameWidth, dateWidth);
			let origin = this.x(seconds) - w / 2;
			origin =
				index === 0
					? Math.min(origin, middle - 4 - w)
					: Math.max(origin, middle + 4);
			origin = Math.min(
				Math.max(origin, this.left),
				this.left + this.room - w,
			);
			const alignRight =
				index === 0 &&
				origin + w <= this.x(seconds) + 1;
			this.out.push(
				text(
					name,
					origin +
						(alignRight
							? w - nameWidth
							: 0),
					labelY,
					fg,
				),
				text(
					date,
					origin +
						(alignRight
							? w - dateWidth
							: 0),
					labelY + line,
					mutedFg,
					{
						weight: 400,
					},
				),
			);
		});
	}

	zones(from: string, to: string) {
		const { width, windowHeight, shown, target } = this.d;
		const layout = zoneLayout(width, windowHeight, this.top);
		this.map(layout.map, [from, to]);
		this.axisRoom = layout.stripsWidth;
		const room = layout.stripsWidth;
		let y = layout.stripsTop;
		const cursor = this.x(shown.a);
		let stripTop = 0;
		let stripBottom = 0;
		const instant = new Date(target.a * 1000);
		[from, to].forEach((zone, index) => {
			const colour = index === 0 ? primary : fg;
			const name = city(zone);
			this.out.push(text(name, this.left, y, colour));
			this.out.push(
				text(
					abbreviation(zone, instant),
					this.left + this.width(name) + 6,
					y,
					mutedFg,
					{
						weight: 400,
					},
				),
			);
			const time = formatter(
				{ hour: 'numeric', minute: '2-digit' },
				zone,
			).format(instant);
			const dayText = formatter(
				{
					weekday: 'short',
					day: 'numeric',
					month: 'short',
				},
				zone,
			).format(instant);
			const dayWidth = this.width(dayText, 400);
			this.out.push(
				text(
					dayText,
					this.left + room - dayWidth,
					y,
					mutedFg,
					{ weight: 400 },
				),
			);
			this.out.push(
				text(
					time,
					this.left +
						room -
						dayWidth -
						6 -
						this.width(time, 600, 12, true),
					y - 0.5,
					colour,
					{
						size: 12,
						family: mono,
					},
				),
			);
			y += line + 4;
			if (index === 0) stripTop = y;
			stripBottom = y + strip;
			this.strip(
				{ x: this.left, y, width: room, height: strip },
				zone,
				index,
			);
			y += strip + 10;
		});
		// card edge separates labels
		this.mark(cursor, stripTop - 3, stripBottom + 3, card, 4);
		this.mark(cursor, stripTop - 3, stripBottom + 3, primary, 2);
		this.axisRoom = undefined;
	}

	/** Hours of one zone as cells, day and night shaded, every third hour named and midnight as the weekday. */
	strip(
		box: { x: number; y: number; width: number; height: number },
		zone: string,
		index: number,
	) {
		const { shown, id } = this.d;
		const clip = `${id}-strip-${index}`;
		const zoneOffset = offsetSeconds(
			new Date(shown.lo * 1000),
			zone,
		);
		// hours start on the zone's wall clock
		let hour =
			Math.floor((shown.lo + zoneOffset) / 3600) * 3600 -
			zoneOffset;
		const hourFormat = formatter({ hour: 'numeric' }, zone);
		const dayFormat = formatter({ weekday: 'short' }, zone);
		const cells: string[] = [];
		const labels: string[] = [];
		for (let count = 0; hour < shown.hi && count < 30; count += 1) {
			const start = this.x(hour);
			const end = this.x(hour + 3600);
			const local = Math.floor(
				((((hour +
					offsetSeconds(
						new Date(hour * 1000),
						zone,
					)) /
					3600) %
					24) +
					24) %
					24,
			);
			cells.push(
				rect(
					start,
					box.y,
					end - start,
					box.height,
					local >= 6 && local < 18 ? card : muted,
				),
			);
			cells.push(rect(start, box.y, 1, box.height, border));
			if (local === 0)
				cells.push(
					rect(
						start - 1,
						box.y,
						2,
						box.height,
						fg,
					),
				);
			if (
				local % (end - start >= 30 ? 1 : 3) === 0 &&
				start >= box.x
			) {
				const at = new Date(hour * 1000);
				labels.push(
					local === 0
						? text(
								dayFormat.format(
									at,
								),
								start + 3,
								box.y +
									(box.height -
										12) /
										2,
								fg,
							)
						: text(
								hourFormat.format(
									at,
								),
								start + 3,
								box.y +
									(box.height -
										12) /
										2,
								mutedFg,
								{
									weight: 400,
								},
							),
				);
			}
			hour += 3600;
		}
		this.out.push(
			`<clipPath id="${clip}"><rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.width)}" height="${n(box.height)}"/></clipPath>`,
			`<g clip-path="url(#${clip})">${cells.join('')}${labels.join('')}</g>`,
			`<rect x="${n(box.x + 0.5)}" y="${n(box.y + 0.5)}" width="${n(box.width - 1)}" height="${n(box.height - 1)}" style="fill: none; stroke: ${border}; stroke-width: 1"/>`,
		);
	}

	/** A faint world: night shaded behind the terminator, land in outline, the sun overhead, the From and To cities. */
	map(
		map: { x: number; y: number; width: number; height: number },
		zones: string[],
	) {
		const { shown, id, land } = this.d;
		const point = (lat: number, lon: number) => {
			const { x, y } = mapPoint(lat, lon);
			return {
				x: map.x + (x / 360) * map.width,
				y: map.y + (y / mapHeight) * map.height,
			};
		};
		const instant = new Date(shown.a * 1000);
		const sun = subsolar(instant);
		const night: string[] = [];
		for (let lon = -180; lon <= 180; lon += 2) {
			const p = point(terminator(lon, sun), lon);
			night.push(
				`${night.length ? 'L' : 'M'}${n(p.x)} ${n(p.y)}`,
			);
		}
		const edge = sun[0] >= 0 ? map.y + map.height + 1 : map.y - 1;
		night.push(
			`L${n(map.x + map.width)} ${n(edge)}L${n(map.x)} ${n(edge)}Z`,
		);
		const across = `${id}-across`;
		const down = `${id}-down`;
		const fadeX = `${id}-fade-x`;
		const fadeY = `${id}-fade-y`;
		const box = `x="${n(map.x)}" y="${n(map.y)}" width="${n(map.width)}" height="${n(map.height)}"`;
		const sunSpot = point(sun[0], sun[1]);
		const rays = Array.from({ length: 8 }, (_, i) => {
			const angle = (i * Math.PI) / 4;
			const c = Math.cos(angle);
			const s = Math.sin(angle);
			return `M${n(sunSpot.x + c * 4)} ${n(sunSpot.y + s * 4)}L${n(sunSpot.x + c * 6)} ${n(sunSpot.y + s * 6)}`;
		}).join('');
		const sunColour = mix(mutedFg, 70);
		this.out.push(
			// edges fade, no box
			`<linearGradient id="${fadeX}"><stop offset="0" stop-color="#000"/><stop offset="0.08" stop-color="#fff"/><stop offset="0.92" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>`,
			`<linearGradient id="${fadeY}" x2="0" y2="1"><stop offset="0" stop-color="#000"/><stop offset="0.18" stop-color="#fff"/><stop offset="0.82" stop-color="#fff"/><stop offset="1" stop-color="#000"/></linearGradient>`,
			`<mask id="${across}" maskContentUnits="userSpaceOnUse"><rect ${box} fill="url(#${fadeX})"/></mask>`,
			`<mask id="${down}" maskContentUnits="userSpaceOnUse"><rect ${box} fill="url(#${fadeY})"/></mask>`,
			`<g mask="url(#${across})"><g mask="url(#${down})">`,
			`<path d="${night.join('')}" style="fill: ${mix(muted, 70)}"/>`,
			land
				? `<path d="${land}" transform="translate(${n(map.x)} ${n(map.y)}) scale(${n(map.width / 360) || 0.01} ${n(map.height / mapHeight) || 0.01})" vector-effect="non-scaling-stroke" style="fill: ${mix(fg, 7)}; stroke: ${mix(fg, 20)}; stroke-width: 0.5"/>`
				: '',
			`<circle cx="${n(sunSpot.x)}" cy="${n(sunSpot.y)}" r="2.6" style="fill: ${sunColour}"/>`,
			`<path d="${rays}" style="stroke: ${sunColour}; stroke-width: 1.2; stroke-linecap: round"/>`,
			'</g></g>',
		);
		const taken: {
			x: number;
			y: number;
			width: number;
			height: number;
		}[] = [];
		const marks: string[] = [];
		zones.map((zone, index) => ({ zone, index }))
			.reverse()
			.forEach(({ zone, index }) => {
				const colour = index === 0 ? primary : fg;
				const place = places[zone];
				if (!place) {
					// no city: offset meridian
					const lon =
						offsetSeconds(instant, zone) /
						240;
					const x = point(0, lon).x;
					marks.push(
						`<line x1="${n(x)}" x2="${n(x)}" y1="${n(map.y)}" y2="${n(map.y + map.height)}" style="stroke: ${mix(colour, 50)}; stroke-width: 1; stroke-dasharray: 3 3"/>`,
					);
					const name = offset(zone, instant);
					const w = this.width(name);
					const leftward =
						x + 5 + w >
						map.x +
							map.width -
							map.width * 0.08;
					marks.push(
						text(
							name,
							leftward
								? x - 5 - w
								: x + 5,
							map.y +
								map.height *
									(index ===
									0
										? 0.3
										: 0.45),
							colour,
							{
								halo: true,
							},
						),
					);
					return;
				}
				const spot = point(place[0], place[1]);
				marks.push(
					`<circle cx="${n(spot.x)}" cy="${n(spot.y)}" r="5" style="fill: ${card}"/>`,
				);
				marks.push(
					index === 0
						? `<circle cx="${n(spot.x)}" cy="${n(spot.y)}" r="3.5" style="fill: ${colour}"/>`
						: `<circle cx="${n(spot.x)}" cy="${n(spot.y)}" r="2.75" style="fill: none; stroke: ${colour}; stroke-width: 1.5"/><circle cx="${n(spot.x)}" cy="${n(spot.y)}" r="1.25" style="fill: ${colour}"/>`,
				);
				const name = city(zone);
				const w = this.width(name);
				// the other city's dot under a rightward label turns it left
				const blocked = zones.some((other) => {
					const at =
						other !== zone && places[other];
					if (!at) return false;
					const dot = point(at[0], at[1]);
					return (
						dot.x > spot.x &&
						dot.x < spot.x + 7 + w + 4 &&
						Math.abs(dot.y - spot.y) < line
					);
				});
				// clear the faded edge
				const leftward =
					blocked ||
					spot.x + 7 + w >
						map.x +
							map.width -
							map.width * 0.08;
				const label = {
					x: leftward
						? spot.x - 7 - w
						: spot.x + 7,
					y: spot.y - line / 2,
					width: w,
					height: line,
				};
				if (
					taken.some(
						(t) =>
							t.x <
								label.x +
									label.width &&
							t.x + t.width >
								label.x &&
							t.y <
								label.y +
									label.height &&
							t.y + t.height >
								label.y,
					)
				)
					label.y += line;
				taken.push(label);
				marks.push(
					text(
						name,
						label.x,
						label.y + 1,
						colour,
						{ halo: true },
					),
				);
			});
		const clip = `${id}-map`;
		this.out.push(
			`<clipPath id="${clip}"><rect x="${n(map.x - padding)}" y="${n(map.y)}" width="${n(map.width + padding * 2)}" height="${n(map.height)}"/></clipPath>`,
			`<g clip-path="url(#${clip})">${marks.join('')}</g>`,
		);
	}
}

export function draw(d: Drawing): string {
	const painter = new Painter(d, 2 + figureRow);
	if (painter.room <= 60) return '';
	const { scene, shown } = d;
	if (scene.kind === 'epoch')
		painter.epoch(
			scene.date !== undefined && Math.abs(shown.a) < reach,
		);
	else if (scene.kind === 'span') painter.span();
	else {
		const zones = new Painter(d, 2);
		zones.zones(scene.from, scene.to);
		return zones.out.join('');
	}
	return painter.out.join('');
}
