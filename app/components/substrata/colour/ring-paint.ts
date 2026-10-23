import { icons } from 'delphitools-v2/lib/icons';
import type {
	Cell,
	RingGeometry,
} from 'delphitools-v2/lib/substrata/colour-ring/geometry';

export interface RingTheme {
	primary: string;
	primaryForeground: string;
	card: string;
	foreground: string;
	mutedForeground: string;
	muted: string;
	border: string;
	font: string;
	mono: string;
}

export function readTheme(element: Element): RingTheme {
	const style = getComputedStyle(element);
	const token = (name: string, fallback: string) =>
		style.getPropertyValue(name).trim() || fallback;
	return {
		primary: token('--canon-primary', '#1e6626'),
		primaryForeground: token(
			'--canon-primary-foreground',
			'#ffffff',
		),
		card: token('--canon-card', '#fbf8f0'),
		foreground: token('--canon-foreground', '#000000'),
		mutedForeground: token('--canon-muted-foreground', '#555555'),
		muted: token('--canon-muted', '#eee8da'),
		border: token('--canon-border', '#cccccc'),
		font: token('--canon-font', 'sans-serif'),
		mono: token('--canon-mono-font', 'monospace'),
	};
}

export type Run = 'centred' | 'outward' | 'inward';

// iOS text styles at 1 pt = 1 px
export const FONT = {
	code: (t: RingTheme) => `500 8px ${t.mono}`,
	heading: (t: RingTheme) => `600 11px ${t.font}`,
	credit: (t: RingTheme) => `500 12px ${t.font}`,
	caption: (t: RingTheme) => `600 12px ${t.font}`,
	footnote: (t: RingTheme, weight = 600) => `${weight} 13px ${t.font}`,
	subheadline: (t: RingTheme) => `600 15px ${t.font}`,
	figure: (t: RingTheme) => `500 12px ${t.mono}`,
	hex: (t: RingTheme) => `500 11px ${t.mono}`,
};

/** iOS ColourRingView's drawing primitives on a 2D canvas, in CSS pixels */
export class RingPaint {
	#widths = new Map<string, number>();
	#symbols = new Map<string, HTMLImageElement>();
	#checks: CanvasPattern | null = null;

	constructor(
		readonly ctx: CanvasRenderingContext2D,
		public geometry: RingGeometry,
		public theme: RingTheme,
		readonly redraw: () => void,
	) {}

	setTheme(theme: RingTheme): void {
		this.theme = theme;
		this.#symbols.clear();
		this.#checks = null;
	}

	width(text: string, font: string): number {
		const key = `${font}|${text}`;
		let w = this.#widths.get(key);
		if (w === undefined) {
			this.ctx.font = font;
			w = this.ctx.measureText(text).width;
			this.#widths.set(key, w);
		}
		return w;
	}

	forgetWidths(): void {
		this.#widths.clear();
	}

	sector(inner: number, outer: number, start: number, end: number): void {
		const { ctx, geometry } = this;
		const a = geometry.radians(start);
		const b = geometry.radians(end);
		const low = Math.min(a, b);
		const high = Math.max(a, b);
		const { x, y } = geometry.hub;
		ctx.beginPath();
		ctx.arc(x, y, outer, low, high, false);
		ctx.arc(x, y, Math.max(0, inner), high, low, true);
		ctx.closePath();
	}

	#text(
		text: string,
		x: number,
		y: number,
		font: string,
		colour: string,
		halo: boolean,
	): void {
		const { ctx } = this;
		ctx.font = font;
		ctx.textBaseline = 'middle';
		ctx.textAlign = 'left';
		if (halo) {
			// NSAttributedString stroke width 30: 30 % of the point size
			ctx.strokeStyle = this.theme.muted;
			ctx.lineWidth =
				parseFloat(
					/(\d+(\.\d+)?)px/.exec(font)?.[1] ??
						'12',
				) * 0.3;
			ctx.lineJoin = 'round';
			ctx.strokeText(text, x, y);
		}
		ctx.fillStyle = colour;
		ctx.fillText(text, x, y);
	}

	/** text along the radius at `radius`, reading away from the hub on either side of the disc */
	radialText(
		text: string,
		radius: number,
		angle: number,
		font: string,
		colour: string,
		run: Run = 'centred',
		halo = false,
	): void {
		const { ctx, geometry } = this;
		const t = geometry.radians(angle);
		const flip = Math.cos(t) < 0;
		const w = this.width(text, font);
		const x =
			run === 'centred'
				? -w / 2
				: (run === 'outward') !== flip
					? 0
					: -w;
		ctx.save();
		ctx.translate(geometry.hub.x, geometry.hub.y);
		ctx.rotate(flip ? t + Math.PI : t);
		ctx.translate(flip ? -radius : radius, 0);
		this.#text(text, x, 0, font, colour, halo);
		ctx.restore();
	}

	/** text along the arc at `radius`, centred on `angle`, its baseline on the arc and its tops away from the hub */
	arcText(
		text: string,
		radius: number,
		angle: number,
		font: string,
		colour: string,
	): void {
		const { ctx, geometry } = this;
		const glyphs = [...text].map(
			(g) => [g, this.width(g, font)] as const,
		);
		let along = -glyphs.reduce((sum, [, w]) => sum + w, 0) / 2;
		ctx.font = font;
		ctx.fillStyle = colour;
		ctx.textBaseline = 'alphabetic';
		ctx.textAlign = 'center';
		for (const [glyph, w] of glyphs) {
			const t =
				geometry.radians(angle) +
				(along + w / 2) / radius;
			ctx.save();
			ctx.translate(
				geometry.hub.x + Math.cos(t) * radius,
				geometry.hub.y + Math.sin(t) * radius,
			);
			ctx.rotate(t + Math.PI / 2);
			ctx.fillText(glyph, 0, -3);
			ctx.restore();
			along += w;
		}
	}

	/** text across the radius, upright as far as the angle allows */
	tangentText(
		text: string,
		radius: number,
		angle: number,
		font: string,
		colour: string,
		halo = false,
	): void {
		const { ctx, geometry } = this;
		const t = geometry.radians(angle);
		const p = geometry.point(radius, angle);
		let turn = t + Math.PI / 2;
		if (Math.cos(turn) < 0) turn += Math.PI;
		const w = this.width(text, font);
		ctx.save();
		ctx.translate(p.x, p.y);
		ctx.rotate(turn);
		this.#text(text, -w / 2, 0, font, colour, halo);
		ctx.restore();
	}

	/** 4 px inside the swatch's edge, clear of the picked swatch's outline */
	swatch(
		fill: string,
		ink: string,
		cell: Cell,
		picked: boolean,
		label: string | null,
		starred: boolean,
	): void {
		const { ctx } = this;
		this.sector(
			cell.inner + 1,
			cell.outer - 1,
			cell.start + 0.25,
			cell.end - 0.25,
		);
		ctx.fillStyle = fill;
		ctx.fill();
		if (picked) {
			ctx.strokeStyle = ink;
			ctx.lineWidth = 2.5;
			ctx.stroke();
		}
		const across =
			(((cell.inner + cell.outer) / 2) *
				(cell.end - cell.start) *
				Math.PI) /
			180;
		const text =
			label && across >= 18
				? starred
					? `★ ${label}`
					: label
				: starred
					? '★'
					: null;
		if (!text) return;
		const inset = ((6 / cell.outer) * 180) / Math.PI;
		this.radialText(
			text,
			cell.outer - 4,
			cell.end - 0.25 - inset,
			FONT.code(this.theme),
			ink,
			'inward',
		);
	}

	checks(): CanvasPattern | null {
		if (this.#checks) return this.#checks;
		const tile = document.createElement('canvas');
		tile.width = 16;
		tile.height = 16;
		const t = tile.getContext('2d');
		if (!t) return null;
		t.fillStyle = this.theme.card;
		t.fillRect(0, 0, 16, 16);
		t.fillStyle = this.theme.muted;
		t.fillRect(8, 0, 8, 8);
		t.fillRect(0, 8, 8, 8);
		this.#checks = this.ctx.createPattern(tile, 'repeat');
		return this.#checks;
	}

	/** a lucide icon tinted, drawn once loaded */
	symbol(
		name: string,
		colour: string,
		fill = false,
	): HTMLImageElement | null {
		const key = `${name}|${colour}|${fill}`;
		const known = this.#symbols.get(key);
		if (known) return known.complete ? known : null;
		const svg = (icons[name] ?? '')
			.replace(/currentColor/g, colour)
			.replace(
				/fill="none"/,
				fill ? `fill="${colour}"` : 'fill="none"',
			)
			.replace(/stroke-width="2"/, 'stroke-width="2.25"');
		const image = new Image();
		image.onload = () => this.redraw();
		image.src = `data:image/svg+xml,${encodeURIComponent(svg)}`;
		this.#symbols.set(key, image);
		return null;
	}
}
