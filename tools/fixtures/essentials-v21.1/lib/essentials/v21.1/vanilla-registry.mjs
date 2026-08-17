const AUTHORITY = Object.freeze({
  repository: "Maruno17/pokemon-essentials",
  version: "21.1",
  commit: "ea7b5d56d2436591160983c4e641a2ceee2d875a",
});

const compiler = "Data/Scripts/021_Compiler/001_Compiler.rb";
const compilePbs = "Data/Scripts/021_Compiler/002_Compiler_CompilePBS.rb";
const pbsData = "Data/Scripts/010_Data/002_PBS data";

function pbs(id, baseFilenames, compiledData, compilerPass, options = {}) {
  return Object.freeze({
    id,
    baseFilenames: Object.freeze(baseFilenames),
    compiledData: Object.freeze(compiledData),
    compilerPass,
    required: options.required ?? true,
    companionPrefixes: Object.freeze(options.companionPrefixes ?? []),
    authority: Object.freeze([
      `${compiler}:957-1006`,
      `${compilePbs}:${options.line}`,
      ...(options.authority ?? []),
    ]),
  });
}

const pbsFamilies = Object.freeze([
  pbs("town-map", ["town_map"], ["town_map.dat"], "compile_town_map", { line: 73 }),
  pbs("connections", ["map_connections"], ["map_connections.dat"], "compile_connections", { line: 104 }),
  pbs("types", ["types"], ["types.dat"], "compile_types", { line: 143 }),
  pbs("abilities", ["abilities"], ["abilities.dat"], "compile_abilities", { line: 181 }),
  pbs("moves", ["moves"], ["moves.dat"], "compile_moves", { line: 205 }),
  pbs("items", ["items"], ["items.dat"], "compile_items", { line: 237 }),
  pbs("berry-plants", ["berry_plants"], ["berry_plants.dat"], "compile_berry_plants", { line: 270 }),
  pbs("species", ["pokemon"], ["species.dat"], "compile_pokemon", { line: 285 }),
  pbs("species-forms", ["pokemon_forms"], ["species.dat"], "compile_pokemon_forms", { line: 380 }),
  pbs("species-metrics", ["pokemon_metrics"], ["species_metrics.dat"], "compile_pokemon_metrics", { line: 535 }),
  pbs("shadow-pokemon", ["shadow_pokemon"], ["shadow_pokemon.dat"], "compile_shadow_pokemon", { line: 560, required: false }),
  pbs("regional-dexes", ["regional_dexes"], ["regional_dexes.dat"], "compile_regional_dexes", { line: 585 }),
  pbs("ribbons", ["ribbons"], ["ribbons.dat"], "compile_ribbons", { line: 626 }),
  pbs("encounters", ["encounters"], ["encounters.dat"], "compile_encounters", { line: 650 }),
  pbs("trainer-types", ["trainer_types"], ["trainer_types.dat"], "compile_trainer_types", { line: 763 }),
  pbs("trainers", ["trainers"], ["trainers.dat"], "compile_trainers", { line: 784 }),
  pbs("battle-facility", ["battle_facility_lists"], ["trainer_lists.dat"], "compile_trainer_lists", {
    line: 948,
    companionPrefixes: ["battle_tower_", "cup_"],
  }),
  pbs("metadata", ["metadata"], ["metadata.dat", "player_metadata.dat"], "compile_metadata", { line: 1067 }),
  pbs("map-metadata", ["map_metadata"], ["map_metadata.dat"], "compile_map_metadata", { line: 1170 }),
  pbs("dungeon-tilesets", ["dungeon_tilesets"], ["dungeon_tilesets.dat"], "compile_dungeon_tilesets", { line: 1193 }),
  pbs("dungeon-parameters", ["dungeon_parameters"], ["dungeon_parameters.dat"], "compile_dungeon_parameters", { line: 1208 }),
  pbs("phone", ["phone"], ["phone.dat"], "compile_phone", { line: 1234 }),
]);

const compiledData = Object.freeze([
  ["town_map.dat", true, "GameData::TownMap"], ["types.dat", true, "GameData::Type"],
  ["abilities.dat", true, "GameData::Ability"], ["moves.dat", true, "GameData::Move"],
  ["items.dat", true, "GameData::Item"], ["berry_plants.dat", true, "GameData::BerryPlant"],
  ["species.dat", true, "GameData::Species"], ["species_metrics.dat", true, "GameData::SpeciesMetrics"],
  ["shadow_pokemon.dat", false, "GameData::ShadowPokemon"], ["ribbons.dat", true, "GameData::Ribbon"],
  ["encounters.dat", true, "GameData::Encounter"], ["trainer_types.dat", true, "GameData::TrainerType"],
  ["trainers.dat", true, "GameData::Trainer"], ["metadata.dat", true, "GameData::Metadata"],
  ["player_metadata.dat", true, "GameData::PlayerMetadata"], ["map_metadata.dat", true, "GameData::MapMetadata"],
  ["dungeon_tilesets.dat", true, "GameData::DungeonTileset"], ["dungeon_parameters.dat", true, "GameData::DungeonParameters"],
  ["phone.dat", true, "GameData::PhoneMessage"],
  ["map_connections.dat", true, "Compiler extra"], ["regional_dexes.dat", true, "Compiler extra"],
  ["trainer_lists.dat", true, "Compiler extra"],
].map(([filename, required, owner]) => Object.freeze({
  filename, required, owner,
  authority: `${owner === "Compiler extra" ? compiler + ":1041-1045" : pbsData}`,
})));

const hardcodedDomains = Object.freeze([
  "GrowthRate", "GenderRatio", "EggGroup", "BodyShape", "BodyColor", "Habitat", "Evolution",
  "Stat", "Nature", "Status", "TerrainTag", "Weather", "EncounterType", "Environment",
  "BattleWeather", "BattleTerrain", "Target",
].map((id, index) => Object.freeze({
  id,
  required: true,
  authority: `Data/Scripts/010_Data/001_Hardcoded data/${String(index + 1).padStart(3, "0")}_*.rb`,
})));

const rmxpRoots = Object.freeze([
  "Actors.rxdata", "Animations.rxdata", "Armors.rxdata", "Classes.rxdata", "CommonEvents.rxdata",
  "Enemies.rxdata", "Items.rxdata", "Skills.rxdata", "States.rxdata", "System.rxdata",
  "Tilesets.rxdata", "Troops.rxdata", "Weapons.rxdata", "Scripts.rxdata", "MapInfos.rxdata",
  "Map*.rxdata", "PluginScripts.rxdata", "PkmnAnimations.rxdata",
].map((pattern) => Object.freeze({
  id: pattern.replace(/\.rxdata$/u, "").replace("*", "-NNN"),
  pattern,
  required: !["PluginScripts.rxdata"].includes(pattern),
  authority: "official Pokémon Essentials v21.1 2023-07-30 Data/ corpus",
})));

const compilerPasses = Object.freeze([
  ...pbsFamilies.map((family) => family.compilerPass),
  "compile_animations", "compile_trainer_events", "gather_script_and_event_texts", "save_default_messages",
].map((id) => Object.freeze({
  id,
  required: true,
  authority: id === "compile_trainer_events"
    ? "Data/Scripts/021_Compiler/004_Compiler_MapsAndEvents.rb:1683"
    : `${compiler}:983-1023`,
})));

export const VANILLA_REGISTRY_V21_1 = Object.freeze({
  authority: AUTHORITY,
  pbsFamilies,
  compiledData,
  hardcodedDomains,
  rmxpRoots,
  compilerPasses,
});
