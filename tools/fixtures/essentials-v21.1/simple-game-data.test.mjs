import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { compileSimpleGameData } from "./lib/essentials/v21.1/simple-game-data.mjs";
import { buildSourceManifest } from "./lib/source/manifest.mjs";
import { createSourceReader } from "./lib/source/reader.mjs";

test("Type, Ability, Move and Item compile to canonical records with defaults and references", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "essentials-simple-domains-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "PBS"));
  await writeFile(join(root, "PBS", "types.txt"), "[NORMAL]\nName=Normal\nWeaknesses=FIGHTING\n[FIGHTING]\nName=Fighting\n");
  await writeFile(join(root, "PBS", "abilities.txt"), "[OVERGROW]\nName=Overgrow\nDescription=Powers up Grass moves.\n");
  await writeFile(join(root, "PBS", "moves.txt"), "[TACKLE]\nName=Tackle\nType=NORMAL\nCategory=Physical\nTarget=NearFoe\n");
  await writeFile(join(root, "PBS", "items.txt"), "[TM01]\nName=TM01\nNamePlural=TM01s\nPocket=4\nPrice=1000\nFieldUse=TM\nFlags=TM\nMove=TACKLE\n");
  const manifest = await buildSourceManifest(root);
  const dataset = await compileSimpleGameData(manifest, createSourceReader(manifest));
  assert.deepEqual(Object.fromEntries(Object.entries(dataset.domains).map(([name, records]) => [name, records.length])), {
    Type: 2, Ability: 1, Move: 1, Item: 1,
  });
  assert.deepEqual(dataset.domains.Type[0].weaknesses, [{ domain: "Type", id: "FIGHTING" }]);
  assert.deepEqual(dataset.domains.Move[0].type, { domain: "Type", id: "NORMAL" });
  assert.equal(dataset.domains.Move[0].accuracy, 100);
  assert.equal(dataset.domains.Item[0].sellPrice, 500);
  assert.equal(dataset.domains.Item[0].consumable, false);
  assert.deepEqual(dataset.domains.Item[0].move, { domain: "Move", id: "TACKLE" });
  assert.deepEqual(dataset.coverage, {
    implementedFamilies: ["types", "abilities", "moves", "items"], discardedProperties: 0, unknownProperties: 0,
  });
});
