// iOS EditorLayout.share: each panel keeps its natural height when all
// fit; otherwise the largest are cut to an equal share of what the rest
// leave
export function sharePanels(room: number, naturals: number[]): number[] {
	let left = room;
	let open = naturals.map((_, i) => i);
	const result = [...naturals];
	while (open.length) {
		const fair = left / open.length;
		const small = open.filter((i) => naturals[i]! <= fair);
		if (!small.length) {
			for (const i of open) result[i] = Math.max(0, fair);
			break;
		}
		for (const i of small) left -= naturals[i]!;
		open = open.filter((i) => naturals[i]! > fair);
	}
	return result;
}
