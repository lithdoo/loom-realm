import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { RENDERER_DATA_PROFILE_V3 } from "@loomrealm/data";

const text = (path) => readFile(new URL(`../../${path}`, import.meta.url), "utf8");

test("active cohort advertises Renderer Data Profile v3 while Control wire remains v2", async () => {
  assert.equal(RENDERER_DATA_PROFILE_V3, "loomrealm.renderer-data/3");
  const [main, validation, controlModel] = await Promise.all([
    text("packages/main/src/internal/main-session.ts"),
    text("packages/renderer-control/src/validation.ts"),
    text("packages/renderer-control/src/model.ts"),
  ]);
  assert.match(main, /RENDERER_DATA_PROFILE_V3 = "loomrealm\.renderer-data\/3"/);
  assert.match(validation, /dataProfile !== "loomrealm\.renderer-data\/3"/);
  assert.match(controlModel, /protocolVersion: 2|RENDERER_CONTROL_PROTOCOL_VERSION_V2/);
});

test("top-frame is a Renderer-local branch and boolean Platform publication stays boolean", async () => {
  const [control, publication, webTypes] = await Promise.all([
    text("packages/renderer/src/control.ts"),
    text("packages/renderer/src/presentation-event.ts"),
    text("packages/renderer/dist/internal/web-projector.d.ts"),
  ]);
  assert.match(control, /options\.broadcast === "top-frame"/);
  assert.match(control, /presentationFrameGate\.offer/);
  assert.doesNotMatch(publication, /top-frame/);
  assert.match(publication, /readonly broadcast: boolean/);
  assert.match(webTypes, /boolean \| "top-frame"/);
});

test("Frame authority stays in Control stack and no restored Framework input protocol exists", async () => {
  const [gate, dataModel] = await Promise.all([
    text("packages/renderer/src/internal/presentation-frame-gate.ts"),
    text("packages/data/src/model.ts"),
  ]);
  assert.match(gate, /snapshot\?\.stack\.at\(-1\)/);
  assert.doesNotMatch(gate, /inputTarget|SessionEventHub/);
  assert.doesNotMatch(dataModel, /input\.interest|input\.state|input\.event|input\.reset/);
});

test("Subsystem public ABI is Frame-bound and independent of scope.events", async () => {
  const [model, types, manager] = await Promise.all([
    text("packages/subsystem/src/model.ts"),
    text("packages/subsystem/src/presentation-events.ts"),
    text("packages/subsystem/src/internal/presentation-event-manager.ts"),
  ]);
  assert.match(model, /readonly presentationEvents: PresentationEventClient/);
  assert.match(types, /readonly frame: Frame/);
  assert.doesNotMatch(manager, /SessionEvent|scope\.events/);
  assert.match(manager, /current\.activationId !== message\.activationId/);
  assert.match(manager, /!current\.deliveryOpen/);
});

test("contracts, game-controls migration example, and qualification matrix are navigable", async () => {
  const [nav, controls, qualification] = await Promise.all([
    text("doc/15-contracts/README.md"),
    text("game-libs/game-common-controls/game-controls-input.md"),
    text("doc/30-implementation/frame-targeted-presentation-events-qualification.md"),
  ]);
  assert.match(nav, /renderer-data-profile-v3/);
  assert.match(nav, /web-presentation-api-v3/);
  assert.match(controls, /broadcast: "top-frame"/);
  assert.match(controls, /scope\.presentationEvents\.createListener/);
  for (let id = 1; id <= 30; id += 1) {
    assert.match(qualification, new RegExp(`F${String(id).padStart(2, "0")}`));
  }
});
