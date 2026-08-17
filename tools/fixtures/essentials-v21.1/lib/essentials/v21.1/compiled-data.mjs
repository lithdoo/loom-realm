const ROOTS = Object.freeze({
  "town_map.dat": "TownMap", "map_connections.dat": "Connection", "berry_plants.dat": "BerryPlant",
  "shadow_pokemon.dat": "ShadowPokemon", "regional_dexes.dat": "RegionalDex", "ribbons.dat": "Ribbon",
  "encounters.dat": "Encounter", "trainer_types.dat": "TrainerType", "trainers.dat": "Trainer",
  "trainer_lists.dat": "BattleFacility", "metadata.dat": "Metadata", "player_metadata.dat": "PlayerMetadata",
  "map_metadata.dat": "MapMetadata", "dungeon_tilesets.dat": "DungeonTileset",
  "dungeon_parameters.dat": "DungeonParameters", "phone.dat": "PhoneMessage",
});

function identity(value) {
  if (value?.kind === "RubySymbol") return value.name;
  if (value?.kind === "RubyString") return value.text;
  if (value?.kind === "Array") return value.items.map(identity).join("_");
  if (["string", "number"].includes(typeof value)) return String(value);
  return null;
}

function records(root) {
  if (root?.kind === "Hash") {
    return root.entries.map(([key, value], index) => Object.freeze({ id: identity(key) ?? `record_${index}`, key, compiled: value }));
  }
  if (root?.kind === "Array") return root.items.map((value, index) => Object.freeze({ id: `record_${String(index).padStart(6, "0")}`, compiled: value }));
  return Object.freeze([Object.freeze({ id: "root", compiled: root })]);
}

export function materializeCompiledDataDomains(rmxpRoots, existingDomains = {}) {
  const domains = {};
  const observedRoots = [];
  for (const root of rmxpRoots) {
    const domain = ROOTS[root.filename];
    if (!domain || existingDomains[domain] !== undefined) continue;
    domains[domain] = Object.freeze(records(root.root));
    observedRoots.push(root.filename);
  }
  return Object.freeze({
    domains: Object.freeze(domains),
    coverage: Object.freeze({
      observedRoots: Object.freeze(observedRoots.sort()),
      materializedDomains: Object.freeze(Object.keys(domains).sort()),
    }),
  });
}
