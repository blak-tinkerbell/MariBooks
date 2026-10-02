/**
 * S3 access for proof-of-transaction files (invoices/receipts).
 *
 * The file never passes through Lambda: the browser PUTs it straight to S3 using a short-lived
 * presigned URL, and later GETs it the same way. Every key is forced under the caller's tenant
 * prefix (`TENANT#<sub>/proof/…`), so a presigned URL can only ever touch the owner's own files.
 * The bucket is private (no public access); KMS-encrypted; CORS allows only the app origin.
 */
import { randomUUID } from "node:crypto";
import { GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const BUCKET = process.env.PROOF_BUCKET ?? "";
const UPLOAD_TTL = 300; // 5 minutes to upload
const VIEW_TTL = 300; // 5 minutes to view

let client: S3Client | null = null;
const s3 = () => (client ??= new S3Client({}));

export function proofEnabled(): boolean {
  return BUCKET.length > 0;
}

/** The tenant's private prefix. A key must start with this or it is rejected. */
function tenantPrefix(tenantId: string): string {
  return `TENANT#${tenantId}/proof/`;
}

/** Allow only known file types for a receipt/invoice. */
const ALLOWED: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "application/pdf": "pdf",
};

export function isAllowedContentType(contentType: string): boolean {
  return contentType in ALLOWED;
}

/** Reject any key that escapes the tenant's own prefix (defence in depth). */
export function keyBelongsToTenant(tenantId: string, key: string): boolean {
  return key.startsWith(tenantPrefix(tenantId)) && !key.includes("..");
}

/**
 * Mint a presigned PUT URL the browser uses to upload one file directly to S3, plus the key to
 * store on the transaction. The content type is pinned into the signature so the upload must
 * match what was declared.
 */
export async function presignUpload(
  tenantId: string,
  contentType: string,
): Promise<{ uploadUrl: string; key: string; expiresIn: number }> {
  const ext = ALLOWED[contentType] ?? "bin";
  const key = `${tenantPrefix(tenantId)}${randomUUID()}.${ext}`;
  const url = await getSignedUrl(
    s3(),
    new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: contentType }),
    { expiresIn: UPLOAD_TTL },
  );
  return { uploadUrl: url, key, expiresIn: UPLOAD_TTL };
}

/** Mint a short-lived presigned GET URL so the owner can view their own proof file. */
export async function presignView(key: string): Promise<string> {
  return getSignedUrl(
    s3(),
    new GetObjectCommand({ Bucket: BUCKET, Key: key }),
    { expiresIn: VIEW_TTL },
  );
}

export function bucketName(): string {
  return BUCKET;
}
