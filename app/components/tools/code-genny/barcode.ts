export type BarcodeType =
	| 'microqr'
	| 'datamatrix'
	| 'azteccode'
	| 'pdf417'
	| 'code128'
	| 'code39'
	| 'ean13'
	| 'upca';

export interface BarcodeInfo {
	name: string;
	category: '2d' | '1d';
	charHint: string;
	allowedPattern: RegExp;
	inventor: string;
	year: string;
	description: string;
	placeholder: string;
	validate?: (value: string) => string | null;
}

// eslint rejects ascii range
const ASCII = /^\p{ASCII}*$/u;
const CODE39 = /^[A-Z0-9\-. $/+%]*$/;
const DIGITS = /^\d*$/;

export function mod10CheckDigit(
	digits: string,
	evenWeight: number,
	oddWeight: number,
): number {
	let sum = 0;
	for (let i = 0; i < digits.length; i++) {
		sum +=
			(digits.charCodeAt(i) - 48) *
			(i % 2 === 0 ? evenWeight : oddWeight);
	}
	return (10 - (sum % 10)) % 10;
}

export const BARCODE_TYPES: Record<BarcodeType, BarcodeInfo> = {
	microqr: {
		name: 'Micro QR',
		category: '2d',
		charHint: 'Letters, numbers, and symbols',
		allowedPattern: ASCII,
		inventor: 'Denso Wave',
		year: '2004',
		description:
			'Smaller version of QR code for space-constrained applications. Uses only one position detection pattern.',
		placeholder: 'Short text or URL',
	},
	datamatrix: {
		name: 'Data Matrix',
		category: '2d',
		charHint: 'Letters, numbers, and symbols',
		allowedPattern: ASCII,
		inventor: 'International Data Matrix Inc. (RVSI Acuity CiMatrix)',
		year: '1987',
		description:
			'Used extensively in electronics, healthcare, and logistics. Can encode up to 2,335 alphanumeric characters.',
		placeholder: 'Product ID or serial number',
	},
	azteccode: {
		name: 'Aztec Code',
		category: '2d',
		charHint: 'Letters, numbers, and symbols',
		allowedPattern: ASCII,
		inventor: 'Andrew Longacre Jr. (Welch Allyn)',
		year: '1995',
		description:
			'Named for resemblance to Aztec pyramids. Used on airline boarding passes and by Deutsche Bahn.',
		placeholder: 'Boarding pass or ticket data',
	},
	pdf417: {
		name: 'PDF417',
		category: '2d',
		charHint: 'Letters, numbers, and symbols',
		allowedPattern: ASCII,
		inventor: 'Ynjiun Paul Wang (Symbol Technologies)',
		year: '1991',
		description:
			'Portable Data File with 4 bars and spaces in 17 modules. Used on IDs, shipping labels, and boarding passes.',
		placeholder: 'ID or license data',
	},
	code128: {
		name: 'Code 128',
		category: '1d',
		charHint: 'Letters, numbers, and symbols',
		allowedPattern: ASCII,
		inventor: 'Computer Identics Corporation',
		year: '1981',
		description:
			'High-density barcode for alphanumeric data. Widely used in shipping and packaging industries.',
		placeholder: 'ABC-12345',
	},
	code39: {
		name: 'Code 39',
		category: '1d',
		charHint: 'A-Z (uppercase), 0-9, and - . $ / + % space',
		allowedPattern: CODE39,
		inventor: 'David Allais & Ray Stevens (Intermec)',
		year: '1974',
		description:
			'One of the first alphanumeric barcodes. Still used in automotive, defense, and healthcare.',
		placeholder: 'CODE39TEST',
		validate: (value) =>
			CODE39.test(value)
				? null
				: 'Code 39 only supports: A-Z (uppercase), 0-9, - . $ / + % and space',
	},
	ean13: {
		name: 'EAN-13',
		category: '1d',
		charHint: 'Numbers only (12-13 digits)',
		allowedPattern: DIGITS,
		inventor: 'George Laurer (IBM), adapted from UPC',
		year: '1976',
		description:
			'European Article Number. Standard barcode for retail products worldwide.',
		placeholder: '5901234123457',
		validate: (value) => {
			if (value.length === 0) return null;
			if (!/^\d{12,13}$/.test(value)) {
				return 'EAN-13 requires exactly 12 or 13 digits';
			}
			if (value.length === 13) {
				const expected = mod10CheckDigit(
					value.slice(0, 12),
					1,
					3,
				);
				if (value.charCodeAt(12) - 48 !== expected) {
					return `Check digit should be ${expected} — or enter just the first 12 digits to auto-fill it`;
				}
			}
			return null;
		},
	},
	upca: {
		name: 'UPC-A',
		category: '1d',
		charHint: 'Numbers only (11-12 digits)',
		allowedPattern: DIGITS,
		inventor: 'George Laurer (IBM)',
		year: '1973',
		description:
			'Universal Product Code. The original retail barcode, still dominant in North America.',
		placeholder: '012345678905',
		validate: (value) => {
			if (value.length === 0) return null;
			if (!/^\d{11,12}$/.test(value)) {
				return 'UPC-A requires exactly 11 or 12 digits';
			}
			if (value.length === 12) {
				const expected = mod10CheckDigit(
					value.slice(0, 11),
					3,
					1,
				);
				if (value.charCodeAt(11) - 48 !== expected) {
					return `Check digit should be ${expected} — or enter just the first 11 digits to auto-fill it`;
				}
			}
			return null;
		},
	},
};

export const TYPE_LIST = Object.entries(BARCODE_TYPES) as [
	BarcodeType,
	BarcodeInfo,
][];

export const BWIP_BCID: Record<BarcodeType, string> = {
	microqr: 'microqrcode',
	datamatrix: 'datamatrix',
	azteccode: 'azteccode',
	pdf417: 'pdf417',
	code128: 'code128',
	code39: 'code39',
	ean13: 'ean13',
	upca: 'upca',
};

export function isContentCompatible(
	content: string,
	type: BarcodeType,
): boolean {
	if (!content) return true;
	return BARCODE_TYPES[type].allowedPattern.test(content);
}

export function filterContent(content: string, type: BarcodeType): string {
	const text = type === 'code39' ? content.toUpperCase() : content;
	const pattern = BARCODE_TYPES[type].allowedPattern;
	return text
		.split('')
		.filter((char) => pattern.test(char))
		.join('');
}

export function friendlyBwipError(err: unknown): string {
	const raw =
		err instanceof Error
			? err.message
			: 'Failed to generate barcode';
	return raw.replace(/^(bwipp\.[^:]*|bwip-js):\s*/, '');
}
