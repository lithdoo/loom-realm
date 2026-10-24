import { createHash } from "node:crypto";

/**
 * Content-addressed staging installation identity.
 * The PWA shell generation alone does not change when Map/FSDB data changes.
 * Include all published game manifest, presentation, executable and content
 * bytes, so an updated game is not mistaken for an existing installation.
 */
export function pokeManBundleId(shellGeneration, payload) {
  if (typeof shellGeneration !== "string" || shellGeneration.length === 0) {
    throw new TypeError("A PWA shell generation is required");
  }
  const digest = createHash("sha256")
    .update(shellGeneration)
    .update("\0")
    .update(JSON.stringify(payload))
    .digest("hex");
  return `pokeman-base-map-sha256-${digest}`;
}
