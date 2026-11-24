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

export interface SessionInfo {
  authenticated: boolean;
  oidcEnabled: boolean;
  passwordEnabled: boolean;
}

export interface MeInfo {
  authKind: "session" | "device-token" | "env-token";
  device: string | null;
  version: string;
  maxFileMb: number;
  maxPresignedFileMb: number;
  maxStorageMb: number;
  directUploadEnabled: boolean;
  retentionDays: number;
  stats: {
    itemCount: number;
    fileBytes: number;
  };
}

export interface ApiTokenView {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt?: string;
}

export interface CreatedApiToken extends ApiTokenView {
  token: string;
}
