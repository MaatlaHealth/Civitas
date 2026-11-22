import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { AppError, type AppErrorCode } from "@/lib/errors";
import { detectImageType, MAX_UPLOAD_BYTES, processUploadedImage } from "@/lib/storage/image-processing";

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_SOI = [0xff, 0xd8, 0xff];

type Format = "png" | "jpeg" | "webp";

/** Generates a real image of the given size with some non-uniform content. */
async function makeImage(width: number, height: number, format: Format): Promise<Uint8Array> {
  const base = sharp({ create: { width, height, channels: 3, background: { r: 200, g: 60, b: 30 } } }).composite([
    {
      input: { create: { width: Math.max(1, Math.floor(width / 2)), height: Math.max(1, Math.floor(height / 2)), channels: 3, background: { r: 10, g: 90, b: 220 } } },
      left: 0,
      top: 0,
    },
  ]);
  const encoded = format === "png" ? base.png() : format === "jpeg" ? base.jpeg() : base.webp();
  return new Uint8Array(await encoded.toBuffer());
}

async function expectAppError(promise: Promise<unknown>, code: AppErrorCode): Promise<AppError> {
  const error: unknown = await promise.then(
    () => null,
    (reason: unknown) => reason,
  );
  expect(error, "expected the upload to be rejected").toBeInstanceOf(AppError);
  if (!(error instanceof AppError)) throw new Error("unreachable");
  expect(error.code).toBe(code);
  return error;
}

describe("detectImageType", () => {
  it("recognises real PNG, JPEG and WebP files by their magic bytes", async () => {
    expect(detectImageType(await makeImage(8, 8, "png"))).toBe("image/png");
    expect(detectImageType(await makeImage(8, 8, "jpeg"))).toBe("image/jpeg");
    expect(detectImageType(await makeImage(8, 8, "webp"))).toBe("image/webp");
  });

  it("recognises bare signatures", () => {
    expect(detectImageType(new Uint8Array(JPEG_SOI))).toBe("image/jpeg");
    expect(detectImageType(new Uint8Array(PNG_SIGNATURE))).toBe("image/png");
    // "RIFF" + 4 size bytes + "WEBP"
    expect(detectImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("image/webp");
  });

  it("rejects a text file renamed to .jpg (content, not name, decides)", () => {
    const renamed = new TextEncoder().encode("This is not a photograph. It was saved as holiday.jpg.\n");
    expect(detectImageType(renamed)).toBeNull();
  });

  it("rejects other common file types", () => {
    const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
    expect(detectImageType(encode("%PDF-1.7\n"))).toBeNull();
    expect(detectImageType(encode("GIF89a"))).toBeNull();
    expect(detectImageType(encode("<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"))).toBeNull();
    expect(detectImageType(encode("<!doctype html><html></html>"))).toBeNull();
    expect(detectImageType(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBeNull(); // ZIP
    expect(detectImageType(new Uint8Array([0x4d, 0x5a, 0x90, 0x00]))).toBeNull(); // Windows executable
  });

  it("rejects a RIFF container that is not WebP (for example a WAV file)", () => {
    const wav = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
    expect(detectImageType(wav)).toBeNull();
  });

  it("rejects empty and truncated input", () => {
    expect(detectImageType(new Uint8Array(0))).toBeNull();
    expect(detectImageType(new Uint8Array([0xff, 0xd8]))).toBeNull();
    expect(detectImageType(new Uint8Array(PNG_SIGNATURE.slice(0, 7)))).toBeNull();
    expect(detectImageType(new Uint8Array([0x52, 0x49, 0x46, 0x46]))).toBeNull();
  });

  it("requires the signature at the start of the file", () => {
    expect(detectImageType(new Uint8Array([0x00, ...JPEG_SOI]))).toBeNull();
    expect(detectImageType(new Uint8Array([0x20, ...PNG_SIGNATURE]))).toBeNull();
  });
});

describe("processUploadedImage", () => {
  it("re-encodes a real PNG as a JPEG of the same dimensions", async () => {
    const png = await makeImage(120, 80, "png");
    const result = await processUploadedImage(png);

    expect(result.contentType).toBe("image/jpeg");
    expect(result.width).toBe(120);
    expect(result.height).toBe(80);
    expect(result.bytes).toBeInstanceOf(Uint8Array);
    expect([...result.bytes.slice(0, 3)]).toEqual(JPEG_SOI);
    expect(detectImageType(result.bytes)).toBe("image/jpeg");

    // Decode the output independently to confirm it really is a readable JPEG.
    const metadata = await sharp(result.bytes).metadata();
    expect(metadata.format).toBe("jpeg");
    expect(metadata.width).toBe(120);
    expect(metadata.height).toBe(80);
  });

  it("accepts JPEG and WebP input and always produces JPEG", async () => {
    for (const format of ["jpeg", "webp"] as const) {
      const result = await processUploadedImage(await makeImage(64, 48, format));
      expect(result.contentType).toBe("image/jpeg");
      expect((await sharp(result.bytes).metadata()).format).toBe("jpeg");
      expect([result.width, result.height]).toEqual([64, 48]);
    }
  });

  it("caps the longest side at 1600 px, preserving the aspect ratio (landscape)", async () => {
    const result = await processUploadedImage(await makeImage(2400, 1200, "png"));
    expect(result.width).toBe(1600);
    expect(result.height).toBe(800);
    const metadata = await sharp(result.bytes).metadata();
    expect([metadata.width, metadata.height]).toEqual([1600, 800]);
  });

  it("caps the longest side at 1600 px, preserving the aspect ratio (portrait)", async () => {
    const result = await processUploadedImage(await makeImage(1000, 2000, "jpeg"));
    expect(result.width).toBe(800);
    expect(result.height).toBe(1600);
  });

  it("leaves an image exactly 1600 px wide alone and never enlarges a small one", async () => {
    const exact = await processUploadedImage(await makeImage(1600, 900, "png"));
    expect([exact.width, exact.height]).toEqual([1600, 900]);
    const small = await processUploadedImage(await makeImage(40, 30, "png"));
    expect([small.width, small.height]).toEqual([40, 30]);
  });

  it("strips EXIF metadata such as camera details and GPS position", async () => {
    const withExif = new Uint8Array(
      await sharp({ create: { width: 60, height: 40, channels: 3, background: { r: 1, g: 2, b: 3 } } })
        .withExif({
          IFD0: { Make: "CivitasTestCam", Copyright: "Private Person" },
          IFD3: { GPSLatitudeRef: "S", GPSLatitude: "26/1 12/1 14/1", GPSLongitudeRef: "E", GPSLongitude: "28/1 2/1 50/1" },
        })
        .jpeg()
        .toBuffer(),
    );
    // Sanity check: the input really carries the metadata.
    const before = await sharp(withExif).metadata();
    expect(before.exif).toBeDefined();
    expect(Buffer.from(withExif).includes("CivitasTestCam")).toBe(true);

    const result = await processUploadedImage(withExif);
    const after = await sharp(result.bytes).metadata();
    expect(after.exif).toBeUndefined();
    expect(after.icc).toBeUndefined();
    expect(after.xmp).toBeUndefined();
    expect(Buffer.from(result.bytes).includes("CivitasTestCam")).toBe(false);
    expect(Buffer.from(result.bytes).includes("Private Person")).toBe(false);
  });

  it("applies the EXIF orientation before dropping it", async () => {
    // 60×40 stored pixels flagged "rotate 90° clockwise to display" → displayed as 40×60.
    const rotated = new Uint8Array(
      await sharp({ create: { width: 60, height: 40, channels: 3, background: { r: 9, g: 9, b: 9 } } })
        .withMetadata({ orientation: 6 })
        .jpeg()
        .toBuffer(),
    );
    expect((await sharp(rotated).metadata()).orientation).toBe(6);

    const result = await processUploadedImage(rotated);
    expect([result.width, result.height]).toEqual([40, 60]);
    expect((await sharp(result.bytes).metadata()).orientation).toBeUndefined();
  });

  it("rejects an empty upload as a validation error", async () => {
    const error = await expectAppError(processUploadedImage(new Uint8Array(0)), "validation");
    expect(error.status).toBe(400);
    expect(error.message).toMatch(/empty/i);
  });

  it("rejects an upload over 4 MB with payload_too_large (413), before looking at its content", async () => {
    expect(MAX_UPLOAD_BYTES).toBe(4 * 1024 * 1024);
    const oversized = new Uint8Array(MAX_UPLOAD_BYTES + 1);
    oversized.set(PNG_SIGNATURE);
    const error = await expectAppError(processUploadedImage(oversized), "payload_too_large");
    expect(error.status).toBe(413);
    expect(error.message).toContain("4 MB");

    // Not an image at all, but still reported as too large.
    await expectAppError(processUploadedImage(new Uint8Array(MAX_UPLOAD_BYTES + 1)), "payload_too_large");
  });

  it("does not treat a file of exactly 4 MB as too large", async () => {
    // All zeros: passes the size check and fails the type check instead.
    await expectAppError(processUploadedImage(new Uint8Array(MAX_UPLOAD_BYTES)), "unsupported_media");
  });

  it("rejects a text file renamed to .jpg with unsupported_media (415)", async () => {
    const renamed = new TextEncoder().encode("Definitely not image data, just text in holiday.jpg");
    const error = await expectAppError(processUploadedImage(renamed), "unsupported_media");
    expect(error.status).toBe(415);
    expect(error.message).toMatch(/JPEG, PNG or WebP/);
  });

  it("rejects a GIF, which is a real image but not a supported format", async () => {
    const gif = new Uint8Array(
      await sharp({ create: { width: 4, height: 4, channels: 3, background: { r: 0, g: 0, b: 0 } } }).gif().toBuffer(),
    );
    await expectAppError(processUploadedImage(gif), "unsupported_media");
  });

  it("rejects corrupted data behind a valid PNG signature as a validation error", async () => {
    const corrupted = new Uint8Array(512);
    corrupted.set(PNG_SIGNATURE);
    for (let index = PNG_SIGNATURE.length; index < corrupted.length; index += 1) corrupted[index] = (index * 37) % 251;
    const error = await expectAppError(processUploadedImage(corrupted), "validation");
    expect(error.status).toBe(400);
    expect(error.message).toMatch(/could not be read/);
  });

  it("rejects corrupted data behind a valid JPEG signature as a validation error", async () => {
    const corrupted = new Uint8Array(256).fill(0x41);
    corrupted.set(JPEG_SOI);
    await expectAppError(processUploadedImage(corrupted), "validation");
  });

  it("rejects a PNG truncated to its header", async () => {
    const png = await makeImage(200, 200, "png");
    await expectAppError(processUploadedImage(png.slice(0, 40)), "validation");
  });
});
