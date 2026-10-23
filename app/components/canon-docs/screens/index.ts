import type { Part } from '../patterns/index';
import ColourPicker from './colour-picker';
import colourPicker from './colour-picker.gts?raw';
import Converter from './converter';
import converter from './converter.gts?raw';
import MediaEditor from './media-editor';
import mediaEditor from './media-editor.gts?raw';
import Settings from './settings';
import settings from './settings.gts?raw';

export const screenParts: Record<string, Part> = {
	'media-editor': { Live: MediaEditor, source: mediaEditor },
	'colour-picker': { Live: ColourPicker, source: colourPicker },
	converter: { Live: Converter, source: converter },
	settings: { Live: Settings, source: settings },
};
