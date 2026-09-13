import crypto from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "./env";

const MAX_MANAGED_ASSET_BYTES = 500 * 1024 * 1024;
function client() {
  return new S3Client({ region: "auto", endpoint: `https://${env.r2AccountId()}.r2.cloudflarestorage.com`, credentials: { accessKeyId: env.r2AccessKeyId(), secretAccessKey: env.r2SecretAccessKey() } });
}
export async function createUploadUrl(userId: string, fileName: string, contentType: string) {
  const extension = fileName.match(/\.[a-z0-9]{1,10}$/i)?.[0]?.toLowerCase() ?? "";
  const objectKey = `users/${userId}/uploads/${crypto.randomUUID()}${extension}`;
  const command = new PutObjectCommand({ Bucket: env.r2Bucket(), Key: objectKey, ContentType: contentType, Metadata: { owner: userId } });
  return {
    objectKey,
    uploadUrl: await getSignedUrl(client(), command, { expiresIn: 900 }),
    assetUrl: await getSignedUrl(client(), new GetObjectCommand({ Bucket: env.r2Bucket(), Key: objectKey }), { expiresIn: 86_400 }),
  };
}
export async function copyRemoteAsset(input: { userId: string; jobId: string; sourceUrl: string; kind: string }) {
  const response = await fetch(input.sourceUrl, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) throw new Error(`Could not download provider output: HTTP ${response.status}.`);
  const length = Number(response.headers.get("content-length") ?? 0);
  if (length > MAX_MANAGED_ASSET_BYTES) throw new Error("Provider output exceeds the managed asset limit.");
  const body = Buffer.from(await response.arrayBuffer());
  if (body.byteLength > MAX_MANAGED_ASSET_BYTES) throw new Error("Provider output exceeds the managed asset limit.");
  const contentType = response.headers.get("content-type") ?? "application/octet-stream";
  const extension = contentType.includes("image") ? ".png" : contentType.includes("video") ? ".mp4" : contentType.includes("audio") ? ".mp3" : ".bin";
  const objectKey = `users/${input.userId}/jobs/${input.jobId}/${crypto.randomUUID()}${extension}`;
  await client().send(new PutObjectCommand({ Bucket: env.r2Bucket(), Key: objectKey, Body: body, ContentType: contentType, Metadata: { owner: input.userId, job: input.jobId } }));
  return { objectKey, contentType, sizeBytes: body.byteLength };
}
export async function createDownloadUrl(objectKey: string) {
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: env.r2Bucket(), Key: objectKey }), { expiresIn: 900 });
}
export async function deleteManagedAsset(objectKey: string) {
  await client().send(new DeleteObjectCommand({ Bucket: env.r2Bucket(), Key: objectKey }));
}
