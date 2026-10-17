import type { GpsFix } from 'delphitools-v2/lib/metadata';

/** Latitudes drawn: Antarctica's interior and the high Arctic have no cities to mark (iOS TimeCalcWorld). */
export const north = 80;
export const south = -60;
export const mapHeight = north - south;
export const mapAspect = 360 / mapHeight;

/** Where a place falls on a 360 by `mapHeight` map, latitude clamped. */
export function mapPoint(lat: number, lon: number) {
	const clamped = Math.min(Math.max(lat, south), north);
	return { x: lon + 180, y: north - clamped };
}

/** Degrees to four places with hemisphere letters (iOS MetadataScan.label). */
export function locationLabel({ lat, lon }: GpsFix) {
	return `${Math.abs(lat).toFixed(4)}° ${lat < 0 ? 'S' : 'N'}, ${Math.abs(lon).toFixed(4)}° ${lon < 0 ? 'W' : 'E'}`;
}

/** Natural Earth 110 m land rings as one SVG path in map units. */
export function landPath(rings: number[][][]): string {
	return rings
		.filter((ring) => ring.length > 2)
		.map(
			(ring) =>
				`M${ring
					.map(
						([lon = 0, lat = 0]) =>
							`${(lon + 180).toFixed(1)} ${(north - lat).toFixed(1)}`,
					)
					.join('L')}Z`,
		)
		.join('');
}

let land: Promise<string> | undefined;

/** The land path from `/data/world-land.json`, fetched once; empty when the fetch fails. */
export const loadLand = () =>
	(land ??= fetch('/data/world-land.json')
		.then((response) => response.json() as Promise<number[][][]>)
		.then(landPath)
		.catch(() => ''));
