// Cloudflare R2 storage service
// Generates presigned URLs for frontend direct uploads + manages card images

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { logger } from "../logger/index.js";

const client = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY!,
    secretAccessKey: process.env.R2_SECRET_KEY!,
  },
});

export interface PresignedUrlResult {
  uploadUrl: string;
  fileUrl: string;
  key: string;
}

/**
 * Generate presigned URL for direct browser upload to R2
 * Frontend uploads directly, avoiding backend file handling
 */
export async function getPresignedUploadUrl(
  userId: number,
  filename: string,
  contentType: string
): Promise<PresignedUrlResult> {
  // Path: cards/{userId}/{timestamp}-{filename}
  const timestamp = Date.now();
  const key = `cards/${userId}/${timestamp}-${filename.replace(/[^a-z0-9.-]/gi, "_")}`;

  try {
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET_NAME!,
      Key: key,
      ContentType: contentType,
    });

    const uploadUrl = await getSignedUrl(client, command, { expiresIn: 3600 }); // 1 hour

    // Public file URL via Cloudflare public development URL
    const fileUrl = `${process.env.R2_PUBLIC_URL}/${key}`;

    logger.info({ userId, key, contentType }, "Presigned upload URL generated");

    return { uploadUrl, fileUrl, key };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err }, "Failed to generate presigned URL");
    throw new Error(`R2 upload failed: ${msg}`);
  }
}

/**
 * Delete file from R2 (soft cleanup, card retains URL reference)
 */
export async function deleteFile(key: string): Promise<void> {
  try {
    // TODO: implement delete if needed
    logger.info({ key }, "File marked for cleanup");
  } catch (err) {
    logger.error({ err, key }, "Failed to delete file");
  }
}
