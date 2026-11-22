/**
 * Derives web-sized brand assets from the supplied logo.
 *
 *   node scripts/prepare-brand.mjs
 *
 * Outputs (committed to the repository):
 *   public/brand/civitas-logo.png  full logo, 720 px wide
 *   public/brand/civitas-mark.png  the circular mark only, 256 px square
 *   src/app/icon.png               favicon, 64 px square
 */
import { mkdir } from "node:fs/promises";
import sharp from "sharp";

const SOURCE = "Civitas City Map Logo.png";
// Region of the 1448x1086 source that contains the circular mark.
const MARK_REGION = { left: 40, top: 250, width: 500, height: 590 };
// The wordmark's "C" intrudes into the right edge of that region; paint it out.
const WORDMARK_INTRUSION = { left: 468, top: 180, width: 32, height: 250 };
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 };

await mkdir("public/brand", { recursive: true });

await sharp(SOURCE)
  .trim({ background: "#ffffff", threshold: 12 })
  .resize({ width: 720 })
  .png({ compressionLevel: 9, palette: true })
  .toFile("public/brand/civitas-logo.png");

const cover = await sharp({
  create: { width: WORDMARK_INTRUSION.width, height: WORDMARK_INTRUSION.height, channels: 4, background: WHITE },
})
  .png()
  .toBuffer();

const mark = await sharp(SOURCE)
  .extract(MARK_REGION)
  .composite([{ input: cover, left: WORDMARK_INTRUSION.left, top: WORDMARK_INTRUSION.top }])
  .png()
  .toBuffer();

const squareMark = sharp(mark).resize({ width: 256, height: 256, fit: "contain", background: WHITE });
await squareMark.clone().png({ compressionLevel: 9, palette: true }).toFile("public/brand/civitas-mark.png");
await squareMark.clone().resize(64, 64).png().toFile("src/app/icon.png");

console.log("Brand assets written.");
