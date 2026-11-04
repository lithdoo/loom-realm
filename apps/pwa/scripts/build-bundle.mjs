import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deriveProductGeneration, emitProductArtifacts } from "./build-identity.mjs";
import { pwaBundleId } from "./pwa-bundle-id.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const outputRoot = join(root, "dist", "staging", "pwa");
const sourceRoot = join(root, "src");
const entries = Object.freeze([
  { input: join(sourceRoot, "bundle-window-entry.ts"), output: "window.js" },
  { input: join(sourceRoot, "session-worker-entry.ts"), output: "session-worker.js" },
  { input: join(sourceRoot, "worker-runner-entry.ts"), output: "worker-runner.js" },
  { input: join(sourceRoot, "service-worker.ts"), output: "service-worker.js" },
]);

function requireString(value, label) {
  if (typeof value !== "string" || value.length === 0) throw new TypeError(label + " must be a non-empty string");
  return value;
}

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function validBase64(value) {
  if (value.length === 0) return true;
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)) return false;
  return Buffer.from(value, "base64").toString("base64") === value;
}

export function validatePwaBundlePayload(value) {
  if (!isObject(value) || value.formatVersion !== 1) throw new TypeError("PWA bundle formatVersion must be 1");
  requireString(value.gameEntryText, "gameEntryText");
  requireString(value.launchManifestText, "launchManifestText");
  try {
    if (!isObject(JSON.parse(value.gameEntryText))) throw new Error();
  } catch {
    throw new TypeError("gameEntryText must contain a JSON object");
  }
  try {
    if (!isObject(JSON.parse(value.launchManifestText))) throw new Error();
  } catch {
    throw new TypeError("launchManifestText must contain a JSON object");
  }
  if (!isObject(value.presentation)) throw new TypeError("presentation must be a JSON object");
  if (!Array.isArray(value.executables) || value.executables.length === 0) {
    throw new TypeError("executables must contain at least one entry");
  }
  const modules = new Set();
  for (const [index, entry] of value.executables.entries()) {
    if (!isObject(entry)) throw new TypeError("Invalid executable at index " + index);
    requireString(entry.logicalModule, "executables[" + index + "].logicalModule");
    if (modules.has(entry.logicalModule)) throw new TypeError("Duplicate executable module: " + entry.logicalModule);
    modules.add(entry.logicalModule);
    if (entry.mime !== "text/javascript" && entry.mime !== "application/javascript") {
      throw new TypeError("Unsupported executable MIME type at index " + index);
    }
    requireString(entry.source, "executables[" + index + "].source");
    requireString(entry.contentVersion, "executables[" + index + "].contentVersion");
  }
  if (!Array.isArray(value.content)) throw new TypeError("content must be an array");
  const identities = new Set();
  for (const [index, entry] of value.content.entries()) {
    if (!isObject(entry)) throw new TypeError("Invalid Content entry at index " + index);
    if (!["record", "group", "resource"].includes(entry.kind)) {
      throw new TypeError("Invalid Content kind at index " + index);
    }
    requireString(entry.namespace, "content[" + index + "].namespace");
    requireString(entry.key, "content[" + index + "].key");
    requireString(entry.mime, "content[" + index + "].mime");
    if (entry.encoding !== "base64" || typeof entry.body !== "string" || !validBase64(entry.body)) {
      throw new TypeError("Content body must be canonical base64 at index " + index);
    }
    const identity = [entry.kind, entry.namespace, entry.key].join("\0");
    if (identities.has(identity)) throw new TypeError("Duplicate PWA Content identity at index " + index);
    identities.add(identity);
  }
  return value;
}

function parseArguments(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const name = args[index];
    if (!["--bundle", "--app-id", "--base-path", "--output-dir"].includes(name)) {
      throw new Error("Unknown PWA bundle build argument: " + name);
    }
    const value = args[index + 1];
    if (typeof value !== "string" || value.startsWith("--")) throw new Error("Missing value for " + name);
    options[name.slice(2).replaceAll("-", "")] = value;
    index += 1;
  }
  if (!options.bundle) throw new Error("--bundle is required");
  if (!options.appid || !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(options.appid)) {
    throw new Error("--app-id must be a lowercase URL-safe identifier");
  }
  if (!options.basepath || !options.basepath.startsWith("/") || !options.basepath.endsWith("/")
    || options.basepath.includes("//") || options.basepath.includes("..")) {
    throw new Error("--base-path must be an absolute path with one trailing slash");
  }
  return Object.freeze({
    bundlePath: resolve(options.bundle),
    appId: options.appid,
    basePath: options.basepath,
    outputDir: options.outputdir ? resolve(options.outputdir) : join(outputRoot, options.appid),
  });
}

function indexHtml() {
  return "<!doctype html>\n<html lang=\"en\">\n<head><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>LoomRealm PWA</title></head>\n<body><script type=\"module\" src=\"./window.js\"></script></body>\n</html>\n";
}

export async function buildPwaBundle(options) {
  const payload = validatePwaBundlePayload(JSON.parse(await readFile(options.bundlePath, "utf8")));
  const commonControlsSource = await readFile(
    join(root, "..", "..", "game-libs", "game-common-controls", "dist", "browser", "device-input.browser.js"),
    "utf8",
  );
  const definitions = Object.freeze({
    __LOOMREALM_GAME_COMMON_CONTROLS_SOURCE__: JSON.stringify(commonControlsSource),
  });
  const generation = await deriveProductGeneration(entries, root, definitions);
  const bundleId = pwaBundleId(generation, payload);
  await rm(options.outputDir, { recursive: true, force: true });
  await mkdir(options.outputDir, { recursive: true });
  await emitProductArtifacts(entries, options.outputDir, root, generation, definitions);
  await writeFile(
    join(options.outputDir, "installation-bundle.json"),
    JSON.stringify({ bundleId, ...payload }) + "\n",
    "utf8",
  );
  await writeFile(join(options.outputDir, "index.html"), indexHtml(), "utf8");
  await writeFile(join(options.outputDir, "generation.json"), JSON.stringify({
    version: 1,
    generation,
    appId: options.appId,
    basePath: options.basePath,
  }) + "\n", "utf8");
  return Object.freeze({ appId: options.appId, basePath: options.basePath, bundleId, generation, outputDir: options.outputDir });
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const result = await buildPwaBundle(parseArguments(process.argv.slice(2)));
  console.log("Built generic LoomRealm PWA installation bundle");
  console.log(JSON.stringify(result));
}
