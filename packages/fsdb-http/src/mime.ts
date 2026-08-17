const RESOURCE_TYPES: Readonly<Record<string, string>> = Object.freeze({
  avif: "image/avif", bmp: "image/bmp", css: "text/css", gif: "image/gif",
  html: "text/html", ico: "image/x-icon", jpeg: "image/jpeg", jpg: "image/jpeg",
  js: "text/javascript", mjs: "text/javascript", json: "application/json",
  md: "text/markdown", mp3: "audio/mpeg", mp4: "video/mp4", ogg: "audio/ogg",
  otf: "font/otf", png: "image/png", svg: "image/svg+xml", ttf: "font/ttf",
  txt: "text/plain", wasm: "application/wasm", wav: "audio/wav", webm: "video/webm",
  webp: "image/webp", woff: "font/woff", woff2: "font/woff2",
});

export function resourceMime(extension: string): string {
  return RESOURCE_TYPES[extension] ?? "application/octet-stream";
}

export const JSON_TYPE = "application/json; charset=utf-8";
export const JSONL_TYPE = "application/x-ndjson; charset=utf-8";
export const SCHEMA_TYPE = "application/schema+json; charset=utf-8";
export const MARKDOWN_TYPE = "text/markdown; charset=utf-8";
