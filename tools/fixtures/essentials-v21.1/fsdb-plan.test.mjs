import assert from "node:assert/strict";
import test from "node:test";
import { ImportFailure } from "./lib/errors.mjs";
import { validateKnownReferences } from "./lib/fsdb/integrity.mjs";
import { mapCanonicalDataset } from "./lib/fsdb/mapper.mjs";
import { streamStructuredJson } from "./lib/fsdb/structured.mjs";

async function collect(iterable) {
  const chunks = [];
  for await (const chunk of iterable) chunks.push(chunk);
  return Buffer.concat(chunks);
}

test("structured JSON producer streams cycles, shared refs, bytes and bigint", async () => {
  const value = { bytes: Buffer.from([0, 255]), bigint: 10n };
  value.self = value;
  const text = (await collect(streamStructuredJson(value, 8))).toString("utf8");
  const parsed = JSON.parse(text);
  assert.equal(parsed.$id, 1);
  assert.equal(parsed.self.$ref, 1);
  assert.equal(parsed.bytes.$bytes, "AP8=");
  assert.equal(parsed.bigint.$bigint, "10");
});

test("FSDB mapper creates stable struct identities and validates references", () => {
  const dataset = { domains: {
    Type: [{ id: "NORMAL" }],
    Move: [{ id: "TACKLE", type: { domain: "Type", id: "NORMAL" } }],
  } };
  const plan = mapCanonicalDataset(dataset);
  assert.deepEqual(plan.tables.map((table) => table.name), ["Move", "Type"]);
  assert.equal(validateKnownReferences(plan).knownReferences, 1);
  const broken = mapCanonicalDataset({ domains: { Move: [{ id: "TACKLE", type: { domain: "Type", id: "MISSING" } }] } });
  assert.throws(() => validateKnownReferences(broken), (error) => error instanceof ImportFailure && error.category === "INTEGRITY_FAILURE");
});
