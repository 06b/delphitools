import Component from '@glimmer/component';
import { tracked } from '@glimmer/tracking';
import { on } from '@ember/modifier';
import { fn } from '@ember/helper';
import { eq, not } from 'ember-truth-helpers';
import { modifier } from 'ember-modifier';
import Icon from 'delphitools-v2/components/icon';
import MaskGrid from 'delphitools-v2/components/mask-grid';
import DownloadLabel from 'delphitools-v2/components/download-label';
import { downloadBlob } from 'delphitools-v2/lib/download';
import { fitPlacement } from 'delphitools-v2/lib/pdf-pages';
import filePaste, { matchesAccept } from 'delphitools-v2/modifiers/file-paste';
import { DEFAULT_MASK, type MaskShape } from 'delphitools-v2/lib/mask-shapes';
import { pinSvgSize } from 'delphitools-v2/lib/svg-size';

// wording from social-cropper
const LOAD_FAILED = 'Image could not be read. Try another file?';

const PREVIEW = 1024;
const MAX_SIZE = 8192;
const PLACEHOLDER = '#9a9a9a';
const ACCEPT = 'image/*,.svg';
const SVG_ACCEPT = '.svg,image/svg+xml';
const SCALES = [0.5, 1, 2, 3];

const DROP_HINT = 'Image: PNG/JPG, Shape: SVG, or paste';

type Mask = MaskShape | HTMLImageElement;

interface View {
	zoom: number;
	x: number;
	y: number;
}

function loadImage(blob: Blob): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(blob);
		const image = new Image();
		image.onload = () => {
			URL.revokeObjectURL(url);
			resolve(image);
		};
		image.onerror = () => {
			URL.revokeObjectURL(url);
			reject(new Error('decode failed'));
		};
		image.src = url;
	});
}

async function loadSvg(file: File): Promise<HTMLImageElement> {
	const text = pinSvgSize(await file.text());
	if (text === null) throw new Error('svg parse failed');
	return loadImage(new Blob([text], { type: 'image/svg+xml' }));
}

function paint(
	ctx: CanvasRenderingContext2D,
	size: number,
	mask: Mask,
	image: HTMLImageElement | null,
	view: View,
) {
	ctx.globalCompositeOperation = 'source-over';
	if (mask instanceof HTMLImageElement) {
		const { x, y, width, height } = fitPlacement(
			mask.width,
			mask.height,
			size,
			size,
			'contain',
		);
		ctx.drawImage(mask, x, y, width, height);
	} else {
		ctx.save();
		ctx.scale(size / 100, size / 100);
		ctx.fill(new Path2D(mask.d));
		ctx.restore();
	}

	ctx.globalCompositeOperation = 'source-in';
	if (!image?.width || !image.height) {
		ctx.fillStyle = PLACEHOLDER;
		ctx.fillRect(0, 0, size, size);
	} else {
		const cover = fitPlacement(
			image.width,
			image.height,
			size,
			size,
			'cover',
		);
		const w = cover.width * view.zoom;
		const h = cover.height * view.zoom;
		const x = (size - w) / 2 + view.x * size;
		const y = (size - h) / 2 + view.y * size;
		// source-in would erase grey
		if (x > 0 || y > 0 || x + w < size || y + h < size) {
			ctx.fillStyle = PLACEHOLDER;
			ctx.fillRect(0, 0, size, size);
			ctx.globalCompositeOperation = 'source-atop';
		}
		ctx.drawImage(image, x, y, w, h);
	}
	ctx.globalCompositeOperation = 'source-over';
}

export default class ImageMaskerTool extends Component {
	@tracked shape: MaskShape = DEFAULT_MASK;
	@tracked customMask: HTMLImageElement | null = null;
	@tracked customName = '';
	@tracked image: HTMLImageElement | null = null;
	@tracked fileName = '';
	@tracked zoom = 1;
	@tracked x = 0;
	@tracked y = 0;
	@tracked scale = 1;
	@tracked gridOpen = false;
	@tracked loadFailed = false;

	#loads = 0;
	#drag: {
		width: number;
		px: number;
		py: number;
		x: number;
		y: number;
	} | null = null;

	get mask(): Mask {
		return this.customMask ?? this.shape;
	}

	get maskLabel() {
		return this.customMask ? this.customName : this.shape.label;
	}

	get selectedD() {
		return this.customMask ? null : this.shape.d;
	}

	get zoomLabel() {
		return `${Math.round(this.zoom * 100)}%`;
	}

	// 1x: one image pixel
	get outputSize() {
		const base = this.image
			? Math.min(this.image.width, this.image.height) /
				this.zoom
			: PREVIEW;
		return Math.max(
			16,
			Math.min(MAX_SIZE, Math.round(base * this.scale)),
		);
	}

	get outputLabel() {
		return `${this.outputSize} × ${this.outputSize}`;
	}

	draw = modifier((canvas: HTMLCanvasElement) => {
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		canvas.width = PREVIEW;
		canvas.height = PREVIEW;
		paint(ctx, PREVIEW, this.mask, this.image, this);
	});

	readFile = (file: File, asMask = matchesAccept(file, SVG_ACCEPT)) => {
		this.loadFailed = false;
		const ticket = ++this.#loads;
		const name = file.name.replace(/\.[^.]+$/, '');
		const loading = asMask ? loadSvg(file) : loadImage(file);
		loading.then(
			(image) => {
				if (this.isDestroyed || ticket !== this.#loads)
					return;
				if (asMask) {
					this.customMask = image;
					this.customName = name;
				} else {
					this.image = image;
					this.fileName = name;
					this.resetView();
				}
			},
			() => {
				if (!this.isDestroyed) this.loadFailed = true;
			},
		);
	};

	handleFileSelect = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		if (file && matchesAccept(file, ACCEPT))
			this.readFile(file, input.accept === SVG_ACCEPT);
		// rearm same-file change
		input.value = '';
	};

	handleDrop = (event: DragEvent) => {
		event.preventDefault();
		const file = event.dataTransfer?.files[0];
		if (file && matchesAccept(file, ACCEPT)) this.readFile(file);
	};

	// else browser opens file
	allowDrop = (event: DragEvent) => {
		event.preventDefault();
	};

	toggleGrid = () => {
		this.gridOpen = !this.gridOpen;
	};

	selectShape = (shape: MaskShape) => {
		this.shape = shape;
		this.customMask = null;
	};

	clearImage = () => {
		this.image = null;
		this.fileName = '';
		this.loadFailed = false;
		this.resetView();
	};

	resetView = () => {
		this.zoom = 1;
		this.x = 0;
		this.y = 0;
	};

	setZoom = (event: Event) => {
		this.zoom = Number((event.target as HTMLInputElement).value);
	};

	wheel = (event: WheelEvent) => {
		if (!this.image) return;
		event.preventDefault();
		this.zoom = Math.min(
			8,
			Math.max(
				0.1,
				this.zoom * Math.exp(-event.deltaY * 0.002),
			),
		);
	};

	// capture keeps outside moves
	startDrag = (event: PointerEvent) => {
		if (!this.image || event.button !== 0) return;
		const stage = event.currentTarget as HTMLElement;
		this.#drag = {
			width: stage
				.querySelector('canvas')!
				.getBoundingClientRect().width,
			px: event.clientX,
			py: event.clientY,
			x: this.x,
			y: this.y,
		};
		stage.setPointerCapture(event.pointerId);
	};

	moveDrag = (event: PointerEvent) => {
		const drag = this.#drag;
		if (!drag || !event.buttons) return;
		this.x = drag.x + (event.clientX - drag.px) / drag.width;
		this.y = drag.y + (event.clientY - drag.py) / drag.width;
	};

	endDrag = (event: PointerEvent) => {
		const stage = event.currentTarget as HTMLElement;
		if (stage.hasPointerCapture(event.pointerId)) {
			stage.releasePointerCapture(event.pointerId);
		}
		this.#drag = null;
	};

	selectScale = (scale: number) => {
		this.scale = scale;
	};

	download = () => {
		const size = this.outputSize;
		const canvas = document.createElement('canvas');
		canvas.width = size;
		canvas.height = size;
		const ctx = canvas.getContext('2d');
		if (!ctx) return;
		paint(ctx, size, this.mask, this.image, this);
		const shape = this.customMask ? this.customName : this.shape.id;
		canvas.toBlob((blob) => {
			if (blob)
				downloadBlob(
					blob,
					`${this.fileName || 'mask'}-${shape}.png`,
				);
		}, 'image/png');
	};

	<template>
		<div
			class="dt-masker"
			{{filePaste this.readFile accept=ACCEPT}}
		>
			<div class="dt-masker-frame">
				<div class="dt-masker-bar">
					<div class="dt-masker-group">
						<span
							class="dt-masker-group-label"
						>Shape</span>
						<span class="dt-masker-current">
							{{#if this.customMask}}
								<Icon
									@name="shapes"
								/>
							{{else}}
								<svg
									viewBox="0 0 100 100"
									aria-hidden="true"
								><path
										d={{this.shape.d}}
									/></svg>
							{{/if}}
							<span
								class="dt-masker-name"
							>{{this.maskLabel}}</span>
						</span>
						<label
							class="dt-masker-bar-btn"
						>
							<input
								type="file"
								accept={{SVG_ACCEPT}}
								class="dt-sr-only"
								{{on
									"change"
									this.handleFileSelect
								}}
							/>
							<Icon @name="file-up" />
							Upload SVG
						</label>
						<button
							type="button"
							class="dt-masker-bar-btn dt-masker-toggle
								{{if
									this.gridOpen
									'is-open'
								}}"
							aria-expanded={{if
								this.gridOpen
								"true"
								"false"
							}}
							aria-controls="dt-masker-grid"
							{{on
								"click"
								this.toggleGrid
							}}
						>
							<Icon @name="shapes" />
							Shapes
							<Icon
								@name="chevron-down"
							/>
						</button>
					</div>

					<div class="dt-masker-group">
						<span
							class="dt-masker-group-label"
						>Image</span>
						{{#if this.image}}
							<span
								class="dt-masker-current"
							>
								<Icon
									@name="image"
								/>
								<span
									class="dt-masker-name"
								>{{this.fileName}}</span>
								<span
									class="dt-masker-dims"
								>{{this.image.width}}
									×
									{{this.image.height}}</span>
							</span>
							<button
								type="button"
								class="dt-masker-bar-btn"
								{{on
									"click"
									this.clearImage
								}}
							>
								<Icon
									@name="trash-2"
								/>
								Clear
							</button>
						{{/if}}
						<label
							class="dt-masker-bar-btn"
						>
							<input
								type="file"
								accept="image/*"
								class="dt-sr-only"
								{{on
									"change"
									this.handleFileSelect
								}}
							/>
							<Icon
								@name="image-up"
							/>
							Upload
						</label>
					</div>
				</div>

				{{#if this.gridOpen}}
					<MaskGrid
						id="dt-masker-grid"
						@selected={{this.selectedD}}
						@onSelect={{this.selectShape}}
					/>
				{{/if}}

				<div class="dt-masker-workspace">
					{{! drag, not click }}
					{{! template-lint-disable no-pointer-down-event-binding }}
					<div
						class="dt-masker-stage
							{{if
								this.image
								'has-image'
							}}"
						{{on
							"pointerdown"
							this.startDrag
						}}
						{{on
							"pointermove"
							this.moveDrag
						}}
						{{on "pointerup" this.endDrag}}
						{{on
							"pointercancel"
							this.endDrag
						}}
						{{on
							"wheel"
							this.wheel
							passive=false
						}}
						{{on "drop" this.handleDrop}}
						{{on "dragover" this.allowDrop}}
					>
						<canvas
							class="dt-masker-canvas"
							role="img"
							aria-label={{this.maskLabel}}
							{{this.draw}}
						></canvas>
						{{#unless this.image}}
							<label
								class="dt-masker-drop"
							>
								<input
									type="file"
									accept="image/*"
									class="dt-sr-only"
									{{on
										"change"
										this.handleFileSelect
									}}
								/>
								<Icon
									@name="upload"
								/>
								<span
									class="dt-masker-drop-title"
								>Drop image here</span>
								<span
									class="dt-masker-drop-hint"
								>{{DROP_HINT}}</span>
							</label>
						{{/unless}}
					</div>

					<div class="dt-masker-zoom">
						<span
							class="dt-masker-readout"
						>{{this.zoomLabel}}</span>
						<input
							type="range"
							min="0.1"
							max="8"
							step="0.01"
							value={{this.zoom}}
							aria-label="Zoom"
							disabled={{not
								this.image
							}}
							{{on
								"input"
								this.setZoom
							}}
						/>
						<button
							type="button"
							class="dt-icon-btn dt-masker-icon-btn"
							aria-label="Reset view"
							disabled={{not
								this.image
							}}
							{{on
								"click"
								this.resetView
							}}
						>
							<Icon
								@name="maximize"
							/>
						</button>
					</div>
				</div>

				<div class="dt-masker-actions">
					<div class="segmented dt-masker-scales">
						{{#each SCALES as |scale|}}
							<button
								type="button"
								class="dt-masker-choice
									{{if
										(eq
											scale
											this.scale
										)
										'is-active'
									}}"
								aria-pressed={{if
									(eq
										scale
										this.scale
									)
									"true"
									"false"
								}}
								{{on
									"click"
									(fn
										this.selectScale
										scale
									)
								}}
							>{{scale}}x</button>
						{{/each}}
					</div>
					<span
						class="dt-masker-summary"
					>{{this.outputLabel}}</span>
					<button
						type="button"
						class="dt-masker-download"
						{{on "click" this.download}}
					>
						<DownloadLabel
							@label="Download PNG"
						/>
					</button>
				</div>

				{{#if this.loadFailed}}
					<p
						class="dt-masker-error"
						role="alert"
					>{{LOAD_FAILED}}</p>
				{{/if}}
			</div>
		</div>
	</template>
}
