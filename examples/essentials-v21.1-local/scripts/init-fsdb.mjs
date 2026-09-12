#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream, existsSync } from "node:fs";
import { mkdtemp, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pipeline } from "node:stream/promises";
import { fileURLToPath } from "node:url";
import { EEVEE_EXPO_DOWNLOAD, OFFICIAL_ARCHIVE_IDENTITY } from "../../../tools/fixtures/essentials-v21.1/lib/acquisition/eevee-expo.mjs";
import { ImportFailure } from "../../../tools/fixtures/essentials-v21.1/lib/errors.mjs";
import { run } from "../../../tools/fixtures/essentials-v21.1/import.mjs";

const exampleRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = fileURLToPath(new URL("../../..", import.meta.url));

function parse(argv) {
  const result = { source: undefined, force: false };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--force") result.force = true;
    else if (argv[i] === "--source") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) throw new Error("Missing value for --source");
      result.source = value;
      i += 1;
    } else {
      throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  return result;
}

function browserExecutable() {
  return [
    process.env.LOOMREALM_CHROMIUM_PATH,
    "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
  ].filter(Boolean).find(existsSync);
}

async function sha256File(path) {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

async function assertOfficialZip(path) {
  const info = await stat(path);
  const digest = await sha256File(path);
  if (info.size !== OFFICIAL_ARCHIVE_IDENTITY.size || digest !== OFFICIAL_ARCHIVE_IDENTITY.sha256) {
    throw new Error(`Downloaded ZIP identity mismatch (${info.size} bytes, SHA-256 ${digest})`);
  }
}

async function downloadOfficialZipWithBrowser(destination) {
  const executablePath = browserExecutable();
  if (!executablePath) {
    throw new Error("No local Edge/Chrome found. Install one, or pass --source <Essentials v21.1 dir or zip>.");
  }
  const { chromium } = await import("playwright");
  const browser = await chromium.launch({ executablePath, headless: false });
  try {
    const page = await browser.newPage();
    await page.goto(EEVEE_EXPO_DOWNLOAD, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector("#downloadButton", { timeout: 60_000 });
    const downloadPromise = page.waitForEvent("download", { timeout: 180_000 });
    await page.click("#downloadButton");
    const download = await downloadPromise;
    await download.saveAs(destination);
  } finally {
    await browser.close();
  }
  await assertOfficialZip(destination);
}

function shouldUseBrowserFallback(error, source) {
  return source === undefined && error instanceof ImportFailure && error.category === "DOWNLOAD_FAILURE";
}

function manualSourceHint() {
  return [
    "Automatic Node download was blocked.",
    `Open ${EEVEE_EXPO_DOWNLOAD} in a browser, save the ZIP, then run:`,
    "  node scripts/init-fsdb.mjs --source <Pokemon_Essentials_v21.1 zip or directory>",
  ].join("\n");
}

async function importFsdb(source) {
  const argv = ["--output", exampleRoot];
  if (source !== undefined) argv.push("--source", source);
  return await run(argv);
}

const options = parse(process.argv.slice(2));
const existing = (await readdir(exampleRoot, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory() && /^\[FSDB\].+$/u.test(entry.name));
if (existing.length && !options.force) {
  throw new Error(`Already has ${existing.map((entry) => entry.name).join(", ")}. Re-run with --force.`);
}
for (const entry of existing) await rm(join(exampleRoot, entry.name), { recursive: true, force: true });

if (options.source === undefined) {
  console.log("No --source given; downloading Pokémon Essentials v21.1 via tools/fixtures/essentials-v21.1.");
}

let fsdbRoot;
try {
  fsdbRoot = await importFsdb(options.source);
} catch (error) {
  if (!shouldUseBrowserFallback(error, options.source)) throw error;
  console.log("Node fetch was blocked by MediaFire/Cloudflare (HTTP 403). Opening a local browser to complete the official download...");
  const archiveRoot = await mkdtemp(join(tmpdir(), "loomrealm-essentials-zip-"));
  const archive = join(archiveRoot, "essentials-v21.1.zip");
  try {
    await downloadOfficialZipWithBrowser(archive);
    fsdbRoot = await importFsdb(archive);
  } catch (fallbackError) {
    throw new Error(`${manualSourceHint()}\n\nBrowser download failed: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`);
  } finally {
    await rm(archiveRoot, { recursive: true, force: true }).catch(() => {});
  }
}

const presentation = join(fsdbRoot, "[resource]Presentation");
await mkdir(join(presentation, "map"), { recursive: true });
await writeFile(join(presentation, ".desc.meta"), "Trusted presentation resources.\n");
await writeFile(
  join(presentation, "map", "map.css.css"),
  await readFile(join(repoRoot, "game-libs/map/browser/map.css")),
);
await writeFile(
  join(presentation, "map", "map.browser.js.js"),
  await readFile(join(repoRoot, "game-libs/map/browser/map.browser.js")),
);
await writeFile(
  join(presentation, "page.css.css"),
  await readFile(join(exampleRoot, "presentation.css")),
);
console.log(`FSDB ready: ${fsdbRoot}`);
