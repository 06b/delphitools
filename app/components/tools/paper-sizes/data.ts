import { paperSizeGroups } from 'delphitools-v2/lib/paper-sizes';

export interface PaperSize {
	id: string;
	name: string;
	widthMM: number;
	heightMM: number;
}

export interface PaperSeries {
	id: string;
	name: string;
	sizes: PaperSize[];
}

// the app table in the iOS shape; Common repeats sizes the series hold
export const allSeries: PaperSeries[] = paperSizeGroups
	.filter((group) => group.id !== 'common')
	.map((group) => ({
		id: group.id,
		name: group.short ?? group.label,
		sizes: group.sizes.map((size) => ({
			id: size.id,
			name: size.label,
			widthMM: size.widthMm,
			heightMM: size.heightMm,
		})),
	}));
