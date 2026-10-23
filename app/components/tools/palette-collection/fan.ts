/** Chip width over chip length, and chip length past the rivet over chip width. */
const widthShare = 0.19;
const tailShare = 0.62;
const degree = Math.PI / 180;
/** The cover lies this far below horizontal; the chips hang clockwise beneath it. */
const coverTilt = 7 * degree;
const maxSpread = 80 * degree;

export interface Fan {
	/** The rivet, px from the room's top left. */
	x: number;
	y: number;
	length: number;
	width: number;
	tail: number;
	/** Degrees clockwise from upright, one per chip, the cover last. */
	angles: number[];
}

/**
 * PaletteDeck.fan from iOS: the largest fan of `count` chips (colours plus the
 * cover) that fits a `width` x `height` room. Chips part at their tips once
 * they are a chip width apart. `hug` is the share of the spare room that goes
 * above and before the fan (iOS 0.3; 0.5 centres it).
 */
export function fanIn(
	width: number,
	height: number,
	count: number,
	hug = 0.5,
): Fan {
	const w = widthShare;
	const tail = tailShare * widthShare;
	const cover = Math.PI / 2 + coverTilt;
	const anglesFor = (step: number) => [
		...Array.from(
			{ length: Math.max(count, 1) - 1 },
			(_, i) => cover + step * (i + 1),
		),
		cover,
	];
	const corners = [
		[-w / 2, -1],
		[w / 2, -1],
		[-w / 2, tail],
		[w / 2, tail],
	] as const;
	const bounds = (angles: number[]) => {
		let minX = Infinity;
		let minY = Infinity;
		let maxX = -Infinity;
		let maxY = -Infinity;
		for (const a of angles)
			for (const [cx, cy] of corners) {
				const x = cx * Math.cos(a) - cy * Math.sin(a);
				const y = cx * Math.sin(a) + cy * Math.cos(a);
				minX = Math.min(minX, x);
				minY = Math.min(minY, y);
				maxX = Math.max(maxX, x);
				maxY = Math.max(maxY, y);
			}
		return { minX, minY, w: maxX - minX, h: maxY - minY };
	};
	const gaps = Math.max(count - 1, 1);
	const highest = Math.min(18 * degree, maxSpread / gaps);
	let best:
		| {
				score: number;
				length: number;
				angles: number[];
				box: ReturnType<typeof bounds>;
		  }
		| undefined;
	let step = Math.min(5 * degree, highest);
	do {
		const angles = anglesFor(step);
		const box = bounds(angles);
		const length = Math.min(width / box.w, height / box.h);
		const parting = count < 2 ? 1 : Math.min(1, step / (1.1 * w));
		const score = length * parting;
		// near ties: wider fan
		if (!best || score >= best.score * 0.999)
			best = { score, length, angles, box };
		step += 0.5 * degree;
	} while (step <= highest);
	const chosen = best;
	const length = Math.max(chosen.length, 0);
	return {
		x:
			(width - chosen.box.w * length) * hug -
			chosen.box.minX * length,
		y:
			(height - chosen.box.h * length) * hug -
			chosen.box.minY * length,
		length,
		width: w * length,
		tail: tail * length,
		angles: chosen.angles.map((a) => a / degree),
	};
}
