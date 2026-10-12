import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { service } from '@ember/service';
import type Owner from '@ember/owner';
import { modifier } from 'ember-modifier';
import CanonBar from 'delphicanon/components/canon-bar';
import CanonButton from 'delphicanon/components/canon-button';
import CanonCanvas from 'delphicanon/components/canon-canvas';
import CanonColourWell from 'delphicanon/components/canon-colour-well';
import CanonGrid from 'delphicanon/components/canon-grid';
import CanonHeading from 'delphicanon/components/canon-heading';
import CanonRow from 'delphicanon/components/canon-row';
import CanonRows from 'delphicanon/components/canon-rows';
import CanonSegmented from 'delphicanon/components/canon-segmented';
import CanonSplit from 'delphicanon/components/canon-split';
import CanonStatus from 'delphicanon/components/canon-status';
import CanonTiles from 'delphicanon/components/canon-tiles';
import { hex, parseHex, type Rgb } from 'delphicanon/lib/colour';
import type CanonToastService from 'delphicanon/services/canon-toast';
import { IconSvg } from 'delphitools-v2/components/icon';
import { downloadBlob, downloadUrl } from 'delphitools-v2/lib/download';
import { downloadIcon, passAlong } from 'delphitools-v2/lib/flow-hooks';
import {
	loadRemover,
	maskToCanvas,
	applyMask,
	loadImage,
	type Remover,
} from 'delphitools-v2/lib/bg-removal';
import filePaste, { matchesAccept } from 'delphitools-v2/modifiers/file-paste';
import { drawnSample } from 'delphitools-v2/components/tools/image-compressor/sample';
import Picture from 'delphitools-v2/components/tools/background-remover/picture';
import './background-remover/background-remover.css';

type Status = 'idle' | 'downloading' | 'processing' | 'done' | 'error';

const modes = ['Transparent', 'Colour'];

const Trash = <template><IconSvg @name="trash-2" /></template>;
const Copy = <template><IconSvg @name="copy" /></template>;
const Save = <template><IconSvg @name={{(downloadIcon)}} /></template>;
const Eraser = <template><IconSvg @name="eraser" /></template>;

function readDataUrl(file: File): Promise<string> {
	return new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(reader.result as string);
		reader.onerror = () =>
			reject(new Error('image failed to load'));
		reader.readAsDataURL(file);
	});
}

/** Mean opacity of an image, measured on a copy at most 256 px across. */
async function keptShare(url: string) {
	const image = await loadImage(url);
	const scale = Math.min(1, 256 / Math.max(image.width, image.height));
	const canvas = document.createElement('canvas');
	canvas.width = Math.max(1, Math.round(image.width * scale));
	canvas.height = Math.max(1, Math.round(image.height * scale));
	const context = canvas.getContext('2d', { willReadFrequently: true })!;
	context.drawImage(image, 0, 0, canvas.width, canvas.height);
	const { data } = context.getImageData(
		0,
		0,
		canvas.width,
		canvas.height,
	);
	let sum = 0;
	for (let i = 3; i < data.length; i += 4) sum += data[i]!;
	return sum / 255 / (data.length / 4);
}

/** The cut-out as a PNG blob, on the background colour when one is set. */
async function pngOf(result: string, fill?: string) {
	const image = await loadImage(result);
	const canvas = document.createElement('canvas');
	canvas.width = image.naturalWidth;
	canvas.height = image.naturalHeight;
	const context = canvas.getContext('2d')!;
	if (fill) {
		context.fillStyle = fill;
		context.fillRect(0, 0, canvas.width, canvas.height);
	}
	context.drawImage(image, 0, 0);
	return new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, 'image/png'),
	);
}

/** The port of BackgroundRemoverViewController, on the web tool's model. */
export default class BackgroundRemover extends Component {
	@service('canon-toast') declare toast: CanonToastService;
	@tracked sourceImage: string | null = null;
	@tracked sourceName = '';
	@tracked width = 0;
	@tracked height = 0;
	@tracked resultImage: string | null = null;
	@tracked kept?: number;
	@tracked status: Status = 'idle';
	@tracked percent = 0;
	@tracked errorDetail = '';
	@tracked mode = 0;
	@tracked colour: Rgb = [1, 1, 1];
	@tracked over = false;

	#remover: Remover | null = null;
	#destroyed = false;
	#input?: HTMLInputElement;
	#loading = 0;

	// ?bgSample: the iOS -bgSample launch argument, with a drawn image; ?bgFill=<hex>: the iOS -bgFill
	constructor(owner: Owner, args: object) {
		super(owner, args);
		const query = new URLSearchParams(window.location.search);
		const fill = parseHex(query.get('bgFill') ?? '');
		if (fill) {
			this.mode = 1;
			this.colour = fill;
		}
		if (query.has('bgSample'))
			void drawnSample().then((file) => this.readFile(file));
	}

	willDestroy() {
		super.willDestroy();
		this.#destroyed = true;
		// release model memory
		this.#remover?.dispose();
		this.#remover = null;
	}

	get isBusy() {
		return (
			this.status === 'downloading' ||
			this.status === 'processing'
		);
	}

	get isDownloading() {
		return this.status === 'downloading';
	}

	get runText() {
		if (this.status === 'downloading')
			return `Downloading... ${this.percent}%`;
		if (this.status === 'processing')
			return 'Removing background...';
		return 'Remove Background';
	}

	get share() {
		return this.percent / 100;
	}

	get fill() {
		return this.mode === 1 ? hex(this.colour) : undefined;
	}

	get sizeText() {
		return `${this.width} × ${this.height}`;
	}

	get tiles() {
		return [
			{
				label: 'Kept',
				value:
					this.kept === undefined
						? '—'
						: `${Math.round(this.kept * 100)} %`,
				level: this.kept ?? 0,
			},
			{ label: 'Size', value: `${this.sizeText} px` },
		];
	}

	get hasError() {
		return this.status === 'error';
	}

	keepInput = modifier((input: HTMLInputElement) => {
		this.#input = input;
	});

	choose = () => this.#input?.click();

	picked = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		// reset permits reselect
		input.value = '';
		if (file) void this.readFile(file);
	};

	dragOver = (event: DragEvent) => {
		if (!event.dataTransfer?.types.includes('Files')) return;
		event.preventDefault();
		this.over = true;
	};

	dragLeave = (event: DragEvent) => {
		const root = event.currentTarget as Element;
		if (!root.contains(event.relatedTarget as Node | null))
			this.over = false;
	};

	drop = (event: DragEvent) => {
		this.over = false;
		const file = [...(event.dataTransfer?.files ?? [])].find((f) =>
			matchesAccept(f, 'image/*'),
		);
		if (!file) return;
		event.preventDefault();
		if (!this.isBusy) void this.readFile(file);
	};

	readFile = async (file: File) => {
		if (!file.type.startsWith('image/') || this.isBusy) return;
		const run = ++this.#loading;
		try {
			const url = await readDataUrl(file);
			const image = await loadImage(url);
			if (run !== this.#loading || this.#destroyed) return;
			this.sourceImage = url;
			this.sourceName = file.name || 'image';
			this.width = image.naturalWidth;
			this.height = image.naturalHeight;
			this.resultImage = null;
			this.kept = undefined;
			this.status = 'idle';
			this.errorDetail = '';
		} catch (error) {
			if (run !== this.#loading) return;
			this.report(
				error instanceof Error
					? error.message
					: String(error),
			);
		}
	};

	clear = () => {
		this.#loading++;
		this.sourceImage = null;
		this.resultImage = null;
		this.kept = undefined;
		this.status = 'idle';
		this.errorDetail = '';
	};

	report = (detail: string) => {
		this.status = 'error';
		this.errorDetail = detail;
	};

	remove = async () => {
		const source = this.sourceImage;
		if (!source || this.isBusy) return;

		try {
			if (!this.#remover) {
				this.status = 'downloading';
				this.percent = 0;
				const remover = await loadRemover(
					({ percent }) => {
						if (!this.#destroyed)
							this.percent = percent;
					},
				);
				// dispose after teardown
				if (this.#destroyed) {
					remover.dispose();
					return;
				}
				this.#remover = remover;
			}

			this.status = 'processing';
			const segments = await this.#remover.segment(source);
			if (this.#destroyed) return;

			const mask = segments[0]?.mask;
			if (!mask)
				throw new Error('the model returned no mask');

			const image = await loadImage(source);
			if (this.#destroyed || source !== this.sourceImage)
				return;

			const result = applyMask(image, maskToCanvas(mask));
			this.resultImage = result;
			this.status = 'done';
			const kept = await keptShare(result);
			if (result === this.resultImage) this.kept = kept;
		} catch (error) {
			if (this.#destroyed) return;
			this.report(
				error instanceof Error
					? error.message
					: String(error),
			);
		}
	};

	pickMode = (index: number) => (this.mode = index);

	pickColour = (colour: Rgb) => (this.colour = colour);

	copy = async () => {
		if (!this.resultImage) return;
		const blob = await pngOf(this.resultImage, this.fill);
		if (!blob) return;
		try {
			await navigator.clipboard.write([
				new ClipboardItem({ 'image/png': blob }),
			]);
		} catch {
			return;
		}
		this.toast.show();
	};

	download = async () => {
		if (!this.resultImage) return;
		if (!this.fill) {
			downloadUrl(this.resultImage, 'background-removed.png');
			return;
		}
		const blob = await pngOf(this.resultImage, this.fill);
		if (blob) downloadBlob(blob, 'background-removed.png');
	};

	<template>
		<CanonSplit
			class="background-remover"
			@halves={{true}}
			@collapsesTo={{200}}
			{{filePaste this.readFile accept="image/*"}}
			{{on "dragover" this.dragOver}}
			{{on "dragleave" this.dragLeave}}
			{{on "drop" this.drop}}
		>
			<:sidebar>
				<CanonCanvas
					@aspect={{1}}
					@background="var(--canon-muted)"
					@pattern={{true}}
				>
					<Picture
						@source={{this.sourceImage}}
						@width={{this.width}}
						@height={{this.height}}
						@result={{this.resultImage}}
						@fill={{this.fill}}
						@busy={{this.isBusy}}
						@over={{this.over}}
						@onChoose={{this.choose}}
					/>
				</CanonCanvas>
			</:sidebar>
			<:main>
				{{#if this.sourceImage}}
					<CanonRows @framed={{true}}>
						<CanonHeading @text="Source" />
						<CanonRow
							class="bg-source"
							@title={{this.sourceName}}
							@detail={{this.sizeText}}
							@form="flush"
						>
							<CanonButton
								@kind="cell"
								@text="Clear"
								@icon={{Trash}}
								@disabled={{this.isBusy}}
								@onClick={{this.clear}}
							/>
						</CanonRow>
						{{#unless this.resultImage}}
							<CanonButton
								class="bg-run"
								@kind="primary"
								@text={{this.runText}}
								@icon={{Eraser}}
								@disabled={{this.isBusy}}
								@onClick={{this.remove}}
							/>
							{{#if
								this.isDownloading
							}}
								<CanonBar
									class="bg-progress"
									@share={{this.share}}
								/>
							{{/if}}
						{{/unless}}
					</CanonRows>
				{{/if}}
				{{#if this.hasError}}
					<CanonRows @framed={{true}}>
						<CanonStatus
							class="bg-error"
							@text={{this.errorDetail}}
							@tone="warn"
							@row={{true}}
						/>
					</CanonRows>
				{{/if}}
				{{#if this.resultImage}}
					<CanonRows @framed={{true}}>
						<CanonHeading @text="Subject" />
						<CanonTiles
							@items={{this.tiles}}
						/>
						<CanonHeading
							@text="Background"
						/>
						<CanonSegmented
							class="bg-modes"
							@items={{modes}}
							@selected={{this.mode}}
							@onChange={{this.pickMode}}
						/>
						{{#if this.fill}}
							<CanonColourWell
								@label="Background Colour"
								@colour={{this.colour}}
								@onChange={{this.pickColour}}
							/>
						{{/if}}
						<CanonGrid>
							<CanonButton
								class="bg-copy"
								@text="Copy Image"
								@icon={{Copy}}
								@onClick={{this.copy}}
							/>
							<CanonButton
								class="bg-download"
								@kind="primary"
								@text={{passAlong
									"Download PNG"
								}}
								@icon={{Save}}
								@iconStyle="oversized"
								@onClick={{this.download}}
							/>
						</CanonGrid>
					</CanonRows>
				{{/if}}
				<CanonRows @framed={{true}}>
					<CanonStatus
						@text="Processing happens entirely in your browser. On first use, a ~110MB processing engine is downloaded and cached."
						@tone="muted"
						@row={{true}}
					/>
				</CanonRows>
				{{! the empty picture opens it }}
				{{! template-lint-disable require-input-label }}
				<input
					type="file"
					accept="image/*"
					hidden
					{{this.keepInput}}
					{{on "change" this.picked}}
				/>
			</:main>
		</CanonSplit>
	</template>
}
