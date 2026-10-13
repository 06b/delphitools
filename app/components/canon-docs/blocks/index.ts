import type { ComponentLike } from '@glint/template';
import Banner from './banner';
import banner from './banner.gts?raw';
import DropSlot from './drop-slot';
import dropSlot from './drop-slot.gts?raw';
import Halves from './halves';
import halves from './halves.gts?raw';
import JobPanel from './job-panel';
import jobPanel from './job-panel.gts?raw';
import ReadoutBand from './readout-band';
import readoutBand from './readout-band.gts?raw';
import TextTool from './text-tool';
import textTool from './text-tool.gts?raw';

export const blockParts: Record<
	string,
	{ Live: ComponentLike; source: string }
> = {
	halves: { Live: Halves, source: halves },
	banner: { Live: Banner, source: banner },
	'readout-band': { Live: ReadoutBand, source: readoutBand },
	'drop-slot': { Live: DropSlot, source: dropSlot },
	'job-panel': { Live: JobPanel, source: jobPanel },
	'text-tool': { Live: TextTool, source: textTool },
};
