import type { JwtResult, JwtTimeClaim } from 'delphitools-v2/lib/jwt';

type Decoded = Extract<JwtResult, { kind: 'decoded' }>;

export type JwtState = 'valid' | 'expired' | 'early';

export const STATE_WORDS: Record<JwtState, string> = {
	valid: 'Valid',
	expired: 'Expired',
	early: 'Not yet valid',
};

/** JWTAnatomy.status: expired past exp, early before nbf, valid with an exp, else none. */
export function jwtState(decoded: Decoded, now: Date): JwtState | null {
	const seconds = now.getTime() / 1000;
	const claim = (key: string) =>
		decoded.timeClaims.find((c) => c.key === key);
	const exp = claim('exp');
	if (exp && exp.seconds <= seconds) return 'expired';
	const nbf = claim('nbf');
	if (nbf && nbf.seconds > seconds) return 'early';
	return exp ? 'valid' : null;
}

const UNITS: [number, string][] = [
	[365 * 86_400, 'y'],
	[86_400, 'd'],
	[3_600, 'h'],
	[60, 'm'],
	[1, 's'],
];

/** The largest whole unit, as DateComponentsFormatter's abbreviated style with one unit. */
export function duration(seconds: number): [number: string, unit: string] {
	const whole = Math.floor(Math.abs(seconds));
	for (const [size, unit] of UNITS) {
		if (whole >= size)
			return [String(Math.floor(whole / size)), unit];
	}
	return ['0', 's'];
}

/** A run of the typed token: its segment (0 header, 1 payload, 2 signature), a dot, or neither. */
export interface Mark {
	text: string;
	part: 0 | 1 | 2 | 'dot' | null;
}

/** The typed text cut into runs by segment; surrounding space and a fourth segment on stay unmarked. */
export function marks(text: string): Mark[] {
	const start = text.length - text.trimStart().length;
	const end = text.trimEnd().length;
	const runs: Mark[] = [];
	const push = (piece: string, part: Mark['part']) => {
		if (!piece) return;
		const last = runs.at(-1);
		if (last && last.part === part) last.text += piece;
		else runs.push({ text: piece, part });
	};
	push(text.slice(0, start), null);
	let part = 0;
	for (const char of text.slice(start, end)) {
		if (char === '.') {
			push(char, 'dot');
			part += 1;
		} else push(char, part < 3 ? (part as 0 | 1 | 2) : null);
	}
	push(text.slice(end), null);
	return runs;
}

export interface Tick {
	/** Share of the axis, 0 to 1. */
	at: number;
	label: string;
	/** Label line: 0 upper, 1 lower. */
	line: number;
}

export interface Timeline {
	ticks: Tick[];
	/** From nbf (else iat) to exp, as shares of the axis. */
	band?: { from: number; to: number };
	now: number;
}

/** JWTAnatomy.drawTimeline: the claims and now on one axis at least a minute long. */
export function timeline(claims: JwtTimeClaim[], now: Date): Timeline {
	const nowSeconds = now.getTime() / 1000;
	const times = [...claims.map((c) => c.seconds), nowSeconds];
	const low = Math.min(...times);
	const span = Math.max(Math.max(...times) - low, 60);
	const at = (seconds: number) => (seconds - low) / span;

	const groups = new Map<number, JwtTimeClaim[]>();
	for (const claim of claims)
		groups.set(claim.seconds, [
			...(groups.get(claim.seconds) ?? []),
			claim,
		]);
	// ponytail: labels closer than half the axis alternate lines; measuring them is the upgrade
	let lastAt = -1;
	let line = 1;
	const ticks = [...groups.entries()]
		.sort(([a], [b]) => a - b)
		.map(([seconds, group]) => {
			const x = at(seconds);
			line = x - lastAt < 1 / 2 ? 1 - line : 1;
			lastAt = x;
			const date = group[0]!.absolute.split(',')[0];
			return {
				at: x,
				label: `${group.map((c) => c.label).join(' · ')}  ${date}`,
				line,
			};
		});

	const claim = (key: string) =>
		claims.find((c) => c.key === key)?.seconds;
	const start = claim('nbf') ?? claim('iat');
	const end = claim('exp');
	return {
		ticks,
		band:
			start !== undefined && end !== undefined
				? { from: at(start), to: at(end) }
				: undefined,
		now: at(nowSeconds),
	};
}

const encode = (text: string) =>
	btoa(text)
		.replaceAll('+', '-')
		.replaceAll('/', '_')
		.replaceAll('=', '');

/** The iOS -jwtSample token: valid, expired or early, with a random 32-byte signature. */
export function sampleToken(kind: string, now: Date): string {
	const seconds = Math.floor(now.getTime() / 1000);
	const [issued, expires] =
		kind === 'expired'
			? [seconds - 86_400 * 40, seconds - 86_400 * 9]
			: kind === 'early'
				? [seconds + 3_600 * 5, seconds + 86_400 * 3]
				: [
						seconds - 3_600 * 20,
						seconds +
							86_400 * 2 +
							3_600 * 4,
					];
	const head = '{"alg":"HS256","typ":"JWT"}';
	const body = `{"sub":"1234567890","name":"Ruby","admin":true,"iat":${Math.min(issued, seconds)},"nbf":${issued},"exp":${expires}}`;
	const signature = String.fromCharCode(
		...crypto.getRandomValues(new Uint8Array(32)),
	);
	return [encode(head), encode(body), encode(signature)].join('.');
}
