import { createHash } from "node:crypto";

export function pwaBundleId(shellGeneration, payload) {
  if (typeof shellGeneration !== "string" || shellGeneration.length === 0) {
    throw new TypeError("A PWA shell generation is required");
  }
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("A PWA installation bundle payload is required");
  }
  const digest = createHash("sha256")
    .update(shellGeneration)
    .update("\0")
    .update(JSON.stringify(payload))
    .digest("hex");
  return "loomrealm-pwa-sha256-" + digest;
}
