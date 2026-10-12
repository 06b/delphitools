// generates a PDF that exercises the Errata content reader and editor:
//   bun scripts/errata-stress.mjs [out.pdf] [extra.pdf ...]
// extra PDFs contribute their first page (embedded subset fonts, real producer output)

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { PDFDocument, PDFName, StandardFonts, degrees } from 'pdf-lib';

const [, , outArg, ...extras] = process.argv;
const out = outArg ?? 'errata-stress.pdf';

const doc = await PDFDocument.create();
const ctx = doc.context;
const std = {};
for (const name of [
	'Helvetica',
	'HelveticaBold',
	'HelveticaOblique',
	'TimesRoman',
	'TimesRomanItalic',
	'CourierBold',
	'Symbol',
	'ZapfDingbats',
])
	std[name] = await doc.embedFont(StandardFonts[name]);

function latin1(text) {
	return Uint8Array.from(text, (c) => c.charCodeAt(0) & 0xff);
}

function esc(s) {
	return s.replace(/[\\()]/g, (c) => '\\' + c);
}

/** a page whose content stream is written by hand */
function rawPage(
	size,
	content,
	{ fonts = {}, xobjects = {}, extra = () => {} } = {},
) {
	const page = doc.addPage(size);
	for (const [name, font] of Object.entries(fonts))
		page.node.setFontDictionary(PDFName.of(name), font.ref ?? font);
	for (const [name, ref] of Object.entries(xobjects))
		page.node.setXObject(PDFName.of(name), ref);
	const bytes = content instanceof Uint8Array ? content : latin1(content);
	page.node.set(
		PDFName.of('Contents'),
		ctx.register(ctx.flateStream(bytes)),
	);
	extra(page);
	return page;
}

// a 96x64 RGB gradient png, no image library needed
function png() {
	const w = 96,
		h = 64;
	const raw = Buffer.alloc((w * 3 + 1) * h);
	for (let y = 0; y < h; y++) {
		raw[y * (w * 3 + 1)] = 0;
		for (let x = 0; x < w; x++) {
			const o = y * (w * 3 + 1) + 1 + x * 3;
			raw[o] = (x * 255) / w;
			raw[o + 1] = (y * 255) / h;
			raw[o + 2] = 128;
		}
	}
	const crcTable = Array.from({ length: 256 }, (_, n) => {
		let c = n;
		for (let k = 0; k < 8; k++)
			c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		return c >>> 0;
	});
	const crc = (buf) => {
		let c = 0xffffffff;
		for (const b of buf) c = crcTable[(c ^ b) & 255] ^ (c >>> 8);
		return (c ^ 0xffffffff) >>> 0;
	};
	const chunk = (type, data) => {
		const len = Buffer.alloc(4);
		len.writeUInt32BE(data.length);
		const td = Buffer.concat([Buffer.from(type), data]);
		const c = Buffer.alloc(4);
		c.writeUInt32BE(crc(td));
		return Buffer.concat([len, td, c]);
	};
	const ihdr = Buffer.alloc(13);
	ihdr.writeUInt32BE(w, 0);
	ihdr.writeUInt32BE(h, 4);
	ihdr[8] = 8;
	ihdr[9] = 2;
	ihdr[10] = 0;
	ihdr[11] = 0;
	ihdr[12] = 0;
	return Buffer.concat([
		Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
		chunk('IHDR', ihdr),
		chunk('IDAT', deflateSync(raw)),
		chunk('IEND', Buffer.alloc(0)),
	]);
}
const image = await doc.embedPng(png());

const F = {
	F1: std.Helvetica,
	F2: std.TimesRoman,
	F3: std.CourierBold,
	F4: std.HelveticaOblique,
	F5: std.Symbol,
	F6: std.ZapfDingbats,
	F7: std.HelveticaBold,
	F8: std.TimesRomanItalic,
};

// ---- page 1: text state
{
	const glyphs = 'Per glyph blocks';
	let x = 72;
	let quartz = '';
	for (const ch of glyphs) {
		quartz += `q 1 0 0 1 ${x.toFixed(2)} 350 cm BT 12 0 0 12 0 0 Tm /F1 1 Tf (${esc(ch)}) Tj ET Q\n`;
		x += std.Helvetica.widthOfTextAtSize(ch, 12);
	}
	const gs = ctx.register(
		ctx.obj({ Type: 'ExtGState', Font: [std.TimesRoman.ref, 14] }),
	);
	rawPage(
		[612, 792],
		`
BT /F7 24 Tf 72 720 Td (Errata stress test) Tj ET
BT /F2 12 Tf 72 690 Td 14 TL (Times Roman, first line) Tj T* (second line after T*) Tj (third line via quote) ' 2 0.5 (fourth line via double quote) " ET
BT /F3 10 Tf 72 620 Td 2 Tc (Courier Bold with Tc 2) Tj 0 Tc ET
BT /F1 12 Tf 72 600 Td 8 Tw (Words with Tw 8 spacing here) Tj 0 Tw ET
BT /F1 12 Tf 72 580 Td 150 Tz (Horizontal scale 150) Tj 100 Tz ET
BT /F1 12 Tf 72 560 Td (Rise) Tj 5 Ts (up) Tj -5 Ts (down) Tj 0 Ts ET
BT /F1 12 Tf 72 540 Td [(K) -100 (erned) 250 (TJ) -500 (array)] TJ ET
BT /F1 12 Tf 0.7071 0.7071 -0.7071 0.7071 400 560 Tm (Rotated 45) Tj ET
BT /F1 12 Tf 0 1 -1 0 560 600 Tm (Vertical 90) Tj ET
BT /F4 12 Tf 72 520 Td 1 0 0 rg (Red oblique) Tj 0 0 1 0 k ( CMYK yellow) Tj 0.5 g ( Grey) Tj 0 g ET
BT /F5 14 Tf 72 490 Td (abgdpF) Tj /F6 14 Tf ( 3456) Tj ET
BT /F1 12 Tf 72 470 Td (WinAnsi: \\344\\366\\374 \\337 \\351 \\200 \\223quotes\\224) Tj ET
q 2 0 0 2 72 400 cm BT /F1 12 Tf 0 0 Td (Scaled by cm 2x) Tj ET Q
q 1 0 0 1 300 400 cm BT /F1 1 Tf 18 0 0 18 0 0 Tm (Tf 1, size in Tm) Tj ET Q
${quartz}
BT /GS1 gs 72 320 Td (Font via ExtGState) Tj ET
BT /F1 14 Tf 72 290 Td 1 Tr 0.5 w (Stroked text) Tj 0 Tr ( then filled) Tj ET
BT /F1 14 Tf 72 270 Td 3 Tr (Invisible OCR style text) Tj 0 Tr ET
q 72 230 200 30 re W n BT /F1 30 Tf 72 235 Td (Clipped big text) Tj ET Q
/P <</MCID 1>> BDC BT /F1 12 Tf 72 200 Td (Inside marked content) Tj ET EMC
BT /F1 12 Tf 320 200 Td (Two) Tj 40 0 Td (runs) Tj 60 0 Td (same) Tj 70 0 Td (line) Tj ET
BT /F1 12 Tf 72 170 Td (Left column) Tj ET BT /F1 12 Tf 400 170 Td (Right column) Tj ET
BT /F8 12 Tf 72 140 Td (Italic Times with parentheses \\(escaped\\) and a backslash \\\\) Tj ET
BT /F1 12 Tf 72 110 Td <48657820737472696E672074657874> Tj ET
`,
		{
			fonts: F,
			extra: (page) => {
				const res = page.node.Resources();
				res.set(
					PDFName.of('ExtGState'),
					ctx.obj({ GS1: gs }),
				);
			},
		},
	);
}

// ---- page 2: graphics, images, forms, shading
{
	const inline = Buffer.alloc(64);
	for (let i = 0; i < 64; i++) inline[i] = (i * 4) & 255;
	const formInner = ctx.register(
		ctx.flateStream(
			latin1(`
0 0 1 RG 2 w 0 0 200 100 re S
BT /F1 14 Tf 10 70 Td (Text inside a form) Tj ET
BT /F1 10 Tf 10 40 Td (second line in the form) Tj ET
q 1 0 0 1 10 5 cm 60 0 0 25 0 0 cm /Im1 Do Q
`),
			{
				Type: 'XObject',
				Subtype: 'Form',
				BBox: [0, 0, 200, 100],
				Resources: {
					Font: { F1: std.Helvetica.ref },
					XObject: { Im1: image.ref },
				},
			},
		),
	);
	const formOuter = ctx.register(
		ctx.flateStream(
			latin1(`
1 0 0 RG 1 w 0 0 260 160 re S
BT /F2 12 Tf 10 140 Td (Outer form, nested one below) Tj ET
q 1 0 0 1 30 20 cm /FxIn Do Q
`),
			{
				Type: 'XObject',
				Subtype: 'Form',
				BBox: [0, 0, 260, 160],
				Matrix: [1, 0, 0, 1, 0, 0],
				Resources: {
					Font: { F2: std.TimesRoman.ref },
					XObject: { FxIn: formInner },
				},
			},
		),
	);
	const shading = ctx.register(
		ctx.obj({
			ShadingType: 2,
			ColorSpace: 'DeviceRGB',
			Coords: [0, 0, 1, 0],
			Function: {
				FunctionType: 2,
				Domain: [0, 1],
				C0: [1, 0.9, 0.2],
				C1: [0.2, 0.4, 1],
				N: 1,
			},
			Extend: [true, true],
		}),
	);
	const head = latin1(`
BT /F7 18 Tf 72 740 Td (Graphics, images, forms) Tj ET
0.2 0.6 0.3 rg 72 620 120 80 re f
0 0 0 RG 3 w 220 620 120 80 re S
0.9 0.2 0.2 rg 0 0 0.5 RG 1 w 370 620 120 80 re B
[6 3] 0 d 2 w 72 600 m 500 600 l S [] 0 d
0.5 w 72 580 m 150 560 l 230 580 l 310 560 l S
0 0 1 rg 400 540 m 400 567.6 377.6 590 350 590 c 322.4 590 300 567.6 300 540 c 300 512.4 322.4 490 350 490 c 377.6 490 400 512.4 400 540 c f
q 72 400 150 100 re W n 0.8 0.8 0.8 rg 0 380 300 150 re f BT /F1 40 Tf 60 420 Td (Clipped) Tj ET Q
q 1 0 0 1 260 400 cm 80 0 0 80 0 0 cm BI /W 8 /H 8 /CS /G /BPC 8 ID `);
	const tail = latin1(` EI Q
q 0.866 0.5 -0.5 0.866 420 400 cm 96 0 0 64 0 0 cm /Im1 Do Q
q 1 0 0 1 72 200 cm /FxOut Do Q
q 1 0 0 1 380 200 cm 0.6 0 0 0.6 0 0 cm /FxOut Do Q
q 72 100 200 60 re W n 200 0 0 60 72 100 cm /Sh1 sh Q
q 1 0 0 1 320 100 cm 2 0 0 1 0 0 cm BT /F1 12 Tf 0 20 Td (Text under a non-uniform cm) Tj ET Q
`);
	const content = new Uint8Array(
		head.length + inline.length + tail.length,
	);
	content.set(head, 0);
	content.set(inline, head.length);
	content.set(tail, head.length + inline.length);
	rawPage([612, 792], content, {
		fonts: F,
		xobjects: { Im1: image.ref, FxOut: formOuter },
		extra: (page) => {
			const res = page.node.Resources();
			res.set(
				PDFName.of('Shading'),
				ctx.obj({ Sh1: shading }),
			);
		},
	});
}

// ---- page 3: rotated page, cropped, offset media box
rawPage(
	[792, 612],
	`
BT /F7 18 Tf 60 560 Td (Rotate 90: this page is landscape in the file) Tj ET
BT /F1 12 Tf 60 530 Td (Top-left in user space; after rotation it reads down the right edge) Tj ET
0 0 1 RG 2 w 60 60 672 480 re S
BT /F1 12 Tf 400 300 Td (centre) Tj ET
q 1 0 0 1 100 100 cm 96 0 0 64 0 0 cm /Im1 Do Q
`,
	{
		fonts: F,
		xobjects: { Im1: image.ref },
		extra: (page) => page.setRotation(degrees(90)),
	},
);

rawPage(
	[612, 792],
	`
BT /F7 18 Tf 100 700 Td (CropBox 50 50 550 740, media 612x792) Tj ET
BT /F1 12 Tf 100 680 Td (Only the inside of the crop box is the page) Tj ET
BT /F1 12 Tf 10 20 Td (outside the crop box, bottom left) Tj ET
0.5 G 1 w 50 50 500 690 re S
`,
	{ fonts: F, extra: (page) => page.setCropBox(50, 50, 500, 690) },
);

rawPage(
	[612, 792],
	`
BT /F7 18 Tf -20 660 Td (MediaBox origin at -100 -100) Tj ET
BT /F1 12 Tf -20 640 Td (User space does not start at zero here) Tj ET
0 0 1 RG 2 w -100 -100 612 792 re S
BT /F1 12 Tf 300 300 Td (300, 300 in user space) Tj ET
`,
	{ fonts: F, extra: (page) => page.setMediaBox(-100, -100, 612, 792) },
);

// ---- page 6: odd fonts: limited widths, Differences, Type3
{
	const limited = ctx.register(
		ctx.obj({
			Type: 'Font',
			Subtype: 'Type1',
			BaseFont: 'Helvetica',
			Encoding: 'WinAnsiEncoding',
			FirstChar: 101,
			LastChar: 111,
			Widths: [
				556, 278, 556, 556, 222, 222, 500, 222, 833,
				556, 556,
			],
			FontDescriptor: ctx.register(
				ctx.obj({
					Type: 'FontDescriptor',
					FontName: 'Helvetica',
					Flags: 32,
					FontBBox: [-166, -225, 1000, 931],
					ItalicAngle: 0,
					Ascent: 718,
					Descent: -207,
					CapHeight: 718,
					StemV: 88,
				}),
			),
		}),
	);
	const differences = ctx.register(
		ctx.obj({
			Type: 'Font',
			Subtype: 'Type1',
			BaseFont: 'Times-Roman',
			Encoding: {
				Type: 'Encoding',
				BaseEncoding: 'WinAnsiEncoding',
				Differences: [65, 'bullet', 'Euro', 'eacute'],
			},
		}),
	);
	const square = ctx.register(
		ctx.flateStream(
			latin1('100 0 0 0 100 100 d1 10 10 80 80 re f'),
		),
	);
	const triangle = ctx.register(
		ctx.flateStream(
			latin1(
				'100 0 0 0 100 100 d1 10 10 m 90 10 l 50 90 l h f',
			),
		),
	);
	const type3 = ctx.register(
		ctx.obj({
			Type: 'Font',
			Subtype: 'Type3',
			FontBBox: [0, 0, 100, 100],
			FontMatrix: [0.01, 0, 0, 0.01, 0, 0],
			CharProcs: { square, triangle },
			Encoding: {
				Type: 'Encoding',
				Differences: [97, 'square', 'triangle'],
			},
			FirstChar: 97,
			LastChar: 98,
			Widths: [100, 100],
			Resources: {},
		}),
	);
	rawPage(
		[612, 792],
		`
BT /F7 18 Tf 72 720 Td (Odd fonts) Tj ET
BT /F1 12 Tf 72 690 Td (Below: Helvetica with Widths for e..o only, typing z needs the substitute) Tj ET
BT /Lim 24 Tf 72 650 Td (one noon) Tj ET
BT /F1 12 Tf 72 620 Td (Times with Differences: A B C map to bullet, Euro, eacute) Tj ET
BT /Dif 24 Tf 72 580 Td (ABC and plain text) Tj ET
BT /F1 12 Tf 72 550 Td (Type 3 font, two glyphs, read only) Tj ET
BT /T3 24 Tf 72 500 Td (abab) Tj ET
`,
		{ fonts: { ...F, Lim: limited, Dif: differences, T3: type3 } },
	);
}

// ---- page 7: paragraphs and a table
{
	const words =
		'the quick brown fox jumps over the lazy dog while errata reads every run of the stream'.split(
			' ',
		);
	let col = (x, seed) => {
		let s = `BT /F2 10 Tf ${x} 700 Td 13 TL\n`;
		for (let i = 0; i < 40; i++) {
			const line = Array.from(
				{ length: 7 },
				(_, k) =>
					words[
						(seed + i * 3 + k) %
							words.length
					],
			).join(' ');
			s += `(${esc(line)}) Tj T*\n`;
		}
		return s + 'ET\n';
	};
	let table = '0.6 G 0.5 w\n';
	for (let r = 0; r <= 6; r++)
		table += `72 ${120 + r * 16} m 540 ${120 + r * 16} l S\n`;
	for (let c = 0; c <= 4; c++)
		table += `${72 + c * 117} 120 m ${72 + c * 117} 216 l S\n`;
	for (let r = 0; r < 6; r++)
		for (let c = 0; c < 4; c++)
			table += `BT /F1 9 Tf ${76 + c * 117} ${125 + r * 16} Td (cell ${r + 1},${c + 1}) Tj ET\n`;
	rawPage(
		[612, 792],
		`
BT /F7 18 Tf 72 740 Td (Two columns and a table) Tj ET
${col(72, 0)}${col(320, 5)}${table}`,
		{ fonts: F },
	);
}

// ---- page 8: many runs
{
	let s = 'BT /F7 18 Tf 72 740 Td (2000 runs) Tj ET\n';
	let n = 0;
	for (let r = 0; r < 50; r++)
		for (let c = 0; c < 40; c++)
			s += `BT /F1 5 Tf ${40 + c * 13.3} ${700 - r * 12} Td (w${n++}) Tj ET\n`;
	rawPage([612, 792], s, { fonts: F });
}

// ---- page 9 and 10: page sizes
rawPage(
	[1191, 1684],
	`BT /F7 36 Tf 100 1580 Td (A2 page) Tj ET BT /F1 6 Tf 100 1550 Td (tiny six point text on a large page) Tj ET 0 0 1 RG 4 w 50 50 1091 1584 re S`,
	{ fonts: F },
);
rawPage(
	[147, 210],
	`BT /F7 10 Tf 10 190 Td (A8 page) Tj ET BT /F1 4 Tf 10 180 Td (four point) Tj ET 1 0 0 RG 1 w 5 5 137 200 re S`,
	{ fonts: F },
);

// ---- page 11: scan-like: full page image, invisible OCR text over it
rawPage(
	[612, 792],
	`
q 612 0 0 792 0 0 cm /Im1 Do Q
BT /F1 12 Tf 3 Tr 72 700 Td (Invisible OCR layer line one) Tj 0 -14 Td (Invisible OCR layer line two) Tj 0 Tr ET
`,
	{ fonts: F, xobjects: { Im1: image.ref } },
);

// ---- extra pages from real producers
for (const file of extras) {
	if (!existsSync(file)) continue;
	const src = await PDFDocument.load(readFileSync(file), {
		ignoreEncryption: true,
	});
	const [page] = await doc.copyPages(src, [0]);
	doc.addPage(page);
}

doc.setTitle('Errata stress test');
writeFileSync(out, await doc.save({ useObjectStreams: false }));
console.log(`wrote ${out}, ${doc.getPageCount()} pages`);
