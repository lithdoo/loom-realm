import { fail } from "../../errors.mjs";
import { parsePbs } from "../../pbs/parser.mjs";
import { createSourceReader } from "../../source/reader.mjs";
import { ABILITY_SCHEMA, itemSchema, moveSchema, TYPE_SCHEMA } from "./schemas/simple.mjs";
import { HARDCODED_DATA_V21_1, hardcodedIdentitySets } from "./hardcoded-data.mjs";
import { compileSpeciesData } from "./species.mjs";
import { compileRemainingPbs } from "./remaining-pbs.mjs";
import { decodeMarshalCorpus } from "../../marshal/corpus.mjs";
import { decodeRmxpCorpus } from "../../rmxp/corpus.mjs";
import { classifyEssentialsSemantics } from "../../semantic/classifier.mjs";
import { VANILLA_REGISTRY_V21_1 } from "./vanilla-registry.mjs";
import { compareV21Oracle } from "./oracle-v21.mjs";
import { materializeCompiledDataDomains } from "./compiled-data.mjs";

const ID = /^(?![0-9])\w+$/u;

async function collect(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function sourceFor(manifest, filename) {
  const object = manifest.objects.find((candidate) => candidate.kind === "file" && candidate.relativePath === `PBS/${filename}`);
  if (object === undefined) fail("PBS_SCHEMA_FAILURE", `Required PBS source is missing: PBS/${filename}`);
  return object;
}

function reference(domain, ids) {
  return (id) => ids.has(id) ? Object.freeze({ domain, id }) : undefined;
}

function canonicalize(parsed, defaults, finish = (record) => record) {
  const records = [];
  let unknownProperties = 0;
  for (const section of parsed.sections) {
    if (!ID.test(section.id)) fail("PBS_SCHEMA_FAILURE", `Invalid section identity '${section.id}' in ${parsed.file}`);
    const values = {};
    const fieldProvenance = {};
    for (const [field, compiled] of Object.entries(section.properties)) {
      if (Array.isArray(compiled)) {
        values[field] = Object.freeze(compiled.map((item) => item.value));
        fieldProvenance[field] = Object.freeze(compiled.map((item) => item.source));
      } else {
        values[field] = compiled.value;
        fieldProvenance[field] = compiled.source;
      }
    }
    unknownProperties += section.unknownProperties.length;
    const record = finish({
      ...defaults,
      ...values,
      id: section.id,
      pbsFileSuffix: "",
      provenance: Object.freeze({ section: section.source, fields: Object.freeze(fieldProvenance) }),
      unknownProperties: section.unknownProperties,
    });
    records.push(Object.freeze(record));
  }
  return Object.freeze({
    records: Object.freeze(records),
    coverage: Object.freeze({ discardedProperties: parsed.coverage.discardedProperties, unknownProperties }),
  });
}

export async function compileSimpleGameData(manifest, reader, options = {}) {
  const targets = options.targets ?? new Set([
    "None", "User", "NearAlly", "UserOrNearAlly", "AllAllies", "UserAndAllies", "NearFoe",
    "RandomNearFoe", "AllNearFoes", "Foe", "AllFoes", "NearOther", "AllNearOthers", "Other",
    "AllBattlers", "UserSide", "FoeSide", "BothSides",
  ]);
  const load = async (filename, schema) => {
    const object = sourceFor(manifest, filename);
    return parsePbs(await collect(reader.open(object)), { file: object.relativePath, schema });
  };

  const typeObject = sourceFor(manifest, "types.txt");
  const typeBytes = await collect(reader.open(typeObject));
  const typeIds = new Set(parsePbs(typeBytes, { file: typeObject.relativePath }).sections.map((section) => section.id));
  const types = canonicalize(parsePbs(typeBytes, { file: typeObject.relativePath, schema: TYPE_SCHEMA }), {
    name: "Unnamed", iconPosition: 0, specialType: false, pseudoType: false,
    weaknesses: Object.freeze([]), resistances: Object.freeze([]), immunities: Object.freeze([]), flags: Object.freeze([]),
  }, (record) => ({
    ...record,
    weaknesses: Object.freeze(record.weaknesses.map((id) => reference("Type", typeIds)(id))),
    resistances: Object.freeze(record.resistances.map((id) => reference("Type", typeIds)(id))),
    immunities: Object.freeze(record.immunities.map((id) => reference("Type", typeIds)(id))),
  }));
  const abilities = canonicalize(await load("abilities.txt", ABILITY_SCHEMA), {
    name: "Unnamed", description: "???", flags: Object.freeze([]),
  });
  const movesParsed = await load("moves.txt", moveSchema(reference("Type", typeIds), reference("Target", targets)));
  const moves = canonicalize(movesParsed, {
    name: "Unnamed", type: Object.freeze({ domain: "Type", id: "NONE" }), category: 2, power: 0,
    accuracy: 100, totalPp: 5, target: Object.freeze({ domain: "Target", id: "None" }), priority: 0,
    functionCode: "None", flags: Object.freeze([]), effectChance: 0, description: "???",
  });
  const moveIds = new Set(moves.records.map((record) => record.id));
  const items = canonicalize(await load("items.txt", itemSchema(reference("Move", moveIds))), {
    name: "Unnamed", namePlural: "Unnamed", portionName: null, portionNamePlural: null, pocket: 1,
    price: 0, sellPrice: null, bpPrice: 1, fieldUse: 0, battleUse: 0, flags: Object.freeze([]),
    consumable: null, showQuantity: null, move: null, description: "???",
  }, (record) => {
    const important = record.fieldUse === 3 || record.fieldUse === 4 || record.flags.some((flag) => ["KeyItem", "HM", "TM"].includes(flag));
    return { ...record, sellPrice: record.sellPrice ?? Math.floor(record.price / 2), consumable: record.consumable ?? !important };
  });
  const domains = Object.freeze({ Type: types.records, Ability: abilities.records, Move: moves.records, Item: items.records });
  return Object.freeze({
    domains,
    coverage: Object.freeze({
      implementedFamilies: Object.freeze(["types", "abilities", "moves", "items"]),
      discardedProperties: types.coverage.discardedProperties + abilities.coverage.discardedProperties + moves.coverage.discardedProperties + items.coverage.discardedProperties,
      unknownProperties: types.coverage.unknownProperties + abilities.coverage.unknownProperties + moves.coverage.unknownProperties + items.coverage.unknownProperties,
    }),
  });
}

export async function buildCanonicalDataset(manifest) {
  const required = ["types.txt", "abilities.txt", "moves.txt", "items.txt"];
  const present = new Set(manifest.objects
    .filter((object) => object.kind === "file" && object.canonicalSegments?.length === 2 && object.canonicalSegments[0] === "PBS")
    .map((object) => object.canonicalSegments[1]));
  if (!required.every((filename) => present.has(filename))) {
    return Object.freeze({
      domains: HARDCODED_DATA_V21_1,
      coverage: Object.freeze({ implementedFamilies: Object.freeze([]), implementedHardcodedDomains: Object.freeze(Object.keys(HARDCODED_DATA_V21_1)), discardedProperties: 0, unknownProperties: 0 }),
    });
  }
  const compiled = await compileSimpleGameData(manifest, createSourceReader(manifest), { targets: hardcodedIdentitySets().Target });
  const initialDomains = Object.freeze({ ...HARDCODED_DATA_V21_1, ...compiled.domains });
  const speciesRequired = ["pokemon.txt", "pokemon_forms.txt", "pokemon_metrics.txt"];
  const reader = createSourceReader(manifest);
  const species = speciesRequired.every((filename) => present.has(filename))
    ? await compileSpeciesData(manifest, reader, initialDomains)
    : Object.freeze({ domains: Object.freeze({}), coverage: Object.freeze({ implementedFamilies: Object.freeze([]), discardedProperties: 0, unknownProperties: 0 }) });
  const remaining = await compileRemainingPbs(manifest, reader);
  const marshal = await decodeMarshalCorpus(manifest, reader);
  const rmxp = decodeRmxpCorpus(marshal);
  const pbsDomains = Object.freeze({ ...initialDomains, ...species.domains, ...remaining.domains });
  const compiledData = materializeCompiledDataDomains(rmxp.roots, pbsDomains);
  const canonicalDomains = Object.freeze({ ...pbsDomains, ...compiledData.domains });
  const semantic = classifyEssentialsSemantics(rmxp, VANILLA_REGISTRY_V21_1.compilerPasses);
  const oracleComparison = compareV21Oracle(canonicalDomains, rmxp.roots);
  const oracle = Object.freeze({ ...oracleComparison, compiledDataRootsCompared: compiledData.coverage.observedRoots.length });
  return Object.freeze({
    domains: Object.freeze({ ...canonicalDomains, MarshalRoots: marshal.roots, RmxpRoots: rmxp.roots, DerivedSemantics: semantic.facts }),
    coverage: Object.freeze({
      implementedFamilies: Object.freeze([...compiled.coverage.implementedFamilies, ...species.coverage.implementedFamilies, ...remaining.coverage.implementedFamilies]),
      implementedHardcodedDomains: Object.freeze(Object.keys(HARDCODED_DATA_V21_1)),
      discardedProperties: compiled.coverage.discardedProperties + species.coverage.discardedProperties + remaining.coverage.discardedProperties,
      unknownProperties: compiled.coverage.unknownProperties + species.coverage.unknownProperties,
      unclassifiedVanillaFiles: remaining.coverage.unclassifiedVanillaFiles,
      marshal: marshal.coverage,
      rmxp: rmxp.coverage,
      semantic: semantic.coverage,
      oracle,
      compiledData: compiledData.coverage,
    }),
  });
}
