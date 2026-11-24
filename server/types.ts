export type SqlParam = string | number | null;

export interface DbAdapter {
  queryAll<T = Record<string, unknown>>(sql: string, params?: SqlParam[]): Promise<T[]>;
  queryFirst<T = Record<string, unknown>>(sql: string, params?: SqlParam[]): Promise<T | null>;
  execute(sql: string, params?: SqlParam[]): Promise<{ changes: number }>;
  execBatch(sql: string): Promise<void>;
}

export interface BlobRange {
  start: number;
  end: number; // inclusive
}

export interface BlobHead {
  size: number;
  contentType?: string;
}

export interface BlobReadResult {
  body: ReadableStream<Uint8Array>;
  size: number;
  range?: BlobRange;
}

export interface PresignPutResult {
  url: string;
  method: "PUT";
  headers: Record<string, string>;
  expiresAt: string;
}

export interface BlobStore {
  put(key: string, body: ArrayBuffer | Uint8Array | ReadableStream<Uint8Array>, contentType: string, size?: number): Promise<void>;
  get(key: string, range?: BlobRange): Promise<BlobReadResult | null>;
  head(key: string): Promise<BlobHead | null>;
  delete(key: string): Promise<void>;
  presignPut?(key: string, contentType: string, size: number, ttlSeconds: number): Promise<PresignPutResult>;
}

export interface OidcConfig {
  issuer: string;
  clientId: string;
  clientSecret: string;
  requiredGroup?: string;
}

export interface AppConfig {
  origin: string;
  password: string;
  sessionSecret: string;
  apiToken?: string;
  oidc?: OidcConfig;
  sessionDays: number;
  retentionDays: number;
  maxFileBytes: number;
  maxPresignedFileBytes: number;
  maxStorageBytes: number;
  version: string;
}

export interface LinkPreview {
  title: string;
  description: string;
  image?: string;
  siteName?: string;
  favicon?: string;
}

export interface DropItem {
  id: string;
  type: "text" | "image" | "file";
  text?: string;
  name?: string;
  mime?: string;
  size: number;
  device: string;
  pinned: boolean;
  previewStatus?: "pending" | "ready" | "failed";
  linkPreview?: LinkPreview;
  createdAt: string;
}

export interface StoredFileMeta {
  id: string;
  storageKey: string;
  name: string;
  mime: string;
  size: number;
}

export interface ApiTokenView {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

export interface AuthContext {
  kind: "session" | "device-token" | "env-token";
  deviceName?: string;
  tokenId?: string;
  subject?: string;
}

export type WaitUntilFn = (promise: Promise<unknown>) => void;

export interface AppDependencies {
  db: DbAdapter;
  blobs: BlobStore;
  config: AppConfig;
  waitUntil?: WaitUntilFn;
  fetchImpl?: typeof fetch;
}
