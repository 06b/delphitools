// web canvas-size-modal PRESETS, as iOS CanvasPreset keeps them
export const CANVAS_PRESETS = [
	{ width: 2000, height: 1500 },
	{ width: 1080, height: 1080 },
	{ width: 1080, height: 1920 },
	{ width: 1920, height: 1080 },
	{ width: 1200, height: 630 },
	{ width: 1600, height: 900 },
] as const;

const SIDE_MAX = 20_000;

export function presetLabel(p: { width: number; height: number }): string {
	return `${p.width} × ${p.height}`;
}

// -1 selects no segment
export function presetIndex(width: number, height: number): number {
	return CANVAS_PRESETS.findIndex(
		(p) => p.width === width && p.height === height,
	);
}

// whole pixels from 1 to 20 000
export function clampSide(side: number): number {
	if (!Number.isFinite(side)) return 1;
	return Math.min(Math.max(Math.round(side), 1), SIDE_MAX);
}

export const EXPORT_PRESET_SCALES = [0.5, 1, 2] as const;
export const CUSTOM_SCALE = { min: 0.1, max: 8, start: 1.5 } as const;

export function scaleLabel(scale: number, locale?: string): string {
	return `${scale.toLocaleString(locale)}×`;
}

// iOS ExportSheet.byteFigure: decimal units as Finder shows sizes, one
// decimal below 100 except for bytes
export function byteFigure(bytes: number, locale?: string): [string, string] {
	const units = ['B', 'KB', 'MB', 'GB'];
	let value = bytes;
	let unit = 0;
	while (value >= 1000 && unit < units.length - 1) {
		value /= 1000;
		unit += 1;
	}
	const digits = unit === 0 || value >= 100 ? 0 : 1;
	return [
		value.toLocaleString(locale, {
			minimumFractionDigits: digits,
			maximumFractionDigits: digits,
			useGrouping: false,
		}),
		units[unit]!,
	];
}
