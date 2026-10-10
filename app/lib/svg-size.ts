const PX = /^\s*[\d.]+\s*(px)?\s*$/;

// img misreports unsized svgs
export function pinSvgSize(svg: string, edge = 512): string | null {
	const doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
	if (doc.querySelector('parsererror')) return null;
	const root = doc.documentElement;

	let [, , w = 0, h = 0] = (root.getAttribute('viewBox') ?? '')
		.trim()
		.split(/[\s,]+/)
		.map(Number);
	if (!(w > 0 && h > 0)) {
		const width = root.getAttribute('width') ?? '';
		const height = root.getAttribute('height') ?? '';
		if (PX.test(width) && PX.test(height)) {
			w = parseFloat(width);
			h = parseFloat(height);
			root.setAttribute('viewBox', `0 0 ${w} ${h}`);
		} else {
			w = h = edge;
		}
	}

	const scale = edge / Math.max(w, h);
	root.setAttribute('width', String(w * scale));
	root.setAttribute('height', String(h * scale));
	return new XMLSerializer().serializeToString(doc);
}
