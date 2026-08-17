import { fail } from "../../errors.mjs";
import { castPbsRecord } from "../../pbs/cast.mjs";
import { parsePbs } from "../../pbs/parser.mjs";
import { metricsSchema, speciesSchema } from "./schemas/species.mjs";

const MAIN_STATS = Object.freeze(["HP", "ATTACK", "DEFENSE", "SPECIAL_ATTACK", "SPECIAL_DEFENSE", "SPEED"]);
const PBS_STAT_ORDER = Object.freeze(["HP", "ATTACK", "DEFENSE", "SPEED", "SPECIAL_ATTACK", "SPECIAL_DEFENSE"]);
const INTEGER_EVOLUTIONS = new Set("Level LevelMale LevelFemale LevelDay LevelNight LevelMorning LevelAfternoon LevelEvening LevelNoWeather LevelSun LevelRain LevelSnow LevelSandstorm LevelCycling LevelSurfing LevelDiving LevelDarkness LevelDarkInParty AttackGreater AtkDefEqual DefenseGreater Silcoon Cascoon Ninjask Shedinja Beauty Location Region BattleDealCriticalHit Event EventAfterDamageTaken".split(" "));
const EVOLUTION_REFERENCES = Object.freeze({
  HappinessMove: "Move", HappinessMoveType: "Type", HappinessHoldItem: "Item", HoldItem: "Item",
  HoldItemMale: "Item", HoldItemFemale: "Item", DayHoldItem: "Item", NightHoldItem: "Item",
  HoldItemHappiness: "Item", HasMove: "Move", HasMoveType: "Type", HasInParty: "Species",
  Item: "Item", ItemMale: "Item", ItemFemale: "Item", ItemDay: "Item", ItemNight: "Item",
  ItemHappiness: "Item", TradeItem: "Item", TradeSpecies: "Species",
});

async function collect(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function find(manifest, filename) {
  const object = manifest.objects.find((entry) => entry.kind === "file" && entry.relativePath === `PBS/${filename}`);
  if (!object) fail("PBS_SCHEMA_FAILURE", `Required PBS source is missing: PBS/${filename}`);
  return object;
}

function sets(domains) {
  return Object.fromEntries(Object.entries(domains).map(([name, records]) => [name, new Set(records.map((record) => record.id))]));
}

function ref(domain, identities) {
  return (id) => identities[domain]?.has(id) ? Object.freeze({ domain, id }) : undefined;
}

function sectionValues(section) {
  const output = {};
  const provenance = {};
  for (const [name, compiled] of Object.entries(section.properties)) {
    if (Array.isArray(compiled)) {
      output[name] = compiled.map((item) => item.value);
      provenance[name] = compiled.map((item) => item.source);
    } else {
      output[name] = compiled.value;
      provenance[name] = compiled.source;
    }
  }
  return { output, provenance: Object.freeze(provenance) };
}

function normalizeEvolution(evolution, identities) {
  if (!Array.isArray(evolution) && evolution?.target && evolution?.method) return evolution;
  const [targetValue, methodValue, rawParameter] = evolution;
  const target = typeof targetValue === "object" ? targetValue : ref("Species", identities)(targetValue);
  if (!target) fail("PBS_REFERENCE_FAILURE", `Undefined evolution target ${targetValue}`);
  const method = typeof methodValue === "object" ? methodValue : ref("Evolution", identities)(methodValue);
  if (!method) fail("PBS_REFERENCE_FAILURE", `Undefined evolution method ${methodValue}`);
  let parameter = rawParameter;
  const parameterDomain = EVOLUTION_REFERENCES[method.id];
  if (parameterDomain) {
    parameter = ref(parameterDomain, identities)(rawParameter);
    if (!parameter) fail("PBS_REFERENCE_FAILURE", `Undefined ${parameterDomain} evolution parameter ${rawParameter}`);
  } else if (INTEGER_EVOLUTIONS.has(method.id)) {
    if (!/^\d+$/u.test(rawParameter)) fail("PBS_SCHEMA_FAILURE", `Invalid integer evolution parameter ${rawParameter}`);
    parameter = Number.parseInt(rawParameter, 10);
  } else if (method.id === "None") {
    parameter = null;
  }
  return Object.freeze({ target, method, parameter, prevolution: false });
}

function defaults(identities) {
  const statMap = Object.freeze(Object.fromEntries(MAIN_STATS.map((id) => [id, 1])));
  const evMap = Object.freeze(Object.fromEntries(MAIN_STATS.map((id) => [id, 0])));
  return Object.freeze({
    formName: null, pokedexForm: 0, category: "???", pokedex: "???", types: Object.freeze([ref("Type", identities)("NORMAL")]),
    baseStats: statMap, evs: evMap, baseExp: 100, growthRate: ref("GrowthRate", identities)("Medium"),
    genderRatio: ref("GenderRatio", identities)("Female50Percent"), catchRate: 255, happiness: 70,
    moves: Object.freeze([]), tutorMoves: Object.freeze([]), eggMoves: Object.freeze([]), abilities: Object.freeze([]),
    hiddenAbilities: Object.freeze([]), wildItemCommon: Object.freeze([]), wildItemUncommon: Object.freeze([]),
    wildItemRare: Object.freeze([]), eggGroups: Object.freeze([ref("EggGroup", identities)("Undiscovered")]),
    hatchSteps: 1, incense: null, offspring: Object.freeze([]), evolutions: Object.freeze([]), height: 1, weight: 1,
    color: ref("BodyColor", identities)("Red"), shape: ref("BodyShape", identities)("Head"),
    habitat: ref("Habitat", identities)("None"), generation: 0, flags: Object.freeze([]), megaStone: null,
    megaMove: null, unmegaForm: 0, megaMessage: 0,
    pbsFileSuffix: "",
  });
}

function finishSpecies(record, identities, normalizeMeasurements = true) {
  const output = { ...record };
  if (Array.isArray(output.baseStats)) output.baseStats = Object.fromEntries(PBS_STAT_ORDER.map((id, index) => [id, output.baseStats[index] ?? 1]));
  if (Array.isArray(output.evs)) output.evs = Object.fromEntries([...MAIN_STATS.map((id) => [id, 0]), ...output.evs.map(([stat, value]) => [stat.id, value])]);
  output.types = [...new Map(output.types.filter(Boolean).map((value) => [value.id, value])).values()];
  if (normalizeMeasurements) {
    output.height = Math.max(Math.round(output.height * 10), 1);
    output.weight = Math.max(Math.round(output.weight * 10), 1);
  }
  output.evolutions = output.evolutions.map((evolution) => normalizeEvolution(evolution, identities));
  for (const key of ["baseStats", "evs", "types", "evolutions", "moves", "tutorMoves", "eggMoves", "abilities", "hiddenAbilities", "wildItemCommon", "wildItemUncommon", "wildItemRare", "eggGroups", "offspring", "flags"]) {
    output[key] = Object.freeze(output[key]);
  }
  return Object.freeze(output);
}

export async function compileSpeciesData(manifest, reader, existingDomains) {
  const objects = Object.fromEntries(["pokemon.txt", "pokemon_forms.txt", "pokemon_metrics.txt"].map((filename) => [filename, find(manifest, filename)]));
  const bytes = Object.fromEntries(await Promise.all(Object.entries(objects).map(async ([filename, object]) => [filename, await collect(reader.open(object))])));
  const speciesIds = new Set(parsePbs(bytes["pokemon.txt"], { file: objects["pokemon.txt"].relativePath }).sections.map((section) => section.id));
  const identities = { ...sets(existingDomains), Species: speciesIds };
  const refs = Object.fromEntries(Object.keys(identities).map((domain) => [domain, ref(domain, identities)]));
  const baseParsed = parsePbs(bytes["pokemon.txt"], { file: objects["pokemon.txt"].relativePath, schema: speciesSchema(refs) });
  const baseDefaults = defaults(identities);
  const species = baseParsed.sections.map((section) => {
    const { output, provenance } = sectionValues(section);
    const offspring = (output.offspring ?? []).map((id) => ref("Species", identities)(id));
    if (offspring.some((value) => !value)) fail("PBS_REFERENCE_FAILURE", `Undefined offspring for ${section.id}`);
    return finishSpecies({ ...baseDefaults, ...output, id: section.id, species: section.id, form: 0, name: output.name ?? "Unnamed", offspring: Object.freeze(offspring), provenance, unknownProperties: section.unknownProperties }, identities);
  });
  const byBase = new Map(species.map((record) => [record.id, record]));
  const formsParsed = parsePbs(bytes["pokemon_forms.txt"], { file: objects["pokemon_forms.txt"].relativePath, schema: speciesSchema(refs, true) });
  const forms = formsParsed.sections.map((section) => {
    const [baseId, formText, ...extra] = section.id.split(",").map((value) => value.trim());
    if (extra.length || !speciesIds.has(baseId) || !/^\d+$/u.test(formText)) fail("PBS_SCHEMA_FAILURE", `Invalid species form section ${section.id}`);
    const base = byBase.get(baseId);
    const { output, provenance } = sectionValues(section);
    const inherited = { ...baseDefaults };
    for (const field of ["name", "category", "pokedex", "baseExp", "growthRate", "genderRatio", "catchRate", "happiness", "hatchSteps", "incense", "height", "weight", "color", "shape", "habitat", "generation", "types", "baseStats", "evs", "tutorMoves", "eggMoves", "abilities", "hiddenAbilities", "eggGroups", "offspring", "flags"]) inherited[field] = base[field];
    inherited.moves = output.moves?.length ? output.moves : base.moves;
    inherited.evolutions = output.evolutions?.length ? output.evolutions : base.evolutions;
    if (output.wildItemCommon === undefined && output.wildItemUncommon === undefined && output.wildItemRare === undefined) {
      inherited.wildItemCommon = base.wildItemCommon;
      inherited.wildItemUncommon = base.wildItemUncommon;
      inherited.wildItemRare = base.wildItemRare;
    }
    const record = { ...inherited, ...output, id: `${baseId}_${Number(formText)}`, species: baseId, form: Number(formText), pokedexForm: output.pokedexForm ?? Number(formText), provenance, unknownProperties: section.unknownProperties };
    if (output.height !== undefined) record.height = Math.max(Math.round(output.height * 10), 1);
    if (output.weight !== undefined) record.weight = Math.max(Math.round(output.weight * 10), 1);
    return finishSpecies(record, identities, false);
  });
  const allSpecies = Object.freeze([...species, ...forms]);
  const metricsParsed = parsePbs(bytes["pokemon_metrics.txt"], { file: objects["pokemon_metrics.txt"].relativePath, schema: metricsSchema(refs) });
  const metrics = metricsParsed.sections.map((section) => {
    const [baseId, formText] = castPbsRecord(section.id, "eV", [refs.Species, undefined], `${metricsParsed.file}:${section.source.line}`);
    const { output, provenance } = sectionValues(section);
    const form = formText ?? 0;
    return Object.freeze({ id: form === 0 ? baseId.id : `${baseId.id}_${form}`, species: baseId, form, backSprite: Object.freeze(output.backSprite ?? [0, 0]), frontSprite: Object.freeze(output.frontSprite ?? [0, 0]), frontSpriteAltitude: output.frontSpriteAltitude ?? 0, shadowX: output.shadowX ?? 0, shadowSize: output.shadowSize ?? 2, pbsFileSuffix: "", provenance, unknownProperties: section.unknownProperties });
  });
  const unknownProperties = [...baseParsed.sections, ...formsParsed.sections, ...metricsParsed.sections].reduce((sum, section) => sum + section.unknownProperties.length, 0);
  return Object.freeze({
    domains: Object.freeze({ Species: allSpecies, SpeciesMetrics: Object.freeze(metrics) }),
    coverage: Object.freeze({ implementedFamilies: Object.freeze(["species", "species-forms", "species-metrics"]), discardedProperties: 0, unknownProperties }),
  });
}
