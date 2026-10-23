import { tracked } from '@glimmer/tracking';
import { reducedMotion } from 'delphicanon/lib/motion';
import {
	blend,
	moved,
	niceFloor,
	resized,
	spanX,
	spanY,
	square,
	squared,
	zoomed,
	type Plane,
	type Size,
} from 'delphitools-v2/components/tools/graph-calc/graph';

/** ms a preset or typed range takes to arrive, and a stepped or tapped trace. */
export const durations = { plane: 500, trace: 320 };
/** Share of a coasting pan's speed left after one second. */
export const coastDecay = 0.02;

const ease = (t: number) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);

interface Tween<T> {
	from: T;
	to: T;
	start: number;
}

/** The visible plane and the trace, shared by the plot and the controls around it. */
export class GraphView {
	@tracked plane?: Plane;
	@tracked size: Size = { width: 0, height: 0 };
	/** Where the trace rests; the table reads it. */
	@tracked trace = 1;
	/** Where the trace line is drawn, which eases towards `trace`. */
	@tracked traceX = 1;

	#planeTween?: Tween<Plane>;
	#traceTween?: Tween<number>;
	#inertia?: { x: number; y: number };
	#lastTick = 0;
	#frame?: number;

	/** Plane units per pixel along x and y. */
	get perPixel() {
		const { plane, size } = this;
		if (!plane || !(size.width > 0) || !(size.height > 0))
			return { x: 0.05, y: 0.05 };
		return {
			x: spanX(plane) / size.width,
			y: spanY(plane) / size.height,
		};
	}

	get squaredPlane(): Plane | undefined {
		return this.plane && squared(this.plane, this.size);
	}

	/** Where a drag rests: the nearest multiple of a round value about two pixels wide. */
	snapped(x: number): number {
		const grain = niceFloor(this.perPixel.x * 2);
		return Math.round(x / grain) * grain;
	}

	resize(size: Size) {
		if (!(size.width > 0) || !(size.height > 0)) return;
		const old = this.size;
		if (old.width === size.width && old.height === size.height)
			return;
		this.size = size;
		if (!this.plane) this.plane = square(size);
		else if (old.width > 0)
			this.plane = resized(this.plane, old, size);
	}

	setWindow(target: Plane, animated: boolean) {
		this.#stopMotion();
		if (!animated || !this.plane || reducedMotion()) {
			this.plane = target;
			return;
		}
		this.#planeTween = {
			from: this.plane,
			to: target,
			start: performance.now(),
		};
		this.#run();
	}

	setTrace(x: number, animated: boolean) {
		this.trace = x;
		this.#traceTween = undefined;
		if (
			!animated ||
			!this.plane ||
			x === this.traceX ||
			reducedMotion()
		) {
			this.traceX = x;
			return;
		}
		this.#traceTween = {
			from: this.traceX,
			to: x,
			start: performance.now(),
		};
		this.#run();
	}

	/** A drag on the trace: no easing. */
	drag(x: number) {
		this.#traceTween = undefined;
		this.trace = x;
		this.traceX = x;
	}

	/** By a drag of dx, dy pixels. */
	pan(dx: number, dy: number) {
		if (!this.plane) return;
		const per = this.perPixel;
		this.plane = moved(this.plane, -dx * per.x, dy * per.y);
	}

	/** Zoom by `factor` about a point in pixels, then move by a drag of the centroid. */
	zoom(
		factor: number,
		at: { x: number; y: number },
		by = { x: 0, y: 0 },
	) {
		const { plane, size } = this;
		if (!plane) return;
		const x = plane.xMin + (at.x / size.width) * spanX(plane);
		const y = plane.yMax - (at.y / size.height) * spanY(plane);
		const next = zoomed(plane, factor, x, y);
		this.plane = moved(
			next,
			(-by.x * spanX(next)) / size.width,
			(by.y * spanY(next)) / size.height,
		);
	}

	/** Lets go of a drag moving at this many pixels per second. */
	coast(velocity: { x: number; y: number }) {
		if (Math.hypot(velocity.x, velocity.y) <= 120) return;
		this.#inertia = velocity;
		this.#lastTick = performance.now();
		this.#run();
	}

	stopMotion() {
		this.#stopMotion();
	}

	#stopMotion() {
		this.#planeTween = undefined;
		this.#inertia = undefined;
	}

	destroy() {
		if (this.#frame !== undefined)
			cancelAnimationFrame(this.#frame);
		this.#frame = undefined;
	}

	#run() {
		this.#frame ??= requestAnimationFrame(this.#tick);
	}

	#tick = (now: number) => {
		this.#frame = undefined;
		const planeTween = this.#planeTween;
		if (planeTween) {
			const t = (now - planeTween.start) / durations.plane;
			this.plane =
				t >= 1
					? planeTween.to
					: blend(
							planeTween.from,
							planeTween.to,
							ease(t),
						);
			if (t >= 1) this.#planeTween = undefined;
		}
		const traceTween = this.#traceTween;
		if (traceTween) {
			const t = (now - traceTween.start) / durations.trace;
			this.traceX =
				t >= 1
					? traceTween.to
					: traceTween.from +
						(traceTween.to -
							traceTween.from) *
							ease(t);
			if (t >= 1) this.#traceTween = undefined;
		}
		const velocity = this.#inertia;
		if (velocity) {
			const dt =
				Math.min(now - this.#lastTick, 1000 / 30) /
				1000;
			this.#lastTick = now;
			this.pan(velocity.x * dt, velocity.y * dt);
			const keep = Math.pow(coastDecay, dt);
			this.#inertia =
				Math.hypot(velocity.x, velocity.y) * keep < 20
					? undefined
					: {
							x: velocity.x * keep,
							y: velocity.y * keep,
						};
		}
		if (this.#planeTween || this.#traceTween || this.#inertia)
			this.#run();
	};
}
