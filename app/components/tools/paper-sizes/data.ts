// iOS PaperSizeDatabase.allSeries (delphitools-ios HEAD), millimetres

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

const size = (
	id: string,
	name: string,
	widthMM: number,
	heightMM: number,
): PaperSize => ({ id, name, widthMM, heightMM });

export const allSeries: PaperSeries[] = [
	{
		id: 'iso-a',
		name: 'ISO A',
		sizes: [
			size('4A0', '4A0', 1682, 2378),
			size('2A0', '2A0', 1189, 1682),
			size('A0', 'A0', 841, 1189),
			size('A0+', 'A0+', 914, 1292),
			size('A1', 'A1', 594, 841),
			size('A1+', 'A1+', 609, 914),
			size('A2', 'A2', 420, 594),
			size('A3', 'A3', 297, 420),
			size('A3+', 'A3+', 329, 483),
			size('A4', 'A4', 210, 297),
			size('A5', 'A5', 148, 210),
			size('A6', 'A6', 105, 148),
			size('A7', 'A7', 74, 105),
			size('A8', 'A8', 52, 74),
			size('A9', 'A9', 37, 52),
			size('A10', 'A10', 26, 37),
		],
	},
	{
		id: 'iso-b',
		name: 'ISO B',
		sizes: [
			size('B0', 'B0', 1000, 1414),
			size('B1', 'B1', 707, 1000),
			size('B2', 'B2', 500, 707),
			size('B3', 'B3', 353, 500),
			size('B4', 'B4', 250, 353),
			size('B5', 'B5', 176, 250),
			size('B6', 'B6', 125, 176),
			size('B7', 'B7', 88, 125),
			size('B8', 'B8', 62, 88),
			size('B9', 'B9', 44, 62),
			size('B10', 'B10', 31, 44),
		],
	},
	{
		id: 'iso-c',
		name: 'ISO C',
		sizes: [
			size('C0', 'C0', 917, 1297),
			size('C1', 'C1', 648, 917),
			size('C2', 'C2', 458, 648),
			size('C3', 'C3', 324, 458),
			size('C4', 'C4', 229, 324),
			size('C5', 'C5', 162, 229),
			size('C6', 'C6', 114, 162),
			size('C7', 'C7', 81, 114),
			size('C8', 'C8', 57, 81),
		],
	},
	{
		id: 'ra',
		name: 'RA',
		sizes: [
			size('RA0', 'RA0', 860, 1220),
			size('RA1', 'RA1', 610, 860),
			size('RA2', 'RA2', 430, 610),
			size('RA3', 'RA3', 305, 430),
			size('RA4', 'RA4', 215, 305),
		],
	},
	{
		id: 'sra',
		name: 'SRA',
		sizes: [
			size('SRA0', 'SRA0', 900, 1280),
			size('SRA1', 'SRA1', 640, 900),
			size('SRA1+', 'SRA1+', 660, 920),
			size('SRA2', 'SRA2', 450, 640),
			size('SRA2+', 'SRA2+', 480, 650),
			size('SRA3', 'SRA3', 320, 450),
			size('SRA3+', 'SRA3+', 320, 460),
			size('SRA4', 'SRA4', 225, 320),
		],
	},
	{
		id: 'us-classic',
		name: 'US Classic',
		sizes: [
			size('letter', 'Letter', 215.9, 279.4),
			size('legal', 'Legal', 215.9, 355.6),
			size('tabloid', 'Tabloid', 279.4, 431.8),
			size('ledger', 'Ledger', 431.8, 279.4),
			size('junior-legal', 'Junior Legal', 127, 203.2),
			size('half-letter', 'Half Letter', 139.7, 215.9),
			size('gov-letter', 'Gov Letter', 203.2, 266.7),
			size('gov-legal', 'Gov Legal', 215.9, 330.2),
		],
	},
	{
		id: 'us-ansi',
		name: 'US ANSI',
		sizes: [
			size('ansi-a', 'ANSI A', 216, 279),
			size('ansi-b', 'ANSI B', 279, 432),
			size('ansi-c', 'ANSI C', 432, 559),
			size('ansi-d', 'ANSI D', 559, 864),
			size('ansi-e', 'ANSI E', 864, 1118),
		],
	},
	{
		id: 'us-arch',
		name: 'US Architectural',
		sizes: [
			size('arch-a', 'Arch A', 229, 305),
			size('arch-b', 'Arch B', 305, 457),
			size('arch-c', 'Arch C', 457, 610),
			size('arch-d', 'Arch D', 610, 914),
			size('arch-e', 'Arch E', 914, 1219),
			size('arch-e1', 'Arch E1', 762, 1067),
		],
	},
	{
		id: 'japanese',
		name: 'Japanese JIS',
		sizes: [
			size('jb0', 'JIS B0', 1030, 1456),
			size('jb1', 'JIS B1', 728, 1030),
			size('jb2', 'JIS B2', 515, 728),
			size('jb3', 'JIS B3', 364, 515),
			size('jb4', 'JIS B4', 257, 364),
			size('jb5', 'JIS B5', 182, 257),
			size('jb6', 'JIS B6', 128, 182),
			size('shiroku-ban-4', 'Shiroku ban 4', 264, 379),
			size('shiroku-ban-5', 'Shiroku ban 5', 189, 262),
			size('kiku-4', 'Kiku 4', 227, 306),
			size('kiku-5', 'Kiku 5', 151, 227),
		],
	},
	{
		id: 'chinese',
		name: 'Chinese',
		sizes: [
			size('d0', 'D0', 764, 1064),
			size('d1', 'D1', 532, 760),
			size('d2', 'D2', 380, 532),
			size('d3', 'D3', 266, 380),
			size('d4', 'D4', 190, 266),
			size('d5', 'D5', 133, 190),
			size('d6', 'D6', 95, 133),
		],
	},
	{
		id: 'swedish',
		name: 'Swedish SIS',
		sizes: [
			size('sis-d0', 'SIS D0', 1091, 1542),
			size('sis-d1', 'SIS D1', 771, 1091),
			size('sis-d2', 'SIS D2', 545, 771),
			size('sis-d3', 'SIS D3', 386, 545),
			size('sis-d4', 'SIS D4', 273, 386),
			size('sis-e0', 'SIS E0', 878, 1242),
			size('sis-e1', 'SIS E1', 621, 878),
			size('sis-e2', 'SIS E2', 439, 621),
			size('sis-e3', 'SIS E3', 310, 439),
			size('sis-e4', 'SIS E4', 220, 310),
		],
	},
	{
		id: 'french',
		name: 'French Traditional',
		sizes: [
			size('cloche', 'Cloche', 300, 400),
			size('pot-ecolier', 'Pot, écolier', 310, 400),
			size('telliere', 'Tellière', 340, 440),
			size(
				'couronne-ecriture',
				'Couronne écriture',
				360,
				360,
			),
			size('couronne-edition', 'Couronne édition', 370, 470),
			size('raisin', 'Raisin', 500, 650),
			size('double-raisin', 'Double Raisin', 650, 1000),
			size('jesus', 'Jésus', 560, 760),
			size('soleil', 'Soleil', 600, 800),
			size(
				'colombier-affiche',
				'Colombier affiche',
				600,
				800,
			),
			size('grand-aigle', 'Grand Aigle', 750, 1050),
			size('univers', 'Univers', 1000, 1130),
		],
	},
	{
		id: 'imperial',
		name: 'Imperial',
		sizes: [
			size('antiquarian', 'Antiquarian', 787, 1346),
			size('atlas', 'Atlas', 660, 864),
			size('broadsheet', 'Broadsheet', 457, 610),
			size('crown', 'Crown', 381, 508),
			size('demy', 'Demy', 445, 572),
			size('double-demy', 'Double Demy', 572, 902),
			size('elephant', 'Elephant', 584, 711),
			size('emperor', 'Emperor', 1219, 1829),
			size('foolscap', 'Foolscap', 343, 432),
			size('imperial-p', 'Imperial', 559, 762),
			size('medium', 'Medium', 470, 584),
			size('royal', 'Royal', 508, 635),
		],
	},
];
