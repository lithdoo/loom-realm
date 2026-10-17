import test from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");

async function tree(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const resolved = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await tree(resolved));
    else result.push(resolved);
  }
  return result;
}

test("Shared State shared implementation is browser/Worker compatible and has no Node-only dependency", async () => {
  const files = (await tree(path.join(root, "packages/shared-state/src"))).filter((file) => file.endsWith(".ts"));
  const source = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
  assert.doesNotMatch(source, /from\s+["']node:/u);
  assert.doesNotMatch(source, /\b(Buffer|process|require|__dirname|fs\.)\b/u);
  assert.match(source, /loomrealm\.shared-state\/1/u);
  assert.match(source, /loomrealm\.shared-state\.frame\/1/u);
  assert.match(source, /MessagePort/u);
});

test("Main and Renderer boundaries do not acquire State values or direct State clients", async () => {
  const mainSession = await readFile(path.join(root, "packages/main/src/internal/main-session.ts"), "utf8");
  const mainModel = await readFile(path.join(root, "packages/main/src/model.ts"), "utf8");
  const rendererFiles = (await tree(path.join(root, "packages/renderer/src"))).filter((file) => file.endsWith(".ts"));
  const renderer = (await Promise.all(rendererFiles.map((file) => readFile(file, "utf8")))).join("\n");
  assert.doesNotMatch(mainSession, /SharedState(Record|Transaction|Snapshot|Authority)/u);
  assert.match(mainModel, /MainSharedStateFatalSource/u);
  assert.doesNotMatch(renderer, /SharedStateClient|@loomrealm\/shared-state/u);
});

test("frozen v1 exclusions remain absent from the public package", async () => {
  const declaration = await readFile(path.join(root, "packages/shared-state/dist/index.d.ts"), "utf8");
  for (const forbidden of [
    "NamespaceRegistry", "createNamespace", "deleteNamespace", "hasInitial", "listInitial",
    "saveSlot", "loadSlot", "transactionId", "resumeCursor", "retryCommit",
  ]) assert.doesNotMatch(declaration, new RegExp(`\\b${forbidden}\\b`, "u"));
  for (const required of [
    "SharedStateAuthority", "SharedStateClient", "PreparedSharedStateDefinition",
    "ReplaceableSharedStateClient", "createSharedStateCarrierBinding", "createSharedStateMessagePortCarrier",
  ]) assert.match(declaration, new RegExp(`\\b${required}\\b`, "u"));
  for (const internal of [
    "identityToken", "snapshotJsonValue", "validateSharedStateKey",
    "validateTransaction", "sendSharedStateMessage", "receiveSharedStateMessages",
  ]) assert.doesNotMatch(declaration, new RegExp(`\\b${internal}\\b`, "u"));
});

test("Hostra uses a dedicated State plane and Subsystem owns the author-facing capability", async () => {
  const hosting = await readFile(path.join(root, "packages/game-launcher-hostra/src/runtime-hosting.ts"), "utf8");
  const subsystem = await readFile(path.join(root, "packages/subsystem/src/model.ts"), "utf8");
  assert.match(hosting, /sharedStateEndpoint/u);
  assert.match(hosting, /serveSharedStateCarrier/u);
  assert.doesNotMatch(hosting, /frame\.call\([^)]*state/iu);
  assert.match(subsystem, /readonly state: SharedStateClient/u);
});

test("cross-boundary validation does not classify machine failures from diagnostic text", async () => {
  const validation = await readFile(
    path.join(root, "packages/game-package/src/validate.ts"),
    "utf8",
  );
  assert.doesNotMatch(validation, /error\.message\.(?:includes|startsWith|match)/u);
  assert.match(validation, /error\.code/u);
  assert.match(validation, /error\.path/u);
});

test("Shared State changes keep selective daily coverage and full cross-platform qualification", async () => {
  const daily = await readFile(path.join(root, ".github/workflows/ci.yml"), "utf8");
  const full = await readFile(path.join(root, ".github/workflows/full-qualification.yml"), "utf8");
  const runner = await readFile(path.join(root, "scripts/ci/run-capability.mjs"), "utf8");
  const impact = await readFile(path.join(root, "scripts/ci/impact.mjs"), "utf8");

  assert.match(impact, /path\.startsWith\("packages\/shared-state\/"\)/u);
  assert.match(daily, /name: Windows \/ Node 24/u);
  assert.match(daily, /run-capability\.mjs state-windows hostra-conformance/u);
  assert.match(runner, /"state-windows"\(\) \{[\s\S]*test:shared-state[\s\S]*test:shared-state:qualification:run[\s\S]*@loomrealm\/desktop[\s\S]*@loomrealm\/shared-state/u);
  assert.match(full, /runs-on: windows-latest/u);
  assert.match(full, /node: \[20, 24\]/u);
  assert.match(full, /run-capability\.mjs full-windows/u);
});

// Constructed without literal retired tokens so this file is not self-flagging.
const RETIRED_VOCAB = new RegExp(
  [
    ["Realm", " State"].join(""),
    ["Realm", "State"].join(""),
    ["realm", "State"].join(""),
    ["realm", "-state"].join(""),
    ["@loomrealm/", "realm", "-state"].join(""),
    ["REALM", "_STATE"].join(""),
  ].join("|"),
  "u",
);
const RETIRED_VOCAB_ALLOWLIST = new Set(["TODO-shared-state.md"]);
const RETIRED_VOCAB_EXTENSIONS = new Set([
  ".ts", ".mts", ".mjs", ".js", ".cjs", ".json", ".md", ".yml", ".yaml", ".css", ".html", ".txt",
]);

function shouldScanForRetiredVocab(relativePath) {
  const normalized = relativePath.replaceAll("\\", "/");
  if (RETIRED_VOCAB_ALLOWLIST.has(normalized)) return false;
  if (normalized.startsWith("doc/.vitepress/")) return false;
  if (normalized.includes("/dist/")) return false;
  if (normalized === "package-lock.json") return false;
  return RETIRED_VOCAB_EXTENSIONS.has(path.extname(normalized));
}

test("repository rejects retired shared-state package vocabulary outside allowlisted historical material", async () => {
  const { execFileSync } = await import("node:child_process");
  const output = execFileSync("git", ["ls-files", "-z"], { cwd: root, encoding: "utf8" });
  const files = output.split("\0").filter(Boolean);
  const offenders = [];
  for (const relative of files) {
    if (!shouldScanForRetiredVocab(relative)) continue;
    const text = await readFile(path.join(root, relative), "utf8");
    if (RETIRED_VOCAB.test(text)) offenders.push(relative);
  }
  assert.deepEqual(offenders, [], `retired vocabulary remains in:\n${offenders.join("\n")}`);
});
