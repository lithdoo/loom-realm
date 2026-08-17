import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { HARDCODED_DATA_V21_1, hardcodedIdentitySets } from "./lib/essentials/v21.1/hardcoded-data.mjs";
import { compileSimpleGameData } from "./lib/essentials/v21.1/simple-game-data.mjs";
import { compileSpeciesData } from "./lib/essentials/v21.1/species.mjs";
import { buildSourceManifest } from "./lib/source/manifest.mjs";
import { createSourceReader } from "./lib/source/reader.mjs";

test("Species, forms and metrics close known v21.1 references and inheritance", async (t) => {
  const root = await mkdtemp(join(tmpdir(), "essentials-species-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "PBS"));
  const files = {
    "types.txt": "[NORMAL]\nName=Normal\n",
    "abilities.txt": "[OVERGROW]\nName=Overgrow\n",
    "moves.txt": "[TACKLE]\nName=Tackle\nType=NORMAL\nCategory=Physical\nTarget=NearFoe\n",
    "items.txt": "[POTION]\nName=Potion\nNamePlural=Potions\nPocket=1\n",
    "pokemon.txt": "[BULBASAUR]\nName=Bulbasaur\nTypes=NORMAL\nBaseStats=45,49,49,45,65,65\nGenderRatio=FemaleOneEighth\nGrowthRate=Medium\nAbilities=OVERGROW\nMoves=1,TACKLE\nEggGroups=Monster\nHeight=0.7\nWeight=6.9\nColor=Green\nShape=Quadruped\nHabitat=Grassland\nEvolutions=IVYSAUR,Level,16\n[IVYSAUR]\nName=Ivysaur\nTypes=NORMAL\nBaseStats=60,62,63,60,80,80\nGenderRatio=FemaleOneEighth\nGrowthRate=Medium\nAbilities=OVERGROW\nEggGroups=Monster\nHeight=1.0\nWeight=13.0\nColor=Green\nShape=Quadruped\nHabitat=Grassland\n",
    "pokemon_forms.txt": "[BULBASAUR,1]\nFormName=Alt\n",
    "pokemon_metrics.txt": "[BULBASAUR]\nBackSprite=1,2\n[BULBASAUR,1]\nShadowSize=3\n",
  };
  for (const [name, contents] of Object.entries(files)) await writeFile(join(root, "PBS", name), contents);
  const manifest = await buildSourceManifest(root);
  const reader = createSourceReader(manifest);
  const simple = await compileSimpleGameData(manifest, reader, { targets: hardcodedIdentitySets().Target });
  const result = await compileSpeciesData(manifest, reader, { ...HARDCODED_DATA_V21_1, ...simple.domains });
  assert.equal(result.domains.Species.length, 3);
  const base = result.domains.Species.find((record) => record.id === "BULBASAUR");
  const form = result.domains.Species.find((record) => record.id === "BULBASAUR_1");
  assert.deepEqual(base.baseStats, { HP: 45, ATTACK: 49, DEFENSE: 49, SPECIAL_ATTACK: 65, SPECIAL_DEFENSE: 65, SPEED: 45 });
  assert.deepEqual(base.moves[0], [1, { domain: "Move", id: "TACKLE" }]);
  assert.deepEqual(base.evolutions[0], { target: { domain: "Species", id: "IVYSAUR" }, method: { domain: "Evolution", id: "Level" }, parameter: 16, prevolution: false });
  assert.deepEqual(form.types, base.types);
  assert.equal(form.formName, "Alt");
  assert.equal(result.domains.SpeciesMetrics[1].id, "BULBASAUR_1");
  assert.equal(result.coverage.unknownProperties, 0);
});
