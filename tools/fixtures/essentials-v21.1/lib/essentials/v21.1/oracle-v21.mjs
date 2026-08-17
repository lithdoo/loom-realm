const FIELD_MAPS = Object.freeze({
  Type: Object.freeze({ id: "@id", name: "@real_name", iconPosition: "@icon_position", specialType: "@special_type", pseudoType: "@pseudo_type", weaknesses: "@weaknesses", resistances: "@resistances", immunities: "@immunities", flags: "@flags", pbsFileSuffix: "@pbs_file_suffix" }),
  Ability: Object.freeze({ id: "@id", name: "@real_name", description: "@real_description", flags: "@flags", pbsFileSuffix: "@pbs_file_suffix" }),
  Move: Object.freeze({ id: "@id", name: "@real_name", type: "@type", category: "@category", power: "@power", accuracy: "@accuracy", totalPp: "@total_pp", target: "@target", priority: "@priority", functionCode: "@function_code", flags: "@flags", effectChance: "@effect_chance", description: "@real_description", pbsFileSuffix: "@pbs_file_suffix" }),
  Item: Object.freeze({ id: "@id", name: "@real_name", namePlural: "@real_name_plural", portionName: "@real_portion_name", portionNamePlural: "@real_portion_name_plural", pocket: "@pocket", price: "@price", sellPrice: "@sell_price", bpPrice: "@bp_price", fieldUse: "@field_use", battleUse: "@battle_use", flags: "@flags", consumable: "@consumable", showQuantity: "@show_quantity", move: "@move", description: "@real_description", pbsFileSuffix: "@pbs_file_suffix" }),
  Species: Object.freeze({ id: "@id", species: "@species", form: "@form", name: "@real_name", formName: "@real_form_name", category: "@real_category", pokedex: "@real_pokedex_entry", pokedexForm: "@pokedex_form", types: "@types", baseStats: "@base_stats", evs: "@evs", baseExp: "@base_exp", growthRate: "@growth_rate", genderRatio: "@gender_ratio", catchRate: "@catch_rate", happiness: "@happiness", moves: "@moves", tutorMoves: "@tutor_moves", eggMoves: "@egg_moves", abilities: "@abilities", hiddenAbilities: "@hidden_abilities", wildItemCommon: "@wild_item_common", wildItemUncommon: "@wild_item_uncommon", wildItemRare: "@wild_item_rare", eggGroups: "@egg_groups", hatchSteps: "@hatch_steps", incense: "@incense", offspring: "@offspring", height: "@height", weight: "@weight", color: "@color", shape: "@shape", habitat: "@habitat", generation: "@generation", flags: "@flags", megaStone: "@mega_stone", megaMove: "@mega_move", unmegaForm: "@unmega_form", megaMessage: "@mega_message", pbsFileSuffix: "@pbs_file_suffix" }),
  SpeciesMetrics: Object.freeze({ id: "@id", species: "@species", form: "@form", backSprite: "@back_sprite", frontSprite: "@front_sprite", frontSpriteAltitude: "@front_sprite_altitude", shadowX: "@shadow_x", shadowSize: "@shadow_size", pbsFileSuffix: "@pbs_file_suffix" }),
});

const FILES = Object.freeze({ Type: "types.dat", Ability: "abilities.dat", Move: "moves.dat", Item: "items.dat", Species: "species.dat", SpeciesMetrics: "species_metrics.dat" });

function normalize(value, seen = new Set()) {
  if (value === null || typeof value !== "object") return value;
  if (seen.has(value)) return "<cycle>";
  if (typeof value.domain === "string" && typeof value.id === "string") return value.id;
  if (value.kind === "RubySymbol") return value.name;
  if (value.kind === "RubyString") return value.text ?? { bytes: value.bytes.toString("base64") };
  seen.add(value);
  if (value.kind === "Array") return value.items.map((item) => normalize(item, seen));
  if (value.kind === "Hash") {
    const output = {};
    for (const [key, item] of value.entries) output[String(normalize(key, seen))] = normalize(item, seen);
    return output;
  }
  if (Array.isArray(value)) return value.map((item) => normalize(item, seen));
  const output = {};
  for (const key of Object.keys(value).sort()) output[key] = normalize(value[key], seen);
  return output;
}

function stable(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${stable(value[key])}`).join(",")}}`;
}

function oracleRecords(root) {
  if (root?.kind !== "Hash") return new Map();
  return new Map(root.entries.map(([key, value]) => [String(normalize(key)), value]));
}

export function compareV21Oracle(domains, rmxpRoots) {
  const roots = new Map(rmxpRoots.map((entry) => [entry.filename, entry.root]));
  const differences = [];
  const domainsReport = [];
  let comparedFields = 0;
  for (const [domain, fields] of Object.entries(FIELD_MAPS)) {
    const actual = new Map((domains[domain] ?? []).map((record) => [record.id, record]));
    const oracle = oracleRecords(roots.get(FILES[domain]));
    const ids = [...new Set([...actual.keys(), ...oracle.keys()])].sort();
    for (const id of ids) {
      const record = actual.get(id);
      const expected = oracle.get(id);
      if (!record || !expected) {
        differences.push(Object.freeze({ domain, id, field: "<record>", actual: Boolean(record), oracle: Boolean(expected), classification: null }));
        continue;
      }
      for (const [field, ivar] of Object.entries(fields)) {
        comparedFields += 1;
        const left = normalize(record[field]);
        const right = normalize(expected.ivars[ivar]);
        if (stable(left) !== stable(right)) differences.push(Object.freeze({ domain, id, field, actual: left, oracle: right, classification: null }));
      }
    }
    domainsReport.push(Object.freeze({ domain, actualRecords: actual.size, oracleRecords: oracle.size, fields: Object.keys(fields).length }));
  }
  const classified = Object.freeze([
    Object.freeze({ domain: "Species", field: "evolutions", classification: "compiler-added prevolution graph is retained in compiled Data/species.dat and RMXP view" }),
  ]);
  const unclassified = differences.filter((difference) => difference.classification === null);
  return Object.freeze({ domains: Object.freeze(domainsReport), classifiedExclusions: classified, differences: Object.freeze(differences), unclassified: Object.freeze(unclassified), comparedFields, pass: unclassified.length === 0 });
}
