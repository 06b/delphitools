import type {
	PDFArray,
	PDFContext,
	PDFDict,
	PDFDocument,
	PDFObject,
} from 'pdf-lib';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { getPdfJs, loadPdfDocument } from 'delphitools-v2/lib/pdfjs';

type PdfLib = typeof import('pdf-lib');

const IMAGE_OBJECT_TIMEOUT_MS = 500;

/** 3mm bleed, in points */
const MIN_BLEED_PT = 8.5;

export type Severity = 'error' | 'warning' | 'info';

export type CheckCategory =
	| 'document'
	| 'geometry'
	| 'fonts'
	| 'colour'
	| 'images'
	| 'transparency';

export interface PreflightIssue {
	severity: Severity;
	category: CheckCategory;
	message: string;
	page?: number;
	details?: string;
}

export interface PageBox {
	x: number;
	y: number;
	width: number;
	height: number;
}

export interface PageInfo {
	number: number;
	width: number;
	height: number;
	mediaBox: PageBox;
	trimBox?: PageBox;
	bleedBox?: PageBox;
	cropBox?: PageBox;
}

export interface FontInfo {
	name: string;
	embedded: boolean;
	type?: string;
	/** font bytes; embedded only */
	data?: Uint8Array;
	/** download extension: .ttf/.otf/.pfb */
	extension?: string;
}

export interface PreflightReport {
	fileName: string;
	fileSize: number;
	pdfVersion: string;
	pageCount: number;
	encrypted: boolean;
	pages: PageInfo[];
	fonts: FontInfo[];
	issues: PreflightIssue[];
}

export const SEVERITY_ICON: Record<Severity, string> = {
	error: 'circle-x',
	warning: 'triangle-alert',
	info: 'info',
};

export const CATEGORIES: { id: CheckCategory; label: string }[] = [
	{ id: 'document', label: 'Document' },
	{ id: 'geometry', label: 'Geometry' },
	{ id: 'fonts', label: 'Fonts' },
	{ id: 'colour', label: 'Colour' },
	{ id: 'images', label: 'Images' },
	{ id: 'transparency', label: 'Transparency' },
];

const STANDARD_14_FONTS = new Set([
	'Courier',
	'Courier-Bold',
	'Courier-BoldOblique',
	'Courier-Oblique',
	'Helvetica',
	'Helvetica-Bold',
	'Helvetica-BoldOblique',
	'Helvetica-Oblique',
	'Symbol',
	'Times-Bold',
	'Times-BoldItalic',
	'Times-Italic',
	'Times-Roman',
	'ZapfDingbats',
]);

export function formatSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ptsToMm(pts: number): number {
	return pts * 0.352778;
}

export function plural(count: number): string {
	return count === 1 ? '' : 's';
}

// pdf.js: name or array
function colourSpaceName(value: unknown): string {
	return typeof value === 'string' ? value : JSON.stringify(value);
}

function asDict(
	lib: PdfLib,
	value: PDFObject | undefined,
	context: PDFContext,
): PDFDict | undefined {
	const resolved =
		value instanceof lib.PDFRef ? context.lookup(value) : value;
	return resolved instanceof lib.PDFDict ? resolved : undefined;
}

function dictAt(
	lib: PdfLib,
	dict: PDFDict,
	key: string,
	context: PDFContext,
): PDFDict | undefined {
	return asDict(lib, dict.get(lib.PDFName.of(key)), context);
}

// pdf box: [llx lly urx ury]
function arrayToBox(lib: PdfLib, arr: PDFArray): PageBox {
	const nums: number[] = [];
	for (let i = 0; i < arr.size(); i++) {
		const val = arr.get(i);
		if (val instanceof lib.PDFNumber) nums.push(val.asNumber());
		else if (val instanceof lib.PDFRef) nums.push(0);
	}
	const [llx, lly, urx, ury] = nums;
	if (
		llx === undefined ||
		lly === undefined ||
		urx === undefined ||
		ury === undefined
	) {
		return { x: 0, y: 0, width: 612, height: 792 };
	}
	return {
		x: Math.min(llx, urx),
		y: Math.min(lly, ury),
		width: Math.abs(urx - llx),
		height: Math.abs(ury - lly),
	};
}

function boxAt(lib: PdfLib, dict: PDFDict, key: string): PageBox | undefined {
	const raw = dict.get(lib.PDFName.of(key));
	return raw instanceof lib.PDFArray ? arrayToBox(lib, raw) : undefined;
}

function extractFontData(
	lib: PdfLib,
	descriptor: PDFDict,
	context: PDFContext,
): { data: Uint8Array; extension: string } | null {
	const entries: [string, string][] = [
		['FontFile', '.pfb'], // type 1
		['FontFile2', '.ttf'], // truetype
		['FontFile3', '.otf'], // cff / opentype
	];

	for (const [key, ext] of entries) {
		const raw = descriptor.get(lib.PDFName.of(key));
		const streamObj =
			raw instanceof lib.PDFRef ? context.lookup(raw) : raw;

		if (streamObj instanceof lib.PDFRawStream) {
			try {
				return {
					data: lib
						.decodePDFRawStream(streamObj)
						.decode(),
					extension: ext,
				};
			} catch {
				try {
					return {
						data: streamObj.getContents(),
						extension: ext,
					};
				} catch {
					return null;
				}
			}
		}
		if (streamObj instanceof lib.PDFStream) {
			try {
				return {
					data: streamObj.getContents(),
					extension: ext,
				};
			} catch {
				return null;
			}
		}
	}
	return null;
}

function hasFontFile(lib: PdfLib, descriptor: PDFDict): boolean {
	return ['FontFile', 'FontFile2', 'FontFile3'].some(
		(key) => descriptor.get(lib.PDFName.of(key)) !== undefined,
	);
}

export async function analyseWithPdfLib(
	buffer: ArrayBuffer,
	fileName: string,
	fileSize: number,
): Promise<PreflightReport> {
	const lib = await import('pdf-lib');
	const issues: PreflightIssue[] = [];
	const pages: PageInfo[] = [];
	const fontsMap = new Map<string, FontInfo>();

	let doc: PDFDocument;
	try {
		doc = await lib.PDFDocument.load(buffer, {
			ignoreEncryption: true,
		});
	} catch {
		throw new Error('PARSE_ERROR');
	}

	const context = doc.context;
	const headerBytes = new Uint8Array(buffer.slice(0, 20));
	const headerStr = String.fromCharCode(...headerBytes);
	const pdfVersion = /%PDF-(\d+\.\d+)/.exec(headerStr)?.[1] ?? 'unknown';
	const preTransparency = parseFloat(pdfVersion) < 1.4;

	const encrypted = !!context.trailerInfo.Encrypt;
	if (encrypted) {
		issues.push({
			severity: 'error',
			category: 'document',
			message: 'PDF is encrypted or has security restrictions',
			details: 'Encrypted PDFs cannot be reliably processed by most print workflows. Remove encryption before sending to print.',
		});
	}

	const pdfPages = doc.getPages();
	const pageCount = pdfPages.length;

	if (pageCount === 0) {
		issues.push({
			severity: 'error',
			category: 'document',
			message: 'PDF contains no pages',
		});
	}

	let firstWidth = 0;
	let firstHeight = 0;

	for (const [i, page] of pdfPages.entries()) {
		const pageNum = i + 1;
		const node = page.node;

		const mediaBox = boxAt(lib, node, 'MediaBox') ?? {
			x: 0,
			y: 0,
			width: page.getWidth(),
			height: page.getHeight(),
		};
		const trimBox = boxAt(lib, node, 'TrimBox');
		const bleedBox = boxAt(lib, node, 'BleedBox');
		const cropBox = boxAt(lib, node, 'CropBox');

		pages.push({
			number: pageNum,
			width: mediaBox.width,
			height: mediaBox.height,
			mediaBox,
			trimBox,
			bleedBox,
			cropBox,
		});

		if (!bleedBox) {
			issues.push({
				severity: 'warning',
				category: 'geometry',
				message: 'No BleedBox defined',
				page: pageNum,
				details: 'Without a bleed area, content may be cut off at the page edge. Most printers require at least 3mm bleed.',
			});
		} else if (trimBox) {
			const minBleed = Math.min(
				trimBox.x - bleedBox.x,
				trimBox.y - bleedBox.y,
				bleedBox.x +
					bleedBox.width -
					(trimBox.x + trimBox.width),
				bleedBox.y +
					bleedBox.height -
					(trimBox.y + trimBox.height),
			);
			if (minBleed < MIN_BLEED_PT) {
				issues.push({
					severity: 'warning',
					category: 'geometry',
					message: `Bleed margin is only ${ptsToMm(minBleed).toFixed(1)}mm (minimum 3mm recommended)`,
					page: pageNum,
					details: `Smallest bleed margin found: ${minBleed.toFixed(1)}pt (${ptsToMm(minBleed).toFixed(1)}mm). Printers typically require at least 3mm.`,
				});
			}
		}

		if (!trimBox) {
			issues.push({
				severity: 'info',
				category: 'geometry',
				message: 'No TrimBox defined',
				page: pageNum,
				details: 'The TrimBox defines the finished page size after cutting. Without it, the MediaBox is used as the trim size.',
			});
		}

		if (i === 0) {
			firstWidth = mediaBox.width;
			firstHeight = mediaBox.height;
		} else if (
			Math.abs(mediaBox.width - firstWidth) > 1 ||
			Math.abs(mediaBox.height - firstHeight) > 1
		) {
			issues.push({
				severity: 'warning',
				category: 'geometry',
				message: 'Page size differs from page 1',
				page: pageNum,
				details: `Page ${pageNum}: ${mediaBox.width.toFixed(0)} x ${mediaBox.height.toFixed(0)}pt vs page 1: ${firstWidth.toFixed(0)} x ${firstHeight.toFixed(0)}pt`,
			});
		}

		const resources = dictAt(lib, node, 'Resources', context);
		if (!resources) continue;

		const fontsDict = dictAt(lib, resources, 'Font', context);
		for (const [, fontValue] of fontsDict?.entries() ?? []) {
			const fontDict = asDict(lib, fontValue, context);
			if (!fontDict) continue;

			const baseFont = fontDict.get(
				lib.PDFName.of('BaseFont'),
			);
			let fontName =
				baseFont instanceof lib.PDFName ||
				baseFont instanceof lib.PDFHexString ||
				baseFont instanceof lib.PDFString
					? baseFont.decodeText()
					: 'Unknown';
			// strip 6-letter subset prefix (ABCDEF+…)
			fontName = fontName.replace(/^[A-Z]{6}\+/, '');

			const subtype = fontDict.get(lib.PDFName.of('Subtype'));
			const fontType =
				subtype instanceof lib.PDFName
					? subtype.decodeText()
					: undefined;

			let embedded = false;
			let fontData: {
				data: Uint8Array;
				extension: string;
			} | null = null;

			const descriptor = dictAt(
				lib,
				fontDict,
				'FontDescriptor',
				context,
			);
			if (descriptor && hasFontFile(lib, descriptor)) {
				embedded = true;
				fontData = extractFontData(
					lib,
					descriptor,
					context,
				);
			}

			// base-14 ship with viewers
			if (!embedded && STANDARD_14_FONTS.has(fontName))
				embedded = true;

			// type0 embeds at descendant cidfont
			if (!embedded && fontType === 'Type0') {
				const descendants = fontDict.get(
					lib.PDFName.of('DescendantFonts'),
				);
				if (descendants instanceof lib.PDFArray) {
					for (
						let d = 0;
						d < descendants.size();
						d++
					) {
						const cidFont = asDict(
							lib,
							descendants.get(d),
							context,
						);
						const cidDescriptor =
							cidFont &&
							dictAt(
								lib,
								cidFont,
								'FontDescriptor',
								context,
							);
						if (
							cidDescriptor &&
							hasFontFile(
								lib,
								cidDescriptor,
							)
						) {
							embedded = true;
							fontData ??=
								extractFontData(
									lib,
									cidDescriptor,
									context,
								);
						}
					}
				}
			}

			const key = `${fontName}:${fontType ?? ''}`;
			if (!fontsMap.has(key)) {
				fontsMap.set(key, {
					name: fontName,
					embedded,
					type: fontType,
					data: fontData?.data,
					extension: fontData?.extension,
				});
			}
		}

		const group = dictAt(lib, node, 'Group', context);
		const groupType = group?.get(lib.PDFName.of('S'));
		if (
			groupType instanceof lib.PDFName &&
			groupType.decodeText() === 'Transparency'
		) {
			issues.push(
				preTransparency
					? {
							severity: 'error',
							category: 'transparency',
							message: 'Transparency used in a PDF older than 1.4',
							page: pageNum,
							details: 'PDF versions before 1.4 do not support transparency. This may cause rendering issues.',
						}
					: {
							severity: 'info',
							category: 'transparency',
							message: 'Page uses transparency group',
							page: pageNum,
							details: 'This page has a transparency group. Ensure your printer/RIP supports transparency or flatten before printing.',
						},
			);
		}

		const extGState = dictAt(lib, resources, 'ExtGState', context);
		let hasTransparency = false;
		for (const [, gsValue] of extGState?.entries() ?? []) {
			const gsDict = asDict(lib, gsValue, context);
			if (!gsDict) continue;

			for (const key of ['ca', 'CA']) {
				const alpha = gsDict.get(lib.PDFName.of(key));
				if (
					alpha instanceof lib.PDFNumber &&
					alpha.asNumber() < 1
				) {
					hasTransparency = true;
				}
			}

			const smask = gsDict.get(lib.PDFName.of('SMask'));
			if (
				smask &&
				!(
					smask instanceof lib.PDFName &&
					smask.decodeText() === 'None'
				)
			) {
				hasTransparency = true;
			}
		}

		if (hasTransparency) {
			issues.push(
				preTransparency
					? {
							severity: 'error',
							category: 'transparency',
							message: 'Transparency effects used in a PDF older than 1.4',
							page: pageNum,
							details: 'Opacity or soft mask settings require PDF 1.4+. This may not render correctly.',
						}
					: {
							severity: 'info',
							category: 'transparency',
							message: 'Page uses transparency effects (opacity or soft mask)',
							page: pageNum,
							details: 'Elements with reduced opacity or soft masks were detected. Consider flattening transparency for older RIPs.',
						},
			);
		}
	}

	const fonts = Array.from(fontsMap.values());
	for (const font of fonts) {
		if (!font.embedded) {
			issues.push({
				severity: 'error',
				category: 'fonts',
				message: `Font "${font.name}" is not embedded`,
				details: 'Non-embedded fonts may render incorrectly or cause missing text at the printer. Embed all fonts before sending to print.',
			});
		}
		if (font.type === 'Type3') {
			issues.push({
				severity: 'warning',
				category: 'fonts',
				message: `Font "${font.name}" is a Type 3 font`,
				details: 'Type 3 fonts are bitmap-based and may not scale well. Consider replacing with an outline font.',
			});
		}
	}

	if (preTransparency) {
		issues.push({
			severity: 'warning',
			category: 'document',
			message: `PDF version ${pdfVersion} is below 1.4`,
			details: 'PDF 1.4+ is recommended for modern print workflows. Older versions lack support for transparency and other features.',
		});
	}

	for (const pageInfo of pages) {
		const orientation =
			pageInfo.width > pageInfo.height
				? 'Landscape'
				: 'Portrait';
		issues.push({
			severity: 'info',
			category: 'geometry',
			message: `${orientation} orientation`,
			page: pageInfo.number,
			details: `${pageInfo.width.toFixed(0)} x ${pageInfo.height.toFixed(0)}pt (${ptsToMm(pageInfo.width).toFixed(0)} x ${ptsToMm(pageInfo.height).toFixed(0)}mm)`,
		});
	}

	const mixedOrientation =
		new Set(pages.map((p) => p.width > p.height)).size > 1;
	if (mixedOrientation) {
		issues.push({
			severity: 'warning',
			category: 'geometry',
			message: 'Mixed page orientations detected',
			details: 'Some pages are portrait and others are landscape. This may cause issues with imposition and binding.',
		});
	}

	return {
		fileName,
		fileSize,
		pdfVersion,
		pageCount,
		encrypted,
		pages,
		fonts,
		issues,
	};
}

export function colourIssues(spaces: string[], page: number): PreflightIssue[] {
	const issues: PreflightIssue[] = [];
	const hasRGB = spaces.some((cs) => cs.includes('RGB') || cs === 'rgb');
	const hasCMYK = spaces.some(
		(cs) => cs.includes('CMYK') || cs === 'cmyk',
	);
	const hasGray = spaces.some(
		(cs) => cs.includes('Gray') || cs === 'gray',
	);
	const hasSpot = spaces.some(
		(cs) =>
			cs.includes('Separation') ||
			cs.includes('DeviceN') ||
			cs === 'spot',
	);

	if (hasRGB) {
		issues.push({
			severity: 'warning',
			category: 'colour',
			message: 'RGB colour space detected',
			page,
			details: 'RGB colours may shift when converted to CMYK for print. Consider converting to CMYK before sending to a commercial printer.',
		});
	}

	if (hasGray) {
		issues.push({
			severity: 'info',
			category: 'colour',
			message: 'Grayscale colour space detected',
			page,
			details: 'Grayscale content found. This is generally fine for print but ensure it meets your colour requirements.',
		});
	}

	if (hasSpot) {
		issues.push({
			severity: 'info',
			category: 'colour',
			message: 'Spot colour or DeviceN colour space detected',
			page,
			details: 'Spot colours were found. Verify your printer supports the spot colour inks used, or convert to CMYK process colours.',
		});
	}

	const activeSpaces = [
		hasRGB && 'RGB',
		hasCMYK && 'CMYK',
		hasGray && 'Gray',
		hasSpot && 'Spot',
	].filter((name): name is string => typeof name === 'string');
	if (activeSpaces.length > 1) {
		issues.push({
			severity: 'warning',
			category: 'colour',
			message: `Mixed colour spaces (${activeSpaces.join(', ')})`,
			page,
			details: 'Multiple colour spaces on this page can cause inconsistent colour output. Consider converting to a single colour space.',
		});
	}
	return issues;
}

// pdf.js image may never resolve
function imageSize(
	objs: {
		get(objId: string, callback?: (obj: unknown) => void): unknown;
	},
	name: string,
): Promise<{ width: number; height: number } | null> {
	return new Promise((resolve) => {
		let settled = false;
		const finish = (
			value: { width: number; height: number } | null,
		) => {
			if (settled) return;
			settled = true;
			clearTimeout(timer);
			resolve(value);
		};
		const timer = setTimeout(
			() => finish(null),
			IMAGE_OBJECT_TIMEOUT_MS,
		);
		try {
			objs.get(name, (obj: unknown) => {
				const size =
					obj &&
					typeof obj === 'object' &&
					'width' in obj &&
					'height' in obj
						? (obj as {
								width: number;
								height: number;
							})
						: null;
				finish(size);
			});
		} catch {
			finish(null);
		}
	});
}

export async function analyseWithPdfJs(
	buffer: ArrayBuffer,
): Promise<{ pdfDoc: PDFDocumentProxy; issues: PreflightIssue[] }> {
	const pdfjsLib = await getPdfJs();
	const OPS = pdfjsLib.OPS;
	const issues: PreflightIssue[] = [];

	const pdfDoc = await loadPdfDocument(buffer.slice(0));

	for (let i = 1; i <= pdfDoc.numPages; i++) {
		const page = await pdfDoc.getPage(i);
		const opList = await page.getOperatorList();
		const argsArray = opList.argsArray as unknown[][];

		let imageCount = 0;
		const imageNames = new Set<string>();
		const colourSpaces = new Set<string>();

		for (const [j, fn] of opList.fnArray.entries()) {
			const first = argsArray[j]?.[0];

			if (
				fn === OPS.paintImageXObject ||
				fn === OPS.paintXObject ||
				fn === OPS.paintImageXObjectRepeat
			) {
				imageCount++;
			}

			if (
				(fn === OPS.paintImageXObject ||
					fn === OPS.paintXObject) &&
				typeof first === 'string'
			) {
				imageNames.add(first);
			}

			if (
				(fn === OPS.setFillColorSpace ||
					fn === OPS.setStrokeColorSpace) &&
				first
			) {
				colourSpaces.add(colourSpaceName(first));
			}
		}

		issues.push(...colourIssues([...colourSpaces], i));

		if (imageCount > 0) {
			issues.push({
				severity: 'info',
				category: 'images',
				message: `${imageCount} image${plural(imageCount)} found`,
				page: i,
				details: 'Ensure images are at least 300 DPI for print. Low-resolution images may appear pixelated.',
			});
		}

		// no ctm; assume full-page
		const viewport = page.getViewport({ scale: 1 });
		const pageWidthInches = viewport.width / 72;
		const pageHeightInches = viewport.height / 72;

		for (const imgName of imageNames) {
			const img = await imageSize(page.objs, imgName);
			if (!img || img.width <= 0 || img.height <= 0) continue;

			const effectiveDpi = Math.min(
				img.width / pageWidthInches,
				img.height / pageHeightInches,
			);
			const rounded = Math.round(effectiveDpi);

			if (effectiveDpi < 72) {
				issues.push({
					severity: 'error',
					category: 'images',
					message: `Very low resolution image (~${rounded} DPI at full page)`,
					page: i,
					details: `Image "${imgName}" is ${img.width}x${img.height}px (~${rounded} DPI if filling the page). This will appear pixelated in print.`,
				});
			} else if (effectiveDpi < 150) {
				issues.push({
					severity: 'warning',
					category: 'images',
					message: `Low resolution image (~${rounded} DPI at full page)`,
					page: i,
					details: `Image "${imgName}" is ${img.width}x${img.height}px (~${rounded} DPI if filling the page). For best quality, use 300 DPI or higher.`,
				});
			}
		}

		page.cleanup();
	}

	return { pdfDoc, issues };
}

// caller destroys pdfDoc
export async function runPreflight(
	buffer: ArrayBuffer,
	fileName: string,
	fileSize: number,
): Promise<{ report: PreflightReport; pdfDoc: PDFDocumentProxy | null }> {
	const report = await analyseWithPdfLib(buffer, fileName, fileSize);
	try {
		const { pdfDoc, issues } = await analyseWithPdfJs(buffer);
		report.issues.push(...issues);
		return { report, pdfDoc };
	} catch (pdfJsError) {
		console.warn('pdf.js analysis failed:', pdfJsError);
		report.issues.push({
			severity: 'warning',
			category: 'document',
			message: 'Could not render page previews',
			details: 'The page preview and image analysis could not be loaded. Structural analysis is still available.',
		});
		return { report, pdfDoc: null };
	}
}

export function badges(
	issues: PreflightIssue[],
): { severity: Severity | 'pass'; label: string }[] {
	if (issues.length === 0)
		return [{ severity: 'pass', label: 'All checks passed' }];
	return (['error', 'warning', 'info'] as const)
		.map((severity) => ({
			severity,
			count: issues.filter((i) => i.severity === severity)
				.length,
		}))
		.filter(({ count }) => count > 0)
		.map(({ severity, count }) => ({
			severity,
			label:
				severity === 'info'
					? `${count} info`
					: `${count} ${severity}${plural(count)}`,
		}));
}

export function groupByPage<T extends { page?: number }>(
	issues: T[],
	pageCount: number,
): { page: number; issues: T[] }[] {
	return Array.from({ length: pageCount }, (_, i) => ({
		page: i + 1,
		issues: issues.filter((issue) => issue.page === i + 1),
	})).filter((entry) => entry.issues.length > 0);
}
