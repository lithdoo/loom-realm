#!/usr/bin/env node

import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const BACKUP_SUFFIX = ".loomrealm-sync.backup";
const TARGET_RELATIVE = Object.freeze([
  ["js", join("[resource]Presentation", "map", "map.browser.js.js")],
  ["css", join("[resource]Presentation", "map", "map.css.css")],
]);
const DIST_RELATIVE = Object.freeze({
  js: join("game-libs", "map", "dist", "browser", "map.browser.js"),
  css: join("game-libs", "map", "dist", "browser", "map.css"),
});
const SOURCE_RELATIVE = Object.freeze({
  js: join("game-libs", "map", "browser", "map.browser.js"),
  css: join("game-libs", "map", "browser", "map.css"),
});

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function defaultFileOps() {
  return {
    readFile: fs.readFile,
    writeFile: fs.writeFile,
    rename: fs.rename,
    unlink: fs.unlink,
    readdir: fs.readdir,
    lstat: fs.lstat,
    mkdir: fs.mkdir,
    open: fs.open,
  };
}

function fail(phase, details, cause) {
  const error = new Error([
    `Map presentation sync failed during ${phase}`,
    `repo: ${details.repoRoot}`,
    `example: ${details.exampleRoot}`,
    `FSDB: ${details.fsdbRoot ?? "(unresolved)"}`,
    `source js: ${details.sourceJs}`,
    `source css: ${details.sourceCss}`,
    `dist js: ${details.distJs}`,
    `dist css: ${details.distCss}`,
    `target js: ${details.targetJs ?? "(unresolved)"}`,
    `target css: ${details.targetCss ?? "(unresolved)"}`,
    `expected js SHA-256: ${details.expectedJs ?? "(uncomputed)"}`,
    `actual js SHA-256: ${details.actualJs ?? "(uncomputed)"}`,
    `expected css SHA-256: ${details.expectedCss ?? "(uncomputed)"}`,
    `actual css SHA-256: ${details.actualCss ?? "(uncomputed)"}`,
    `retry: node "${join(details.exampleRoot, "scripts", "sync-map-presentation.mjs")}"`,
    cause instanceof Error ? cause.message : cause ? String(cause) : "",
  ].filter(Boolean).join("\n"));
  error.cause = cause;
  throw error;
}

async function exists(fileOps, path) {
  try {
    await fileOps.lstat(path);
    return true;
  } catch (cause) {
    if (cause && cause.code === "ENOENT") return false;
    throw cause;
  }
}

async function runNpmBuild(repoRoot) {
  await new Promise((resolve, reject) => {
    const child = spawn("npm", ["run", "build:m15"], {
      cwd: repoRoot,
      stdio: "inherit",
      shell: true,
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`npm run build:m15 failed (${code ?? signal})`));
    });
  });
}

async function discoverFsdb(exampleRoot, fileOps) {
  const entries = await fileOps.readdir(exampleRoot, { withFileTypes: true });
  const matches = [];
  for (const entry of entries) {
    if (!entry.name.startsWith("[FSDB]")) continue;
    const full = join(exampleRoot, entry.name);
    const stat = await fileOps.lstat(full);
    if (stat.isSymbolicLink()) throw new Error("FSDB path must not be a symlink");
    if (!stat.isDirectory()) continue;
    matches.push(full);
  }
  if (matches.length !== 1) {
    throw new Error(`example root must contain exactly one [FSDB]* directory, found ${matches.length}`);
  }
  const presentation = join(matches[0], "[resource]Presentation");
  const presentationStat = await fileOps.lstat(presentation).catch((cause) => {
    throw new Error(`missing [resource]Presentation: ${cause instanceof Error ? cause.message : String(cause)}`);
  });
  if (presentationStat.isSymbolicLink() || !presentationStat.isDirectory()) {
    throw new Error("[resource]Presentation must be a regular directory");
  }
  return matches[0];
}

async function readRegularFile(fileOps, path, label) {
  const stat = await fileOps.lstat(path);
  if (stat.isSymbolicLink()) throw new Error(`${label} must not be a symlink`);
  if (!stat.isFile()) throw new Error(`${label} must be a regular file`);
  return fileOps.readFile(path);
}

async function writeStaging(fileOps, path, bytes) {
  const handle = await fileOps.open(path, "w");
  try {
    await handle.write(bytes);
    if (typeof handle.sync === "function") await handle.sync();
  } finally {
    await handle.close();
  }
}

async function restoreBackup(fileOps, target) {
  const backup = `${target}${BACKUP_SUFFIX}`;
  if (!await exists(fileOps, backup)) return;
  if (await exists(fileOps, target)) await fileOps.unlink(target);
  await fileOps.rename(backup, target);
}

async function removeStaleStaging(fileOps, directory) {
  let entries = [];
  try {
    entries = await fileOps.readdir(directory);
  } catch (cause) {
    if (cause && cause.code === "ENOENT") return;
    throw cause;
  }
  await Promise.all(entries.filter((name) => name.includes(".loomrealm-sync.") && name.endsWith(".tmp")).map((name) =>
    fileOps.unlink(join(directory, name)).catch(() => undefined)));
}

async function replacePair(fileOps, targets, staging) {
  const backups = targets.map((target) => `${target}${BACKUP_SUFFIX}`);
  try {
    await fileOps.rename(targets[0], backups[0]);
    await fileOps.rename(staging[0], targets[0]);
    await fileOps.rename(targets[1], backups[1]);
    await fileOps.rename(staging[1], targets[1]);
  } catch (cause) {
    for (const [index, target] of targets.entries()) {
      try { await restoreBackup(fileOps, target); } catch { /* keep attempting the pair */ }
      try { await fileOps.unlink(staging[index]); } catch { /* staging may already be gone */ }
    }
    throw cause;
  }
  for (const backup of backups) {
    try { await fileOps.unlink(backup); } catch { /* backup already consumed */ }
  }
}

export async function syncMapPresentation({
  repoRoot,
  exampleRoot,
  runBuild = true,
  checkOnly = false,
  fileOps = defaultFileOps(),
} = {}) {
  const details = {
    repoRoot,
    exampleRoot,
    fsdbRoot: undefined,
    sourceJs: join(repoRoot, SOURCE_RELATIVE.js),
    sourceCss: join(repoRoot, SOURCE_RELATIVE.css),
    distJs: join(repoRoot, DIST_RELATIVE.js),
    distCss: join(repoRoot, DIST_RELATIVE.css),
    targetJs: undefined,
    targetCss: undefined,
    expectedJs: undefined,
    expectedCss: undefined,
    actualJs: undefined,
    actualCss: undefined,
  };
  try {
    if (runBuild) await runNpmBuild(repoRoot);
    const fsdbRoot = await discoverFsdb(exampleRoot, fileOps);
    details.fsdbRoot = fsdbRoot;
    const targetJs = join(fsdbRoot, TARGET_RELATIVE[0][1]);
    const targetCss = join(fsdbRoot, TARGET_RELATIVE[1][1]);
    details.targetJs = targetJs;
    details.targetCss = targetCss;
    const targetDir = dirname(targetJs);
    if (!checkOnly) {
      await restoreBackup(fileOps, targetJs);
      await restoreBackup(fileOps, targetCss);
      await removeStaleStaging(fileOps, targetDir);
    }
    const sourceJs = await readRegularFile(fileOps, details.sourceJs, "map browser JS source");
    const sourceCss = await readRegularFile(fileOps, details.sourceCss, "map CSS source");
    const distJs = await readRegularFile(fileOps, details.distJs, "map browser JS dist");
    const distCss = await readRegularFile(fileOps, details.distCss, "map CSS dist");
    details.expectedJs = sha256(distJs);
    details.expectedCss = sha256(distCss);
    if (sha256(sourceJs) !== details.expectedJs || sha256(sourceCss) !== details.expectedCss) {
      details.actualJs = sha256(sourceJs);
      details.actualCss = sha256(sourceCss);
      fail("source/dist hash", details);
    }
    if (!checkOnly) {
      const stagingJs = `${targetJs}.loomrealm-sync.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
      const stagingCss = `${targetCss}.loomrealm-sync.${process.pid}.${randomBytes(8).toString("hex")}.tmp`;
      await writeStaging(fileOps, stagingJs, distJs);
      await writeStaging(fileOps, stagingCss, distCss);
      await replacePair(fileOps, [targetJs, targetCss], [stagingJs, stagingCss]);
    }
    const actualJs = await readRegularFile(fileOps, targetJs, "FSDB map browser JS");
    const actualCss = await readRegularFile(fileOps, targetCss, "FSDB map CSS");
    details.actualJs = sha256(actualJs);
    details.actualCss = sha256(actualCss);
    if (details.actualJs !== details.expectedJs || details.actualCss !== details.expectedCss) {
      fail("source/dist/FSDB hash", details);
    }
  } catch (cause) {
    if (cause && cause.message?.startsWith("Map presentation sync failed")) throw cause;
    fail("discover/build/replace", details, cause);
  }
}

function parseArgs(argv) {
  if (argv.length === 0) return { checkOnly: false };
  if (argv.length === 1 && argv[0] === "--check") return { checkOnly: true };
  const error = new Error(`Unknown argument: ${argv.join(" ")}`);
  error.exitCode = 2;
  throw error;
}

async function main() {
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const exampleRoot = dirname(scriptDir);
  const repoRoot = dirname(dirname(exampleRoot));
  try {
    const { checkOnly } = parseArgs(process.argv.slice(2));
    await syncMapPresentation({ repoRoot, exampleRoot, runBuild: true, checkOnly });
  } catch (cause) {
    process.stderr.write(`${cause instanceof Error ? cause.message : String(cause)}\n`);
    process.exitCode = cause && cause.exitCode === 2 ? 2 : 1;
  }
}

function isCliEntry() {
  try {
    return fileURLToPath(import.meta.url).toLowerCase() === resolve(process.argv[1] ?? "").toLowerCase();
  } catch {
    return false;
  }
}

if (isCliEntry()) {
  await main();
}
