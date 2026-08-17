function definition(className, fields) {
  return Object.freeze({ className, fields: Object.freeze(fields) });
}

export const RMXP_CLASS_REGISTRY = Object.freeze(new Map([
  definition("RPG::AudioFile", ["@name", "@volume", "@pitch"]),
  definition("RPG::MapInfo", ["@name", "@parent_id", "@order", "@expanded", "@scroll_x", "@scroll_y"]),
  definition("RPG::Map", ["@tileset_id", "@width", "@height", "@autoplay_bgm", "@bgm", "@autoplay_bgs", "@bgs", "@encounter_list", "@encounter_step", "@data", "@events"]),
  definition("RPG::Event", ["@id", "@name", "@x", "@y", "@pages"]),
  definition("RPG::Event::Page", ["@condition", "@graphic", "@move_type", "@move_speed", "@move_frequency", "@move_route", "@walk_anime", "@step_anime", "@direction_fix", "@through", "@always_on_top", "@trigger", "@list"]),
  definition("RPG::Event::Page::Condition", ["@switch1_valid", "@switch2_valid", "@variable_valid", "@self_switch_valid", "@switch1_id", "@switch2_id", "@variable_id", "@variable_value", "@self_switch_ch"]),
  definition("RPG::Event::Page::Graphic", ["@tile_id", "@character_name", "@character_hue", "@direction", "@pattern", "@opacity", "@blend_type"]),
  definition("RPG::EventCommand", ["@code", "@indent", "@parameters"]),
  definition("RPG::MoveRoute", ["@repeat", "@skippable", "@list"]),
  definition("RPG::MoveCommand", ["@code", "@parameters"]),
  definition("RPG::CommonEvent", ["@id", "@name", "@trigger", "@switch_id", "@list"]),
  definition("RPG::Tileset", ["@id", "@name", "@tileset_name", "@autotile_names", "@panorama_name", "@panorama_hue", "@fog_name", "@fog_hue", "@fog_opacity", "@fog_blend_type", "@fog_zoom", "@fog_sx", "@fog_sy", "@battleback_name", "@passages", "@priorities", "@terrain_tags"]),
  definition("RPG::System", ["@magic_number", "@party_members", "@elements", "@switches", "@variables", "@windowskin_name", "@title_name", "@gameover_name", "@battle_transition", "@title_bgm", "@battle_bgm", "@battle_end_me", "@gameover_me", "@cursor_se", "@decision_se", "@cancel_se", "@buzzer_se", "@equip_se", "@shop_se", "@save_se", "@load_se", "@battle_start_se", "@escape_se", "@actor_collapse_se", "@enemy_collapse_se", "@words", "@test_battlers", "@test_troop_id", "@start_map_id", "@start_x", "@start_y", "@battleback_name", "@battler_name", "@battler_hue", "@edit_map_id"]),
  definition("RPG::System::Words", ["@gold", "@hp", "@sp", "@str", "@dex", "@agi", "@int", "@atk", "@pdef", "@mdef", "@weapon", "@armor1", "@armor2", "@armor3", "@armor4", "@attack", "@skill", "@guard", "@item", "@equip"]),
  definition("RPG::System::TestBattler", ["@actor_id", "@level", "@weapon_id", "@armor1_id", "@armor2_id", "@armor3_id", "@armor4_id"]),
].map((entry) => [entry.className, entry])));

export const RGSS_USER_DEFINED = Object.freeze(new Set(["Table", "Color", "Tone"]));
