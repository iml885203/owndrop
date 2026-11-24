import { AwsClient } from "aws4fetch";
import type { BlobHead, BlobRange, BlobReadResult, BlobStore, PresignPutResult } from "../../types.js";

export interface R2PresignConfig {
  accountId: string;
  bucketName: string;
  accessKeyId: string;
  secretAccessKey: string;
}

export class R2BlobStore implements BlobStore {
  private readonly aws?: AwsClient;

  constructor(
    private readonly bucket: R2Bucket,
    private readonly presignConfig?: R2PresignConfig,
  ) {
    if (presignConfig) {
      this.aws = new AwsClient({
        accessKeyId: presignConfig.accessKeyId,
        secretAccessKey: presignConfig.secretAccessKey,
        service: "s3",
        region: "auto",
      });
    }
  }

  async put(
    key: string,
    body: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>,
    contentType: string,
  ): Promise<void> {
    await this.bucket.put(key, body, {
      httpMetadata: { contentType },
    });
  }

  async get(key: string, range?: BlobRange): Promise<BlobReadResult | null> {
    const options = range
      ? { range: { offset: range.start, length: range.end - range.start + 1 } }
      : undefined;
    const object = await this.bucket.get(key, options);
    if (!object) return null;
    return {
      body: object.body as unknown as ReadableStream<Uint8Array>,
      size: object.size,
      ...(range ? { range } : {}),
    };
  }

  async head(key: string): Promise<BlobHead | null> {
    const meta = await this.bucket.head(key);
    if (!meta) return null;
    return {
      size: meta.size,
      contentType: meta.httpMetadata?.contentType,
    };
  }

  async delete(key: string): Promise<void> {
    await this.bucket.delete(key);
  }

  get presignPut(): BlobStore["presignPut"] {
    if (!this.aws || !this.presignConfig) return undefined;
    const aws = this.aws;
    const { accountId, bucketName } = this.presignConfig;
    return async (key: string, contentType: string, size: number, ttlSeconds: number): Promise<PresignPutResult> => {
      const endpoint = new URL(`https://${accountId}.r2.cloudflarestorage.com/${bucketName}/${encodeURIComponent(key)}`);
      endpoint.searchParams.set("X-Amz-Expires", String(ttlSeconds));
      const signed = await aws.sign(
        new Request(endpoint.toString(), {
          method: "PUT",
          headers: {
            "Content-Type": contentType,
            "Content-Length": String(size),
          },
        }),
        { aws: { signQuery: true } },
      );
      return {
        url: signed.url,
        method: "PUT",
        headers: {
          "Content-Type": contentType,
        },
        expiresAt: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      };
    };
  }
}
