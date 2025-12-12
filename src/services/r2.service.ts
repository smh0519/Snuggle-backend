import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { env } from '../config/env.js'

export const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${env.r2.accountId}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.r2.accessKeyId,
    secretAccessKey: env.r2.secretAccessKey,
  },
})

export async function uploadToR2(
  buffer: Buffer,
  key: string,
  contentType: string
): Promise<string> {
  await r2Client.send(
    new PutObjectCommand({
      Bucket: env.r2.bucketName,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    })
  )

  return `${env.r2.publicUrl}/${key}`
}

export async function deleteFromR2(key: string): Promise<void> {
  await r2Client.send(
    new DeleteObjectCommand({
      Bucket: env.r2.bucketName,
      Key: key,
    })
  )
}

export function getKeyFromUrl(url: string): string | null {
  if (!url.startsWith(env.r2.publicUrl)) {
    return null
  }
  return url.replace(`${env.r2.publicUrl}/`, '')
}
