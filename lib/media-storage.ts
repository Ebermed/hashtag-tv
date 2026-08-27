import { env } from "cloudflare:workers";

type StoredObject = {
  body: ReadableStream<Uint8Array>;
  size: number;
  httpEtag: string;
  writeHttpMetadata: (headers: Headers) => void;
};

type StoredObjectHead = {
  size: number;
  httpEtag: string;
  writeHttpMetadata: (headers: Headers) => void;
};

type MediaBucket = {
  delete: (key: string) => Promise<void>;
  get: (key: string, options?: { range?: { offset: number; length: number } }) => Promise<StoredObject | null>;
  head: (key: string) => Promise<StoredObjectHead | null>;
  put: (key: string, value: ReadableStream<Uint8Array> | ArrayBuffer | Blob, options?: { httpMetadata?: { contentType?: string }; customMetadata?: Record<string, string> }) => Promise<StoredObjectHead | null>;
};

export function getMediaBucket() {
  const bucket = (env as unknown as { BUCKET?: MediaBucket }).BUCKET;
  if (!bucket) throw new Error("El almacenamiento de videos no está disponible.");
  return bucket;
}
