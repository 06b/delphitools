import {
	BlendMode,
	LineCapStyle,
	PDFDocument,
	StandardFonts,
	clip,
	concatTransformationMatrix,
	degrees,
	endPath,
	popGraphicsState,
	pushGraphicsState,
	rectangle,
	rgb,
	type PDFFont,
	type PDFPage,
} from 'pdf-lib';
import {
	contentBox,
	contentPlacement,
	displayedToUser,
	totalRotation,
	unrotatedSize,
	type ErrataDoc,
	type ErrataPage,
	type PageObject,
} from './doc-model';
import { applyEditsToDoc } from './content';
import { writeComments } from './comments';
import { redactPdf } from './redact';
import { addFormFields, carryAcroForm } from './fields';
import { hexToRgb } from '../colour-maths';

function colour(hex: string) {
	const [r, g, b] = hexToRgb(hex) ?? [0, 0, 0];
	return rgb(r / 255, g / 255, b / 255);
}

// WinAnsi only; anything else becomes '?'
export function encodable(font: PDFFont, text: string): string {
	let out = '';
	for (const ch of text) {
		try {
			font.encodeText(ch);
			out += ch;
		} catch {
			out += ch === '\n' ? '\n' : '?';
		}
	}
	return out;
}

async function drawObject(
	pdfPage: PDFPage,
	page: ErrataPage,
	object: PageObject,
	font: PDFFont,
	images: Map<string, Awaited<ReturnType<PDFDocument['embedPng']>>>,
): Promise<void> {
	const rotation = totalRotation(page);
	const box = pdfPage.getCropBox();
	const u = unrotatedSize(page);
	const centre = displayedToUser(
		object.cx,
		object.cy,
		rotation,
		u.width,
		u.height,
	);
	const theta = ((rotation - object.angle) * Math.PI) / 180;
	const cos = Math.cos(theta);
	const sin = Math.sin(theta);
	const { w, h, scaleX, scaleY } = object;

	pdfPage.pushOperators(
		pushGraphicsState(),
		concatTransformationMatrix(
			cos,
			sin,
			-sin,
			cos,
			box.x + centre.x,
			box.y + centre.y,
		),
		concatTransformationMatrix(scaleX, 0, 0, scaleY, 0, 0),
	);

	switch (object.kind) {
		case 'text': {
			const size = object.fontSize;
			// fabric IText metrics: lineHeight 1.16 * _fontSizeMult 1.13, baseline at 0.778 of that
			pdfPage.drawText(encodable(font, object.text), {
				x: -w / 2,
				y: h / 2 - size * 1.13 * 0.778,
				size,
				font,
				color: colour(object.colour),
				opacity: object.opacity,
				lineHeight: size * 1.16 * 1.13,
			});
			break;
		}
		case 'ink':
			pdfPage.drawSvgPath(object.d, {
				x: -w / 2,
				y: h / 2,
				borderColor: colour(object.colour),
				borderWidth: object.strokeWidth,
				borderLineCap: LineCapStyle.Round,
			});
			break;
		case 'shape': {
			const stroke = colour(object.colour);
			if (object.shape === 'highlight') {
				pdfPage.drawRectangle({
					x: -w / 2,
					y: -h / 2,
					width: w,
					height: h,
					color: stroke,
					blendMode: BlendMode.Multiply,
				});
			} else if (object.shape === 'rect') {
				pdfPage.drawRectangle({
					x: -w / 2,
					y: -h / 2,
					width: w,
					height: h,
					borderColor: stroke,
					borderWidth: object.strokeWidth,
				});
			} else if (object.shape === 'ellipse') {
				pdfPage.drawEllipse({
					x: 0,
					y: 0,
					xScale: w / 2,
					yScale: h / 2,
					borderColor: stroke,
					borderWidth: object.strokeWidth,
				});
			} else {
				pdfPage.drawLine({
					start: { x: -w / 2, y: 0 },
					end: { x: w / 2, y: 0 },
					color: stroke,
					thickness: object.strokeWidth,
					lineCap: LineCapStyle.Round,
				});
			}
			break;
		}
		case 'image': {
			let embedded = images.get(object.dataUrl);
			if (!embedded) {
				embedded = await pdfPage.doc.embedPng(
					object.dataUrl,
				);
				images.set(object.dataUrl, embedded);
			}
			pdfPage.drawImage(embedded, {
				x: -w / 2,
				y: -h / 2,
				width: w,
				height: h,
			});
			break;
		}
	}

	pdfPage.pushOperators(popGraphicsState());
}

export async function exportPdf(
	doc: ErrataDoc,
	sourceBytes: Uint8Array | null,
): Promise<Uint8Array> {
	const out = await PDFDocument.create();
	const source = sourceBytes ? await PDFDocument.load(sourceBytes) : null;
	if (source) applyEditsToDoc(source, doc.pages);
	const font = await out.embedFont(StandardFonts.Helvetica);
	let bold: PDFFont | undefined;
	const images = new Map<
		string,
		Awaited<ReturnType<PDFDocument['embedPng']>>
	>();

	const flipped = (p: ErrataPage) => p.flipX || p.flipY;
	// flips need wrapping matrix
	const copyable = (p: ErrataPage) =>
		p.sourceIndex !== null && !p.resize && !flipped(p);
	const copyIndices = doc.pages
		.filter(copyable)
		.map((p) => p.sourceIndex!);
	const copied = source ? await out.copyPages(source, copyIndices) : [];
	if (source) carryAcroForm(source, out, copied);
	let copiedAt = 0;

	for (const page of doc.pages) {
		const u = unrotatedSize(page);
		const c = contentBox(page);
		const p = contentPlacement(page);
		let pdfPage: PDFPage;
		if (copyable(page)) {
			pdfPage = out.addPage(copied[copiedAt++]);
			if (page.crop) {
				const box = pdfPage.getCropBox();
				pdfPage.setCropBox(
					box.x + c.x,
					box.y +
						(page.baseHeight -
							c.y -
							c.height),
					c.width,
					c.height,
				);
			}
		} else {
			pdfPage = out.addPage([u.width, u.height]);
			if (flipped(page))
				pdfPage.pushOperators(
					pushGraphicsState(),
					concatTransformationMatrix(
						page.flipX ? -1 : 1,
						0,
						0,
						page.flipY ? -1 : 1,
						page.flipX ? u.width : 0,
						page.flipY ? u.height : 0,
					),
				);
			// pdf-lib cannot embed a page without a content stream
			if (
				page.sourceIndex !== null &&
				source &&
				source.getPage(page.sourceIndex).node.Contents()
			) {
				const srcPage = source.getPage(
					page.sourceIndex,
				);
				const box = srcPage.getCropBox();
				const left = box.x + c.x;
				const bottom =
					box.y +
					(page.baseHeight - c.y - c.height);
				const embedded = await out.embedPage(
					srcPage,
					{
						left,
						bottom,
						right: left + c.width,
						top: bottom + c.height,
					},
					[1, 0, 0, 1, -left, -bottom],
				);
				pdfPage.drawPage(embedded, {
					x: p.x,
					y: u.height - p.y - c.height * p.scale,
					xScale: p.scale,
					yScale: p.scale,
				});
			} else if (page.image) {
				const isJpeg =
					page.image.dataUrl.startsWith(
						'data:image/jpeg',
					);
				const embedded = isJpeg
					? await out.embedJpg(page.image.dataUrl)
					: await out.embedPng(
							await asPng(
								page.image
									.dataUrl,
							),
						);
				// clip to the placed content box, the image is drawn whole
				pdfPage.pushOperators(
					pushGraphicsState(),
					rectangle(
						p.x,
						u.height -
							p.y -
							c.height * p.scale,
						c.width * p.scale,
						c.height * p.scale,
					),
					clip(),
					endPath(),
				);
				pdfPage.drawImage(embedded, {
					x: p.x - c.x * p.scale,
					y:
						u.height -
						p.y +
						c.y * p.scale -
						page.baseHeight * p.scale,
					width: page.baseWidth * p.scale,
					height: page.baseHeight * p.scale,
				});
				pdfPage.pushOperators(popGraphicsState());
			}
			if (flipped(page))
				pdfPage.pushOperators(popGraphicsState());
		}
		pdfPage.setRotation(degrees(totalRotation(page)));
		for (const object of page.objects) {
			if (
				object.kind === 'comment' ||
				object.kind === 'redact' ||
				object.kind === 'field'
			)
				continue;
			const face =
				object.kind === 'text' && object.bold
					? (bold ??= await out.embedFont(
							StandardFonts.HelveticaBold,
						))
					: font;
			await drawObject(pdfPage, page, object, face, images);
		}
		writeComments(pdfPage, page);
	}
	addFormFields(out, doc, font);
	return redactPdf(await out.save(), doc.pages);
}

async function asPng(dataUrl: string): Promise<string> {
	if (dataUrl.startsWith('data:image/png')) return dataUrl;
	const img = new Image();
	await new Promise<void>((resolve, reject) => {
		img.onload = () => resolve();
		img.onerror = () => reject(new Error('image decode failed'));
		img.src = dataUrl;
	});
	const canvas = document.createElement('canvas');
	canvas.width = img.naturalWidth;
	canvas.height = img.naturalHeight;
	canvas.getContext('2d')!.drawImage(img, 0, 0);
	return canvas.toDataURL('image/png');
}
