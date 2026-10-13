import { parseHex, type Rgb } from 'delphicanon/lib/colour';
import { readColour } from 'delphitools-v2/components/tools/colour-atlas/atlas';
import {
	MATRICES,
	type SimulationType,
} from 'delphitools-v2/lib/colour-vision';

export interface VisionType {
	type: SimulationType;
	name: string;
	/** iOS ColourBlindnessType.shortDescription. */
	short: string;
	/** The web tool's badge; none for normal vision. */
	severity?: 'Partial' | 'Full';
}

export const visionTypes: VisionType[] = [
	{ type: 'normal', name: 'Normal Vision', short: 'Full colour vision' },
	{
		type: 'protanopia',
		name: 'Protanopia',
		short: 'Red-blind (~1% AMAB)',
		severity: 'Full',
	},
	{
		type: 'deuteranopia',
		name: 'Deuteranopia',
		short: 'Green-blind (~1% AMAB)',
		severity: 'Full',
	},
	{
		type: 'tritanopia',
		name: 'Tritanopia',
		short: 'Blue-blind (~0.003%)',
		severity: 'Full',
	},
	{
		type: 'protanomaly',
		name: 'Protanomaly',
		short: 'Red-weak (~1% AMAB)',
		severity: 'Partial',
	},
	{
		type: 'deuteranomaly',
		name: 'Deuteranomaly',
		short: 'Green-weak (~5% AMAB)',
		severity: 'Partial',
	},
	{
		type: 'tritanomaly',
		name: 'Tritanomaly',
		short: 'Blue-weak (~0.01%)',
		severity: 'Partial',
	},
	{
		type: 'achromatopsia',
		name: 'Achromatopsia',
		short: 'Total colour blindness (~0.003%)',
		severity: 'Full',
	},
	{
		type: 'achromatomaly',
		name: 'Achromatomaly',
		short: 'Partial colour blindness (very rare)',
		severity: 'Partial',
	},
];

/** RGBA pixels through a vision matrix, rounded half up as the web tool; alpha kept. */
export function simulatePixels(
	pixels: Uint8ClampedArray,
	type: SimulationType,
): Uint8ClampedArray<ArrayBuffer> {
	const [[a, b, c], [d, e, f], [g, h, i]] = MATRICES[type];
	const out = new Uint8ClampedArray(pixels.length);
	for (let p = 0; p < pixels.length; p += 4) {
		const r = pixels[p]!;
		const gr = pixels[p + 1]!;
		const bl = pixels[p + 2]!;
		out[p] = Math.round(a * r + b * gr + c * bl);
		out[p + 1] = Math.round(d * r + e * gr + f * bl);
		out[p + 2] = Math.round(g * r + h * gr + i * bl);
		out[p + 3] = pixels[p + 3]!;
	}
	return out;
}

export interface LaunchFlags {
	colour?: Rgb;
	type?: SimulationType;
	image: boolean;
	typeLater: boolean;
}

/**
 * The iOS launch arguments as query flags: ?cbsColour=<any notation>
 * ?cbsType=<index> ?cbsImage (a drawn sample) ?cbsTypeLater, plus the
 * carried ?color=<hex>.
 */
export function launchFlags(search: string): LaunchFlags {
	const query = new URLSearchParams(search);
	const typed = query.get('cbsColour');
	const carried = query.get('color');
	const index = Number(query.get('cbsType') ?? NaN);
	return {
		colour:
			(typed ? readColour(typed) : undefined) ??
			(carried ? parseHex(carried) : undefined),
		type: visionTypes[index]?.type,
		image: query.has('cbsImage'),
		typeLater: query.has('cbsTypeLater'),
	};
}
