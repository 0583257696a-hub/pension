import { createHash, createHmac } from "node:crypto";

/**
 * Minimal AWS Signature V4 query-string presigning (S3-compatible), used for
 * Cloudflare R2. No SDK dependency; covers GET and PUT presigned URLs.
 */
export interface PresignInput {
  method: "GET" | "PUT" | "HEAD";
  host: string;
  path: string; // already starting with "/", e.g. /bucket/key
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  expiresSeconds: number;
  date?: Date;
  service?: string;
}

function hmac(key: Buffer | string, data: string): Buffer {
  return createHmac("sha256", key).update(data, "utf8").digest();
}

export function encodeRfc3986(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function encodePath(path: string): string {
  return path.split("/").map(encodeRfc3986).join("/");
}

export function presignUrl(input: PresignInput): string {
  const service = input.service ?? "s3";
  const date = input.date ?? new Date();
  const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const scope = `${dateStamp}/${input.region}/${service}/aws4_request`;
  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${input.accessKeyId}/${scope}`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(input.expiresSeconds),
    "X-Amz-SignedHeaders": "host",
  };
  const canonicalQuery = Object.keys(query)
    .sort()
    .map((k) => `${encodeRfc3986(k)}=${encodeRfc3986(query[k])}`)
    .join("&");
  const canonicalRequest = [input.method, encodePath(input.path), canonicalQuery, `host:${input.host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, createHash("sha256").update(canonicalRequest).digest("hex")].join("\n");
  const kDate = hmac(`AWS4${input.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, input.region);
  const kService = hmac(kRegion, service);
  const kSigning = hmac(kService, "aws4_request");
  const signature = createHmac("sha256", kSigning).update(stringToSign).digest("hex");
  return `https://${input.host}${encodePath(input.path)}?${canonicalQuery}&X-Amz-Signature=${signature}`;
}
