import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { writeFile, readFile, open } from "node:fs/promises";
import path from "node:path";
import { getConfig } from "../config";
import { presignUrl } from "./sigv4";

/**
 * Object storage for uploaded videos and course materials.
 *  - "local": files under ACADEMY_UPLOAD_DIR (development).
 *  - "r2": Cloudflare R2 through its S3-compatible API with presigned URLs, so
 *    large files go straight between the browser and R2.
 */
export interface StorageProvider {
  readonly driver: "local" | "r2";
  /** Server-side write (small files, or local development uploads). */
  put(key: string, data: Uint8Array, contentType: string): Promise<void>;
  /** First `bytes` bytes, for file-type checks. */
  head(key: string, bytes: number): Promise<{ size: number; firstBytes: Uint8Array } | null>;
  /** Whole object (used for metadata parsing of moderate-size files). */
  read(key: string): Promise<Uint8Array | null>;
  /** URL the browser can PUT to directly, or null when uploads go through the server. */
  presignedUpload(key: string, contentType: string): Promise<string | null>;
  /** Short-lived URL for playback, or null when the server streams the file. */
  presignedDownload(key: string, expiresSeconds?: number): Promise<string | null>;
  /** Local path for streaming (local driver only). */
  localPath(key: string): string | null;
}

function safeKey(key: string): string {
  if (key.includes("..") || key.startsWith("/")) throw new Error("מפתח אחסון לא תקין");
  return key;
}

class LocalStorage implements StorageProvider {
  readonly driver = "local" as const;
  constructor(private readonly root: string) {}

  localPath(key: string): string {
    return path.join(this.root, safeKey(key));
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    const file = this.localPath(key);
    mkdirSync(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  }

  async head(key: string, bytes: number) {
    const file = this.localPath(key);
    if (!existsSync(file)) return null;
    const size = statSync(file).size;
    const handle = await open(file, "r");
    try {
      const buffer = Buffer.alloc(Math.min(bytes, size));
      await handle.read(buffer, 0, buffer.length, 0);
      return { size, firstBytes: new Uint8Array(buffer) };
    } finally {
      await handle.close();
    }
  }

  async read(key: string) {
    const file = this.localPath(key);
    if (!existsSync(file)) return null;
    return new Uint8Array(await readFile(file));
  }

  async presignedUpload() {
    return null;
  }

  async presignedDownload() {
    return null;
  }

  stream(key: string, start?: number, end?: number) {
    return createReadStream(this.localPath(key), { start, end });
  }
}

class R2Storage implements StorageProvider {
  readonly driver = "r2" as const;
  private readonly host: string;
  constructor(private readonly cfg: { accountId: string; bucket: string; accessKeyId: string; secretAccessKey: string }) {
    this.host = `${cfg.accountId}.r2.cloudflarestorage.com`;
  }

  private sign(method: "GET" | "PUT" | "HEAD", key: string, expires: number) {
    return presignUrl({
      method,
      host: this.host,
      path: `/${this.cfg.bucket}/${safeKey(key)}`,
      region: "auto",
      accessKeyId: this.cfg.accessKeyId,
      secretAccessKey: this.cfg.secretAccessKey,
      expiresSeconds: expires,
    });
  }

  localPath() {
    return null;
  }

  async put(key: string, data: Uint8Array, contentType: string) {
    const response = await fetch(this.sign("PUT", key, 300), { method: "PUT", body: Buffer.from(data), headers: { "content-type": contentType } });
    if (!response.ok) throw new Error(`R2 upload failed: ${response.status}`);
  }

  async head(key: string, bytes: number) {
    const response = await fetch(this.sign("GET", key, 120), { headers: { range: `bytes=0-${bytes - 1}` } });
    if (response.status === 404) return null;
    if (!response.ok && response.status !== 206) throw new Error(`R2 read failed: ${response.status}`);
    const range = response.headers.get("content-range");
    const size = range ? Number(range.split("/")[1]) : Number(response.headers.get("content-length") ?? 0);
    return { size, firstBytes: new Uint8Array(await response.arrayBuffer()) };
  }

  async read(key: string) {
    const response = await fetch(this.sign("GET", key, 300));
    if (!response.ok) return null;
    return new Uint8Array(await response.arrayBuffer());
  }

  async presignedUpload(key: string) {
    return this.sign("PUT", key, 3600);
  }

  async presignedDownload(key: string, expiresSeconds = 900) {
    return this.sign("GET", key, expiresSeconds);
  }
}

let cached: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (cached) return cached;
  const config = getConfig().storage;
  if (config.driver === "r2") {
    const { accountId, bucket, accessKeyId, secretAccessKey } = config.r2;
    if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
      throw new Error("R2 storage selected but CF_ACCOUNT_ID / R2_BUCKET / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY are missing");
    }
    cached = new R2Storage({ accountId, bucket, accessKeyId, secretAccessKey });
  } else {
    cached = new LocalStorage(path.resolve(config.localDir));
  }
  return cached;
}

export function resetStorageForTests() {
  cached = null;
}

export { LocalStorage, R2Storage };
