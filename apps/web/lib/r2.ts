import crypto from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { createAdminClient } from "./supabase";
import { env } from "./env";

const MAX_MANAGED_ASSET_BYTES = 500 * 1024 * 1024;
function client() {
  return new S3Client({ region: "auto", endpoint: `https://${env.r2AccountId()}.r2.cloudflarestorage.com`, credentials: { accessKeyId: env.r2AccessKeyId(), secretAccessKey: env.r2SecretAccessKey() } });
}
export async function createUploadUrl(userId: string, fileName: string, contentType: string, sizeBytes: number, requestId: string) {
  const extension = fileName.match(/\.[a-z0-9]{1,10}$/i)?.[0]?.toLowerCase() ?? "";
  const objectKey = `users/${userId}/uploads/${crypto.createHash("sha256").update(userId + requestId).digest("hex")}${extension}`;
  const reservation = await createAdminClient().rpc("reserve_cloud_storage", { p_user_id: userId, p_object_key: objectKey, p_mime_type: contentType, p_size_bytes: sizeBytes });
  if (reservation.error) throw new Error(reservation.error.message);
  const command = new PutObjectCommand({ Bucket: env.r2Bucket(), Key: objectKey, ContentType: contentType, ContentLength: sizeBytes, Metadata: { owner: userId } });
  return {
    objectKey,
    uploadUrl: await getSignedUrl(client(), command, { expiresIn: 900, signableHeaders: new Set(["content-length"]) }),
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
  const objectKey = `users/${input.userId}/jobs/${input.jobId}/${crypto.createHash("sha256").update(input.sourceUrl).digest("hex")}${extension}`;
  const reservation = await createAdminClient().rpc("reserve_cloud_storage", { p_user_id: input.userId, p_object_key: objectKey, p_mime_type: contentType, p_size_bytes: body.byteLength });
  if (reservation.error) throw new Error(reservation.error.message);
  await client().send(new PutObjectCommand({ Bucket: env.r2Bucket(), Key: objectKey, Body: body, ContentType: contentType, Metadata: { owner: input.userId, job: input.jobId } }));
  return { objectKey, contentType, sizeBytes: body.byteLength };
}
export async function storeLayerAsset(input: { userId: string; jobId: string; index: number; body: Buffer }) {
  const objectKey = `users/${input.userId}/jobs/${input.jobId}/layer-${String(input.index).padStart(2, "0")}.png`;
  const reservation = await createAdminClient().rpc("reserve_cloud_storage", { p_user_id: input.userId, p_object_key: objectKey, p_mime_type: "image/png", p_size_bytes: input.body.length });
  if (reservation.error) throw new Error(reservation.error.message);
  await client().send(new PutObjectCommand({ Bucket: env.r2Bucket(), Key: objectKey, Body: input.body, ContentType: "image/png", Metadata: { owner: input.userId, job: input.jobId } }));
  return objectKey;
}
export async function createDownloadUrl(objectKey: string) {
  return getSignedUrl(client(), new GetObjectCommand({ Bucket: env.r2Bucket(), Key: objectKey }), { expiresIn: 900 });
}
export async function deleteManagedAsset(objectKey: string) {
  await client().send(new DeleteObjectCommand({ Bucket: env.r2Bucket(), Key: objectKey }));
}
