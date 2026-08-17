import assert from "node:assert/strict";
import test from "node:test";
import { precompile } from "./lib/essentials/v21.1/compiler/precompile.mjs";
import { createReferenceResolver } from "./lib/essentials/v21.1/compiler/resolve.mjs";
import { ImportFailure } from "./lib/errors.mjs";
import { castPbsRecord, castPbsScalar } from "./lib/pbs/cast.mjs";
import { splitPbsCsv } from "./lib/pbs/csv.mjs";
import { parsePbs } from "./lib/pbs/parser.mjs";

const schema = Object.freeze({
  Name: { field: "name", format: "s" },
  Count: { field: "count", format: "u" },
  Enabled: { field: "enabled", format: "b" },
  Kind: { field: "kind", format: "e", enumerations: [["First", "Second"]] },
  Flag: { field: "flags", format: "^s" },
  Pair: { field: "pairs", format: "*uv" },
});

test("PBS lexer/parser handles UTF-8 BOM, comments, sections, repeats and provenance", () => {
  const bytes = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(`
# heading
[ENTRY] # inline
Name = Café
Count=0
Enabled = YES
Kind = Second
Flag = one
Flag = two
Pair = 0,1,2,3
FutureProperty = preserved
`)]);
  const parsed = parsePbs(bytes, { file: "PBS/test.txt", schema });
  const section = parsed.sections[0];
  assert.equal(section.properties.name.value, "Café");
  assert.equal(section.properties.enabled.value, true);
  assert.equal(section.properties.kind.value, 1);
  assert.deepEqual(section.properties.flags.map((entry) => entry.value), ["one", "two"]);
  assert.deepEqual(section.properties.pairs.value, [[0, 1], [2, 3]]);
  assert.equal(section.properties.name.source.line, 4);
  assert.equal(section.unknownProperties[0].name, "FutureProperty");
  assert.equal(parsed.coverage.discardedProperties, 0);
});

test("PBS CSV and every v21.1 cast grammar primitive are deterministic", () => {
  assert.deepEqual(splitPbsCsv('one,"two,too",three\\\\four'), ["one", "two,too", "three\\\\four"]);
  assert.equal(castPbsScalar("-2", "i"), -2);
  assert.equal(castPbsScalar("", "I"), null);
  assert.equal(castPbsScalar("0", "u"), 0);
  assert.equal(castPbsScalar("", "U"), null);
  assert.equal(castPbsScalar("1", "v"), 1);
  assert.equal(castPbsScalar("", "V"), null);
  assert.equal(castPbsScalar("ff", "x"), 255);
  assert.equal(castPbsScalar("", "X"), null);
  assert.equal(castPbsScalar("-1.5", "f"), -1.5);
  assert.equal(castPbsScalar("", "F"), null);
  assert.equal(castPbsScalar("true", "b"), true);
  assert.equal(castPbsScalar("", "B"), null);
  assert.equal(castPbsScalar("Valid_1", "n"), "Valid_1");
  assert.equal(castPbsScalar("", "N"), null);
  assert.equal(castPbsScalar("text", "s"), "text");
  assert.equal(castPbsScalar("", "S"), null);
  assert.equal(castPbsScalar("raw,text", "q"), "raw,text");
  assert.equal(castPbsScalar("", "Q"), null);
  assert.equal(castPbsScalar("SYMBOL", "m"), "SYMBOL");
  assert.equal(castPbsScalar("", "M"), null);
  assert.equal(castPbsScalar("B", "e", ["A", "B"]), 1);
  assert.equal(castPbsScalar("", "E", ["A"]), null);
  assert.equal(castPbsScalar("-3", "y", ["A"]), -3);
  assert.equal(castPbsScalar("", "Y", ["A"]), null);
  assert.deepEqual(castPbsRecord("A,1,B,2", "*su"), [["A", 1], ["B", 2]]);
});

test("PBS casting rejects invalid integer, enum and reference", () => {
  assert.throws(() => castPbsScalar("1.2", "i"), (error) => error instanceof ImportFailure && error.category === "PBS_SCHEMA_FAILURE");
  assert.throws(() => castPbsScalar("Missing", "e", ["Present"]), (error) => error instanceof ImportFailure && error.category === "PBS_SCHEMA_FAILURE");
  const resolver = createReferenceResolver({ Type: new Set(["NORMAL"]) });
  assert.deepEqual(resolver("Type", "NORMAL"), { domain: "Type", id: "NORMAL" });
  assert.throws(() => resolver("Type", "MISSING"), (error) => error instanceof ImportFailure && error.category === "PBS_REFERENCE_FAILURE");
});

test("compatibility rewrites never mutate the raw dataset", () => {
  const raw = Object.freeze({ value: "legacy" });
  const result = precompile(raw, [{ id: "rewrite", authority: "v21.1", apply: (input) => ({ ...input, value: "canonical" }) }]);
  assert.equal(result.rawDataset.value, "legacy");
  assert.equal(result.canonicalInput.value, "canonical");
  assert.deepEqual(result.applied, [{ id: "rewrite", authority: "v21.1" }]);
});
