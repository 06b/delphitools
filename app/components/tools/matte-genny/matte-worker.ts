import {
	average,
	drawMatte,
	heightOf,
	type Bytes,
	type MatteSpec,
} from 'delphitools-v2/components/tools/matte-genny/matte';

export type MatteRequest =
	| { kind: 'load'; id: number; file: Blob }
	| { kind: 'render'; id: number; spec: MatteSpec };

export type MatteReply =
	| {
			kind: 'loaded';
			id: number;
			width: number;
			height: number;
			dominant: Bytes;
	  }
	| { kind: 'rendered'; id: number; blob: Blob }
	| { kind: 'failed'; id: number };

// the tsconfig has the DOM lib, not the worker one
const scope = self as unknown as {
	onmessage: ((event: MessageEvent<MatteRequest>) => void) | null;
	postMessage(reply: MatteReply): void;
};

let source: ImageBitmap | undefined;

async function answer(request: MatteRequest): Promise<MatteReply> {
	if (request.kind === 'load') {
		const image = await createImageBitmap(request.file, {
			imageOrientation: 'from-image',
		});
		source?.close();
		source = image;
		return {
			kind: 'loaded',
			id: request.id,
			width: image.width,
			height: image.height,
			dominant: average(image),
		};
	}
	const { spec } = request;
	if (!source) throw new Error('no source');
	const canvas = new OffscreenCanvas(
		spec.width,
		heightOf(spec.width, spec.ratioW, spec.ratioH),
	);
	const context = canvas.getContext('2d', { alpha: false });
	if (!context) throw new Error('no context');
	drawMatte(context, source, spec);
	const blob = await canvas.convertToBlob({ type: 'image/png' });
	return { kind: 'rendered', id: request.id, blob };
}

scope.onmessage = (event) => {
	answer(event.data).then(scope.postMessage.bind(scope), () =>
		scope.postMessage({ kind: 'failed', id: event.data.id }),
	);
};
