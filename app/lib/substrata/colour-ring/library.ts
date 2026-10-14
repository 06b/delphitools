import { takesBlackInk } from 'delphicanon/lib/colour';
import markers from 'delphitools-v2/lib/substrata/colour-data/marker-colours.json';
import freetone from 'delphitools-v2/lib/substrata/colour-data/freetone-colours.json';
import palettes from 'delphitools-v2/lib/substrata/colour-data/palette-collection.json';
import { SwatchSet, parseHex, type Swatch } from './geometry';

// iOS ColourLibrary. FREETONE is Stuart Semple's, by permission: his CMYK
// through Coated FOGRA39, grouped into the old Spot library's hue columns
export const ColourLibrary = {
	markers: SwatchSet.families(markers, 2, 7, 34),
	freetone: SwatchSet.families(freetone, 1, 8.4, 40, true),
	palettes: SwatchSet.palettes(palettes, 7, 44),
};

// marker and FREETONE colours by lowercased hex; markers win a tie
const named = new Map<string, Swatch>();
for (const column of [
	...ColourLibrary.freetone.columns,
	...ColourLibrary.markers.columns,
])
	for (const swatch of column.swatches)
		named.set(swatch.hex.toLowerCase(), swatch);

export const namedSwatches: ReadonlyMap<string, Swatch> = named;

/** the library swatch of `hex`, or a bare one coded with its digits */
export function swatchFor(hex: string): Swatch {
	const key = hex.toLowerCase().slice(0, 7);
	return named.get(key) ?? { code: key.slice(1), name: '', hex: key };
}

export interface Paint {
	fill: string;
	ink: string;
}

const paints = new Map<string, Paint>();

/** a swatch's fill and the ink of its label */
export function paint(hex: string): Paint {
	const known = paints.get(hex);
	if (known) return known;
	const rgb = parseHex(hex) ?? [0, 0, 0, 0];
	const made = {
		fill: hex,
		ink: takesBlackInk([rgb[0], rgb[1], rgb[2]])
			? 'rgb(20 20 20 / 75%)'
			: 'rgb(247 247 247 / 90%)',
	};
	paints.set(hex, made);
	return made;
}
