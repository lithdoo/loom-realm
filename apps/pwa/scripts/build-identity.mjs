import { createHash } from "node:crypto";
import { join } from "node:path";
import { build } from "esbuild";

export const GENERATION_PLACEHOLDER = "loomrealm-pwa-generation-placeholder-v1";

function options(entry, outfile, generation, absWorkingDir, write) {
  return {
    absWorkingDir,
    entryPoints: [entry],
    outfile,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "chrome140",
    sourcemap: false,
    write,
    define: { __LOOMREALM_SW_GENERATION__: JSON.stringify(generation) },
  };
}

export async function deriveProductGeneration(entries, absWorkingDir) {
  const digest = createHash("sha256");
  for (const entry of entries) {
    const outfile = join(absWorkingDir, ".pwa-identity", entry.output);
    const result = await build(options(entry.input, outfile, GENERATION_PLACEHOLDER, absWorkingDir, false));
    const artifact = result.outputFiles?.find((file) => file.path === outfile) ?? result.outputFiles?.[0];
    if (artifact === undefined) throw new Error(`Missing canonical PWA artifact ${entry.output}`);
    digest.update(entry.output);
    digest.update("\0");
    digest.update(artifact.contents);
    digest.update("\0");
  }
  return `pwa-v1-${digest.digest("hex").slice(0, 32)}`;
}

export async function emitProductArtifacts(entries, output, absWorkingDir, generation) {
  for (const entry of entries) {
    await build(options(entry.input, join(output, entry.output), generation, absWorkingDir, true));
  }
}
