/** A bitmap of any image the browser can show, svg included: createImageBitmap rejects svg blobs, a sized <img> does not. */
export async function decodeImage(file: Blob): Promise<ImageBitmap> {
	const url = URL.createObjectURL(file);
	try {
		const img = new Image();
		img.src = url;
		await img.decode();
		return await createImageBitmap(img, {
			imageOrientation: 'from-image',
		});
	} finally {
		URL.revokeObjectURL(url);
	}
}
