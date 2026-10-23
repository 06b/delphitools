import type { ComponentLike } from '@glint/template';
import Banner from './banner';
import Equation from './equation';
import equation from './equation.gts?raw';
import Solid from './solid';
import solid from './solid.gts?raw';
import banner from './banner.gts?raw';
import Columns from './columns';
import columns from './columns.gts?raw';
import Compare from './compare';
import compare from './compare.gts?raw';
import Contrast from './contrast';
import contrast from './contrast.gts?raw';
import DropSlot from './drop-slot';
import dropSlot from './drop-slot.gts?raw';
import Glyphs from './glyphs';
import glyphs from './glyphs.gts?raw';
import Halves from './halves';
import halves from './halves.gts?raw';
import JobPanel from './job-panel';
import jobPanel from './job-panel.gts?raw';
import Lamps from './lamps';
import lamps from './lamps.gts?raw';
import Loaders from './loaders';
import loaders from './loaders.gts?raw';
import Maths from './maths';
import maths from './maths.gts?raw';
import Palette from './palette';
import palette from './palette.gts?raw';
import Paper from './paper';
import paper from './paper.gts?raw';
import ReadoutBand from './readout-band';
import readoutBand from './readout-band.gts?raw';
import Swatch from './swatch';
import swatch from './swatch.gts?raw';
import TextTool from './text-tool';
import textTool from './text-tool.gts?raw';
import Timecode from './timecode';
import timecode from './timecode.gts?raw';
import Tone from './tone';
import tone from './tone.gts?raw';

export interface Part {
	Live: ComponentLike;
	source: string;
}

export const patternParts: Record<string, Part> = {
	solid: { Live: Solid, source: solid },
	equation: { Live: Equation, source: equation },
	tone: { Live: Tone, source: tone },
	swatch: { Live: Swatch, source: swatch },
	lamps: { Live: Lamps, source: lamps },
	maths: { Live: Maths, source: maths },
	paper: { Live: Paper, source: paper },
	contrast: { Live: Contrast, source: contrast },
	timecode: { Live: Timecode, source: timecode },
	palette: { Live: Palette, source: palette },
	glyphs: { Live: Glyphs, source: glyphs },
	compare: { Live: Compare, source: compare },
	loaders: { Live: Loaders, source: loaders },
	columns: { Live: Columns, source: columns },
	halves: { Live: Halves, source: halves },
	banner: { Live: Banner, source: banner },
	'readout-band': { Live: ReadoutBand, source: readoutBand },
	'drop-slot': { Live: DropSlot, source: dropSlot },
	'job-panel': { Live: JobPanel, source: jobPanel },
	'text-tool': { Live: TextTool, source: textTool },
};
