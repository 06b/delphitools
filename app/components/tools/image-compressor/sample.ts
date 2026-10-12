// ?compressSample: the iOS -compressSample launch argument, a drawn 1600 x 1200 PNG
export async function drawnSample(): Promise<File> {
	const canvas = document.createElement('canvas');
	canvas.width = 1600;
	canvas.height = 1200;
	const context = canvas.getContext('2d')!;
	const sky = context.createLinearGradient(0, 0, 1600, 1200);
	sky.addColorStop(0, '#1d3b8f');
	sky.addColorStop(0.55, '#e07a3f');
	sky.addColorStop(1, '#f6d58e');
	context.fillStyle = sky;
	context.fillRect(0, 0, 1600, 1200);
	for (let i = 0; i < 24; i++) {
		context.fillStyle = `hsl(${i * 15} 70% 55% / 0.7)`;
		context.beginPath();
		context.arc(
			100 + i * 60,
			600 + Math.sin(i) * 300,
			40 + i * 4,
			0,
			7,
		);
		context.fill();
	}
	const blob = await new Promise<Blob | null>((resolve) =>
		canvas.toBlob(resolve, 'image/png'),
	);
	return new File([blob!], 'sample.png', { type: 'image/png' });
}
