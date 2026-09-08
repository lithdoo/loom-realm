import type { JsonValue } from "@loomrealm/wire";

export interface ContentReadOptions {
  readonly signal?: AbortSignal;
}

export interface ContentRecord {
  readonly value: JsonValue;
  readonly contentVersion: string;
}

export interface ContentResource {
  readonly bytes: Uint8Array;
  readonly mime: string;
  readonly contentVersion: string;
}

export type ContentReadErrorCode =
  | "CONTENT_NOT_FOUND"
  | "CONTENT_CONFLICT"
  | "CONTENT_INVALID"
  | "CONTENT_UNAVAILABLE"
  | "CONTENT_CANCELLED";

export class ContentReadError extends Error {
  readonly code: ContentReadErrorCode;

  constructor(code: ContentReadErrorCode) {
    super(code);
    this.name = "ContentReadError";
    this.code = code;
  }
}

export interface ContentClient {
  record(namespace: string, key: string, options?: ContentReadOptions): Promise<ContentRecord>;
  resource(namespace: string, key: string, options?: ContentReadOptions): Promise<ContentResource>;
}
