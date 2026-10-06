import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("..", import.meta.url));
const sourceRoot = join(root, "src");
const output = join(root, "dist");

async function sourceFiles(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(target));
    else if (entry.name.endsWith(".ts")) files.push(target);
  }
  return files.sort();
}

const digest = createHash("sha256");
for (const file of await sourceFiles(sourceRoot)) digest.update(await readFile(file));
const generation = `pwa-v1-${digest.digest("hex").slice(0, 32)}`;
await mkdir(output, { recursive: true });

const entries = [
  ["window-entry.ts", "window.js"],
  ["session-worker-entry.ts", "session-worker.js"],
  ["worker-runner-entry.ts", "worker-runner.js"],
  ["service-worker.ts", "service-worker.js"],
];
for (const [entry, outfile] of entries) {
  await build({
    entryPoints: [join(sourceRoot, entry)],
    outfile: join(output, outfile),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "chrome140",
    sourcemap: false,
    define: { __LOOMREALM_SW_GENERATION__: JSON.stringify(generation) },
  });
}

await writeFile(join(output, "index.html"), `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LoomRealm PWA</title></head>
<body><script type="module" src="/window.js"></script></body>
</html>\n`, "utf8");
await writeFile(join(output, "generation.json"), `${JSON.stringify({ version: 1, generation })}\n`, "utf8");
await writeFile(join(output, "blank.html"), "<!doctype html><html><title>Blank</title><body>blank</body></html>\n", "utf8");
