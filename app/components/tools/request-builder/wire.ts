export type Part = 'start' | 'headers' | 'body';

export const PARTS: Part[] = ['start', 'headers', 'body'];

export interface WireLine {
	part: Part;
	/** Bytes before the line in the message on the wire. */
	offset: number;
	text: string;
	/** CRLF in the head, LF between body lines, nothing after the last. */
	ending: '\r\n' | '\n' | '';
}

const size = (text: string) => new TextEncoder().encode(text).length;

/**
 * RequestWire.lines: the message as it goes on the wire, the head in CRLF
 * lines up to the blank line, the body as typed; with the bytes of the
 * request line, the headers (blank line included) and the body.
 */
export function wireLines(message: string): {
	lines: WireLine[];
	bytes: Record<Part, number>;
} {
	const split = message.indexOf('\n\n');
	const head =
		split >= 0
			? message.slice(0, split)
			: message.endsWith('\n')
				? message.slice(0, -1)
				: message;
	const body = split >= 0 ? message.slice(split + 2) : '';
	const lines: WireLine[] = [];
	const bytes = { start: 0, headers: 0, body: 0 };
	let offset = 0;
	const push = (part: Part, text: string, ending: WireLine['ending']) => {
		lines.push({ part, offset, text, ending });
		const length = size(text) + ending.length;
		bytes[part] += length;
		offset += length;
	};
	head.split('\n').forEach((text, index) =>
		push(index === 0 ? 'start' : 'headers', text, '\r\n'),
	);
	push('headers', '', '\r\n');
	if (body) {
		const parts = body.split('\n');
		parts.forEach((text, index) =>
			push(
				'body',
				text,
				index < parts.length - 1 ? '\n' : '',
			),
		);
	}
	return { lines, bytes };
}

/** ByteCountFormatter's file style, as a number and a unit. */
export function byteSize(bytes: number): [number: string, unit: string] {
	if (bytes < 1000) return [String(bytes), 'bytes'];
	if (bytes < 1_000_000) return [String(Math.round(bytes / 1000)), 'KB'];
	return [(bytes / 1_000_000).toFixed(1), 'MB'];
}
