import { fail } from "../../errors.mjs";

const MAP_FILE = /^Map(\d+)\.rxdata$/u;
const SIZE_EVENT = /size\((\d+),(\d+)\)/iu;
const SCRIPT_START = 355;
const SCRIPT_CONTINUE = 655;
const COMMAND_END = 0;
const BRIDGE_ON = /^\s*pbBridgeOn\s*(?:\(\s*(2)\s*\)|\(\s*\)|)\s*$/u;
const BRIDGE_OFF = /^\s*pbBridgeOff\s*(?:\(\s*\)|)\s*$/u;
const BRIDGE_MENTION = /\bpbBridge(?:On|Off)?\b/u;
const DYNAMIC_RUBY = /\b(eval|instance_eval|send|__send__|public_send|const_get)\s*[\(\[]|#\{/u;

function invalid(message) {
  fail("MAP_ACTION_CONSUMER_PROJECTION_FAILURE", message);
}

function rubyText(value) {
  if (value?.kind !== "RubyString" || typeof value.text !== "string") return null;
  return value.text;
}

function integer(value, label, { positive = false, nonNegative = false } = {}) {
  if (!Number.isSafeInteger(value) || (positive && value <= 0) || (nonNegative && value < 0)) {
    invalid(`${label} must be a ${positive ? "positive " : nonNegative ? "non-negative " : ""}safe integer`);
  }
  return value;
}

function boolean(value, label) {
  if (typeof value !== "boolean") invalid(`${label} must be a boolean`);
  return value;
}

function pageEmptyGraphic(page) {
  const graphic = page.fields["@graphic"];
  if (graphic == null) return true;
  if (graphic.kind !== "RmxpObject" || graphic.className !== "RPG::Event::Page::Graphic") {
    invalid("page graphic must be RPG::Event::Page::Graphic");
  }
  const name = rubyText(graphic.fields["@character_name"]) ?? "";
  const tileId = graphic.fields["@tile_id"];
  return name.length === 0 && !(Number.isSafeInteger(tileId) && tileId > 0);
}

export function occupiedTiles(x, y, width = 1, height = 1) {
  integer(x, "occupiedTiles.x", { nonNegative: true });
  integer(y, "occupiedTiles.y", { nonNegative: true });
  integer(width, "occupiedTiles.width", { positive: true });
  integer(height, "occupiedTiles.height", { positive: true });
  const tiles = [];
  for (let i = 0; i < width; i += 1) {
    for (let j = 0; j < height; j += 1) {
      tiles.push(Object.freeze({ x: x + i, y: y - height + 1 + j }));
    }
  }
  return Object.freeze(tiles);
}

function parseSize(name) {
  const match = SIZE_EVENT.exec(name ?? "");
  if (!match) return Object.freeze({ width: 1, height: 1 });
  return Object.freeze({ width: Number(match[1]), height: Number(match[2]) });
}

function commandList(page) {
  const list = page.fields["@list"];
  if (list?.kind !== "Array") invalid("RPG::Event::Page @list must be an Array");
  return list.items.map((item, index) => {
    if (item?.kind !== "RmxpObject" || item.className !== "RPG::EventCommand") {
      invalid(`EventCommand[${index}] must be RPG::EventCommand`);
    }
    return item;
  });
}

function joinScripts(commands) {
  const groups = [];
  for (let index = 0; index < commands.length; index += 1) {
    const code = commands[index].fields["@code"];
    if (code !== SCRIPT_START) continue;
    const parts = [];
    const firstParams = commands[index].fields["@parameters"];
    parts.push(rubyText(firstParams?.items?.[0]) ?? "");
    let end = index;
    while (end + 1 < commands.length && [SCRIPT_START, SCRIPT_CONTINUE].includes(commands[end + 1].fields["@code"])) {
      end += 1;
      const params = commands[end].fields["@parameters"];
      parts.push(rubyText(params?.items?.[0]) ?? "");
    }
    groups.push(Object.freeze({ startCommandIndex: index, joined: parts.join("\n") }));
    index = end;
  }
  return Object.freeze(groups);
}

function classifyScript(text) {
  const trimmed = String(text ?? "").trim();
  if (DYNAMIC_RUBY.test(trimmed)) return Object.freeze({ kind: "opaque-related", reason: "dynamic-ruby" });
  const on = BRIDGE_ON.exec(trimmed);
  if (on) {
    return Object.freeze({ kind: "bridge-on", height: 2 });
  }
  if (BRIDGE_OFF.test(trimmed)) return Object.freeze({ kind: "bridge-off", height: null });
  if (BRIDGE_MENTION.test(trimmed)) return Object.freeze({ kind: "opaque-related", reason: "bridge-script-not-statically-confirmable" });
  return Object.freeze({ kind: "unrelated" });
}

function projectPage(mapId, eventId, eventX, eventY, eventName, page, pageIndex) {
  const trigger = page.fields["@trigger"];
  const commands = commandList(page);
  const codes = commands.map((command) => command.fields["@code"]);
  const COMMENT_START = 108;
  const COMMENT_CONTINUE = 408;
  const disallowed = codes.filter((code) => ![SCRIPT_START, SCRIPT_CONTINUE, COMMAND_END, COMMENT_START, COMMENT_CONTINUE].includes(code));
  const groups = joinScripts(commands);
  const classified = groups.map((group) => ({ ...group, ...classifyScript(group.joined) }));
  const related = classified.filter((item) => item.kind !== "unrelated");
  if (related.length === 0) return null;
  const size = parseSize(eventName);
  const occupied = occupiedTiles(eventX, eventY, size.width, size.height);
  if (trigger !== 1) {
    return Object.freeze({
      kind: "opaque-related",
      mapId,
      eventId,
      pageIndex,
      occupied,
      reason: "bridge-candidate-trigger-is-not-player-touch",
    });
  }
  if (disallowed.length > 0) {
    return Object.freeze({
      kind: "opaque-related",
      mapId,
      eventId,
      pageIndex,
      occupied,
      reason: `bridge-page-contains-non-whitelist-command-${disallowed[0]}`,
    });
  }
  if (related.length !== 1 || (related[0].kind !== "bridge-on" && related[0].kind !== "bridge-off")) {
    return Object.freeze({
      kind: "opaque-related",
      mapId,
      eventId,
      pageIndex,
      occupied,
      reason: related[0]?.reason ?? "bridge-page-not-a-single-confirmable-script",
    });
  }
  const hit = related[0];
  return Object.freeze({
    kind: "bridge",
    mapId,
    eventId,
    pageIndex,
    commandIndex: hit.startCommandIndex,
    trigger: 1,
    occupied,
    op: hit.kind,
    height: hit.height,
    through: boolean(page.fields["@through"], "page.through"),
    emptyGraphic: pageEmptyGraphic(page),
  });
}

function eventsOf(root, filename) {
  const events = root.fields["@events"];
  if (events == null) return [];
  if (events.kind !== "Hash") invalid(`${filename} @events must be a Hash`);
  const projected = [];
  for (const [key, event] of events.entries) {
    if (event?.kind !== "RmxpObject" || event.className !== "RPG::Event") invalid(`${filename} event must be RPG::Event`);
    const id = integer(event.fields["@id"], "RPG::Event @id", { positive: true });
    if (key !== id) invalid(`${filename} event hash key ${key} does not equal @id ${id}`);
    projected.push(event);
  }
  return projected;
}

export function projectMapActionRecord(entry) {
  const match = MAP_FILE.exec(entry?.filename ?? "");
  if (!match) return undefined;
  const mapId = Number(match[1]);
  integer(mapId, "MapAction mapId", { positive: true });
  const root = entry.root;
  if (root?.kind !== "RmxpObject" || root.className !== "RPG::Map") invalid(`${entry.filename} root must be RPG::Map`);
  const actions = [];
  const opaqueRelated = [];
  for (const event of eventsOf(root, entry.filename)) {
    const eventId = integer(event.fields["@id"], "RPG::Event @id", { positive: true });
    const x = integer(event.fields["@x"], "RPG::Event @x", { nonNegative: true });
    const y = integer(event.fields["@y"], "RPG::Event @y", { nonNegative: true });
    const name = rubyText(event.fields["@name"]) ?? "";
    const pages = event.fields["@pages"];
    if (pages?.kind !== "Array") invalid("RPG::Event @pages must be an Array");
    for (const [pageIndex, page] of pages.items.entries()) {
      if (page?.kind !== "RmxpObject" || page.className !== "RPG::Event::Page") invalid("event page must be RPG::Event::Page");
      const projected = projectPage(mapId, eventId, x, y, name, page, pageIndex);
      if (projected == null) continue;
      if (projected.kind === "opaque-related") opaqueRelated.push(projected);
      else actions.push(projected);
    }
  }
  return Object.freeze({
    key: String(mapId),
    value: Object.freeze({
      id: mapId,
      schemaVersion: "struct.MapAction/v1-bridge",
      actions: Object.freeze(actions),
      opaqueRelated: Object.freeze(opaqueRelated),
    }),
  });
}

export function materializeMapActionRecords(rmxpRoots) {
  const records = [];
  for (const entry of rmxpRoots) {
    const projected = projectMapActionRecord(entry);
    if (projected) records.push(projected);
  }
  return Object.freeze(records);
}
