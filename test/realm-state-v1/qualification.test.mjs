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

test("Realm State shared implementation is browser/Worker compatible and has no Node-only dependency", async () => {
  const files = (await tree(path.join(root, "packages/realm-state/src"))).filter((file) => file.endsWith(".ts"));
  const source = (await Promise.all(files.map((file) => readFile(file, "utf8")))).join("\n");
  assert.doesNotMatch(source, /from\s+["']node:/u);
  assert.doesNotMatch(source, /\b(Buffer|process|require|__dirname|fs\.)\b/u);
  assert.match(source, /loomrealm\.realm-state\/1/u);
  assert.match(source, /loomrealm\.realm-state\.frame\/1/u);
  assert.match(source, /MessagePort/u);
});

test("Main and Renderer boundaries do not acquire State values or direct State clients", async () => {
  const mainSession = await readFile(path.join(root, "packages/main/src/internal/main-session.ts"), "utf8");
  const mainModel = await readFile(path.join(root, "packages/main/src/model.ts"), "utf8");
  const rendererFiles = (await tree(path.join(root, "packages/renderer/src"))).filter((file) => file.endsWith(".ts"));
  const renderer = (await Promise.all(rendererFiles.map((file) => readFile(file, "utf8")))).join("\n");
  assert.doesNotMatch(mainSession, /RealmState(Record|Transaction|Snapshot|Authority)/u);
  assert.match(mainModel, /MainRealmStateFatalSource/u);
  assert.doesNotMatch(renderer, /RealmStateClient|@loomrealm\/realm-state/u);
});

test("frozen v1 exclusions remain absent from the public package", async () => {
  const declaration = await readFile(path.join(root, "packages/realm-state/dist/index.d.ts"), "utf8");
  for (const forbidden of [
    "NamespaceRegistry", "createNamespace", "deleteNamespace", "hasInitial", "listInitial",
    "saveSlot", "loadSlot", "transactionId", "resumeCursor", "retryCommit",
  ]) assert.doesNotMatch(declaration, new RegExp(`\\b${forbidden}\\b`, "u"));
  for (const required of [
    "RealmStateAuthority", "RealmStateClient", "PreparedRealmStateDefinition",
    "ReplaceableRealmStateClient", "createRealmStateCarrierBinding", "createRealmStateMessagePortCarrier",
  ]) assert.match(declaration, new RegExp(`\\b${required}\\b`, "u"));
  for (const internal of [
    "identityToken", "snapshotJsonValue", "validateRealmStateKey",
    "validateTransaction", "sendRealmStateMessage", "receiveRealmStateMessages",
  ]) assert.doesNotMatch(declaration, new RegExp(`\\b${internal}\\b`, "u"));
});

test("Hostra uses a dedicated State plane and Subsystem owns the author-facing capability", async () => {
  const hosting = await readFile(path.join(root, "packages/game-launcher-hostra/src/runtime-hosting.ts"), "utf8");
  const subsystem = await readFile(path.join(root, "packages/subsystem/src/model.ts"), "utf8");
  assert.match(hosting, /realmStateEndpoint/u);
  assert.match(hosting, /serveRealmStateCarrier/u);
  assert.doesNotMatch(hosting, /frame\.call\([^)]*state/iu);
  assert.match(subsystem, /readonly state: RealmStateClient/u);
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

test("Realm State changes keep selective daily coverage and full cross-platform qualification", async () => {
  const daily = await readFile(path.join(root, ".github/workflows/ci.yml"), "utf8");
  const full = await readFile(path.join(root, ".github/workflows/full-qualification.yml"), "utf8");
  const runner = await readFile(path.join(root, "scripts/ci/run-capability.mjs"), "utf8");
  const impact = await readFile(path.join(root, "scripts/ci/impact.mjs"), "utf8");

  assert.match(impact, /path\.startsWith\("packages\/realm-state\/"\)/u);
  assert.match(daily, /name: Windows \/ Node 24/u);
  assert.match(daily, /run-capability\.mjs state-windows hostra-conformance/u);
  assert.match(runner, /"state-windows"\(\) \{[\s\S]*test:realm-state[\s\S]*test:realm-state:qualification:run[\s\S]*@loomrealm\/desktop[\s\S]*@loomrealm\/realm-state/u);
  assert.match(full, /runs-on: windows-latest/u);
  assert.match(full, /node: \[20, 24\]/u);
  assert.match(full, /run-capability\.mjs full-windows/u);
});
