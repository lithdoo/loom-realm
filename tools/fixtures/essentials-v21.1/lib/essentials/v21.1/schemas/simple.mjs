const field = (name, format, ...enumerations) => Object.freeze({ field: name, format, enumerations: Object.freeze(enumerations) });

export const TYPE_SCHEMA = Object.freeze({
  Name: field("name", "s"), IconPosition: field("iconPosition", "u"),
  IsSpecialType: field("specialType", "b"), IsPseudoType: field("pseudoType", "b"),
  Weaknesses: field("weaknesses", "*m"), Resistances: field("resistances", "*m"),
  Immunities: field("immunities", "*m"), Flags: field("flags", "*s"),
});

export const ABILITY_SCHEMA = Object.freeze({
  Name: field("name", "s"), Description: field("description", "q"), Flags: field("flags", "*s"),
});

export function moveSchema(resolveType, resolveTarget) {
  return Object.freeze({
    Name: field("name", "s"), Type: field("type", "e", resolveType),
    Category: field("category", "e", ["Physical", "Special", "Status"]),
    Power: field("power", "u"), Accuracy: field("accuracy", "u"), TotalPP: field("totalPp", "u"),
    Target: field("target", "e", resolveTarget), Priority: field("priority", "i"),
    FunctionCode: field("functionCode", "s"), Flags: field("flags", "*s"),
    EffectChance: field("effectChance", "u"), Description: field("description", "q"),
  });
}

export function itemSchema(resolveMove) {
  return Object.freeze({
    Name: field("name", "s"), NamePlural: field("namePlural", "s"),
    PortionName: field("portionName", "s"), PortionNamePlural: field("portionNamePlural", "s"),
    Pocket: field("pocket", "v"), Price: field("price", "u"), SellPrice: field("sellPrice", "u"),
    BPPrice: field("bpPrice", "u"),
    FieldUse: field("fieldUse", "e", { OnPokemon: 1, Direct: 2, TM: 3, HM: 4, TR: 5 }),
    BattleUse: field("battleUse", "e", { OnPokemon: 1, OnMove: 2, OnBattler: 3, OnFoe: 4, Direct: 5 }),
    Flags: field("flags", "*s"), Consumable: field("consumable", "b"), ShowQuantity: field("showQuantity", "b"),
    Move: field("move", "e", resolveMove), Description: field("description", "q"),
  });
}
