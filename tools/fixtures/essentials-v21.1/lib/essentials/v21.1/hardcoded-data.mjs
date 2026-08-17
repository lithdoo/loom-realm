const IDS = Object.freeze({
  GrowthRate: "Medium Erratic Fluctuating Parabolic Fast Slow",
  GenderRatio: "AlwaysMale AlwaysFemale Genderless FemaleOneEighth Female25Percent Female50Percent Female75Percent FemaleSevenEighths",
  EggGroup: "Undiscovered Monster Water1 Bug Flying Field Fairy Grass Humanlike Water3 Mineral Amorphous Water2 Ditto Dragon",
  BodyShape: "Head Serpentine Finned HeadArms HeadBase BipedalTail HeadLegs Quadruped Winged Multiped MultiBody Bipedal MultiWinged Insectoid",
  BodyColor: "Red Blue Yellow Green Black Brown Purple Gray White Pink",
  Habitat: "None Grassland Forest WatersEdge Sea Cave Mountain RoughTerrain Urban Rare",
  Evolution: "None Level LevelMale LevelFemale LevelDay LevelNight LevelMorning LevelAfternoon LevelEvening LevelNoWeather LevelSun LevelRain LevelSnow LevelSandstorm LevelCycling LevelSurfing LevelDiving LevelDarkness LevelDarkInParty AttackGreater AtkDefEqual DefenseGreater Silcoon Cascoon Ninjask Shedinja Happiness HappinessMale HappinessFemale HappinessDay HappinessNight HappinessMove HappinessMoveType HappinessHoldItem MaxHappiness Beauty HoldItem HoldItemMale HoldItemFemale DayHoldItem NightHoldItem HoldItemHappiness HasMove HasMoveType HasInParty Location LocationFlag Region Item ItemMale ItemFemale ItemDay ItemNight ItemHappiness Trade TradeMale TradeFemale TradeDay TradeNight TradeItem TradeSpecies BattleDealCriticalHit Event EventAfterDamageTaken",
  Stat: "HP ATTACK DEFENSE SPECIAL_ATTACK SPECIAL_DEFENSE SPEED ACCURACY EVASION",
  Nature: "HARDY LONELY BRAVE ADAMANT NAUGHTY BOLD DOCILE RELAXED IMPISH LAX TIMID HASTY SERIOUS JOLLY NAIVE MODEST MILD QUIET BASHFUL RASH CALM GENTLE SASSY CAREFUL QUIRKY",
  Status: "NONE SLEEP POISON BURN PARALYSIS FROZEN",
  TerrainTag: "None Ledge Grass Sand Rock DeepWater StillWater Water Waterfall WaterfallCrest TallGrass UnderwaterGrass Ice Neutral SootGrass Bridge Puddle NoEffect",
  Weather: "None Rain Storm Snow Blizzard Sandstorm HeavyRain Sun Fog",
  EncounterType: "Land LandDay LandNight LandMorning LandAfternoon LandEvening PokeRadar Cave CaveDay CaveNight CaveMorning CaveAfternoon CaveEvening Water WaterDay WaterNight WaterMorning WaterAfternoon WaterEvening OldRod GoodRod SuperRod RockSmash HeadbuttLow HeadbuttHigh BugContest",
  Environment: "None Grass TallGrass MovingWater StillWater Puddle Underwater Cave Rock Sand Forest ForestGrass Snow Ice Volcano Graveyard Sky Space UltraSpace",
  BattleWeather: "None Sun Rain Sandstorm Hail HarshSun HeavyRain StrongWinds ShadowSky",
  BattleTerrain: "None Electric Grassy Misty Psychic",
  Target: "None User NearAlly UserOrNearAlly AllAllies UserAndAllies NearFoe RandomNearFoe AllNearFoes Foe AllFoes NearOther AllNearOthers Other AllBattlers UserSide FoeSide BothSides",
});

function records(domain, value) {
  return Object.freeze(value.split(" ").map((id) => Object.freeze({
    id,
    authority: `Maruno17/pokemon-essentials@ea7b5d56d2436591160983c4e641a2ceee2d875a GameData::${domain}`,
  })));
}

export const HARDCODED_DATA_V21_1 = Object.freeze(Object.fromEntries(
  Object.entries(IDS).map(([domain, value]) => [domain, records(domain, value)]),
));

export function hardcodedIdentitySets(dataset = HARDCODED_DATA_V21_1) {
  return Object.freeze(Object.fromEntries(Object.entries(dataset).map(([domain, values]) => [domain, new Set(values.map((value) => value.id))])));
}
