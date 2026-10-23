import { downloadUrl } from 'delphitools-v2/lib/download';
import {
	markerPrefix,
	type GlossToken,
} from 'delphitools-v2/lib/shavian/transliterate';

// the web tool's gloss image: Latin, Shavian and IPA rows on one sheet
const CANVAS_WIDTH = 1200;
const PADDING = 40;
const WORD_GAP = 24;
const LINE_HEIGHT = 80;
const BRANDING_HEIGHT = 40;
const CONTENT_WIDTH = CANVAS_WIDTH - PADDING * 2;

const LATIN_FONT = '14px system-ui';
const SHAVIAN_FONT = "22px 'Noto Sans Shavian', sans-serif";
const IPA_FONT = '13px system-ui';
const PUNCTUATION_FONT = '18px system-ui';
const BRAND_FONT = '12px system-ui';
const MARKED_COLOUR = '#ff9f43';

export async function exportGloss(tokens: GlossToken[]) {
	const canvas = document.createElement('canvas');
	const ctx = canvas.getContext('2d');
	if (!ctx) return;

	// fonts.ready before measuring widths
	await document.fonts.ready;

	const isDark =
		document.documentElement.classList.contains('dark') ||
		window.matchMedia('(prefers-color-scheme: dark)').matches;
	const bgColour = isDark ? '#0a0a0a' : '#ffffff';
	const latinColour = isDark ? '#8888aa' : '#666688';
	const shavianColour = isDark ? '#e8e8ff' : '#1a1a2e';
	const ipaColour = isDark ? '#66cc88' : '#227744';
	const brandColour = isDark ? '#555' : '#aaa';

	const measurements: { token: GlossToken; width: number }[] = [];
	ctx.font = LATIN_FONT;
	for (const token of tokens) {
		if (token.type === 'word' && token.gloss) {
			ctx.font = LATIN_FONT;
			const latinWidth = ctx.measureText(
				token.gloss.latin,
			).width;
			ctx.font = SHAVIAN_FONT;
			const shavianWidth = ctx.measureText(
				token.gloss.phonemes
					.map((p) => p.shavian)
					.join(''),
			).width;
			ctx.font = IPA_FONT;
			const ipaWidth = ctx.measureText(token.gloss.ipa).width;
			measurements.push({
				token,
				width: Math.max(
					latinWidth,
					shavianWidth,
					ipaWidth,
				),
			});
		} else if (token.type === 'punctuation') {
			ctx.font = LATIN_FONT;
			measurements.push({
				token,
				width: ctx.measureText(token.value).width,
			});
		}
	}

	const lines: (typeof measurements)[] = [];
	let currentLine: typeof measurements = [];
	let currentWidth = 0;
	for (const measurement of measurements) {
		if (
			currentWidth + measurement.width + WORD_GAP >
				CONTENT_WIDTH &&
			currentLine.length > 0
		) {
			lines.push(currentLine);
			currentLine = [measurement];
			currentWidth = measurement.width;
		} else {
			currentLine.push(measurement);
			currentWidth += measurement.width + WORD_GAP;
		}
	}
	if (currentLine.length > 0) lines.push(currentLine);

	canvas.width = CANVAS_WIDTH;
	canvas.height =
		PADDING +
		lines.length * LINE_HEIGHT +
		BRANDING_HEIGHT +
		PADDING;

	ctx.fillStyle = bgColour;
	ctx.fillRect(0, 0, canvas.width, canvas.height);

	let y = PADDING;
	for (const line of lines) {
		let x = PADDING;
		for (const { token } of line) {
			if (token.type === 'punctuation') {
				ctx.font = PUNCTUATION_FONT;
				ctx.fillStyle = latinColour;
				ctx.textAlign = 'left';
				ctx.fillText(token.value, x, y + 42);
				x += ctx.measureText(token.value).width + 4;
				continue;
			}

			const gloss = token.gloss;
			if (!gloss) continue;
			const prefix = markerPrefix(gloss.marker);
			const shavianText =
				prefix +
				gloss.phonemes.map((p) => p.shavian).join('');

			ctx.font = LATIN_FONT;
			ctx.fillStyle = latinColour;
			ctx.textAlign = 'left';
			ctx.fillText(gloss.latin, x, y + 14);
			const latinWidth = ctx.measureText(gloss.latin).width;

			ctx.font = SHAVIAN_FONT;
			ctx.fillStyle =
				gloss.marker !== 'none'
					? MARKED_COLOUR
					: shavianColour;
			ctx.fillText(shavianText, x, y + 42);
			const shavianWidth = ctx.measureText(shavianText).width;

			ctx.font = IPA_FONT;
			ctx.fillStyle = ipaColour;
			ctx.fillText(gloss.ipa, x, y + 62);

			x += Math.max(latinWidth, shavianWidth) + WORD_GAP;
		}
		y += LINE_HEIGHT;
	}

	ctx.font = BRAND_FONT;
	ctx.fillStyle = brandColour;
	ctx.textAlign = 'right';
	ctx.fillText(
		'delphi.tools',
		CANVAS_WIDTH - PADDING,
		canvas.height - PADDING + 8,
	);

	downloadUrl(canvas.toDataURL('image/png'), 'shavian-gloss.png');
}
