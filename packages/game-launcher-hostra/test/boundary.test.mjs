import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";
import * as launcher from "../dist/index.js";

test("public runtime surface stays narrow", () => {
  assert.deepEqual(Object.keys(launcher).sort(), [
    "HostraLauncherError",
    "createHostraRuntimeHosting",
    "prepareHostraGame",
  ]);
});

test("declarations expose no Runner bootstrap or mutable attempt state", async () => {
  const declaration = await readFile(new URL("../dist/index.d.ts", import.meta.url), "utf8");
  const provisioning = await readFile(new URL("../dist/data-provisioning.d.ts", import.meta.url), "utf8");
  assert.match(declaration, /HostraRuntimeDataPrepareRequest/);
  assert.match(declaration, /HostraRuntimeDataProvisioner/);
  assert.match(provisioning, /interface HostraRuntimeDataPrepareRequest/);
  assert.match(provisioning, /interface HostraRuntimeDataProvisioner/);
  assert.match(provisioning, /prepare\(request: HostraRuntimeDataPrepareRequest, signal: AbortSignal\): Promise<void>/);
  assert.match(provisioning, /commit\(candidateId: string, signal: AbortSignal\): Promise<void>/);
  assert.match(provisioning, /revoke\(candidateId: string\): void/);
  assert.equal(declaration.includes("RunnerBootstrapV1"), false);
  assert.equal(declaration.includes("controlEndpoint"), false);
  assert.equal(declaration.includes("ownership"), false);
});

test("package keeps the frozen dependency and authority boundary", async () => {
  const manifest = JSON.parse(
    await readFile(new URL("../package.json", import.meta.url), "utf8"),
  );
  assert.deepEqual(Object.keys(manifest.dependencies).sort(), [
    "@loomrealm/foundation",
    "@loomrealm/game-package",
    "@loomrealm/platform-ports",
    "@loomrealm/subsystem",
    "@loomrealm/wire",
    "ws",
  ]);
  const { readdir } = await import("node:fs/promises");
  const sourceRoot = new URL("../src/", import.meta.url);
  const files = await readdir(sourceRoot, { recursive: true });
  const source = (
    await Promise.all(
      files
        .filter((file) => file.endsWith(".ts"))
        .map((file) => readFile(new URL(file.replaceAll("\\", "/"), sourceRoot), "utf8")),
    )
  ).join("\n");
  assert.equal(source.includes("@loomrealm/main"), false);
  assert.equal(source.includes("@loomrealm/runtime-control"), false);
  assert.equal(source.includes("electron"), false);
  assert.equal(source.includes("HOSTRA_RPC"), false);
});
