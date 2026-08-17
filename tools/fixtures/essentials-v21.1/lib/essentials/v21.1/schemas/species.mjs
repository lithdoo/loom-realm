const field = (name, format, ...enumerations) => Object.freeze({ field: name, format, enumerations: Object.freeze(enumerations) });

export function speciesSchema(refs, forms = false) {
  const schema = {
    FormName: field("formName", "q"), Types: field("types", "*e", refs.Type),
    BaseStats: field("baseStats", "vvvvvv"), BaseExp: field("baseExp", "v"),
    EVs: field("evs", "*ev", refs.Stat, undefined), CatchRate: field("catchRate", "u"),
    Happiness: field("happiness", "u"), Abilities: field("abilities", "*e", refs.Ability),
    HiddenAbilities: field("hiddenAbilities", "*e", refs.Ability), Moves: field("moves", "*ue", undefined, refs.Move),
    TutorMoves: field("tutorMoves", "*e", refs.Move), EggMoves: field("eggMoves", "*e", refs.Move),
    EggGroups: field("eggGroups", "*e", refs.EggGroup), HatchSteps: field("hatchSteps", "v"),
    Height: field("height", "f"), Weight: field("weight", "f"), Color: field("color", "e", refs.BodyColor),
    Shape: field("shape", "e", refs.BodyShape), Habitat: field("habitat", "e", refs.Habitat),
    Category: field("category", "s"), Pokedex: field("pokedex", "q"), Generation: field("generation", "i"),
    Flags: field("flags", "*s"), WildItemCommon: field("wildItemCommon", "*e", refs.Item),
    WildItemUncommon: field("wildItemUncommon", "*e", refs.Item), WildItemRare: field("wildItemRare", "*e", refs.Item),
  };
  if (forms) {
    Object.assign(schema, {
      PokedexForm: field("pokedexForm", "u"), MegaStone: field("megaStone", "e", refs.Item),
      MegaMove: field("megaMove", "e", refs.Move), UnmegaForm: field("unmegaForm", "u"),
      MegaMessage: field("megaMessage", "u"), Offspring: field("offspring", "*e", refs.Species),
      Evolutions: field("evolutions", "*ees", refs.Species, refs.Evolution, undefined),
    });
  } else {
    Object.assign(schema, {
      Name: field("name", "s"), GenderRatio: field("genderRatio", "e", refs.GenderRatio),
      GrowthRate: field("growthRate", "e", refs.GrowthRate), Incense: field("incense", "e", refs.Item),
      Offspring: field("offspring", "*s"), Evolutions: field("evolutions", "*ses", undefined, refs.Evolution, undefined),
    });
  }
  return Object.freeze(schema);
}

export function metricsSchema(refs) {
  return Object.freeze({
    BackSprite: field("backSprite", "ii"), FrontSprite: field("frontSprite", "ii"),
    FrontSpriteAltitude: field("frontSpriteAltitude", "i"), ShadowX: field("shadowX", "i"),
    ShadowSize: field("shadowSize", "u"),
    __section: field("id", "eV", refs.Species, undefined),
  });
}
