import { build } from "esbuild";
import { fileURLToPath } from "node:url";

await build({
    entryPoints: [fileURLToPath(new URL("../src/renderer-entry.ts", import.meta.url))],
    outfile: fileURLToPath(new URL("../dist/browser/renderer.js", import.meta.url)),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "chrome140",
    sourcemap: false,
  });
