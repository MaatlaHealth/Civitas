const MAX_DIMENSION_PIXELS = 1600;
const JPEG_QUALITY = 0.85;

/**
 * Downsizes a photograph in the browser before upload. This keeps uploads
 * within the server's request size limit on slow mobile connections and
 * drops embedded metadata (such as GPS position) before the file leaves the
 * device. The server validates and re-encodes the image again regardless.
 *
 * Returns the original file if the browser cannot decode it; the server
 * will then accept or reject it on its own checks.
 */
export async function downscaleImage(file: File): Promise<Blob> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: "from-image" });
  } catch {
    return file;
  }
  const scale = Math.min(1, MAX_DIMENSION_PIXELS / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY));
  return blob ?? file;
}
