#!/usr/bin/env node

import { copyFile, mkdir, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const exampleRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

export async function syncPresentation(fsdbRoot) {
  const presentation = join(fsdbRoot, "[resource]Presentation");
  await mkdir(join(presentation, "map"), { recursive: true });
  await writeFile(join(presentation, ".desc.meta"), "Trusted presentation resources.\n");
  await copyFile(
    join(repoRoot, "game-libs/map/browser/map.css"),
    join(presentation, "map", "map.css.css"),
  );
  await copyFile(
    join(repoRoot, "game-libs/map/browser/map.browser.js"),
    join(presentation, "map", "map.browser.js.js"),
  );
  await copyFile(
    join(exampleRoot, "presentation.css"),
    join(presentation, "page.css.css"),
  );
  return presentation;
}

const invoked = Boolean(process.argv[1]) && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  const existing = (await readdir(exampleRoot, { withFileTypes: true }))
    .filter((entry) => entry.isDirectory() && /^\[FSDB\].+$/u.test(entry.name));
  if (existing.length !== 1) {
    throw new Error(`Need exactly one [FSDB]* directory, found: ${existing.map((entry) => entry.name).join(", ") || "(none)"}`);
  }
  const presentation = await syncPresentation(join(exampleRoot, existing[0].name));
  console.log(`Updated presentation: ${presentation}`);
}
