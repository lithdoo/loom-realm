import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { deriveProductGeneration, emitProductArtifacts } from "./build-identity.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const sourceRoot = join(root, "src");
const output = join(root, "dist");
const qualification = process.argv.includes("--qualification");
const entries = Object.freeze([
  { input: join(sourceRoot, qualification ? "qualification-window-entry.ts" : "window-entry.ts"), output: "window.js" },
  { input: join(sourceRoot, "session-worker-entry.ts"), output: "session-worker.js" },
  { input: join(sourceRoot, "worker-runner-entry.ts"), output: "worker-runner.js" },
  { input: join(sourceRoot, "service-worker.ts"), output: "service-worker.js" },
]);

const generation = await deriveProductGeneration(entries, root);
await mkdir(output, { recursive: true });
for (const file of [...entries.map(({ output: name }) => name), "service-worker-update.js", "index.html", "generation.json", "blank.html"]) {
  await rm(join(output, file), { force: true });
}
await rm(join(output, "qualification"), { recursive: true, force: true });
await emitProductArtifacts(entries, output, root, generation);
if (qualification) {
  await emitProductArtifacts(
    [{ input: join(sourceRoot, "service-worker.ts"), output: "service-worker-update.js" }],
    output,
    root,
    `${generation}-qualification-update`,
  );
  await build({
    absWorkingDir: join(root, "..", ".."),
    entryPoints: [join(root, "..", "..", "examples", "essentials-v21.1", "subsystems", "map.mjs")],
    outfile: join(output, "qualification", "map-subsystem.mjs"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "chrome140",
    sourcemap: false,
  });
}
await writeFile(join(output, "index.html"), `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LoomRealm PWA</title></head>
<body><script type="module" src="/window.js"></script></body>
</html>\n`, "utf8");
await writeFile(join(output, "generation.json"), `${JSON.stringify({ version: 1, generation })}\n`, "utf8");
await writeFile(join(output, "blank.html"), "<!doctype html><html><title>Blank</title><body>blank</body></html>\n", "utf8");
