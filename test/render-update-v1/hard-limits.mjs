import test from "node:test";
import assert from "node:assert/strict";
import { createRendererDataPeer, createSubsystemDataPeer } from "@loomrealm/data";
import { jsonDepth } from "@loomrealm/wire";
import { chain, domains, event, flatNodes, inboundCarrier, nestedData, node, objectMembers, patch, snapshot, turn } from "./helpers/render-fixtures.mjs";

function methodFor(message) {
  return message.type === "render.domains" ? "sendDomains"
    : message.type === "render.snapshot" ? "sendSnapshot"
    : message.type === "render.patch" ? "sendPatch" : "sendEvent";
}

async function outbound(message, accepted, label = message.type) {
  const sent = [];
  const carrier = inboundCarrier([]);
  carrier.send = async (raw) => { sent.push(raw); };
  const peer = createSubsystemDataPeer({
    binding: { carrier, subsystemKey: "demo", generation: 1, dataProfile: "loomrealm.renderer-data/1" },
    handlers: { onInputState: () => ({ kind: "accepted" }), onInputEvent: () => ({ kind: "accepted" }), onInputReset: () => ({ kind: "accepted" }) },
  });
  const outcome = await peer.render[methodFor(message)](message);
  assert.equal(outcome.kind, accepted ? "sent" : "terminal", label);
  assert.equal(sent.length, accepted ? 1 : 0);
  await peer.close();
}

async function inbound(message, accepted) {
  let delivered = 0;
  const peer = createRendererDataPeer({
    binding: { carrier: inboundCarrier([typeof message === "string" ? message : JSON.stringify(message)]), subsystemKey: "demo", generation: 1, dataProfile: "loomrealm.renderer-data/1" },
    handlers: {
      onInputInterest: () => ({ kind: "accepted" }),
      onRenderDomains: () => { delivered += 1; return { kind: "accepted" }; },
      onRenderSnapshot: () => { delivered += 1; return { kind: "accepted" }; },
      onRenderPatch: () => { delivered += 1; return { kind: "accepted" }; },
      onRenderEvent: () => { delivered += 1; return { kind: "accepted" }; },
    },
  });
  if (accepted) {
    await turn(); await turn();
    assert.equal(delivered, 1);
    await peer.close();
  } else {
    assert.equal((await peer.terminal).kind, "protocol-fatal");
    assert.equal(delivered, 0, "invalid inbound must retire before handler commit");
  }
}

function dataBytes(size) {
  const overhead = Buffer.byteLength(JSON.stringify({ value: "" }));
  const value = { value: "x".repeat(size - overhead) };
  assert.equal(Buffer.byteLength(JSON.stringify(value)), size);
  return value;
}

function minimalNodes(count) {
  return Array.from({ length: count }, (_, index) => node(index.toString(36), [], {}, {}, "x"));
}

function depthMessage(target) {
  for (let extra = 0; extra <= 32; extra += 1) {
    const root = chain(30);
    let leaf = root;
    while (leaf.children.length > 0) leaf = leaf.children[0];
    leaf.data = extra === 0 ? {} : { deep: nestedData(extra - 1) };
    const message = snapshot("d", 1, [root]);
    if (jsonDepth(message) === target) return message;
  }
  throw new Error(`Cannot construct Render message at JSON depth ${target}`);
}

export function registerHardLimitAudit() {
  test("M11 Render hard-limit matrix proves exact, one-over, UTF-8, and inbound retirement", async () => {
    const utf8 = (bytes) => "é".repeat(bytes / 2);
    const update = (delta) => patch([{ op: "update", key: "root", ...delta }]);
    const cases = [
      ["Registry entries", domains(...Array.from({ length: 256 }, (_, i) => `d${i}`)), domains(...Array.from({ length: 257 }, (_, i) => `d${i}`))],
      ["RenderNode count", snapshot("d", 1, minimalNodes(16_384)), snapshot("d", 1, minimalNodes(16_385))],
      ["Render tree depth", snapshot("d", 1, [chain(30)]), snapshot("d", 1, [chain(31)])],
      ["Patch operations", patch(Array.from({ length: 4_096 }, () => ({ op: "remove", key: "x" }))), patch(Array.from({ length: 4_097 }, () => ({ op: "remove", key: "x" })))],
      ["attrs members", snapshot("d", 1, [node("root", [], Object.fromEntries(Array.from({ length: 256 }, (_, i) => [`a${i}`, ""]))) ]), snapshot("d", 1, [node("root", [], Object.fromEntries(Array.from({ length: 257 }, (_, i) => [`a${i}`, ""]))) ])],
      ["data array members", event("root", { domainId: "d", data: { values: Array(16_384).fill(null) } }), event("root", { domainId: "d", data: { values: Array(16_385).fill(null) } })],
      ["data object members", event("root", { domainId: "d", data: objectMembers(16_384) }), event("root", { domainId: "d", data: objectMembers(16_385) })],
      ["data compact bytes", event("root", { domainId: "d", data: dataBytes(262_144) }), event("root", { domainId: "d", data: dataBytes(262_145) })],
      ["data relative depth", event("root", { domainId: "d", data: nestedData(32) }), event("root", { domainId: "d", data: nestedData(33) })],
      ["domainId UTF-8 bytes", domains(utf8(128)), domains(`${utf8(128)}a`)],
      ["Node key UTF-8 bytes", snapshot("d", 1, [node(utf8(128))]), snapshot("d", 1, [node(`${utf8(128)}a`)])],
      ["tag UTF-8 bytes", snapshot("d", 1, [node("root", [], {}, {}, utf8(256))]), snapshot("d", 1, [node("root", [], {}, {}, `${utf8(256)}a`)])],
      ["Event name UTF-8 bytes", event("root", { domainId: "d", name: utf8(128) }), event("root", { domainId: "d", name: `${utf8(128)}a` })],
      ["attrs key UTF-8 bytes", update({ attrs: { set: { [utf8(128)]: "" } } }), update({ attrs: { set: { [`${utf8(128)}a`]: "" } } })],
      ["attrs value UTF-8 bytes", update({ attrs: { set: { x: utf8(4096) } } }), update({ attrs: { set: { x: `${utf8(4096)}a` } } })],
      ["generic data key UTF-8 bytes", update({ data: { set: { [utf8(256)]: null } } }), update({ data: { set: { [`${utf8(256)}a`]: null } } })],
      ["revision positive-safe", snapshot("d", Number.MAX_SAFE_INTEGER, []), snapshot("d", 0, [])],
    ];
    for (const [label, exact, over] of cases) {
      await outbound(exact, true, `${label} exact outbound`);
      await inbound(exact, true);
      await outbound(over, false, `${label} one-over outbound`);
      await inbound(over, false);
      assert.ok(label.length > 0);
    }
    for (const value of [-2_147_483_648, 2_147_483_647]) await outbound(snapshot("d", 1, [], value), true);
    for (const value of [-2_147_483_649, 2_147_483_648]) await inbound(snapshot("d", 1, [], value), false);

    const exactDepth = depthMessage(64);
    const overDepth = depthMessage(65);
    await inbound(exactDepth, true);
    await inbound(overDepth, false);

    const base = JSON.stringify(domains());
    await inbound(`${base}${" ".repeat(1_048_576 - Buffer.byteLength(base))}`, true);
    await inbound(`${base}${" ".repeat(1_048_577 - Buffer.byteLength(base))}`, false);
  });
}
