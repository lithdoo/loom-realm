import assert from "node:assert/strict";
import test from "node:test";
import { decodeRmxpGraph } from "./lib/rmxp/decoder.mjs";

function graph(root) { return { root }; }
function object(className, ivars, objectId = 0) { return { kind: "object", className, ivars, objectId }; }

test("RMXP known views preserve known fields and every extra ivar", () => {
  const command = object("RPG::EventCommand", { "@code": 101, "@indent": 0, "@parameters": { kind: "array", items: [], objectId: 1 }, "@future": true });
  const decoded = decodeRmxpGraph(graph(command));
  assert.equal(decoded.root.kind, "RmxpObject");
  assert.equal(decoded.root.fields["@code"], 101);
  assert.equal(decoded.root.extraIvars["@future"], true);
  assert.equal(decoded.coverage.eventCommands, 1);
  assert.equal(decoded.coverage.discardedIvars, 0);
  assert.equal(decoded.coverage.discardedEventCommands, 0);
});

test("RMXP unknown classes are generic-preserved", () => {
  const decoded = decodeRmxpGraph(graph(object("Plugin::FutureClass", { "@value": 7 })));
  assert.equal(decoded.root.kind, "GenericRubyObject");
  assert.equal(decoded.root.ivars["@value"], 7);
  assert.deepEqual(decoded.coverage.genericUnknownClasses, { "Plugin::FutureClass": 1 });
});

test("RGSS Table payload becomes a typed structural view", () => {
  const payload = Buffer.alloc(24);
  payload.writeInt32LE(1, 0); payload.writeInt32LE(2, 4); payload.writeInt32LE(1, 8);
  payload.writeInt32LE(1, 12); payload.writeInt32LE(2, 16); payload.writeInt16LE(-4, 20); payload.writeInt16LE(9, 22);
  const decoded = decodeRmxpGraph(graph({ kind: "user-defined", className: "Table", payload, ivars: {}, objectId: 0 }));
  assert.equal(decoded.root.kind, "Table");
  assert.deepEqual([...decoded.root.values], [-4, 9]);
});
