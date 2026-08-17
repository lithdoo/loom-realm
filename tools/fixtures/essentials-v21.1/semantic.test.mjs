import assert from "node:assert/strict";
import test from "node:test";
import { VANILLA_REGISTRY_V21_1 } from "./lib/essentials/v21.1/vanilla-registry.mjs";
import { classifyEssentialsSemantics } from "./lib/semantic/classifier.mjs";

const string = (text) => ({ kind: "RubyString", text, bytes: Buffer.from(text), ivars: {} });
const parameters = (...items) => ({ kind: "Array", items });
const command = (code, ...items) => ({ kind: "RmxpObject", className: "RPG::EventCommand", rubyObjectId: code, fields: { "@code": code, "@parameters": parameters(...items) }, extraIvars: {} });

test("Essentials semantic classifier derives helpers/messages/warps without mutating canonical facts", () => {
  const root = { kind: "Array", items: [
    command(101, string("Hello")), command(201, 0, 12, 3, 4),
    command(355, string("pbTrainerBattle(:YOUNGSTER, 'Ben')")), command(355, string("project_specific_call()")),
  ] };
  const before = root.items[2].fields["@parameters"].items[0].text;
  const result = classifyEssentialsSemantics({ roots: [{ filename: "Map001.rxdata", root }] }, VANILLA_REGISTRY_V21_1.compilerPasses);
  assert.equal(result.facts.messages[0].text, "Hello");
  assert.equal(result.facts.warps.length, 1);
  assert.equal(result.facts.helperCalls[0].classification, "trainer-battle");
  assert.equal(result.coverage.opaqueRubyScripts, 1);
  assert.equal(result.coverage.compilerPasses.length, 26);
  assert.equal(result.coverage.canonicalFactsMutated, 0);
  assert.equal(root.items[2].fields["@parameters"].items[0].text, before);
});
