import { formatBytes } from 'delphitools-v2/lib/image-compress';

// the web tool's ceiling: a bigger data URI stalls the text field
export const maxBytes = 5 * 1024 * 1024;

/** iOS Base64Mosaic: banner height, character size in px, opacity of the text outside the picture. */
export const tuning = { height: 216, point: 7, faint: 0.28 };

export const idleText = btoa('delphitools base64 '.repeat(60));

export interface Cell {
	width: number;
	height: number;
}

export interface Cover {
	x: number;
	y: number;
	columns: number;
	rows: number;
}

/** The character cells a picture covers, aspect kept, centred. */
export function cover(
	columns: number,
	rows: number,
	cell: Cell,
	picture: Cell,
): Cover {
	if (picture.width <= 0 || picture.height <= 0)
		return { x: 0, y: 0, columns: 0, rows: 0 };
	const scale = Math.min(
		(columns * cell.width) / picture.width,
		(rows * cell.height) / picture.height,
	);
	const wide = Math.min(
		columns,
		Math.max(1, Math.round((picture.width * scale) / cell.width)),
	);
	const tall = Math.min(
		rows,
		Math.max(1, Math.round((picture.height * scale) / cell.height)),
	);
	return {
		x: Math.floor((columns - wide) / 2),
		y: Math.floor((rows - tall) / 2),
		columns: wide,
		rows: tall,
	};
}

/** The figure's number and unit for a byte count, as formatBytes writes it. */
export function figure(bytes: number): { value: string; unit: string } {
	const [value = '', unit = ''] = formatBytes(bytes).split(' ');
	return { value, unit };
}

export function rawBase64(dataUri: string): string {
	return dataUri.slice(dataUri.indexOf(',') + 1);
}
