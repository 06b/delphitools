// iOS ColourRingView's timings, in seconds and degrees

/** the fly-in: the sweep across the columns, each row later than the one inside it, and one swatch's flight */
export const ARRIVAL = { sweep: 0.17, row: 0.011, flight: 0.19, lift: 36 };
/** the fly-out after a pick, faster; the picked swatch lingers before it goes */
export const DEPARTURE = { sweep: 0.1, row: 0.005, flight: 0.13, linger: 0.11 };
/** share of a coast's speed kept per second, the fastest flick and the slowest coast in degrees per second, and the stretch of the drag's end that measures the flick */
export const COAST = { kept: 0.4, fastest: 1440, slowest: 2, window: 0.08 };
export const SWIVEL = 0.18;
/** columns this far either side of the quarter still reach the screen past the hub's corner */
export const DRAWN: readonly [number, number] = [-25, 115];
/** most rows in any library (FREETONE's), for how long the stagger runs */
export const DEEPEST_ROWS = 18;

export const ARRIVAL_TOTAL =
	ARRIVAL.sweep + DEEPEST_ROWS * ARRIVAL.row + ARRIVAL.flight;
export const DEPARTURE_TOTAL =
	DEPARTURE.sweep +
	DEEPEST_ROWS * DEPARTURE.row +
	DEPARTURE.flight +
	DEPARTURE.linger;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** the stagger: columns later the further round from the drawn edge, rows later the further out */
export function delay(
	angle: number,
	row: number,
	sweep: number,
	rowStep: number,
): number {
	const span = DRAWN[1] - DRAWN[0];
	return (
		Math.min(1, Math.max(0, angle - DRAWN[0]) / span) * sweep +
		row * rowStep
	);
}

/** how far a swatch has flown in `elapsed` seconds after the start, eased; 1 once landed */
export function arrival(elapsed: number, angle: number, row: number): number {
	const wait = delay(angle, row, ARRIVAL.sweep, ARRIVAL.row);
	const t = clamp01((elapsed - wait) / ARRIVAL.flight);
	return 1 - Math.pow(1 - t, 3);
}

/** how much of a swatch is still there as the ring leaves; the picked swatch goes last */
export function departure(
	elapsed: number,
	angle: number,
	row: number,
	picked: boolean,
): number {
	const wait = picked
		? DEPARTURE_TOTAL - DEPARTURE.flight
		: delay(angle, row, DEPARTURE.sweep, DEPARTURE.row);
	const t = clamp01((elapsed - wait) / DEPARTURE.flight);
	return 1 - t * t;
}

/** the types and round buttons during the fly-out: gone once the swatches are */
export function departureFade(elapsed: number): number {
	return Math.max(0, 1 - elapsed / (DEPARTURE.sweep + DEPARTURE.flight));
}

export interface TrailPoint {
	time: number;
	offset: number;
}

/** the speed a turn is let go with, from its last moments; 0 when too slow to coast */
export function flingSpeed(trail: TrailPoint[]): number {
	const last = trail.at(-1);
	if (!last) return 0;
	const first = trail.find((p) => last.time - p.time <= COAST.window);
	if (!first || last.time - first.time <= 0.008) return 0;
	const speed = Math.min(
		COAST.fastest,
		Math.max(
			-COAST.fastest,
			(last.offset - first.offset) / (last.time - first.time),
		),
	);
	return Math.abs(speed) > COAST.slowest * 4 ? speed : 0;
}

/** a coast's speed `dt` seconds on; 0 once below the slowest */
export function coast(spin: number, dt: number): number {
	const next = spin * Math.pow(COAST.kept, dt);
	return Math.abs(next) < COAST.slowest ? 0 : next;
}

export const ease = (t: number): number => 1 - Math.pow(1 - clamp01(t), 3);
