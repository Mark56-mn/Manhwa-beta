import type { R2BucketLike, R2ObjectBodyLike, R2ObjectLike } from '../../worker/src/env';

/** Minimal in-memory R2 binding used by route tests (no network). */
export class MemoryR2Bucket implements R2BucketLike {
  objects = new Map<
    string,
    { body: ReadableStream | null; size: number; etag: string; contentType: string }
  >();

  head(key: string): Promise<R2ObjectLike | null> {
    const stored = this.objects.get(key);
    if (!stored) return Promise.resolve(null);
    return Promise.resolve({
      key,
      size: stored.size,
      etag: stored.etag,
      contentType: stored.contentType
    });
  }

  get(key: string): Promise<R2ObjectBodyLike | R2ObjectLike | null> {
    const stored = this.objects.get(key);
    if (!stored) return Promise.resolve(null);
    return Promise.resolve({
      body: stored.body,
      size: stored.size,
      etag: stored.etag,
      httpEtag: stored.etag,
      contentType: stored.contentType
    });
  }

  put(
    key: string,
    value: ReadableStream | ArrayBuffer | ArrayBufferView | string | null | Blob,
    options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }
  ): Promise<R2ObjectLike | null> {
    const size =
      value instanceof ArrayBuffer
        ? value.byteLength
        : typeof value === 'string'
          ? new TextEncoder().encode(value).byteLength
          : 0;
    const etag = `etag-${this.objects.size + 1}`;
    this.objects.set(key, {
      body: null,
      size,
      etag,
      contentType: options?.httpMetadata?.contentType ?? 'application/octet-stream'
    });
    return Promise.resolve({ key, size, etag, httpEtag: etag });
  }

  delete(key: string | string[]): Promise<void> {
    if (typeof key === 'string') this.objects.delete(key);
    else key.forEach((entry) => this.objects.delete(entry));
    return Promise.resolve();
  }
}
