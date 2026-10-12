import Component from '@glimmer/component';
import { fn } from '@ember/helper';
import { on } from '@ember/modifier';
import { modifier } from 'ember-modifier';
import Icon from 'delphitools-v2/components/icon';
import { newId, pageSize } from 'delphitools-v2/lib/errata/doc-model';
import {
	addSignature,
	removeSignature,
	signatures,
	trimCanvas,
} from 'delphitools-v2/lib/errata/signatures';
import { addObject, currentPage } from 'delphitools-v2/lib/errata/store';
import { activeTool } from 'delphitools-v2/lib/errata/tool';
import { modal, selectObject } from 'delphitools-v2/lib/errata/ui';
import { TrackedExternal } from 'delphitools-v2/lib/tracked-external';

const PAD_W = 480;
const PAD_H = 180;
const PLACED_WIDTH = 180;

function placeSignature(dataUrl: string): void {
	const page = currentPage();
	if (!page) return;
	const img = new Image();
	img.onload = () => {
		const { width, height } = pageSize(page);
		const w = PLACED_WIDTH;
		const h = (img.naturalHeight / img.naturalWidth) * w;
		const id = newId();
		addObject(page.id, {
			id,
			kind: 'image',
			cx: width / 2,
			cy: height / 2,
			w,
			h,
			scaleX: 1,
			scaleY: 1,
			angle: 0,
			dataUrl,
		});
		activeTool.set('select');
		selectObject(id);
	};
	img.src = dataUrl;
}

// substrata modal-host chrome
export default class SignatureModal extends Component {
	shown = new TrackedExternal(modal.subscribe, modal.get);
	saved = new TrackedExternal(signatures.subscribe, signatures.get);
	#pad: HTMLCanvasElement | null = null;
	#input: HTMLInputElement | null = null;

	willDestroy() {
		super.willDestroy();
		this.shown.unsubscribe();
		this.saved.unsubscribe();
		modal.set(null);
	}

	sync = modifier((dialog: HTMLDialogElement, [open]: [boolean]) => {
		if (open && !dialog.open) dialog.showModal();
		else if (!open && dialog.open) dialog.close();
	});

	// dialog click requires modifier
	backdropDismiss = modifier((dialog: HTMLDialogElement) => {
		const onClick = (event: MouseEvent) => {
			if (event.target === dialog) dialog.close();
		};
		dialog.addEventListener('click', onClick);
		return () => dialog.removeEventListener('click', onClick);
	});

	onClose = () => {
		modal.set(null);
	};

	get open() {
		return this.shown.current === 'signature';
	}

	dismiss = (event: Event) => {
		(event.currentTarget as HTMLElement).closest('dialog')?.close();
	};

	pad = modifier((canvas: HTMLCanvasElement) => {
		this.#pad = canvas;
		const dpr = window.devicePixelRatio || 1;
		canvas.width = PAD_W * dpr;
		canvas.height = PAD_H * dpr;
		const ctx = canvas.getContext('2d')!;
		ctx.scale(dpr, dpr);
		ctx.lineWidth = 2.5;
		ctx.lineCap = 'round';
		ctx.lineJoin = 'round';
		ctx.strokeStyle = '#111';
		let drawing = false;
		const pt = (e: PointerEvent) => {
			const r = canvas.getBoundingClientRect();
			return [e.clientX - r.left, e.clientY - r.top] as const;
		};
		const down = (e: PointerEvent) => {
			drawing = true;
			canvas.setPointerCapture(e.pointerId);
			ctx.beginPath();
			ctx.moveTo(...pt(e));
		};
		const move = (e: PointerEvent) => {
			if (!drawing) return;
			ctx.lineTo(...pt(e));
			ctx.stroke();
		};
		const up = () => {
			drawing = false;
		};
		canvas.addEventListener('pointerdown', down);
		canvas.addEventListener('pointermove', move);
		canvas.addEventListener('pointerup', up);
		canvas.addEventListener('pointercancel', up);
		return () => {
			canvas.removeEventListener('pointerdown', down);
			canvas.removeEventListener('pointermove', move);
			canvas.removeEventListener('pointerup', up);
			canvas.removeEventListener('pointercancel', up);
			this.#pad = null;
		};
	});

	clear = () => {
		const pad = this.#pad;
		if (pad)
			pad.getContext('2d')!.clearRect(
				0,
				0,
				pad.width,
				pad.height,
			);
	};

	useDrawn = () => {
		const pad = this.#pad;
		if (!pad) return;
		const trimmed = trimCanvas(pad);
		if (!trimmed) return;
		const dataUrl = trimmed.toDataURL('image/png');
		addSignature(dataUrl);
		this.clear();
		placeSignature(dataUrl);
		modal.set(null);
	};

	registerInput = modifier((el: HTMLInputElement) => {
		this.#input = el;
		return () => {
			this.#input = null;
		};
	});

	pickUpload = () => this.#input?.click();

	onUpload = (event: Event) => {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];
		input.value = '';
		if (!file) return;
		const reader = new FileReader();
		reader.onload = () => {
			const dataUrl = reader.result as string;
			addSignature(dataUrl);
			placeSignature(dataUrl);
			modal.set(null);
		};
		reader.readAsDataURL(file);
	};

	place = (dataUrl: string) => {
		placeSignature(dataUrl);
		modal.set(null);
	};

	remove = (dataUrl: string) => removeSignature(dataUrl);

	<template>
		<dialog
			class="sub-modal"
			{{this.sync this.open}}
			{{on "close" this.onClose}}
			{{this.backdropDismiss}}
		>
			<button
				type="button"
				class="sub-modal-x"
				aria-label="Close"
				{{on "click" this.dismiss}}
			>
				<Icon @name="x" />
			</button>
			<div class="sub-modal-frame is-wide">
				<div class="sub-modal-header">
					<h2
						class="sub-modal-title"
					>Signatures</h2>
				</div>
				<div class="sub-modal-body">
					{{#if this.saved.current.length}}
						<div
							class="segmented err-sig-grid"
						>
							{{#each
								this.saved.current
								as |url|
							}}
								<div
									class="err-sig-cell"
								>
									<button
										type="button"
										class="err-sig-place"
										aria-label="Place signature"
										{{on
											"click"
											(fn
												this.place
												url
											)
										}}
									>
										<img
											src={{url}}
											alt=""
											class="err-sig-img"
										/>
									</button>
									<button
										type="button"
										class="err-sig-remove"
										aria-label="Remove signature"
										{{on
											"click"
											(fn
												this.remove
												url
											)
										}}
									>
										<Icon
											@name="x"
										/>
									</button>
								</div>
							{{/each}}
						</div>
					{{/if}}
					<canvas
						class="err-sig-pad"
						aria-label="Draw signature"
						{{this.pad}}
					></canvas>
				</div>
				<input
					type="file"
					accept="image/png,image/jpeg"
					class="dt-sr-only"
					aria-label="Upload signature"
					{{this.registerInput}}
					{{on "change" this.onUpload}}
				/>
				<div class="sub-modal-footer">
					<button
						type="button"
						class="sub-modal-btn is-ghost"
						{{on "click" this.pickUpload}}
					>
						<Icon @name="upload" />
						Upload
					</button>
					<button
						type="button"
						class="sub-modal-btn is-ghost"
						{{on "click" this.clear}}
					>
						<Icon @name="eraser" />
						Clear
					</button>
					<button
						type="button"
						class="sub-modal-btn is-primary"
						{{on "click" this.useDrawn}}
					>
						<Icon @name="signature" />
						Place
					</button>
				</div>
			</div>
		</dialog>
	</template>
}
