export interface Release {
	version: string;
	since: string;
	features: string[];
	fixes: string[];
	technical: string[];
}

export const RELEASES: Release[] = [
	{
		version: '2.2.0',
		since: '2.1.1',
		features: [
			// ∑CG: changelog feature line, errata launch
			//   spec: one or two sentences in the "pitch!" voice, "Errata:" prefix or lead with the name; new beta PDF editor at /errata, in the sidebar next to Substrata; open a PDF or image, change existing text in place, move and delete existing text and images, add text, pen, shapes, highlights and a signature, reorder/rotate/delete/insert pages, export a PDF; everything runs locally in the browser
			//   sample: "Errata: A real PDF editor, in your browser. Change the text that's already there, move things around, sign it, and export. It's in beta, so tell us what breaks!"
			'∑CG',
			// ∑CG: changelog feature line, errata toolbox
			//   spec: one or two sentences, "Errata:" prefix; the Toolbox holds page tools that apply to the document and stay undoable until export: organise (grid of pages, drag to reorder, duplicate, delete), page size, rotate and flip, insert page, crop, page numbers, watermark, stamp, compress, impose, true redaction (content is removed, not covered), comments, prepare form (add fillable fields), and preflight; keep it to a handful of named tools if the list is too long
			//   sample: "Errata: The Toolbox has page numbers, watermarks, stamps, real redaction, fillable forms, comments, imposition and a preflight check, and every one of them can be undone."
			'∑CG',
		],
		fixes: [
			// ∑CG: changelog fix line, imposer rotated and cropped pages
			//   spec: one sentence, "PDF Imposer:" prefix; source pages with a rotation, a crop box, or no content came out blank, misplaced or sideways on the imposed sheet, now they impose upright and in place
			//   sample: "PDF Imposer: Rotated and cropped pages now land upright and in the right spot."
			'∑CG',
			// ∑CG: changelog fix line, substrata undo after a control
			//   spec: one sentence, "Substrata:" prefix; after clicking a checkbox, toggle or slider in the editor, Cmd/Ctrl+Z and the other shortcuts did nothing until you clicked the canvas, now they work straight away
			//   sample: "Substrata: Undo works again right after you touch a slider or checkbox."
			'∑CG',
		],
		technical: [
			// ∑CG: changelog technical line, mupdf
			//   spec: one sentence; Errata loads MuPDF (WebAssembly, self-hosted, fetched only when a tool needs it) for redaction and reading existing form fields; no file leaves the browser
			//   sample: "Errata uses MuPDF, loaded on demand, for redaction and forms. Your files still never leave your browser."
			'∑CG',
		],
	},
	{
		version: '2.1.1',
		since: '2.1.0',
		features: [
			'A new privacy page now details what data gets collected. Find it in the sidebar!',
			'The sidebar and omnibox now find tools by what file type they take or produce. Thanks to @Bhagya-Vishwakarma-20 and @davidnoeee on GitHub!',
			'Palette Collection: Filter palettes by how many colours they have. Thanks, @TheTinkerersHaven on GitHub!',
			'Palette Generator: Regenerating now correctly respects your locked colours, and adding a colour will get you one that fits. Thanks again, @TheTinkerersHaven!',
			'Text Diff: So much more room for activities, like long lines. Thanks, @crhallberg on GitHub!',
			'Added new hero art',
		],
		fixes: [
			'QR Generator: SVG downloads have been transitioned away from black scraps on WebKit. Thanks, @SpacyRicochet on GitHub!',
			'Favicon Generator: SVGs now fill every icon size instead of coming out cropped, and the HTML snippet includes the ICO. Thanks, @Kaio20 on GitHub!',
			'Palette Generator: Adding a colour no longer produces #NaNNaNNaN. Jeez, that was embarrassing. Thanks, @TheTinkerersHaven!',
			'On phones, the sidebar now closes after you pick a tool.',
			'Document Converter: PDFs no longer start with a big empty gap at the top. Thanks, @davidnoeee on GitHub!',
		],
		technical: [],
	},
	{
		version: '2.1.0',
		since: '2.0.4',
		features: [
			'Image Masker: Cut any image into a shape. Comes with over 300 shapes, or bring your own SVG! Requested by Jett Archer.',
			'Substrata: Layers can now be masked! Apply masks in the inspector, per layer.',
			'Substrata: The crop tool now works on rotated images.',
			'Workflows: Build your own! Pick up to three tools in a row and save a link directly to them. All combinations are valid, provided their outputs can chain into the next input.',
		],
		fixes: [
			'Substrata: The canvas now no longer insists upon its original size when resized.',
		],
		technical: [
			'Tools now broadcast their input and output types.',
		],
	},
	{
		version: '2.0.4',
		since: '2.0.3',
		features: [
			'Image Atlas: Learn everything about an image file. Credits to @TheTinkerersHaven and @Fleny113 on GitHub for contributing this tool!',
			'Audio, Video and Image Atlas tools now offer to open your file in every tool that takes it.',
			'Added new hero art',
		],
		fixes: [
			'The omnibox can now hand a dropped file over to the tool you choose. Thanks, @eliorpom-cmd on GitHub!',
			'Substrata: Fixed a bug that would prevent modal dialogues from opening',
			'Fixed a bug that would hide the Back button behind the art, thanks Himanshu!',
			'Palette Collection: All tab no longer breaks the container',
		],
		technical: [],
	},
	{
		version: '2.0.3',
		since: '2.0.2',
		features: [],
		fixes: [
			'OpenGraph sharing cards now behave like they did in 1.0',
			'Screen Recorder: Fixed behaviour on Firefox and fixed mic echoing. Thanks again, @TheTinkerersHaven on GitHub!',
		],
		technical: [],
	},
	{
		version: '2.0.2',
		since: '2.0.1',
		features: [],
		fixes: [
			'Clicking a palette now opens it in the generator correctly. Thanks, @paletteheart on GitHub!',
			'Bookmarks and links straight to a tool page now load correctly. Thanks, @Jon-Corey on GitHub!',
			'The omnibox no longer disregards spaces. Thanks again, @Jon-Corey on GitHub!',
		],
		technical: [],
	},
	{
		version: '2.0.1',
		since: '2.0.0',
		features: ['added new hero art'],
		fixes: [
			"Favicon Generator: Fixed an issue where the entire pack wouldn't download as one zip. Thanks, @TheTinkerersHaven on GitHub!",
			'Picked Alien Delphi up from jail',
		],
		technical: [],
	},
	{
		version: '2.0.0',
		since: '1.0',
		features: [
			'Rebuilt from the ground up: delphitools is now rebuilt from scratch with Ember 7 and Crayon CSS as the new foundation. Every tool was rebuilt for the new stack!',
			'The Omnibox: The front page now has one box that answers your queries as you type! Drop a file on it to see what tools accept it, paste a colour code and it gives you conversions right there, decipher text, try conversions and more!',
			"Workflows: Connect your favourite tools into a sequence that carries files between it! No more downloading and uploading when you're switching tools. Track your progress in the new flow bar!",
			'Semantic Versioning and the Changelog: No more commit hashes! Real version numbers for real people. And a swanky changelog, which you are reading right now!',
			'Audio Atlas: Learn everything about an audio file, from loudness to codec and bitrate!',
			'Audio Extractor: Drop a video file and get a clean audio track from it, every time!',
			'Audio Normaliser: Pretend you know what LUFS means when you upload to social media!',
			'Audio Trimmer: Trim down any audio file In/Out style without getting out the editing workstation!',
			"Auto Subtitle: Speech to text, in the browser! Uses open-source transcription technologies and your computer's GPU to process on-device using Whisper.",
			'Braille Converter: Convert latin text to Braille clusters and back again!',
			'Colour Atlas: Learn everything about a colour, its tints, shades, harmonies and so on! Goes great with our other colour tools!',
			'Cron Builder: Stop memorising arcane incantations and start setting up your Cronjobs with a simple to use interface!',
			'Frame Extractor: Take out any frame from a video file or make yourself a photo lab style contact sheet!',
			'HTTP Status: Forgot what 404 means? We doubt it, so we added all the other codes to this handy reference just in case!',
			'Image Compressor: Squish and crunch your images so they fit in your carry on!',
			'Image De-skewer: Straighten any image! Goes great with our new Image to PDF tool!',
			'Images to PDF: This one is also a PDF to image tool! Will wonders ever cease?',
			'IPA Transcription: Transcribe your text to pronunciation aides, provided you speak my flavour of English!',
			'JSON Formatter: Look at JSON payloads, in style!',
			'JWT Decoder: Decode your Web Tokens and look at what makes them tick!',
			'Metadata Stripper: Remove that pesky XMP and EXIF data from your pictures! Does not remove AI watermarks, because that would be stupid!',
			'Morse Code: Impress family and friends with this most amazing novelty! Human speech encoded as dits and dahs!',
			'NATO Phonetic: Stop saying "M as in Mancy" when giving directions over the phone!',
			'Password Generator: Make safe passwords along with an entropy counter! Go for a high score!',
			'PDF Compressor: Compresses your PDFs to a fraction of their size, we hope!',
			'PDF Organiser: Impress your boss by rearranging pages in a confidential PDF with ease!',
			'PDF Page Numbers: All good documents have to be numbered, and watermarked! This tool lets you do both!',
			'PDF Rotate & Crop: Unlock the ancient secrets of rotating a PDF, and triumph over your boomer co workers!',
			'Request Builder: cURL needs not be frightening to you any longer, my friend!',
			'Screen Recorder: Abuses the video sharing feature we all relied on during the pandemic to record your, yes, your screen without any downloads!',
			'Subtitle Converter: We will never converge on a standard on this, thankfully the conversion is painless!',
			'Subtitle Studio: Apply your subtitles to your video files at full quality, right here!',
			'Timecode Calculator: SMTPE timecode will never go away, so better get used to it! This might help!',
			"UUID Generator: Take some home, it's no trouble! We have so many UUIDs!",
			'Video Atlas: Learn everything there is to know about a video file you have! Frame rate, resolution, codec, is Jamie Lee Curtis in it? Spoiler, probably not!',
			'Video Muter: Mmmmph, mmmm, mmmmph!',
			'Video to GIF: This one is self explanatory!',
			'Video Trimmer: Cut your video files, In/Out style!',
			'Voice Recorder: Record your voice, in the browser and in style!',
			'Waveform Generator: Make your audio files into visual representations!',
		],
		fixes: [
			'QR Generator: Exported files no longer show hairlines when exported as SVG.',
			'QR Generator: Exports now come with optional caption text.',
			'Tailwind Shade Generator: Ramps now hold their saturation instead of washing out. Thanks, Ash!',
			'Shavian Transliterator: All 125k words in the dictionary now load correctly.',
			'Colour tools: Now read their notation from one header instead of seperate pickers.',
			'Text Scratchpad: Now supports uploading files.',
			'Text Editor: Now supports uploading files.',
			'Loading states now use a custom made component.',
			'Substrata is now a lot more stable.',
			'Semantic versioning is now in effect. Welcome to version 2.0.0!',
			'Removed all evil alien clones trying to replace me, I hope!',
		],
		technical: [
			'The tech stack is now Ember + Glimmer, with Crayon CSS for styling, built in Vite.',
			'Transformers.js use has been expanded, now using RMBG 1.4 as well as Whisper for local inference, with a WASM fallback.',
			'646 unit tests run headlessly against every future change.',
		],
	},
];
