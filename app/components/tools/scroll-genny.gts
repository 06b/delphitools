import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { registerDestructor } from '@ember/destroyable';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import { htmlSafe } from '@ember/template';
import type Owner from '@ember/owner';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonColourWell from 'delphicanon/components/canon-colour-well';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonLoader from 'delphicanon/components/canon-loader';
import CanonPageStrip, {
	pageStripHeight,
	type CanonPage,
} from 'delphicanon/components/canon-page-strip';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonTiles from 'delphicanon/components/canon-tiles';
import { parseHex, type Rgb } from 'delphicanon/lib/colour';
import { stem } from 'delphicanon/lib/files';
import { springEasing } from 'delphicanon/lib/motion';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import filePaste from 'delphitools-v2/modifiers/file-paste';
import { bytes } from 'delphitools-v2/components/tools/matte-genny/matte';
import Drop from 'delphitools-v2/components/tools/media/drop';
import Picture from 'delphitools-v2/components/tools/scroll-genny/picture';
import {
	drawSlide,
	drawnPanorama,
	fileName,
	geometry,
	pngOf,
	decode,
	ratios,
	type Fill,
} from 'delphitools-v2/components/tools/scroll-genny/scroll';
import './scroll-genny/scroll-genny.css';

const loadFailed = 'Image could not be read. Try another file?';
const shapes = ['4:5 Portrait', '1:1 Square'];
const fills = ['Blur', 'Solid Colour'];

// web value: stagger multiple file downloads
const downloadGap = 300;

// iOS: spring over 0.5 s, damping 0.8
const spring = htmlSafe(`--scroll-spring: ${springEasing(0.8)}`);

const Save = <template><IconSvg @name={{(downloadIcon)}} /></template>;
const Trash = <template><IconSvg @name="trash-2" /></template>;

interface Source {
	full: ImageBitmap;
	preview: ImageBitmap;
	stem: string;
}

// ?scrollShape=<index> ?scrollFill=<index> ?scrollColour=<rrggbb> ?scrollSample: the iOS -scrollShape, -scrollFill, -scrollColour, -scrollSample flags
function launchFlags() {
	const query = new URLSearchParams(window.location.search);
	const index = (name: string) =>
		Math.abs(Number(query.get(name)) || 0) % 2;
	return {
		shape: index('scrollShape'),
		fill: index('scrollFill'),
		colour: parseHex(query.get('scrollColour') ?? '') ?? [0, 0, 0],
		sample: query.has('scrollSample'),
	};
}

/** The port of ScrollGeneratorViewController. */
export default class ScrollGenny extends Component {
	@service('canon-toast') declare toast: CanonToastService;

	@tracked shape: number;
	@tracked fill: number;
	@tracked colour: Rgb;
	@tracked source?: Source;
	@tracked failed = false;
	@tracked exporting = false;
	@tracked slides: string[] = [];

	drop = new Drop('image/*', (file) => this.load(file));

	#loading = 0;
	#rendering = 0;
	#frame = 0;
	#timers: number[] = [];

	constructor(owner: Owner, args: object) {
		super(owner, args);
		const flags = launchFlags();
		this.shape = flags.shape;
		this.fill = flags.fill;
		this.colour = flags.colour;
		if (flags.sample) void drawnPanorama().then(this.load);
		registerDestructor(this, () => {
			cancelAnimationFrame(this.#frame);
			this.#timers.forEach(clearTimeout);
			this.#release();
		});
	}

	get geometry() {
		const full = this.source?.full;
		return full
			? geometry(full.width, full.height, ratios[this.shape]!)
			: undefined;
	}

	get fillChoice(): Fill {
		return this.fill === 1 ? bytes(this.colour) : 'blur';
	}

	get needsFill() {
		return this.geometry?.needsFill ?? false;
	}

	get showsColour() {
		return this.needsFill && this.fill === 1;
	}

	get fillNotNeeded() {
		return !!this.geometry && !this.needsFill;
	}

	get sourceText() {
		const full = this.source?.full;
		return full ? `${full.width} × ${full.height} px` : '';
	}

	get bannerAspect() {
		const g = this.geometry;
		const ratio = g
			? (g.tileWidth * g.slideCount) / g.tileHeight
			: 0;
		return Math.min(Math.max(ratio, 2), 4);
	}

	get tiles() {
		const g = this.geometry;
		const fit = g
			? g.needsFill
				? 'Edge fill'
				: 'Perfect fit'
			: '—';
		return [
			{ label: 'Count', value: g ? `${g.slideCount}` : '—' },
			{
				label: 'Size',
				value: g
					? `${g.tileWidth} × ${g.tileHeight} px`
					: '—',
			},
			{ label: 'Fit', value: fit },
		];
	}

	get pages(): CanonPage[] {
		const g = this.geometry;
		if (!g) return [];
		const size = { width: g.tileWidth, height: g.tileHeight };
		return this.slides.map((picture) => ({ size, picture }));
	}

	get exportDisabled() {
		return !this.source || this.exporting;
	}

	menu = (index: number) => [
		{
			title: passAlong('Download'),
			action: () => void this.export(index),
		},
		{ title: 'Copy', action: () => void this.copy(index) },
	];

	load = (file: File) => {
		const id = ++this.#loading;
		void decode(file).then(
			({ full, preview }) => {
				if (id !== this.#loading) {
					full.close();
					preview.close();
					return;
				}
				this.#release();
				this.source = {
					full,
					preview,
					stem: stem(file.name) || 'image',
				};
				this.failed = false;
				this.#rerender();
			},
			() => {
				if (id !== this.#loading) return;
				this.clear();
				this.failed = true;
			},
		);
	};

	clear = () => {
		this.#loading++;
		this.#release();
		this.source = undefined;
		this.failed = false;
	};

	pickShape = (index: number) => {
		this.shape = index;
		this.#rerender();
	};

	pickFill = (index: number) => {
		this.fill = index;
		this.#rerender();
	};

	pickColour = (colour: Rgb) => {
		this.colour = colour;
		this.#rerender();
	};

	exportAll = () => void this.export();

	/** No index: every slide, as the web tool did, a download apart. */
	async export(index?: number) {
		const { source, geometry: g } = this;
		if (!source || !g || this.exporting) return;
		this.exporting = true;
		const fill = this.fillChoice;
		const indices =
			index === undefined
				? [...Array(g.slideCount).keys()]
				: [index];
		try {
			for (const [k, i] of indices.entries()) {
				const blob = await pngOf(
					drawSlide(source.full, g, i, fill),
				);
				if (!blob || source !== this.source) return;
				const name = fileName(source.stem, i);
				this.#timers.push(
					window.setTimeout(
						() => downloadBlob(blob, name),
						k * downloadGap,
					),
				);
			}
		} finally {
			this.exporting = false;
		}
	}

	async copy(index: number) {
		const { source, geometry: g } = this;
		if (!source || !g) return;
		const blob = await pngOf(
			drawSlide(source.full, g, index, this.fillChoice),
		);
		if (!blob) return;
		try {
			await navigator.clipboard.write([
				new ClipboardItem({ 'image/png': blob }),
			]);
		} catch {
			return;
		}
		this.toast.show();
	}

	select = (index: number) => void this.export(index);

	// one draw a frame however fast the colour picker reports
	#rerender() {
		cancelAnimationFrame(this.#frame);
		this.#frame = requestAnimationFrame(() => void this.#render());
	}

	async #render() {
		const { source, geometry: g } = this;
		const id = ++this.#rendering;
		if (!source || !g) return;
		const fill = this.fillChoice;
		const blobs = await Promise.all(
			Array.from({ length: g.slideCount }, (_, i) =>
				pngOf(drawSlide(source.preview, g, i, fill)),
			),
		);
		if (id !== this.#rendering || source !== this.source) return;
		this.#revokeSlides();
		this.slides = blobs.map((blob) =>
			blob ? URL.createObjectURL(blob) : '',
		);
	}

	#revokeSlides() {
		this.slides.forEach((url) => url && URL.revokeObjectURL(url));
		this.slides = [];
	}

	#release() {
		this.#rendering++;
		this.#revokeSlides();
		const source = this.source;
		if (!source) return;
		source.full.close();
		source.preview.close();
	}

	<template>
		<CanonSplit
			class="scroll-genny"
			@collapsesTo={{120}}
			style={{spring}}
			{{filePaste this.load accept="image/*"}}
			{{on "dragover" this.drop.enter}}
			{{on "dragleave" this.drop.leave}}
			{{on "drop" this.drop.drop}}
		>
			<:banner>
				<CanonCanvas
					@aspect={{this.bannerAspect}}
					@maxHeight={{360}}
					@background="var(--canon-muted)"
				>
					<Picture
						@geometry={{this.geometry}}
						@slides={{this.slides}}
						@busy={{this.exporting}}
						@over={{this.drop.over}}
						@onFile={{this.load}}
					/>
				</CanonCanvas>
			</:banner>
			<:sidebar>
				{{#if this.source}}
					<CanonRows @framed={{true}}>
						<CanonHeading @text="Source" />
						<CanonRow
							class="scroll-source"
							@title={{this.source.stem}}
							@detail={{this.sourceText}}
							@form="flush"
						>
							<CanonButton
								@kind="cell"
								@text="Clear"
								@icon={{Trash}}
								@onClick={{this.clear}}
							/>
						</CanonRow>
					</CanonRows>
				{{else if this.failed}}
					<CanonRows @framed={{true}}>
						<CanonStatus
							@text={{loadFailed}}
							@tone="warn"
							@row={{true}}
						/>
					</CanonRows>
				{{/if}}
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Shape" />
					<CanonSegmented
						class="scroll-shapes"
						@items={{shapes}}
						@selected={{this.shape}}
						@onChange={{this.pickShape}}
					/>
					<CanonHeading @text="Fill" />
					<CanonSegmented
						class="scroll-fills"
						@items={{fills}}
						@selected={{this.fill}}
						@disabled={{if
							this.needsFill
							false
							true
						}}
						@onChange={{this.pickFill}}
					/>
					{{#if this.showsColour}}
						<CanonColourWell
							@label="Colour"
							@colour={{this.colour}}
							@onChange={{this.pickColour}}
						/>
					{{/if}}
					{{#if this.fillNotNeeded}}
						<CanonStatus
							class="scroll-not-needed"
							@text="Not needed"
							@tone="muted"
							@row={{true}}
						/>
					{{/if}}
					<CanonButton
						class="scroll-export"
						@kind="primary"
						@text={{passAlong
							"Download All"
						}}
						@icon={{Save}}
						@iconStyle="oversized"
						@disabled={{this.exportDisabled}}
						@onClick={{this.exportAll}}
					/>
					{{#if this.exporting}}
						<CanonRow @title="Processing…">
							<CanonLoader />
						</CanonRow>
					{{/if}}
				</CanonRows>
			</:sidebar>
			<:main>
				<CanonRows @framed={{true}}>
					<CanonHeading @text="Slides" />
					<CanonTiles @items={{this.tiles}} />
				</CanonRows>
				<CanonCanvas
					@height={{pageStripHeight}}
					@background="var(--canon-muted)"
					@boxing="unlessWide"
				>
					<CanonPageStrip
						class="scroll-strip-pages"
						@pages={{this.pages}}
						@empty="Slides"
						@menu={{this.menu}}
						@onSelect={{this.select}}
					/>
				</CanonCanvas>
			</:main>
		</CanonSplit>
	</template>
}
