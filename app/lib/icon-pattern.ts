import { htmlSafe } from '@ember/template';
import { icons } from 'delphitools-v2/lib/icons';

// css masks these, so the stroke colour is irrelevant
function iconSvg(name: string, x: number, y: number, size: number) {
	const inner =
		/<svg[^>]*>([\s\S]*)<\/svg>/.exec(icons[name] ?? '')?.[1] ?? '';
	return `<svg x="${x}" y="${y}" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="black" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
}

function svgUrl(width: number, height: number, body: string) {
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">${body}</svg>`;
	return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

// staggered rows of one icon
export function patternStyle(name: string) {
	const tile = svgUrl(
		56,
		48,
		iconSvg(name, 4, 2, 20) + iconSvg(name, 32, 26, 20),
	);
	return htmlSafe(`--suite-pattern: ${tile}`);
}

// ios FanInfoView: 92 pt tile, 24 pt symbols, 6 tiles per block
export const HERO_TILE = 92;
export const HERO_BLOCK_TILES = 6;
const HERO_SYMBOL = 24;

// ios HomePatternView: two random symbols per tile, on its diagonal
export function heroPatternStyle(names: string[]) {
	const block = HERO_TILE * HERO_BLOCK_TILES;
	let body = '';
	for (let row = 0; row < HERO_BLOCK_TILES; row++)
		for (let column = 0; column < HERO_BLOCK_TILES; column++)
			for (const slot of [0.25, 0.75]) {
				const name =
					names[
						Math.floor(
							Math.random() *
								names.length,
						)
					];
				if (!name) continue;
				body += iconSvg(
					name,
					column * HERO_TILE +
						HERO_TILE * slot -
						HERO_SYMBOL / 2,
					row * HERO_TILE +
						HERO_TILE * slot -
						HERO_SYMBOL / 2,
					HERO_SYMBOL,
				);
			}
	return htmlSafe(
		`--hero-pattern: ${svgUrl(block, block, body)}; --hero-block: ${block}px`,
	);
}
