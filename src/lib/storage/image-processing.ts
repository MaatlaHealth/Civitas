import sharp from "sharp";
import { AppError } from "@/lib/errors";

/**
 * Netlify Functions accept request bodies up to roughly 6 MB (less once
 * binary data is base64-encoded), so uploads are capped well below that. The
 * report form downsizes photographs in the browser before sending them.
 */
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
const MAX_DIMENSION_PIXELS = 1600;
const JPEG_QUALITY = 82;

export type SupportedImageType = "image/jpeg" | "image/png" | "image/webp";

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0): boolean =>
  signature.every((value, index) => bytes[offset + index] === value);

/** Identifies the format from the file's leading bytes, ignoring its name and declared type. */
export function detectImageType(bytes: Uint8Array): SupportedImageType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return "image/jpeg";
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  const isRiff = startsWith(bytes, [0x52, 0x49, 0x46, 0x46]);
  if (isRiff && startsWith(bytes, [0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

export interface ProcessedImage {
  bytes: Uint8Array;
  contentType: "image/jpeg";
  width: number;
  height: number;
}

/**
 * Validates an upload and re-encodes it as a JPEG. Re-encoding applies the
 * EXIF orientation and then drops all metadata (including GPS position and
 * device details), and guarantees that what is stored really is an image.
 */
export async function processUploadedImage(bytes: Uint8Array): Promise<ProcessedImage> {
  if (bytes.byteLength === 0) throw new AppError("validation", "The uploaded photograph is empty.");
  if (bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new AppError("payload_too_large", "The photograph is too large. The maximum size is 4 MB.");
  }
  if (!detectImageType(bytes)) {
    throw new AppError("unsupported_media", "Unsupported file type. Please upload a JPEG, PNG or WebP photograph.");
  }
  try {
    const { data, info } = await sharp(bytes, { failOn: "error" })
      .rotate()
      .resize({ width: MAX_DIMENSION_PIXELS, height: MAX_DIMENSION_PIXELS, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer({ resolveWithObject: true });
    return { bytes: new Uint8Array(data), contentType: "image/jpeg", width: info.width, height: info.height };
  } catch {
    throw new AppError("validation", "The photograph could not be read. It may be corrupted; please try another file.");
  }
}
