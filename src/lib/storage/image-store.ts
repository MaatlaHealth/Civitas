import path from "node:path";
import { AppError } from "@/lib/errors";

/**
 * Private object storage for incident photographs. Nothing stored here has a
 * public URL; images are only served through an authorised route handler.
 */
export interface ImageStore {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  get(key: string): Promise<Uint8Array | null>;
  delete(key: string): Promise<void>;
}

const BLOB_STORE_NAME = "incident-images";

function netlifyBlobStore(): ImageStore {
  const store = async () => {
    const { getStore } = await import("@netlify/blobs");
    return getStore({ name: BLOB_STORE_NAME, consistency: "strong" });
  };
  return {
    async put(key, bytes, contentType) {
      const blob = new Blob([new Uint8Array(bytes)], { type: contentType });
      await (await store()).set(key, blob, { metadata: { contentType } });
    },
    async get(key) {
      const data = await (await store()).get(key, { type: "arrayBuffer" });
      return data ? new Uint8Array(data) : null;
    },
    async delete(key) {
      await (await store()).delete(key);
    },
  };
}

/** Development-only store under ./.data. Never used on a serverless host. */
function localFileStore(): ImageStore {
  const root = path.join(process.cwd(), ".data", "uploads");
  // Keys are generated server-side, but resolve defensively so a key can
  // never address a file outside the upload directory.
  const resolve = (key: string) => {
    const target = path.resolve(root, key);
    if (!target.startsWith(root + path.sep)) throw new AppError("validation", "Invalid storage key.");
    return target;
  };
  return {
    async put(key, bytes) {
      const { mkdir, writeFile } = await import("node:fs/promises");
      const target = resolve(key);
      await mkdir(path.dirname(target), { recursive: true });
      await writeFile(target, bytes);
    },
    async get(key) {
      const { readFile } = await import("node:fs/promises");
      try {
        return new Uint8Array(await readFile(resolve(key)));
      } catch {
        return null;
      }
    },
    async delete(key) {
      const { rm } = await import("node:fs/promises");
      await rm(resolve(key), { force: true });
    },
  };
}

function runningOnNetlify(): boolean {
  return Boolean(process.env.NETLIFY || process.env.NETLIFY_BLOBS_CONTEXT || process.env.SITE_ID);
}

let override: ImageStore | undefined;

export function setImageStoreForTesting(store: ImageStore | undefined): void {
  override = store;
}

export function getImageStore(): ImageStore {
  if (override) return override;
  if (runningOnNetlify()) return netlifyBlobStore();
  if (process.env.NODE_ENV !== "production" || process.env.CIVITAS_ALLOW_EMBEDDED_DB === "true") {
    return localFileStore();
  }
  throw new AppError("unavailable", "Photograph storage is not configured for this deployment.");
}
