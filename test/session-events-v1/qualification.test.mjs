import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (relative) => readFile(new URL(relative, root), "utf8");

test("Session Events package and Subsystem author boundary expose the frozen surface", async () => {
  const [events, subsystem, subsystemModel, host, hostRuntime, gamePackage, renderer] = await Promise.all([
    read("packages/session-events/dist/index.d.ts"),
    read("packages/subsystem/dist/index.d.ts"),
    read("packages/subsystem/dist/model.d.ts"),
    read("packages/subsystem/dist/host/index.d.ts"),
    read("packages/subsystem/dist/host/run-subsystem.d.ts"),
    read("packages/game-package/package.json"),
    read("packages/renderer/package.json"),
  ]);
  for (const name of [
    "SessionEvent", "SessionEventClient", "SessionEventListener",
    "SessionEventSubscription", "SessionEventSubscriptionClose",
    "SessionEventFailure", "SessionEventFailureCode", "SessionEventError",
    "isSessionEventFailure",
  ]) {
    assert.match(events, new RegExp(`\\b${name}\\b`));
    assert.match(subsystem, new RegExp(`\\b${name}\\b`));
  }
  assert.match(subsystemModel, /readonly events: SessionEventClient/);
  assert.match(host, /SessionEventsRuntimeCapability/);
  assert.match(hostRuntime, /readonly events: SessionEventsRuntimeCapability/);
  assert.match(hostRuntime, /readonly state: SharedStateRuntimeCapability/);
  assert.doesNotMatch(gamePackage, /session-events/);
  assert.doesNotMatch(renderer, /session-events/);
});

test("Main receives only the narrow Session Events fatal fact", async () => {
  const model = await read("packages/main/dist/model.d.ts");
  const source = model.match(/export interface MainSessionEventsFatalSource \{[\s\S]*?\n\}/)?.[0];
  assert.ok(source, "MainSessionEventsFatalSource declaration is missing");
  assert.match(source, /subscribe\(listener: \(\) => void\): \(\) => void/);
  assert.doesNotMatch(source, /channel|payload|subscription|binding|SessionEventClient/i);
  assert.match(model, /readonly sessionEventsFatal\?: MainSessionEventsFatalSource/);
});

test("Hostra owns a distinct scrubbed loopback capability endpoint without changing Control bootstrap", async () => {
  const [hosting, entry, endpoint, bootstrap] = await Promise.all([
    read("packages/game-launcher-hostra/src/runtime-hosting.ts"),
    read("packages/game-launcher-hostra/src/runner/entry.ts"),
    read("packages/game-launcher-hostra/src/runner/session-events.ts"),
    read("packages/game-launcher-hostra/src/runner/bootstrap.ts"),
  ]);
  assert.match(hosting, /eventsCapabilityPath = `\/\$\{randomBytes\(32\)\.toString\("base64url"\)\}`/);
  assert.match(hosting, /new WebSocketServer\(\{[\s\S]*?host: "127\.0\.0\.1"[\s\S]*?path: eventsCapabilityPath/);
  assert.match(hosting, /serveSessionEventCarrier\([\s\S]*?sessionEventHub\.createBinding\(request\.subsystemKey\)/);
  assert.match(entry, /const encodedSessionEventsEndpoint = process\.env\[SESSION_EVENTS_ENDPOINT_ENV_KEY\]/);
  assert.ok(entry.indexOf("delete process.env[SESSION_EVENTS_ENDPOINT_ENV_KEY]") < entry.indexOf("runBootstrap("));
  assert.match(endpoint, /LOOMREALM_HOSTRA_SESSION_EVENTS_ENDPOINT/);
  assert.match(endpoint, /endpoint\.hostname !== "127\.0\.0\.1"/);
  const frozenFields = bootstrap.match(/export interface RunnerBootstrapV1 \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.doesNotMatch(frozenFields, /event|sessionEvents/i);
});

test("PWA keeps the closed bootstrap and provisions a dedicated Event MessagePort", async () => {
  const [protocol, hosting, runner, eventBinding] = await Promise.all([
    read("apps/pwa/src/bootstrap-protocol.ts"),
    read("apps/pwa/src/runtime-hosting.ts"),
    read("apps/pwa/src/worker-runner-entry.ts"),
    read("apps/pwa/src/runner-session-events.ts"),
  ]);
  const bootstrap = protocol.match(/export interface PwaRunnerBootstrapV1 \{[\s\S]*?\n\}/)?.[0] ?? "";
  assert.deepEqual(
    [...bootstrap.matchAll(/readonly ([A-Za-z0-9]+):/g)].map((match) => match[1]),
    [
      "formatVersion", "sessionEpoch", "installationId", "expectedServiceWorker",
      "subsystemKey", "bootstrapToken", "logicalModule", "runtimeControlPort",
      "sharedStatePort", "provisioningPort",
    ],
  );
  assert.doesNotMatch(bootstrap, /sessionEvents|eventPort|bindingId/);
  assert.match(protocol, /type: "session-events\/install"/);
  assert.match(protocol, /type: "session-events\/result"/);
  assert.match(hosting, /const events = new MessageChannel\(\)/);
  assert.match(hosting, /serveSessionEventCarrier\([\s\S]*?events\.port1/);
  assert.match(hosting, /eventProvisioner\.install\([\s\S]*?events\.port2/);
  assert.ok(runner.indexOf("await events.initial") < runner.indexOf("await import(moduleUrl)"));
  assert.match(eventBinding, /createSessionEventMessagePortCarrier\(request\.port\)/);
  assert.match(protocol, /sessionEventProvisioningGeneration/);
  assert.match(hosting, /acceptedGeneration/);
  assert.match(eventBinding, /acceptedGeneration/);
  assert.doesNotMatch(hosting, /seenRequests|seenBindings/);
  assert.doesNotMatch(eventBinding, /seenRequests|seenBindings/);
});

test("root and CI expose build, integration, qualification-only, and full gates", async () => {
  const [pkg, ci, runner] = await Promise.all([
    read("package.json"),
    read(".github/workflows/ci.yml"),
    read("scripts/ci/run-capability.mjs"),
  ]);
  for (const script of [
    "build:session-events-stack",
    "test:session-events:packages",
    "test:session-events:qualification:run",
    "test:session-events:qualification",
  ]) assert.match(pkg, new RegExp(`"${script}"`));
  assert.match(ci, /name: Session Events v1 qualification[\s\S]*run-capability\.mjs session-events-after-pwa/);
  assert.match(runner, /"session-events"\(\)[\s\S]*test:session-events:qualification/);
  assert.match(runner, /"session-events-after-pwa"\(\)[\s\S]*session-events-v1\/qualification\.test\.mjs/);
});
