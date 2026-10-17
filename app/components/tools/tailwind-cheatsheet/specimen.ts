import ban from 'lucide-static/icons/ban.svg?raw';
import handGrab from 'lucide-static/icons/hand-grab.svg?raw';
import hourglass from 'lucide-static/icons/hourglass.svg?raw';
import keyboard from 'lucide-static/icons/keyboard.svg?raw';
import lock from 'lucide-static/icons/lock.svg?raw';
import monitor from 'lucide-static/icons/monitor.svg?raw';
import mousePointer from 'lucide-static/icons/mouse-pointer-2.svg?raw';
import moveDiagonal from 'lucide-static/icons/move-diagonal.svg?raw';
import moveHorizontal from 'lucide-static/icons/move-horizontal.svg?raw';
import moveVertical from 'lucide-static/icons/move-vertical.svg?raw';
import pointer from 'lucide-static/icons/pointer.svg?raw';
import smartphone from 'lucide-static/icons/smartphone.svg?raw';
import type { CheatSheetItem } from './data';

/*
 * TailwindSpecimen: what a class does, drawn as SVG in an 88 x 60 design
 * box, so a row thumbnail, a card and the stage share one drawing. Colours
 * are canon tokens, so a theme change needs no redraw.
 */

export const DESIGN = { width: 88, height: 60 };

interface Rect {
	x: number;
	y: number;
	w: number;
	h: number;
}
interface Point {
	x: number;
	y: number;
}

const rect = (x: number, y: number, w: number, h: number): Rect => ({
	x,
	y,
	w,
	h,
});
const pt = (x: number, y: number): Point => ({ x, y });
const inset = (r: Rect, dx: number, dy: number) =>
	rect(r.x + dx, r.y + dy, r.w - dx * 2, r.h - dy * 2);
const maxX = (r: Rect) => r.x + r.w;
const maxY = (r: Rect) => r.y + r.h;
const midX = (r: Rect) => r.x + r.w / 2;
const midY = (r: Rect) => r.y + r.h / 2;
const union = (a: Rect, b: Rect) => {
	const x = Math.min(a.x, b.x);
	const y = Math.min(a.y, b.y);
	return rect(
		x,
		y,
		Math.max(maxX(a), maxX(b)) - x,
		Math.max(maxY(a), maxY(b)) - y,
	);
};
const n = (value: number) => String(Math.round(value * 100) / 100);

const P = 'var(--canon-primary)';
const PF = 'var(--canon-primary-foreground)';
const F = 'var(--canon-foreground)';
const MF = 'var(--canon-muted-foreground)';
const CARD = 'var(--canon-card)';
const alpha = (colour: string, share: number) =>
	`color-mix(in srgb, ${colour} ${n(share * 100)}%, transparent)`;

const lit = P;
const dim = alpha(P, 0.38);
const tint = alpha(P, 0.16);
const well = 'var(--canon-muted)';
const frame = alpha(MF, 0.55);
const faint = alpha(MF, 0.45);
const ink = F;

/** The container most specimens draw in. */
const c = rect(8, 7, 72, 46);

/** Tailwind's default easing, cubic-bezier(0.4, 0, 0.2, 1). */
const standard: Curve = [0.4, 0, 0.2, 1];
type Curve = [number, number, number, number];
const easing: Record<string, Curve> = {
	'ease-linear': [0, 0, 1, 1],
	'ease-in': [0.4, 0, 1, 1],
	'ease-out': [0, 0, 0.2, 1],
	'ease-in-out': [0.4, 0, 0.2, 1],
};

/** The track a timing dot runs, and the plot a curve dot rides. */
export const TRACK = { from: pt(12, 30), to: pt(76, 30) };
export const PLOT = rect(24, 8, 40, 44);

function number(name: string): number {
	return Number(name.split('-').pop()) || 0;
}

/** The pixel figure in a CSS value: "(16px)" or "16px", else a rem value times 16. */
function pixels(css: string): number | undefined {
	const px = /(-?[\d.]+)px/.exec(css);
	if (px) return Number(px[1]);
	const rem = /(-?[\d.]+)rem/.exec(css);
	if (rem) return Number(rem[1]) * 16;
	return undefined;
}

/** A 2-D affine transform: a b c d tx ty. */
export type Affine = [number, number, number, number, number, number];

export type Motion =
	| { kind: 'transform'; box: Rect; anchor: Point; to: Affine }
	| { kind: 'spin' | 'ping' | 'pulse' | 'bounce' }
	| { kind: 'timing'; duration: number; delay: number }
	| { kind: 'curve'; curve: Curve };

const box3 = (name: string) =>
	name.includes('translate')
		? rect(26, 18, 24, 24)
		: rect(30, 16, 28, 28);

/** Transform classes: the box before, and the transform that puts it where the class does. */
function transformOf(
	name: string,
): { box: Rect; anchor: Point; to: Affine } | undefined {
	const box = box3(name);
	let anchor = pt(midX(box), midY(box));
	const value = number(name);
	const sign = name.startsWith('-') ? -1 : 1;
	const rem = 16 * 0.72;
	const rotate = (deg: number): Affine => {
		const a = (deg * Math.PI) / 180;
		return [
			Math.cos(a),
			Math.sin(a),
			-Math.sin(a),
			Math.cos(a),
			0,
			0,
		];
	};
	const skew = Math.tan((3 * Math.PI) / 180);
	let to: Affine;
	if (name.startsWith('scale-')) {
		const s = Math.max(0.001, value / 100);
		to = [s, 0, 0, s, 0, 0];
	} else if (name.includes('rotate-')) to = rotate(sign * value);
	else if (name === 'translate-x-full') to = [1, 0, 0, 1, box.w, 0];
	else if (name.includes('translate-x-'))
		to = [1, 0, 0, 1, (sign * value * rem) / 4, 0];
	else if (name.includes('translate-y-'))
		to = [1, 0, 0, 1, 0, (sign * value * rem) / 4];
	else if (name === 'skew-x-3') to = [1, 0, skew, 1, 0, 0];
	else if (name === 'skew-y-3') to = [1, skew, 0, 1, 0, 0];
	else if (name === 'origin-center' || name === 'origin-top') {
		if (name === 'origin-top') anchor = pt(midX(box), box.y);
		to = rotate(20);
	} else return undefined;
	return { box, anchor, to };
}

/** A mark in a box's top leading corner, so a turned square reads as turned. */
export const corner = (box: Rect) => rect(box.x + 3.5, box.y + 3.5, 4.5, 4.5);

/** What the stage animates, in design coordinates. */
export function motionOf(name: string, category: string): Motion | undefined {
	if (category === 'Transforms') {
		const t = transformOf(name);
		return t && { kind: 'transform', ...t };
	}
	if (category !== 'Transitions') return undefined;
	switch (name) {
		case 'animate-spin':
			return { kind: 'spin' };
		case 'animate-ping':
			return { kind: 'ping' };
		case 'animate-pulse':
			return { kind: 'pulse' };
		case 'animate-bounce':
			return { kind: 'bounce' };
	}
	const curve = easing[name];
	if (curve) return { kind: 'curve', curve };
	if (name.startsWith('duration-'))
		return {
			kind: 'timing',
			duration: number(name) / 1000,
			delay: 0,
		};
	if (name.startsWith('delay-'))
		return {
			kind: 'timing',
			duration: 0.15,
			delay: number(name) / 1000,
		};
	return undefined;
}

let serial = 0;

function inner(svg: string) {
	return svg.slice(
		svg.indexOf('>', svg.indexOf('<svg')) + 1,
		svg.lastIndexOf('</svg>'),
	);
}

interface TextOptions {
	weight?: number;
	family?: string;
	colour?: string;
	style?: string;
	anchor?: 'start' | 'middle';
}

class Painter {
	out: string[] = [];
	omitsMotion: boolean;

	constructor(omitsMotion: boolean) {
		this.omitsMotion = omitsMotion;
	}

	id() {
		serial += 1;
		return `tw${serial}`;
	}

	push(markup: string) {
		this.out.push(markup);
	}

	fill(r: Rect, colour: string, radius = 1.2, extra = '') {
		if (r.w <= 0 || r.h <= 0) return;
		this.push(
			`<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(r.w)}" height="${n(r.h)}" rx="${n(radius)}" style="fill:${colour}"${extra}/>`,
		);
	}

	stroke(
		r: Rect,
		colour: string,
		{
			width,
			dash,
			radius = 1.2,
		}: { width?: number; dash?: number[]; radius?: number } = {},
	) {
		this.push(
			`<rect x="${n(r.x)}" y="${n(r.y)}" width="${n(Math.max(0, r.w))}" height="${n(Math.max(0, r.h))}" rx="${n(radius)}" style="fill:none;stroke:${colour};stroke-width:${n(width ?? 1)}"${width === undefined ? ' vector-effect="non-scaling-stroke"' : ''}${dash ? ` stroke-dasharray="${dash.join(' ')}"` : ''}/>`,
		);
	}

	container(r: Rect = c) {
		this.fill(r, well, 2);
		this.stroke(r, frame, { radius: 2 });
	}

	dashed(r: Rect, colour = frame) {
		this.stroke(r, colour, { dash: [2.5, 2] });
	}

	line(
		from: Point,
		to: Point,
		colour: string,
		{
			width,
			dash,
			round = true,
		}: { width?: number; dash?: number[]; round?: boolean } = {},
	) {
		this.push(
			`<line x1="${n(from.x)}" y1="${n(from.y)}" x2="${n(to.x)}" y2="${n(to.y)}" style="stroke:${colour};stroke-width:${n(width ?? 1)}" stroke-linecap="${round ? 'round' : 'butt'}"${width === undefined ? ' vector-effect="non-scaling-stroke"' : ''}${dash ? ` stroke-dasharray="${dash.join(' ')}"` : ''}/>`,
		);
	}

	/** A line of text as a bar. */
	words(x: number, y: number, width: number, colour = faint, height = 3) {
		this.fill(
			rect(x, y - height / 2, Math.max(0, width), height),
			colour,
			height / 2,
		);
	}

	text(
		value: string,
		size: number,
		centre: Point,
		{
			weight = 600,
			family,
			colour = ink,
			style = '',
			anchor = 'middle',
		}: TextOptions = {},
	) {
		const escaped = value
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;');
		this.push(
			`<text x="${n(centre.x)}" y="${n(centre.y)}" text-anchor="${anchor}" dominant-baseline="central" style="font-size:${n(size)}px;font-weight:${weight};fill:${colour}${family ? `;font-family:${family}` : ''}${style}">${escaped}</text>`,
		);
	}

	symbol(svg: string, size: number, centre: Point, colour = ink) {
		const side = size * 1.3;
		this.push(
			`<svg x="${n(centre.x - side / 2)}" y="${n(centre.y - side / 2)}" width="${n(side)}" height="${n(side)}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:${colour}">${inner(svg)}</svg>`,
		);
	}

	clip(path: string, body: () => void, rule = 'nonzero') {
		const id = this.id();
		this.push(
			`<clipPath id="${id}"><path d="${path}" clip-rule="${rule}"/></clipPath><g clip-path="url(#${id})">`,
		);
		body();
		this.push('</g>');
	}

	/** Diagonal lines over `outer` outside `inner`: margin, as against padding's flat tint. */
	hatch(outer: Rect, excluding?: Rect) {
		this.clip(
			rectPath(outer) +
				(excluding ? rectPath(excluding) : ''),
			() => {
				for (
					let x = outer.x - outer.h;
					x < maxX(outer);
					x += 3
				)
					this.line(
						pt(x, maxY(outer)),
						pt(x + outer.h, outer.y),
						dim,
						{
							width: 0.8,
							round: false,
						},
					);
			},
			'evenodd',
		);
	}

	checker(r: Rect) {
		const id = this.id();
		this.fill(r, CARD, 2);
		this.push(
			`<pattern id="${id}" patternUnits="userSpaceOnUse" x="${n(r.x)}" y="${n(r.y)}" width="8" height="8"><rect width="4" height="4" style="fill:${alpha(MF, 0.18)}"/><rect x="4" y="4" width="4" height="4" style="fill:${alpha(MF, 0.18)}"/></pattern>`,
		);
		this.fill(r, `url(#${id})`, 2);
	}

	numbered(boxes: Rect[]) {
		boxes.forEach((box, index) => {
			this.fill(box, lit);
			this.text(
				String(index + 1),
				Math.min(9, box.h * 0.7),
				pt(midX(box), midY(box)),
				{
					weight: 700,
					colour: PF,
				},
			);
		});
	}

	/** A picture for background classes: sky, sun and hills, square. */
	picture(r: Rect) {
		const side = r.w;
		this.clip(rectPath(r), () => {
			this.fill(r, tint, 0);
			this.push(
				`<circle cx="${n(r.x + side * 0.7)}" cy="${n(r.y + side * 0.26)}" r="${n(side * 0.12)}" style="fill:${alpha(P, 0.7)}"/>`,
			);
			this.push(
				`<path d="M${n(r.x)} ${n(maxY(r))}L${n(r.x + side * 0.32)} ${n(r.y + side * 0.45)}L${n(r.x + side * 0.55)} ${n(r.y + side * 0.7)}L${n(r.x + side * 0.75)} ${n(r.y + side * 0.55)}L${n(maxX(r))} ${n(maxY(r))}Z" style="fill:${lit}"/>`,
			);
		});
	}

	/** Draws `shape` blurred by `radius` design units. */
	blurred(radius: number, shape: () => void) {
		if (radius <= 0) return shape();
		const id = this.id();
		this.push(
			`<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${n(radius / 2)}"/></filter><g filter="url(#${id})">`,
		);
		shape();
		this.push('</g>');
	}

	shadowed(dy: number, blur: number, opacity: number, shape: () => void) {
		const id = this.id();
		this.push(
			`<filter id="${id}" x="-50%" y="-50%" width="200%" height="200%"><feDropShadow dx="0" dy="${n(dy)}" stdDeviation="${n(blur / 2)}" flood-color="#000" flood-opacity="${n(opacity)}"/></filter><g filter="url(#${id})">`,
		);
		shape();
		this.push('</g>');
	}

	paint(item: CheatSheetItem, category: string) {
		switch (category) {
			case 'Breakpoints':
				return this.breakpoint(item);
			case 'Display':
				return this.display(item.class);
			case 'Position':
				return this.position(item.class);
			case 'Flexbox':
				return this.flexbox(item.class);
			case 'Grid':
				return this.grid(item.class);
			case 'Alignment':
				return this.alignment(item.class);
			case 'Spacing':
				return this.spacing(item);
			case 'Sizing':
				return this.sizing(item);
			case 'Typography':
				return this.typography(item);
			case 'Text':
				return this.textClass(item.class);
			case 'Backgrounds':
				return this.background(item.class);
			case 'Borders':
				return this.border(item);
			case 'Effects':
				return this.effect(item);
			case 'Transitions':
				return this.transition(item.class);
			case 'Transforms':
				return this.transformed(item.class);
			case 'Interactivity':
				return this.interactivity(item.class);
			case 'States':
				return this.state(item.class);
			case 'Overflow & Z-Index':
				return this.overflow(item.class);
			case 'Arbitrary Values':
				return this.arbitrary(item.class);
			default:
				return this.container();
		}
	}

	breakpoint(item: CheatSheetItem) {
		const widths = [640, 768, 1024, 1280, 1536];
		const x = (px: number) => 8 + (72 * px) / 1800;
		const px = pixels(item.css) ?? 0;
		this.line(pt(8, 30), pt(80, 30), faint, { width: 1.5 });
		for (const width of widths)
			this.line(pt(x(width), 27), pt(x(width), 33), faint);
		this.fill(rect(x(px), 20, 80 - x(px), 20), tint, 0);
		this.line(pt(x(px), 30), pt(80, 30), lit, { width: 3 });
		this.line(pt(x(px), 16), pt(x(px), 44), lit, { width: 1.5 });
		this.text(String(px), 7, pt(x(px), 50), {
			family: 'var(--canon-mono-font)',
			colour: lit,
		});
		this.symbol(monitor, 8, pt(78, 12), faint);
		this.symbol(smartphone, 8, pt(10, 12), faint);
	}

	display(name: string) {
		switch (name) {
			case 'block':
				this.container();
				this.fill(
					rect(c.x + 5, c.y + 6, c.w - 10, 14),
					lit,
				);
				this.fill(
					rect(c.x + 5, c.y + 26, c.w - 10, 14),
					dim,
				);
				break;
			case 'inline-block':
				this.words(8, 22, 20);
				this.fill(rect(31, 13, 24, 18), lit);
				this.words(58, 22, 22);
				this.words(8, 40, 50);
				break;
			case 'inline':
				this.words(8, 22, 34);
				this.words(45, 22, 35, lit, 5);
				this.words(8, 36, 24, lit, 5);
				this.words(35, 36, 30);
				break;
			case 'flex':
				this.container();
				this.numbered(row(inset(c, 4, 8), 3));
				break;
			case 'inline-flex': {
				this.words(6, 30, 14);
				const hug = rect(23, 19, 40, 22);
				this.container(hug);
				this.numbered(row(inset(hug, 3, 3), 3, 2));
				this.words(66, 30, 16);
				break;
			}
			case 'grid':
			case 'inline-grid': {
				const isInline = name === 'inline-grid';
				const r = isInline ? rect(25, 16, 32, 28) : c;
				if (isInline) {
					this.words(6, 30, 15);
					this.words(60, 30, 20);
				}
				this.container(r);
				const columns = isInline ? 2 : 3;
				row(inset(r, 3, 3), 2, 2, true).forEach(
					(band, rowIndex) =>
						row(band, columns, 2).forEach(
							(cell, columnIndex) =>
								this.fill(
									cell,
									(rowIndex +
										columnIndex) %
										2 ===
										0
										? lit
										: dim,
								),
						),
				);
				break;
			}
			case 'hidden':
				this.dashed(c);
				this.line(
					pt(c.x + 10, maxY(c) - 8),
					pt(maxX(c) - 10, c.y + 8),
					faint,
					{
						width: 1.2,
					},
				);
				break;
			case 'contents':
				this.dashed(c);
				for (const box of row(inset(c, 6, 10), 2, 6))
					this.fill(box, lit);
				break;
			default:
				this.container();
		}
	}

	position(name: string) {
		const small = { w: 22, h: 14 };
		switch (name) {
			case 'static':
				this.container();
				row(inset(c, 5, 5), 3, 3, true).forEach(
					(band, index) =>
						this.fill(
							band,
							index === 1 ? lit : dim,
						),
				);
				break;
			case 'relative': {
				this.container();
				const ghost = rect(18, 14, 28, 18);
				this.dashed(ghost);
				this.fill(
					rect(
						ghost.x + 12,
						ghost.y + 10,
						ghost.w,
						ghost.h,
					),
					lit,
				);
				break;
			}
			case 'absolute':
				this.container();
				for (const band of row(
					inset(c, 5, 5),
					3,
					3,
					true,
				))
					this.fill(band, dim);
				this.fill(
					rect(
						maxX(c) - 3 - small.w,
						c.y + 3,
						small.w,
						small.h,
					),
					lit,
				);
				break;
			case 'fixed': {
				const screen = rect(22, 3, 44, 54);
				this.stroke(screen, frame, {
					width: 1.5,
					radius: 5,
				});
				for (let index = 0; index < 6; index++)
					this.words(
						27,
						10 + index * 8,
						34 - (index % 3) * 6,
					);
				this.fill(
					rect(
						maxX(screen) - 16,
						maxY(screen) - 14,
						12,
						10,
					),
					lit,
					2,
				);
				break;
			}
			case 'sticky':
				this.container();
				this.clip(rectPath(c), () => {
					for (let index = 0; index < 5; index++)
						this.words(
							c.x + 5,
							c.y + 11 + index * 8,
							50 - (index % 2) * 12,
						);
				});
				this.fill(
					rect(c.x + 2, c.y + 2, c.w - 4, 11),
					lit,
				);
				break;
			case 'inset-0':
				this.container();
				this.fill(inset(c, 3, 3), lit);
				break;
			case 'inset-x-0':
				this.container();
				this.fill(
					rect(c.x + 3, midY(c) - 7, c.w - 6, 14),
					lit,
				);
				break;
			case 'inset-y-0':
				this.container();
				this.fill(
					rect(
						midX(c) - 10,
						c.y + 3,
						20,
						c.h - 6,
					),
					lit,
				);
				break;
			case 'top-0':
				this.container();
				this.fill(
					rect(
						midX(c) - small.w / 2,
						c.y,
						small.w,
						small.h,
					),
					lit,
				);
				break;
			case 'right-0':
				this.container();
				this.fill(
					rect(
						maxX(c) - small.w,
						midY(c) - small.h / 2,
						small.w,
						small.h,
					),
					lit,
				);
				break;
			case 'bottom-0':
				this.container();
				this.fill(
					rect(
						midX(c) - small.w / 2,
						maxY(c) - small.h,
						small.w,
						small.h,
					),
					lit,
				);
				break;
			case 'left-0':
				this.container();
				this.fill(
					rect(
						c.x,
						midY(c) - small.h / 2,
						small.w,
						small.h,
					),
					lit,
				);
				break;
			default:
				this.container();
		}
	}

	flexbox(name: string) {
		const box = inset(c, 4, 8);
		this.container();
		switch (name) {
			case 'flex-row':
				this.numbered(row(box, 3));
				break;
			case 'flex-col':
				this.numbered(row(inset(c, 12, 4), 3, 2, true));
				break;
			case 'flex-wrap': {
				const top = rect(box.x, c.y + 4, box.w, 17);
				for (const b of row(top, 3)) this.fill(b, lit);
				for (const b of row(
					rect(
						box.x,
						maxY(top) + 4,
						(box.w * 2) / 3 - 1,
						17,
					),
					2,
				))
					this.fill(b, dim);
				break;
			}
			case 'flex-nowrap':
				for (let index = 0; index < 5; index++) {
					const b = rect(
						box.x + index * 19,
						box.y,
						16,
						box.h,
					);
					this.fill(
						b,
						maxX(b) > maxX(c) ? dim : lit,
					);
				}
				break;
			case 'flex-1':
				for (const b of row(box, 3)) this.fill(b, lit);
				break;
			case 'flex-auto': {
				let x = box.x;
				const total = box.w - 6;
				for (const share of [0.24, 0.46, 0.3]) {
					this.fill(
						rect(
							x,
							box.y,
							total * share,
							box.h,
						),
						lit,
					);
					this.words(
						x + 3,
						midY(box),
						total * share - 6,
						alpha(PF, 0.6),
					);
					x += total * share + 3;
				}
				break;
			}
			case 'flex-none':
			case 'grow-0':
				for (let index = 0; index < 3; index++)
					this.fill(
						rect(
							box.x + index * 17,
							box.y,
							14,
							box.h,
						),
						name === 'grow-0' && index !== 1
							? dim
							: lit,
					);
				this.dashed(
					rect(
						box.x + 51,
						box.y,
						box.w - 51,
						box.h,
					),
				);
				break;
			case 'grow':
				this.fill(rect(box.x, box.y, 14, box.h), dim);
				this.fill(
					rect(
						box.x + 17,
						box.y,
						box.w - 34,
						box.h,
					),
					lit,
				);
				this.fill(
					rect(maxX(box) - 14, box.y, 14, box.h),
					dim,
				);
				break;
			case 'shrink': {
				const boxes = [
					rect(box.x, box.y, 26, box.h),
					rect(box.x + 29, box.y, 8, box.h),
					rect(
						box.x + 40,
						box.y,
						box.w - 40,
						box.h,
					),
				];
				boxes.forEach((b, index) =>
					this.fill(b, index === 1 ? lit : dim),
				);
				const middle = boxes[1]!;
				for (const [from, to] of [
					[
						pt(middle.x - 7, c.y + 4),
						pt(middle.x - 1, c.y + 4),
					],
					[
						pt(maxX(middle) + 7, c.y + 4),
						pt(maxX(middle) + 1, c.y + 4),
					],
				] as const) {
					const back = from.x < to.x ? -2 : 2;
					this.line(from, to, lit, {
						width: 1.2,
					});
					this.line(
						to,
						pt(to.x + back, to.y - 2),
						lit,
						{ width: 1.2 },
					);
					this.line(
						to,
						pt(to.x + back, to.y + 2),
						lit,
						{ width: 1.2 },
					);
				}
				break;
			}
			case 'shrink-0':
				this.fill(rect(box.x, box.y, 16, box.h), dim);
				this.fill(
					rect(box.x + 19, box.y, 34, box.h),
					lit,
				);
				this.fill(
					rect(
						box.x + 56,
						box.y,
						box.w - 56,
						box.h,
					),
					dim,
				);
				break;
		}
	}

	grid(name: string) {
		this.container();
		const box = inset(c, 3, 3);
		if (name.startsWith('grid-cols-')) {
			const columns = Math.max(1, Math.trunc(number(name)));
			const gap = columns > 6 ? 1 : 2;
			for (const band of row(box, 2, gap, true))
				for (const cell of row(band, columns, gap))
					this.fill(cell, lit, 0.6);
		} else if (name.startsWith('grid-rows-')) {
			const rows = Math.max(1, Math.trunc(number(name)));
			for (const band of row(box, rows, 2, true))
				for (const cell of row(band, 3, 2))
					this.fill(cell, lit);
		} else {
			const bands = row(box, 2, 2, true);
			const cells = row(bands[0]!, 3, 2);
			const span =
				name === 'col-span-full'
					? 3
					: name === 'col-span-2'
						? 2
						: 1;
			this.fill(union(cells[0]!, cells[span - 1]!), lit);
			for (const cell of cells.slice(span))
				this.fill(cell, dim);
			for (const cell of row(bands[1]!, 3, 2))
				this.fill(cell, dim);
		}
	}

	alignment(name: string) {
		this.container();
		const box = inset(c, 4, 4);
		const width = 12;
		if (name.startsWith('justify-')) {
			const free = box.w - width * 3;
			const steps = [0, 1, 2];
			let xs: number[];
			switch (name) {
				case 'justify-center':
					xs = steps.map(
						(s) => free / 2 + s * width,
					);
					break;
				case 'justify-end':
					xs = steps.map((s) => free + s * width);
					break;
				case 'justify-between':
					xs = [
						0,
						free / 2 + width,
						free + width * 2,
					];
					break;
				case 'justify-around':
					xs = steps.map(
						(s) =>
							free / 6 +
							s * (width + free / 3),
					);
					break;
				case 'justify-evenly':
					xs = steps.map(
						(s) =>
							(free / 4) * (s + 1) +
							s * width,
					);
					break;
				default:
					xs = steps.map((s) => s * width);
			}
			xs.forEach((x, index) =>
				this.fill(
					rect(
						box.x + x,
						box.y + 8,
						width - 1,
						box.h - 16,
					),
					index === 1 ? lit : dim,
				),
			);
			this.line(
				pt(box.x, midY(box)),
				pt(maxX(box), midY(box)),
				faint,
				{
					dash: [2.5, 2],
				},
			);
			return;
		}
		const heights = [16, 30, 22];
		// 14-wide items, 9 apart
		const start = midX(box) - (3 * 14 + 2 * 9) / 2;
		const xs = [start, start + 23, start + 46];
		if (name === 'items-baseline') {
			const baseline = box.y + 24;
			const above = [8, 16, 12];
			this.line(
				pt(box.x, baseline),
				pt(maxX(box), baseline),
				lit,
				{
					width: 0.8,
					dash: [2, 2],
				},
			);
			for (let index = 0; index < 3; index++) {
				const b = rect(
					xs[index]!,
					baseline - above[index]!,
					14,
					heights[index]! * 0.8,
				);
				this.fill(b, index === 1 ? lit : dim);
				this.words(b.x + 2, baseline - 1, 10, PF, 2);
			}
			return;
		}
		const isSelf = name.startsWith('self-');
		for (let index = 0; index < 3; index++) {
			const mode = isSelf
				? index === 1
					? name.slice(5)
					: 'stretch'
				: name.slice(6);
			const height =
				mode === 'stretch' || mode === 'auto'
					? box.h
					: heights[index]!;
			const y =
				mode === 'center'
					? midY(box) - height / 2
					: mode === 'end'
						? maxY(box) - height
						: box.y;
			const colour =
				!isSelf || index === 1
					? index === 1
						? lit
						: dim
					: alpha(P, 0.2);
			this.fill(rect(xs[index]!, y, 14, height), colour);
		}
	}

	spacing(item: CheatSheetItem) {
		const name = item.class;
		const px = pixels(item.css) ?? (name.endsWith('-*') ? 16 : 0);
		const amount = Math.min(14, px * 0.45);
		if (name.startsWith('p')) {
			const edges = name.startsWith('px-')
				? [0, 9, 0, 9]
				: name.startsWith('py-')
					? [7, 0, 7, 0]
					: name.startsWith('pt/')
						? [8, 0, 0, 0]
						: [
								amount,
								amount,
								amount,
								amount,
							];
			const [top, left, bottom, right] = edges as [
				number,
				number,
				number,
				number,
			];
			this.fill(c, tint, 2);
			this.stroke(c, lit, { radius: 2 });
			const content = rect(
				c.x + left,
				c.y + top,
				c.w - left - right,
				c.h - top - bottom,
			);
			this.fill(content, dim);
			this.words(
				content.x + 4,
				midY(content),
				content.w - 8,
				alpha(PF, 0.7),
			);
		} else if (name.startsWith('gap')) {
			const gap = name.endsWith('-*')
				? 6
				: Math.min(12, px * 0.6);
			this.container();
			const box = inset(c, 3, 3);
			if (name === 'gap-x-*' || name === 'gap-y-*') {
				const vertical = name === 'gap-y-*';
				const bands = row(
					box,
					2,
					vertical ? gap : 2,
					true,
				);
				this.fill(
					vertical
						? rect(
								box.x,
								maxY(bands[0]!),
								box.w,
								gap,
							)
						: rect(
								midX(box) -
									gap / 2,
								box.y,
								gap,
								box.h,
							),
					tint,
					0,
				);
				for (const band of bands)
					for (const cell of row(
						band,
						2,
						vertical ? 2 : gap,
					))
						this.fill(cell, lit);
			} else {
				const boxes = row(box, 3, gap);
				for (let index = 0; index < 2; index++) {
					const left = boxes[index]!;
					const right = boxes[index + 1]!;
					this.fill(
						rect(
							maxX(left),
							box.y,
							right.x - maxX(left),
							box.h,
						),
						tint,
						0,
					);
				}
				for (const b of boxes) this.fill(b, lit);
			}
		} else {
			this.dashed(c);
			const signed = name.startsWith('-')
				? -Math.abs(pixels(item.css) ?? 4) * 0.8
				: amount;
			let box: Rect;
			switch (name) {
				case 'm-auto':
					box = rect(
						midX(c) - 16,
						midY(c) - 10,
						32,
						20,
					);
					break;
				case 'mx-auto':
					box = rect(midX(c) - 18, c.y, 36, c.h);
					break;
				case 'mt-4':
					box = rect(
						c.x,
						c.y + 10,
						c.w,
						c.h - 10,
					);
					break;
				default:
					box = inset(c, signed, signed);
			}
			if (
				signed > 0 ||
				name.endsWith('auto') ||
				name === 'mt-4'
			)
				this.hatch(c, box);
			this.fill(box, lit);
			if (signed < 0) this.dashed(c, PF);
		}
	}

	sizing(item: CheatSheetItem) {
		const name = item.class;
		const css = item.css;
		const percentMatch = /([\d.]+)%/.exec(css);
		const percent = percentMatch
			? Number(percentMatch[1]) / 100
			: undefined;
		const px = pixels(css);
		const screenWide =
			css.includes('100vw') || css.includes('100vh');
		if (name.startsWith('size-')) {
			this.container();
			const side =
				percent !== undefined
					? c.h - 6
					: (px ?? 16) * 1.2;
			const full = name === 'size-full';
			this.fill(
				rect(
					full ? c.x + 3 : midX(c) - side / 2,
					midY(c) - side / 2,
					full ? c.w - 6 : side,
					side,
				),
				lit,
			);
			return;
		}
		if (name.startsWith('h-') || name.startsWith('min-h-')) {
			if (screenWide) {
				this.dashed(rect(4, 2, 80, 56), faint);
				this.container(inset(c, 0, 8));
				this.fill(rect(midX(c) - 7, 2, 14, 56), lit);
				return;
			}
			this.container();
			const height =
				percent !== undefined
					? c.h * percent
					: css.includes('auto')
						? 20
						: (px ?? 0) * 0.72;
			const bar = rect(
				midX(c) - 7,
				maxY(c) - height,
				14,
				height,
			);
			if (height > 0) this.fill(bar, lit);
			else
				this.line(
					pt(bar.x - 3, maxY(c) - 1),
					pt(maxX(bar) + 3, maxY(c) - 1),
					lit,
					{ width: 1.5 },
				);
			if (css.includes('auto'))
				for (let index = 0; index < 3; index++)
					this.words(
						bar.x + 3,
						bar.y + 5 + index * 5,
						8,
						alpha(PF, 0.7),
						2,
					);
			if (name.startsWith('min-'))
				this.line(
					pt(c.x + 4, bar.y),
					pt(maxX(c) - 4, bar.y),
					lit,
					{
						width: 0.8,
						dash: [2, 2],
					},
				);
			return;
		}
		if (screenWide) {
			this.dashed(rect(2, 8, 84, 44), faint);
			this.container(inset(c, 10, 0));
			this.fill(rect(2, midY(c) - 7, 84, 14), lit);
			return;
		}
		this.container();
		const box = inset(c, 4, 0);
		const fits =
			css.includes('auto') || css.includes('fit-content');
		let width: number;
		if (name.startsWith('max-w-'))
			width =
				percent !== undefined
					? box.w * percent
					: Math.min(1, (px ?? 0) / 1024) * box.w;
		else if (fits) width = 34;
		else
			width =
				percent !== undefined
					? box.w * percent
					: Math.min(
							box.w,
							((px ?? 0) * box.w) /
								256,
						);
		const bar = rect(box.x, midY(c) - 8, width, 16);
		if (width > 0) this.fill(bar, lit);
		else
			this.line(
				pt(bar.x, bar.y - 3),
				pt(bar.x, maxY(bar) + 3),
				lit,
				{ width: 1.5 },
			);
		if (fits)
			this.words(
				bar.x + 4,
				midY(bar),
				width - 8,
				alpha(PF, 0.7),
			);
		if (name.startsWith('max-w-') || name.startsWith('min-w-')) {
			const x = maxX(bar);
			this.line(pt(x, c.y + 4), pt(x, maxY(c) - 4), lit, {
				width: 1.2,
			});
			if (name.startsWith('max-w-'))
				this.dashed(
					rect(x, bar.y, maxX(box) - x, bar.h),
					faint,
				);
		}
	}

	typography(item: CheatSheetItem) {
		const name = item.class;
		const centre = pt(44, 30);
		if (name.startsWith('text-')) {
			this.text(
				'Aa',
				(pixels(item.css) ?? 16) * 0.95,
				centre,
				{ weight: 500 },
			);
		} else if (name.startsWith('font-')) {
			const weights: Record<string, number> = {
				'font-thin': 100,
				'font-light': 300,
				'font-normal': 400,
				'font-medium': 500,
				'font-semibold': 600,
				'font-bold': 700,
			};
			const families: Record<string, string> = {
				'font-sans':
					'ui-sans-serif, system-ui, sans-serif',
				'font-serif': 'ui-serif, Georgia, serif',
				'font-mono': 'ui-monospace, monospace',
			};
			this.text(
				'Aa',
				name === 'font-mono' ? 28 : 30,
				centre,
				{
					weight: weights[name] ?? 400,
					family: families[name],
				},
			);
		} else if (name === 'italic' || name === 'not-italic') {
			this.text('Aa', 30, centre, {
				weight: 400,
				style:
					name === 'italic'
						? ';font-style:italic'
						: '',
			});
		} else if (name.startsWith('leading-')) {
			const heights: Record<string, number> = {
				'leading-none': 1,
				'leading-tight': 1.25,
				'leading-normal': 1.5,
				'leading-relaxed': 1.625,
				'leading-loose': 2,
			};
			const pitch = 8 * (heights[name] ?? 1.5);
			const top = 30 - pitch * 1.5;
			for (let index = 0; index < 3; index++) {
				const band = rect(
					14,
					top + index * pitch,
					60,
					pitch,
				);
				this.fill(
					band,
					index % 2 === 0 ? tint : alpha(P, 0.08),
					0,
				);
				this.words(
					16,
					midY(band),
					index === 2 ? 36 : 56,
					alpha(F, 0.7),
					5,
				);
			}
		} else if (name.startsWith('tracking-')) {
			const em: Record<string, number> = {
				'tracking-tight': -0.025,
				'tracking-normal': 0,
				'tracking-wide': 0.025,
			};
			const size = 20;
			// kerning x4 for visibility
			this.text('Abc', size, centre, {
				weight: 500,
				style: `;letter-spacing:${n((em[name] ?? 0) * size * 4)}px`,
			});
			this.line(pt(18, 42), pt(70, 42), faint, {
				width: 0.8,
				dash: [2, 2],
			});
		}
	}

	textClass(name: string) {
		const centre = pt(44, 30);
		const sample = 'hi there';
		switch (name) {
			case 'text-left':
			case 'text-center':
			case 'text-right':
			case 'text-justify': {
				this.container();
				const box = inset(c, 6, 0);
				[0.92, 0.64, 0.84, 0.46].forEach(
					(share, index) => {
						const width =
							name ===
								'text-justify' &&
							index < 3
								? box.w
								: box.w * share;
						const x =
							name === 'text-center'
								? midX(box) -
									width /
										2
								: name ===
									  'text-right'
									? maxX(
											box,
										) -
										width
									: box.x;
						this.words(
							x,
							c.y + 10 + index * 9,
							width,
							index === 1
								? lit
								: alpha(
										F,
										0.55,
									),
						);
					},
				);
				break;
			}
			case 'uppercase':
				this.text(sample.toUpperCase(), 13, centre);
				break;
			case 'lowercase':
				this.text(sample, 13, centre);
				break;
			case 'capitalize':
				this.text('Hi There', 13, centre);
				break;
			case 'normal-case':
				this.text('hi There', 13, centre);
				break;
			case 'underline':
				this.text('Abc', 24, centre, { weight: 500 });
				this.line(pt(27, 40), pt(61, 40), lit, {
					width: 1.4,
				});
				break;
			case 'line-through':
				this.text('Abc', 24, centre, { weight: 500 });
				this.line(pt(27, 31), pt(61, 31), lit, {
					width: 1.4,
				});
				break;
			case 'no-underline':
				this.text('Abc', 24, centre, { weight: 500 });
				break;
			case 'truncate':
			case 'text-ellipsis':
			case 'text-clip': {
				const box = rect(14, 20, 58, 20);
				this.stroke(box, lit);
				this.clip(rectPath(inset(box, 3, 0)), () =>
					this.text(
						name === 'text-clip'
							? 'hi there, friend'
							: 'hi there, fr…',
						11,
						pt(box.x + 3, midY(box)),
						{ anchor: 'start' },
					),
				);
				break;
			}
			case 'whitespace-normal':
			case 'whitespace-nowrap':
			case 'whitespace-pre': {
				const box = rect(14, 10, 46, 40);
				this.stroke(box, frame);
				if (name === 'whitespace-nowrap')
					this.words(
						box.x + 3,
						box.y + 8,
						68,
						lit,
					);
				else if (name === 'whitespace-pre')
					[0, 8, 8, 0].forEach((indent, index) =>
						this.words(
							box.x + 3 + indent,
							box.y + 8 + index * 8,
							22,
							lit,
						),
					);
				else
					[40, 40, 18].forEach((width, index) =>
						this.words(
							box.x + 3,
							box.y + 8 + index * 8,
							width,
							lit,
						),
					);
				break;
			}
			case 'break-normal':
			case 'break-words':
			case 'break-all': {
				const box = rect(14, 10, 46, 40);
				this.stroke(box, frame);
				this.words(box.x + 3, box.y + 8, 12);
				if (name === 'break-normal')
					this.words(
						box.x + 3,
						box.y + 16,
						64,
						lit,
					);
				else if (name === 'break-words') {
					this.words(
						box.x + 3,
						box.y + 16,
						40,
						lit,
					);
					this.words(
						box.x + 3,
						box.y + 24,
						24,
						lit,
					);
				} else {
					this.words(
						box.x + 17,
						box.y + 8,
						26,
						lit,
					);
					this.words(
						box.x + 3,
						box.y + 16,
						38,
						lit,
					);
				}
				break;
			}
			default: {
				// line-clamp-n
				const lines = Math.max(
					1,
					Math.trunc(number(name)),
				);
				const box = rect(14, 8, 60, 44);
				for (let index = 0; index < 4; index++) {
					const y = box.y + 6 + index * 9;
					if (index < lines) {
						const last =
							index === lines - 1;
						this.words(
							box.x,
							y,
							last ? 42 : 60,
							lit,
						);
						if (last)
							this.text(
								'…',
								10,
								pt(
									box.x +
										48,
									y - 2,
								),
								{
									weight: 700,
									colour: lit,
								},
							);
					} else
						this.dashed(
							rect(
								box.x,
								y - 1.5,
								60,
								3,
							),
							faint,
						);
				}
			}
		}
	}

	background(name: string) {
		const colours: Record<string, string> = {
			'bg-white': '#fff',
			'bg-black': '#000',
			'bg-slate-500': '#64748b',
			'bg-[#hex]': '#1da1f2',
			'bg-current': F,
		};
		if (name === 'bg-transparent') {
			this.checker(c);
			this.stroke(c, frame, { radius: 2 });
			return;
		}
		const solid = colours[name];
		if (solid) {
			this.fill(c, solid, 2);
			this.stroke(c, frame, { radius: 2 });
			return;
		}
		const gradientStop = name.startsWith('from-')
			? 0
			: name.startsWith('via-')
				? 0.5
				: name.startsWith('to-')
					? 1
					: undefined;
		if (
			gradientStop !== undefined ||
			name.startsWith('bg-gradient')
		) {
			const stops = name.startsWith('bg-gradient')
				? [P, alpha(P, 0.08)]
				: ['#3b82f6', '#a855f7', '#ec4899'];
			const down = name === 'bg-gradient-to-b';
			const id = this.id();
			this.push(
				`<linearGradient id="${id}" x1="0" y1="0" x2="${down ? 0 : 1}" y2="${down ? 1 : 0}">${stops
					.map(
						(stop, index) =>
							`<stop offset="${n(index / (stops.length - 1))}" style="stop-color:${stop}"/>`,
					)
					.join('')}</linearGradient>`,
			);
			this.fill(c, `url(#${id})`, 2);
			this.stroke(c, frame, { radius: 2 });
			if (gradientStop !== undefined)
				this.push(
					`<circle cx="${n(c.x + c.w * gradientStop)}" cy="${n(maxY(c))}" r="4" style="fill:#fff;stroke:${ink};stroke-width:1.5"/>`,
				);
			return;
		}
		this.container();
		this.clip(roundedPath(c, 2), () => {
			switch (name) {
				case 'bg-cover':
					this.picture(
						rect(
							c.x,
							midY(c) - c.w / 2,
							c.w,
							c.w,
						),
					);
					break;
				case 'bg-contain':
					this.picture(
						rect(
							midX(c) - c.h / 2,
							c.y,
							c.h,
							c.h,
						),
					);
					break;
				case 'bg-center':
					this.picture(
						rect(
							midX(c) - 13,
							midY(c) - 13,
							26,
							26,
						),
					);
					break;
				case 'bg-no-repeat':
					this.picture(rect(c.x, c.y, 22, 22));
					break;
				case 'bg-repeat':
					for (let y = c.y; y < maxY(c); y += 22)
						for (
							let x = c.x;
							x < maxX(c);
							x += 22
						)
							this.picture(
								rect(
									x,
									y,
									22,
									22,
								),
							);
					break;
				case 'bg-fixed':
					this.picture(
						rect(
							c.x,
							midY(c) - c.w / 2,
							c.w,
							c.w,
						),
					);
					for (let index = 0; index < 4; index++)
						this.words(
							c.x + 6,
							c.y + 8 + index * 10,
							40,
							CARD,
						);
					break;
			}
		});
		this.stroke(c, frame, { radius: 2 });
	}

	border(item: CheatSheetItem) {
		const name = item.class;
		const box = inset(c, 6, 6);
		if (name.startsWith('rounded')) {
			const radius =
				name === 'rounded-full'
					? box.h / 2
					: (pixels(item.css) ?? 0) * 1.1;
			const d =
				name === 'rounded-t-lg'
					? topRoundedPath(box, 8.8)
					: roundedPath(
							box,
							Math.min(
								radius,
								box.h / 2,
							),
						);
			this.push(
				`<path d="${d}" style="fill:${dim};stroke:${lit};stroke-width:1.5"/>`,
			);
			return;
		}
		if (name.startsWith('divide-')) {
			this.container();
			const vertical = name === 'divide-y';
			for (const part of row(c, 3, 0, vertical).slice(1)) {
				const from = vertical
					? pt(c.x, part.y)
					: pt(part.x, c.y);
				const to = vertical
					? pt(maxX(c), part.y)
					: pt(part.x, maxY(c));
				this.line(from, to, lit, { width: 1.5 });
			}
			return;
		}
		this.fill(box, tint);
		switch (name) {
			case 'border-t':
			case 'border-r':
			case 'border-b':
			case 'border-l': {
				this.dashed(box);
				const ends: Record<string, [Point, Point]> = {
					'border-t': [
						pt(box.x, box.y),
						pt(maxX(box), box.y),
					],
					'border-r': [
						pt(maxX(box), box.y),
						pt(maxX(box), maxY(box)),
					],
					'border-b': [
						pt(box.x, maxY(box)),
						pt(maxX(box), maxY(box)),
					],
					'border-l': [
						pt(box.x, box.y),
						pt(box.x, maxY(box)),
					],
				};
				const [from, to] = ends[name]!;
				this.line(from, to, lit, {
					width: 2.4,
					round: false,
				});
				break;
			}
			case 'border-dashed':
				this.stroke(box, lit, {
					width: 2,
					dash: [5, 3],
				});
				break;
			case 'border-dotted':
				this.push(
					`<rect x="${n(box.x)}" y="${n(box.y)}" width="${n(box.w)}" height="${n(box.h)}" rx="1.2" style="fill:none;stroke:${lit};stroke-width:2" stroke-linecap="round" stroke-dasharray="0.01 4"/>`,
				);
				break;
			case 'border-none':
			case 'border-0':
				this.dashed(box);
				break;
			case 'border-solid':
				this.stroke(box, lit, { width: 2 });
				break;
			default: {
				const px = pixels(item.css) ?? 1;
				this.stroke(
					inset(box, px * 0.6, px * 0.6),
					lit,
					{ width: px * 1.2 },
				);
			}
		}
	}

	effect(item: CheatSheetItem) {
		const name = item.class;
		if (name.startsWith('shadow')) {
			const card = rect(22, 12, 44, 30);
			// shadows need light page
			this.fill(rect(6, 3, 76, 54), '#f5f5f5', 2);
			const numbers = [
				...item.css.matchAll(/(-?[\d.]+)(px)?/g),
			].map((m) => Number(m[1]));
			if (name === 'shadow-inner') {
				this.fill(card, '#fff', 3);
				this.clip(roundedPath(card, 3), () =>
					this.shadowed(2, 4, 0.25, () =>
						this.push(
							`<path d="${rectPath(inset(card, -20, -20))}${roundedPath(card, 3)}" fill-rule="evenodd" style="fill:#000"/>`,
						),
					),
				);
				this.stroke(card, 'rgb(0 0 0 / 8%)', {
					radius: 3,
				});
				return;
			}
			if (name !== 'shadow-none' && numbers.length >= 4) {
				// x y blur spread
				const dy = numbers[1]!;
				const blur = numbers[2]!;
				const spread = numbers[3]!;
				const opacity = numbers.at(-1) ?? 0.1;
				this.shadowed(
					dy * 0.5,
					blur * 0.5,
					Math.min(0.6, opacity * 3),
					() =>
						this.fill(
							inset(
								card,
								-spread * 0.5,
								-spread * 0.5,
							),
							'#fff',
							3,
						),
				);
			}
			this.fill(card, '#fff', 3);
			this.stroke(card, 'rgb(0 0 0 / 8%)', { radius: 3 });
			return;
		}
		if (name.startsWith('opacity-')) {
			this.checker(c);
			this.fill(
				inset(c, 10, 8),
				alpha(P, number(name) / 100),
			);
			this.stroke(inset(c, 10, 8), frame, { dash: [2, 2] });
			return;
		}
		if (name.startsWith('blur')) {
			this.blurred((pixels(item.css) ?? 0) * 0.5, () => {
				this.push(
					`<circle cx="35" cy="27" r="13" style="fill:${lit}"/>`,
				);
				this.fill(rect(42, 22, 24, 20), lit, 0);
			});
			return;
		}
		const stripes = () => {
			for (let index = 0; index < 7; index++)
				this.fill(
					rect(10 + index * 10, 8, 5, 44),
					lit,
					0,
				);
		};
		stripes();
		const panel = rect(20, 18, 48, 24);
		this.clip(roundedPath(panel, 3), () => {
			this.fill(panel, CARD, 0);
			this.blurred(
				name === 'backdrop-blur-sm' ? 2 : 4,
				stripes,
			);
			this.fill(panel, alpha(CARD, 0.35), 0);
		});
		this.stroke(panel, frame, { radius: 3 });
	}

	transition(name: string) {
		switch (name) {
			case 'animate-spin':
				if (!this.omitsMotion) this.push(spinArc());
				return;
			case 'animate-ping':
				if (this.omitsMotion) return;
				for (const [radius, share] of [
					[18, 0.2],
					[12, 0.4],
				] as const)
					this.push(
						`<circle cx="44" cy="30" r="${radius}" style="fill:none;stroke:${alpha(P, share)};stroke-width:1.5"/>`,
					);
				this.fill(rect(38, 24, 12, 12), lit, 6);
				return;
			case 'animate-pulse':
				if (this.omitsMotion) return;
				[1, 0.5, 1].forEach((share, index) =>
					this.fill(
						rect(
							14 + index * 22,
							20,
							16,
							20,
						),
						alpha(P, share),
						2,
					),
				);
				return;
			case 'animate-bounce':
				this.line(pt(20, 50), pt(68, 50), faint, {
					width: 1.2,
				});
				if (this.omitsMotion) return;
				this.push(
					`<path d="M24 44Q34 4 44 44Q54 4 64 44" style="fill:none;stroke:${faint};stroke-width:0.8" stroke-dasharray="2 2"/>`,
				);
				this.fill(rect(38, 14, 12, 12), lit, 6);
				return;
		}
		const curve = easing[name];
		if (curve) {
			this.plot(curve);
			return;
		}
		const { from, to } = TRACK;
		const x = (ms: number) => from.x + ((to.x - from.x) * ms) / 500;
		for (let ms = 0; ms <= 500; ms += 100)
			this.line(pt(x(ms), 42), pt(x(ms), 45), faint);
		this.line(pt(from.x, 42), pt(to.x, 42), faint);
		const label = (ms: number) =>
			this.text(
				`${ms}ms`,
				7,
				pt(
					Math.min(
						to.x - 8,
						Math.max(from.x + 8, x(ms)),
					),
					51,
				),
				{
					family: 'var(--canon-mono-font)',
					colour: lit,
				},
			);
		if (name.startsWith('duration-')) {
			const ms = number(name);
			this.fill(rect(from.x, 14, x(ms) - from.x, 8), lit);
			label(ms);
		} else if (name.startsWith('delay-')) {
			const ms = number(name);
			this.line(pt(from.x, 18), pt(x(ms), 18), faint, {
				width: 1.2,
				dash: [2, 2],
			});
			this.fill(rect(x(ms), 14, x(ms + 150) - x(ms), 8), lit);
			label(ms);
		} else {
			// tailwind default: 150 ms
			const ms = name === 'transition-none' ? 0 : 150;
			if (ms > 0)
				this.fill(
					rect(from.x, 14, x(ms) - from.x, 8),
					dim,
				);
			label(ms);
			const start = rect(18, 26, 10, 10);
			const end = rect(60, 26, 10, 10);
			switch (name) {
				case 'transition-colors':
					this.fill(start, dim);
					this.fill(end, lit);
					break;
				case 'transition-opacity':
					this.fill(start, lit);
					this.fill(end, alpha(P, 0.15));
					this.stroke(end, frame, {
						dash: [2, 2],
					});
					break;
				case 'transition-transform':
					this.dashed(start);
					this.fill(
						rect(-5, -5, 10, 10),
						lit,
						1.2,
						` transform="translate(${n(midX(end))} ${n(midY(end))}) rotate(45)"`,
					);
					break;
				default:
					this.fill(start, dim);
					this.fill(inset(end, -2, -2), lit);
			}
			this.line(pt(32, 31), pt(54, 31), faint, {
				width: 1,
				dash:
					name === 'transition-none'
						? [2, 2]
						: undefined,
			});
		}
		if (!this.omitsMotion && !name.startsWith('transition'))
			this.fill(rect(from.x - 3, from.y - 3, 6, 6), lit, 3);
	}

	/** An easing curve over time, time along the bottom. */
	plot(curve: Curve) {
		const box = PLOT;
		this.line(pt(box.x, box.y), pt(box.x, maxY(box)), faint);
		this.line(
			pt(box.x, maxY(box)),
			pt(maxX(box), maxY(box)),
			faint,
		);
		this.line(pt(box.x, maxY(box)), pt(maxX(box), box.y), faint, {
			width: 0.6,
			dash: [2, 2],
		});
		const [x1, y1, x2, y2] = curve;
		this.push(
			`<path d="M${n(box.x)} ${n(maxY(box))}C${n(box.x + box.w * x1)} ${n(maxY(box) - box.h * y1)} ${n(box.x + box.w * x2)} ${n(maxY(box) - box.h * y2)} ${n(maxX(box))} ${n(box.y)}" style="fill:none;stroke:${lit};stroke-width:2" stroke-linecap="round"/>`,
		);
	}

	transformed(name: string) {
		const t = transformOf(name);
		if (!t) return this.container();
		const { box, anchor, to } = t;
		this.dashed(box);
		if (!this.omitsMotion) {
			this.push(
				`<g transform="translate(${n(anchor.x)} ${n(anchor.y)}) matrix(${to.map(n).join(' ')}) translate(${n(-anchor.x)} ${n(-anchor.y)})">`,
			);
			this.fill(box, alpha(P, 0.9));
			this.fill(corner(box), PF, 1.3);
			this.push('</g>');
		}
		if (name.startsWith('origin-'))
			this.fill(
				rect(anchor.x - 2.5, anchor.y - 2.5, 5, 5),
				ink,
				2.5,
			);
	}

	interactivity(name: string) {
		const cursors: Record<string, string> = {
			'cursor-pointer': pointer,
			'cursor-default': mousePointer,
			'cursor-not-allowed': ban,
			'cursor-wait': hourglass,
			'cursor-grab': handGrab,
		};
		const cursor = cursors[name];
		if (cursor) {
			this.symbol(
				cursor,
				26,
				pt(44, 30),
				name === 'cursor-not-allowed'
					? 'var(--canon-destructive)'
					: ink,
			);
			return;
		}
		switch (name) {
			case 'pointer-events-none':
			case 'pointer-events-auto': {
				const below = rect(16, 18, 40, 30);
				const above = rect(32, 10, 40, 30);
				const passes = name === 'pointer-events-none';
				this.fill(below, passes ? lit : dim);
				if (passes) this.dashed(above);
				else this.fill(above, lit);
				this.symbol(mousePointer, 12, pt(46, 36), ink);
				break;
			}
			case 'select-none':
			case 'select-text':
			case 'select-all':
				for (let index = 0; index < 3; index++) {
					const y = 18 + index * 10;
					if (name === 'select-all')
						this.fill(
							rect(14, y - 4, 60, 8),
							tint,
							0,
						);
					if (
						name === 'select-text' &&
						index === 1
					)
						this.fill(
							rect(26, y - 4, 30, 8),
							tint,
							0,
						);
					this.words(
						14,
						y,
						index === 2 ? 40 : 60,
						alpha(F, 0.6),
					);
				}
				if (name === 'select-none')
					this.symbol(ban, 12, pt(70, 46), faint);
				break;
			case 'resize':
			case 'resize-none':
			case 'resize-x':
			case 'resize-y': {
				const box = rect(14, 10, 52, 36);
				this.container(box);
				if (name !== 'resize-none')
					for (const offset of [4, 8])
						this.line(
							pt(
								maxX(box) -
									offset,
								maxY(box) - 1.5,
							),
							pt(
								maxX(box) - 1.5,
								maxY(box) -
									offset,
							),
							ink,
							{ width: 1 },
						);
				const arrows: Record<string, string> = {
					'resize-x': moveHorizontal,
					'resize-y': moveVertical,
					resize: moveDiagonal,
				};
				this.symbol(
					arrows[name] ?? lock,
					10,
					pt(maxX(box) + 8, maxY(box) + 6),
					name === 'resize-none' ? faint : lit,
				);
				break;
			}
			case 'scroll-smooth':
			case 'scroll-auto': {
				const track = rect(56, 8, 4, 44);
				this.fill(track, well, 2);
				const positions =
					name === 'scroll-smooth'
						? [
								0, 0.04, 0.14,
								0.3, 0.52, 0.72,
								0.86, 0.95, 1,
							]
						: [0, 1];
				positions.forEach((share, index) => {
					const y =
						track.y +
						4 +
						(track.h - 8) * share;
					this.fill(
						rect(27, y - 3, 6, 6),
						index === positions.length - 1
							? lit
							: dim,
						3,
					);
				});
				this.fill(
					rect(track.x, maxY(track) - 12, 4, 12),
					lit,
					2,
				);
				if (name === 'scroll-auto')
					this.line(
						pt(30, 16),
						pt(30, 44),
						faint,
						{ width: 0.8, dash: [2, 3] },
					);
				break;
			}
			default:
				this.container();
		}
	}

	button(r: Rect, colour: string) {
		this.fill(r, colour, 3);
		this.words(r.x + 8, midY(r), r.w - 16, alpha(PF, 0.8));
	}

	state(name: string) {
		const pill = rect(22, 20, 44, 20);
		switch (name) {
			case 'hover:':
				this.button(pill, lit);
				this.symbol(
					mousePointer,
					13,
					pt(maxX(pill) - 4, maxY(pill) + 3),
					ink,
				);
				break;
			case 'focus:':
			case 'focus-visible:':
				this.button(pill, dim);
				this.stroke(inset(pill, -3, -3), lit, {
					width: 1.8,
					radius: 5,
				});
				if (name === 'focus-visible:')
					this.symbol(
						keyboard,
						10,
						pt(44, 51),
						lit,
					);
				break;
			case 'active:':
				this.button(
					inset(pill, 2, 1.5),
					alpha(P, 0.75),
				);
				break;
			case 'disabled:':
				this.button(pill, alpha(P, 0.25));
				break;
			case 'first:':
			case 'last:':
			case 'odd:':
			case 'even:':
				row(inset(c, 10, 3), 4, 2, true).forEach(
					(band, index) => {
						const on =
							name === 'first:'
								? index === 0
								: name ===
									  'last:'
									? index ===
										3
									: name ===
										  'odd:'
										? index %
												2 ===
											0
										: index %
												2 ===
											1;
						this.fill(
							band,
							on
								? lit
								: alpha(P, 0.2),
						);
					},
				);
				break;
			case 'group-hover:': {
				const parent = rect(14, 10, 60, 40);
				this.fill(parent, tint, 3);
				this.stroke(parent, lit, { radius: 3 });
				this.fill(rect(20, 16, 20, 28), lit, 2);
				this.words(46, 22, 22);
				this.words(46, 30, 16);
				this.symbol(mousePointer, 12, pt(62, 42), ink);
				break;
			}
			case 'peer-focus:': {
				const input = rect(12, 20, 32, 20);
				this.fill(input, CARD, 2);
				this.stroke(inset(input, -2.5, -2.5), lit, {
					width: 1.6,
					radius: 4,
				});
				this.line(
					pt(input.x + 5, input.y + 5),
					pt(input.x + 5, maxY(input) - 5),
					lit,
					{ width: 1 },
				);
				this.fill(rect(52, 20, 24, 20), lit, 2);
				break;
			}
			case 'dark:': {
				const left = rect(12, 12, 32, 36);
				const right = rect(44, 12, 32, 36);
				this.fill(left, '#fff', 0);
				this.fill(right, '#1a1a1a', 0);
				for (let index = 0; index < 3; index++) {
					this.words(
						left.x + 5,
						left.y + 10 + index * 8,
						20,
						'#333',
					);
					this.words(
						right.x + 5,
						right.y + 10 + index * 8,
						20,
						'#d9d9d9',
					);
				}
				this.stroke(right, lit, {
					width: 1.6,
					radius: 0,
				});
				this.stroke(union(left, right), frame, {
					radius: 0,
				});
				break;
			}
			case 'motion-safe:':
			case 'motion-reduce:': {
				const safe = name === 'motion-safe:';
				for (let index = 0; index < 5; index++) {
					const x = 18 + index * 12;
					if (safe || index === 4)
						this.fill(
							rect(x - 4, 26, 8, 8),
							alpha(
								P,
								safe
									? 0.2 +
											0.2 *
												index
									: 1,
							),
							4,
						);
				}
				if (!safe)
					this.line(
						pt(18, 30),
						pt(60, 30),
						faint,
						{ width: 1, dash: [2, 3] },
					);
				break;
			}
			default:
				this.button(pill, lit);
		}
	}

	overflow(name: string) {
		if (name.startsWith('z-') || name.startsWith('-z-')) {
			const z =
				name === 'z-auto'
					? 0
					: number(name) *
						(name.startsWith('-') ? -1 : 1);
			const a = rect(14, 8, 30, 24);
			const b = rect(44, 8, 30, 24);
			const mine = rect(29, 20, 30, 30);
			const draw = (r: Rect, colour: string) => {
				this.fill(r, CARD, 2);
				this.fill(r, colour, 2);
				this.stroke(r, CARD, { width: 1.2, radius: 2 });
			};
			if (z < 0) {
				draw(mine, lit);
				const sheet = rect(8, 14, 72, 34);
				this.fill(
					sheet,
					alpha('var(--canon-muted)', 0.9),
					2,
				);
				this.stroke(sheet, frame, { radius: 2 });
				draw(a, dim);
				draw(b, dim);
				return;
			}
			// ties: later element wins
			[
				{ level: 10, r: a, colour: dim },
				{ level: 30, r: b, colour: dim },
				{ level: z, r: mine, colour: lit },
			]
				.map((plane, index) => ({ ...plane, index }))
				.sort(
					(p, q) =>
						p.level - q.level ||
						p.index - q.index,
				)
				.forEach((plane) =>
					draw(plane.r, plane.colour),
				);
			return;
		}
		const visible = name === 'overflow-visible';
		const horizontal = name.includes('-x-');
		const box = rect(18, 8, 52, visible ? 30 : 44);
		this.container(box);
		const lines = () => {
			for (let index = 0; index < 6; index++)
				this.words(
					box.x + 5,
					box.y + 6 + index * 8,
					horizontal ? 70 : 38,
					index < 3 || visible ? lit : dim,
				);
		};
		if (visible) lines();
		else this.clip(rectPath(box), lines);
		if (name.endsWith('auto') || name === 'overflow-scroll') {
			if (name === 'overflow-scroll')
				this.fill(
					rect(
						maxX(box) - 5,
						box.y + 2,
						3,
						box.h - 4,
					),
					alpha('var(--canon-muted)', 0.6),
					1.5,
				);
			if (horizontal)
				this.fill(
					rect(box.x + 3, maxY(box) - 4, 22, 2.5),
					alpha(F, 0.5),
					1.2,
				);
			else
				this.fill(
					rect(maxX(box) - 5, box.y + 3, 3, 16),
					alpha(F, 0.5),
					1.5,
				);
		}
	}

	arbitrary(name: string) {
		switch (name) {
			case 'text-[#1da1f2]':
				this.text('Aa', 30, pt(44, 30), {
					colour: '#1da1f2',
				});
				break;
			case 'grid-cols-[1fr_2fr]':
				this.container();
				for (const band of row(
					inset(c, 3, 3),
					2,
					2,
					true,
				)) {
					const first = (band.w - 2) / 3;
					this.fill(
						rect(
							band.x,
							band.y,
							first,
							band.h,
						),
						dim,
					);
					this.fill(
						rect(
							band.x + first + 2,
							band.y,
							band.w - first - 2,
							band.h,
						),
						lit,
					);
				}
				break;
			default: {
				this.container();
				const box = inset(c, 4, 0);
				this.fill(
					rect(
						box.x,
						midY(c) - 8,
						(box.w * 200) / 256,
						16,
					),
					lit,
				);
			}
		}
	}
}

/** `count` boxes along an axis inside `r`, `gap` apart. */
function row(r: Rect, count: number, gap = 3, vertical = false): Rect[] {
	const length = ((vertical ? r.h : r.w) - gap * (count - 1)) / count;
	return Array.from({ length: count }, (_, index) => {
		const offset = index * (length + gap);
		return vertical
			? rect(r.x, r.y + offset, r.w, length)
			: rect(r.x + offset, r.y, length, r.h);
	});
}

function rectPath(r: Rect) {
	return `M${n(r.x)} ${n(r.y)}H${n(maxX(r))}V${n(maxY(r))}H${n(r.x)}Z`;
}

function roundedPath(r: Rect, radius: number) {
	const k = Math.min(radius, r.w / 2, r.h / 2);
	return `M${n(r.x + k)} ${n(r.y)}H${n(maxX(r) - k)}A${n(k)} ${n(k)} 0 0 1 ${n(maxX(r))} ${n(r.y + k)}V${n(maxY(r) - k)}A${n(k)} ${n(k)} 0 0 1 ${n(maxX(r) - k)} ${n(maxY(r))}H${n(r.x + k)}A${n(k)} ${n(k)} 0 0 1 ${n(r.x)} ${n(maxY(r) - k)}V${n(r.y + k)}A${n(k)} ${n(k)} 0 0 1 ${n(r.x + k)} ${n(r.y)}Z`;
}

function topRoundedPath(r: Rect, radius: number) {
	const k = Math.min(radius, r.w / 2, r.h);
	return `M${n(r.x)} ${n(maxY(r))}V${n(r.y + k)}A${n(k)} ${n(k)} 0 0 1 ${n(r.x + k)} ${n(r.y)}H${n(maxX(r) - k)}A${n(k)} ${n(k)} 0 0 1 ${n(maxX(r))} ${n(r.y + k)}V${n(maxY(r))}Z`;
}

function spinArc() {
	// -90 deg to 216 deg, clockwise, radius 16 about the centre
	const end = (216 * Math.PI) / 180;
	return `<path d="M44 14A16 16 0 1 1 ${n(44 + 16 * Math.cos(end))} ${n(30 + 16 * Math.sin(end))}" style="fill:none;stroke:${lit};stroke-width:3" stroke-linecap="round"/>`;
}

/** The specimen's SVG body (no outer element), drawn in the design box. */
export function specimen(
	item: CheatSheetItem,
	category: string,
	omitsMotion = false,
): string {
	const painter = new Painter(
		omitsMotion && motionOf(item.class, category) !== undefined,
	);
	painter.paint(item, category);
	return painter.out.join('');
}

/** The moving part of a stage specimen, each animated element tagged with `data-tw-move`. */
export function motionMarkup(motion: Motion): string {
	const centre = pt(44, 30);
	const dot = (x: number, y: number, r: number) =>
		`<circle cx="${n(x)}" cy="${n(y)}" r="${n(r)}" style="fill:${lit}"/>`;
	switch (motion.kind) {
		case 'transform': {
			const { box, anchor } = motion;
			return `<path data-tw-move="transform" d="${rectPath(box)}${roundedPath(corner(box), 1.3)}" fill-rule="evenodd" style="fill:${lit};opacity:0.9;transform-box:view-box;transform-origin:${n(anchor.x)}px ${n(anchor.y)}px"/>`;
		}
		case 'spin':
			return `<g data-tw-move="spin" style="transform-box:view-box;transform-origin:44px 30px">${spinArc()}</g>`;
		case 'ping':
			return `${dot(centre.x, centre.y, 6)}<g data-tw-move="ping" style="transform-box:view-box;transform-origin:44px 30px">${dot(centre.x, centre.y, 6)}</g>`;
		case 'pulse':
			return `<rect data-tw-move="pulse" x="24" y="16" width="40" height="28" rx="3" style="fill:${lit}"/>`;
		case 'bounce':
			return `<g data-tw-move="bounce">${dot(centre.x, 44, 6)}</g>`;
		case 'timing':
			return `<g data-tw-move="timing">${dot(TRACK.from.x, TRACK.from.y, 3)}</g>`;
		case 'curve':
			return `<g data-tw-move="across"><g data-tw-move="up">${dot(PLOT.x, maxY(PLOT), 3.5)}</g></g>`;
	}
}

const affine = (t: Affine) => `matrix(${t.map(n).join(', ')})`;

/** Keyframes for each `data-tw-move` element of `motionMarkup`, after the iOS layer animations. */
export function motionFrames(
	motion: Motion,
	move: string,
): { keyframes: Keyframe[]; options: KeyframeAnimationOptions } | undefined {
	const infinite = { iterations: Infinity };
	switch (motion.kind) {
		case 'transform': {
			const end = affine(motion.to);
			return {
				keyframes: [
					{ transform: 'none', offset: 0 },
					{
						transform: 'none',
						offset: 0.2,
						easing: 'cubic-bezier(0.2, 0.9, 0.3, 1.1)',
					},
					{ transform: end, offset: 0.46 },
					{
						transform: end,
						offset: 0.84,
						easing: 'ease-in-out',
					},
					{ transform: 'none', offset: 1 },
				],
				options: { duration: 2800, ...infinite },
			};
		}
		case 'spin':
			return {
				keyframes: [
					{ transform: 'rotate(0turn)' },
					{ transform: 'rotate(1turn)' },
				],
				options: { duration: 1000, ...infinite },
			};
		case 'ping':
			return {
				keyframes: [
					{
						transform: 'scale(1)',
						opacity: 1,
						offset: 0,
					},
					{
						transform: 'scale(2)',
						opacity: 0,
						offset: 0.75,
					},
					{
						transform: 'scale(2)',
						opacity: 0,
						offset: 1,
					},
				],
				options: {
					duration: 1000,
					easing: 'cubic-bezier(0, 0, 0.2, 1)',
					...infinite,
				},
			};
		case 'pulse':
			return {
				keyframes: [
					{ opacity: 1 },
					{ opacity: 0.5 },
					{ opacity: 1 },
				],
				options: {
					duration: 2000,
					easing: 'cubic-bezier(0.4, 0, 0.6, 1)',
					...infinite,
				},
			};
		case 'bounce':
			return {
				keyframes: [
					{
						transform: 'translateY(-26px)',
						easing: 'cubic-bezier(0.8, 0, 1, 1)',
					},
					{
						transform: 'translateY(0)',
						easing: 'cubic-bezier(0, 0, 0.2, 1)',
					},
					{ transform: 'translateY(-26px)' },
				],
				options: { duration: 1000, ...infinite },
			};
		case 'timing': {
			const period = Math.max(
				1.2,
				motion.delay + motion.duration + 0.9,
			);
			const distance = TRACK.to.x - TRACK.from.x;
			return {
				keyframes: [
					{
						transform: 'translateX(0)',
						offset: 0,
					},
					{
						transform: 'translateX(0)',
						offset: motion.delay / period,
						easing: `cubic-bezier(${standard.join(', ')})`,
					},
					{
						transform: `translateX(${distance}px)`,
						offset:
							(motion.delay +
								motion.duration) /
							period,
					},
					{
						transform: `translateX(${distance}px)`,
						offset: 1,
					},
				],
				options: {
					duration: period * 1000,
					...infinite,
				},
			};
		}
		case 'curve': {
			const period = 1.8;
			const at = 1 / period;
			if (move === 'across')
				return {
					keyframes: [
						{
							transform: 'translateX(0)',
							offset: 0,
						},
						{
							transform: `translateX(${PLOT.w}px)`,
							offset: at,
						},
						{
							transform: `translateX(${PLOT.w}px)`,
							offset: 1,
						},
					],
					options: {
						duration: period * 1000,
						...infinite,
					},
				};
			return {
				keyframes: [
					{
						transform: 'translateY(0)',
						offset: 0,
						easing: `cubic-bezier(${motion.curve.join(', ')})`,
					},
					{
						transform: `translateY(${-PLOT.h}px)`,
						offset: at,
					},
					{
						transform: `translateY(${-PLOT.h}px)`,
						offset: 1,
					},
				],
				options: {
					duration: period * 1000,
					...infinite,
				},
			};
		}
	}
}
