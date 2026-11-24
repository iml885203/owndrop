import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import type { BlobHead, BlobRange, BlobReadResult, BlobStore } from "../../types.js";

const SAFE_KEY_RE = /^[a-zA-Z0-9_-]{8,128}$/;

export class FsBlobStore implements BlobStore {
  private readonly dir: string;

  constructor(baseDir: string) {
    this.dir = path.resolve(baseDir);
    fs.mkdirSync(this.dir, { recursive: true });
  }

  private resolveSafePath(key: string): string {
    if (!SAFE_KEY_RE.test(key)) {
      throw new Error("Invalid blob storage key");
    }
    const target = path.resolve(this.dir, key);
    if (!target.startsWith(this.dir + path.sep)) {
      throw new Error("Blob path traversal rejected");
    }
    return target;
  }

  async put(
    key: string,
    body: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>,
  ): Promise<void> {
    const target = this.resolveSafePath(key);
    const temp = `${target}.tmp-${Date.now()}-${Math.random().toString(16).slice(2)}`;
    try {
      if (body instanceof ArrayBuffer) {
        await fsp.writeFile(temp, new Uint8Array(body));
      } else if (body instanceof Uint8Array) {
        await fsp.writeFile(temp, body);
      } else {
        const reader = body.getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          chunks.push(value);
        }
        await fsp.writeFile(temp, Buffer.concat(chunks));
      }
      await fsp.rename(temp, target);
    } catch (error) {
      await fsp.rm(temp, { force: true }).catch(() => {});
      throw error;
    }
  }

  async get(key: string, range?: BlobRange): Promise<BlobReadResult | null> {
    const target = this.resolveSafePath(key);
    let stat: fs.Stats;
    try {
      stat = await fsp.stat(target);
    } catch {
      return null;
    }
    const stream = range
      ? fs.createReadStream(target, { start: range.start, end: range.end })
      : fs.createReadStream(target);
    return {
      body: Readable.toWeb(stream) as unknown as ReadableStream<Uint8Array>,
      size: stat.size,
      ...(range ? { range } : {}),
    };
  }

  async head(key: string): Promise<BlobHead | null> {
    const target = this.resolveSafePath(key);
    try {
      const stat = await fsp.stat(target);
      return { size: stat.size };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    const target = this.resolveSafePath(key);
    await fsp.rm(target, { force: true });
  }
}
