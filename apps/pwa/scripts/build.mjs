import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { createPokeManPwaFixture } from "../../../examples/PokeMan/scripts/prepare-pwa-content.mjs";
import { deriveProductGeneration, emitProductArtifacts } from "./build-identity.mjs";
import { pokeManBundleId } from "./pokeman-bundle-id.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const sourceRoot = join(root, "src");
const output = join(root, "dist");
const qualification = process.argv.includes("--qualification");
const staging = process.argv.includes("--staging");
const entries = Object.freeze([
  { input: join(sourceRoot, qualification ? "qualification-window-entry.ts" : "window-entry.ts"), output: "window.js" },
  { input: join(sourceRoot, "session-worker-entry.ts"), output: "session-worker.js" },
  { input: join(sourceRoot, "worker-runner-entry.ts"), output: "worker-runner.js" },
  { input: join(sourceRoot, "service-worker.ts"), output: "service-worker.js" },
]);

function indexHtml(script) {
  return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>LoomRealm PWA</title></head>
<body><script type="module" src="${script}"></script></body>
</html>\n`;
}

async function buildRoot() {
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
    await build({
      absWorkingDir: join(root, "..", ".."),
      entryPoints: [join(root, "..", "..", "examples", "PokeMan", "subsystems", "map.mjs")],
      outfile: join(output, "qualification", "pokeman-map-subsystem.mjs"),
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "chrome140",
      sourcemap: false,
    });
  }
  await writeFile(join(output, "index.html"), indexHtml("/window.js"), "utf8");
  await writeFile(join(output, "generation.json"), `${JSON.stringify({ version: 1, generation })}\n`, "utf8");
  await writeFile(join(output, "blank.html"), "<!doctype html><html><title>Blank</title><body>blank</body></html>\n", "utf8");
}

async function buildStaging() {
  const stagingRoot = join(output, "staging", "pwa", "pokeman");
  const executable = join(output, "staging", "pokeman-map-subsystem.mjs");
  const stagingEntries = Object.freeze([
    { input: join(sourceRoot, "pokeman-window-entry.ts"), output: "window.js" },
    { input: join(sourceRoot, "session-worker-entry.ts"), output: "session-worker.js" },
    { input: join(sourceRoot, "worker-runner-entry.ts"), output: "worker-runner.js" },
    { input: join(sourceRoot, "service-worker.ts"), output: "service-worker.js" },
  ]);
  await mkdir(dirname(executable), { recursive: true });
  await build({
    absWorkingDir: join(root, "..", ".."),
    entryPoints: [join(root, "..", "..", "examples", "PokeMan", "subsystems", "map.mjs")],
    outfile: executable,
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "chrome140",
    sourcemap: false,
  });
  const generation = await deriveProductGeneration(stagingEntries, root);
  await rm(stagingRoot, { recursive: true, force: true });
  await mkdir(stagingRoot, { recursive: true });
  await emitProductArtifacts(stagingEntries, stagingRoot, root, generation);
  const fixture = await createPokeManPwaFixture({ executablePath: executable });
  const payload = {
    gameEntryText: fixture.gameEntryText,
    launchManifestText: fixture.launchManifestText,
    presentation: fixture.presentation,
    executable: fixture.executable,
    content: fixture.content,
  };
  // The shell generation does not cover Map/FSDB changes. A content-addressed
  // bundle ID causes the browser to install new game content on next visit.
  const bundleId = pokeManBundleId(generation, payload);
  await writeFile(join(stagingRoot, "pokeman-bundle.json"), `${JSON.stringify({ bundleId, ...payload })}\n`, "utf8");
  await writeFile(join(stagingRoot, "index.html"), indexHtml("./window.js"), "utf8");
  await writeFile(join(stagingRoot, "generation.json"), `${JSON.stringify({ version: 1, generation, basePath: "/pwa/pokeman/" })}\n`, "utf8");
  await rm(executable, { force: true });
}

if (staging) await buildStaging();
else await buildRoot();
