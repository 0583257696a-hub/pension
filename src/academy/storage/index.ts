import { createReadStream, existsSync, mkdirSync, statSync } from "node:fs";
import { writeFile, readFile, open } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { getConfig } from "../config";
import { cloudflareEnv } from "../platform";
import { presignUrl } from "./sigv4";

/**
 * Object storage for uploaded videos and course materials.
 *  - "r2-binding": Cloudflare R2 through the Worker binding ACADEMY_MEDIA (picked automatically on Cloudflare).
 *  - "r2": Cloudflare R2 through its S3 API with presigned URLs (any Node host).
 *  - "local": files under ACADEMY_UPLOAD_DIR (development).
 */
export interface ObjectStream {
  body: ReadableStream;
  size: number;
  start: number;
  end: number;
  partial: boolean;
}

export interface StorageProvider {
  readonly driver: "local" | "r2" | "r2-binding";
  /** Server-side write (uploads that go through the app). */
  put(key: string, data: Uint8Array, contentType: string): Promise<void>;
  /** First `bytes` bytes, for file-type checks. */
  head(key: string, bytes: number): Promise<{ size: number; firstBytes: Uint8Array } | null>;
  /** Whole object (used for metadata parsing of moderate-size files). */
  read(key: string): Promise<Uint8Array | null>;
  /** URL the browser can PUT to directly, or null when uploads go through the server. */
  presignedUpload(key: string, contentType: string): Promise<string | null>;
  /** Short-lived URL for playback, or null when the app streams the file itself. */
  presignedDownload(key: string, expiresSeconds?: number): Promise<string | null>;
  /** Streams the object (optionally a byte range) through the app. */
  stream(key: string, range?: { start: number; end?: number }): Promise<ObjectStream | null>;
}

function safeKey(key: string): string {
  if (key.includes("..") || key.startsWith("/")) throw new Error("מפתח אחסון לא תקין");
  return key;
}

class LocalStorage implements StorageProvider {
  readonly driver = "local" as const;
  constructor(private readonly root: string) {}

  private file(key: string): string {
    return path.join(this.root, safeKey(key));
  }

  async put(key: string, data: Uint8Array): Promise<void> {
    const file = this.file(key);
    mkdirSync(path.dirname(file), { recursive: true });
    await writeFile(file, data);
  }

  async head(key: string, bytes: number) {
    const file = this.file(key);
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
    const file = this.file(key);
    if (!existsSync(file)) return null;
    return new Uint8Array(await readFile(file));
  }

  async presignedUpload() {
    return null;
  }

  async presignedDownload() {
    return null;
  }

  async stream(key: string, range?: { start: number; end?: number }): Promise<ObjectStream | null> {
    const file = this.file(key);
    if (!existsSync(file)) return null;
    const size = statSync(file).size;
    const start = range?.start ?? 0;
    const end = Math.min(range?.end ?? size - 1, size - 1);
    const body = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
    return { body, size, start, end, partial: !!range };
  }
}

/** Structural subset of the Workers R2 bucket binding used here. */
interface R2BucketLike {
  put(key: string, value: ArrayBuffer | Uint8Array, options?: { httpMetadata?: { contentType?: string } }): Promise<unknown>;
  get(key: string, options?: { range?: { offset: number; length?: number } }): Promise<{ body: ReadableStream; size: number; arrayBuffer(): Promise<ArrayBuffer> } | null>;
  head(key: string): Promise<{ size: number } | null>;
}

class R2BindingStorage implements StorageProvider {
  readonly driver = "r2-binding" as const;
  constructor(private readonly bucket: R2BucketLike) {}

  async put(key: string, data: Uint8Array, contentType: string) {
    await this.bucket.put(safeKey(key), data, { httpMetadata: { contentType } });
  }

  async head(key: string, bytes: number) {
    const meta = await this.bucket.head(safeKey(key));
    if (!meta) return null;
    const object = await this.bucket.get(key, { range: { offset: 0, length: Math.min(bytes, meta.size) } });
    if (!object) return null;
    return { size: meta.size, firstBytes: new Uint8Array(await object.arrayBuffer()) };
  }

  async read(key: string) {
    const object = await this.bucket.get(safeKey(key));
    return object ? new Uint8Array(await object.arrayBuffer()) : null;
  }

  async presignedUpload() {
    return null;
  }

  async presignedDownload() {
    return null;
  }

  async stream(key: string, range?: { start: number; end?: number }): Promise<ObjectStream | null> {
    const meta = await this.bucket.head(safeKey(key));
    if (!meta) return null;
    const start = range?.start ?? 0;
    const end = Math.min(range?.end ?? meta.size - 1, meta.size - 1);
    const object = await this.bucket.get(key, range ? { range: { offset: start, length: end - start + 1 } } : undefined);
    if (!object) return null;
    return { body: object.body, size: meta.size, start, end, partial: !!range };
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

  async stream(): Promise<ObjectStream | null> {
    return null; // playback uses presignedDownload
  }
}

let cached: StorageProvider | null = null;

export async function getStorage(): Promise<StorageProvider> {
  if (cached) return cached;
  const config = getConfig().storage;
  const env = await cloudflareEnv();
  if (env?.ACADEMY_MEDIA && !process.env.ACADEMY_STORAGE_DRIVER) {
    cached = new R2BindingStorage(env.ACADEMY_MEDIA as R2BucketLike);
  } else if (config.driver === "r2") {
    const { accountId, bucket, accessKeyId, secretAccessKey } = config.r2;
    if (!accountId || !bucket || !accessKeyId || !secretAccessKey) {
      throw new Error("R2 storage selected but CF_ACCOUNT_ID / R2_BUCKET / R2_ACCESS_KEY_ID / R2_SECRET_ACCESS_KEY are missing");
    }
    cached = new R2Storage({ accountId, bucket, accessKeyId, secretAccessKey });
  } else {
    if (env) throw new Error("No ACADEMY_MEDIA R2 binding found. Add it in wrangler.jsonc (r2_buckets).");
    cached = new LocalStorage(path.resolve(config.localDir));
  }
  return cached;
}

export function resetStorageForTests() {
  cached = null;
}

export { LocalStorage, R2Storage, R2BindingStorage };
