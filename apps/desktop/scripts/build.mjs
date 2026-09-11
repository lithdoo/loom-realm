import { build } from "esbuild";
import { fileURLToPath } from "node:url";

await Promise.all([
  build({
    entryPoints: [fileURLToPath(new URL("../src/renderer-entry.ts", import.meta.url))],
    outfile: fileURLToPath(new URL("../dist/browser/renderer.js", import.meta.url)),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "chrome140",
    sourcemap: false,
  }),
  build({
    entryPoints: [fileURLToPath(new URL("../src/preload.ts", import.meta.url))],
    outfile: fileURLToPath(new URL("../dist/browser/preload.cjs", import.meta.url)),
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node22",
    external: ["electron"],
    sourcemap: false,
  }),
]);
