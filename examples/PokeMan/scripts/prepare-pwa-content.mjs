import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { listFsdbEntries, openFsdb, openFsdbObject } from "@loomrealm/fsdb";
import { MAP_ONLY_NPC_PLACEMENTS } from "../subsystems/map.mjs";

const exampleRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const defaultFsdbRoot = join(exampleRoot, "[FSDB]PokeMan");

function codePointCompare(left, right) {
  const a = [...left];
  const b = [...right];
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) {
    const difference = a[index].codePointAt(0) - b[index].codePointAt(0);
    if (difference !== 0) return difference;
  }
  return a.length - b.length;
}

function fsdbIdentityKey(identity) {
  return `${identity.kind}\0${identity.table}\0${identity.key}`;
}

function pwaIdentityKey(entry) {
  return `${entry.kind}\0${entry.namespace}\0${entry.key}`;
}

export function mapFsdbEntryToPwaIdentity(entry) {
  const { identity } = entry;
  const kind = identity.kind === "group" ? "group" : identity.kind === "resource" ? "resource" : "record";
  return Object.freeze({
    kind,
    namespace: `${identity.kind}.${identity.table}`,
    key: identity.key,
    mime: entry.contentType,
  });
}

export function indexFsdbEntries(entries) {
  const index = new Map();
  for (const entry of entries) {
    const key = fsdbIdentityKey(entry.identity);
    if (index.has(key)) throw new Error(`Duplicate FSDB identity: ${key.replaceAll("\0", "/")}`);
    index.set(key, entry);
  }
  return index;
}

export function requireFsdbEntry(index, kind, table, key) {
  const lookup = `${kind}\0${table}\0${key}`;
  const entry = index.get(lookup);
  if (entry === undefined) throw new Error(`Missing PokeMan Map dependency: ${kind}/${table}/${key}`);
  return entry;
}

export function assertUniquePwaContent(entries) {
  const seen = new Set();
  for (const entry of entries) {
    const identity = pwaIdentityKey(entry);
    if (seen.has(identity)) throw new Error(`Duplicate PWA Content identity: ${identity.replaceAll("\0", "/")}`);
    seen.add(identity);
  }
}

async function readFsdbEntry(db, entry) {
  const lease = await openFsdbObject(db, entry.identity, new AbortController().signal);
  if (lease === null) throw new Error(`Indexed FSDB entry disappeared: ${fsdbIdentityKey(entry.identity).replaceAll("\0", "/")}`);
  try {
    const chunks = [];
    for await (const chunk of lease.stream) chunks.push(Buffer.from(chunk));
    const bytes = Buffer.concat(chunks);
    if (BigInt(bytes.byteLength) !== entry.length) throw new Error("FSDB entry length changed while preparing PWA Content");
    return bytes;
  } finally {
    await lease.close();
  }
}

function transferTargets(value, mapId) {
  if (value === null || typeof value !== "object" || value.id !== mapId) {
    throw new Error(`Invalid MapTransfer dependency for Map ${mapId}`);
  }
  const rules = ["contacts", "steps", "edges"].flatMap((name) => {
    if (!Array.isArray(value[name])) throw new Error(`Invalid MapTransfer ${mapId} ${name}`);
    return value[name];
  });
  return rules.map((rule) => {
    if (!Number.isSafeInteger(rule?.targetMapId) || rule.targetMapId <= 0) {
      throw new Error(`Invalid MapTransfer target from Map ${mapId}`);
    }
    return rule.targetMapId;
  });
}

/**
 * Builds the map-only dependency closure rooted at game.json's initial map.
 * The closure follows every real MapTransfer edge, then includes only the
 * Tileset/Autotile/Graphics, configured NPC, player, and Presentation objects
 * required by those reachable maps. No non-map gameplay tables are selected.
 */
export async function preparePokeManPwaContent(options = {}) {
  const root = options.exampleRoot ?? exampleRoot;
  const fsdbRoot = options.fsdbRoot ?? defaultFsdbRoot;
  const game = JSON.parse(await readFile(join(root, "game.json"), "utf8"));
  const presentation = JSON.parse(await readFile(join(root, "presentation.json"), "utf8"));
  const initialMapId = game?.initial?.input?.mapId;
  const characterName = game?.initial?.input?.characterName;
  if (!Number.isSafeInteger(initialMapId) || initialMapId <= 0 || typeof characterName !== "string" || characterName.length === 0) {
    throw new Error("PokeMan Map initial input is invalid");
  }

  const db = await openFsdb({ root: fsdbRoot });
  try {
    const index = indexFsdbEntries(listFsdbEntries(db));
    const selected = new Map();
    const records = new Map();
    const include = async (kind, table, key) => {
      const descriptor = requireFsdbEntry(index, kind, table, String(key));
      const mapped = mapFsdbEntryToPwaIdentity(descriptor);
      const identity = pwaIdentityKey(mapped);
      let selectedEntry = selected.get(identity);
      if (selectedEntry === undefined) {
        selectedEntry = Object.freeze({ ...mapped, bytes: Uint8Array.from(await readFsdbEntry(db, descriptor)) });
        selected.set(identity, selectedEntry);
      }
      return selectedEntry;
    };
    const record = async (table, key) => {
      const identity = `struct\0${table}\0${key}`;
      if (records.has(identity)) return records.get(identity);
      const entry = await include("struct", table, key);
      let value;
      try { value = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(entry.bytes)); }
      catch (cause) { throw new Error(`Invalid PokeMan Map record: struct/${table}/${key}`, { cause }); }
      records.set(identity, value);
      return value;
    };

    const pendingMaps = [initialMapId];
    const reachableMaps = new Set();
    const tilesetIds = new Set();
    while (pendingMaps.length > 0) {
      const mapId = pendingMaps.shift();
      if (reachableMaps.has(mapId)) continue;
      reachableMaps.add(mapId);
      const map = await record("Map", mapId);
      if (!Number.isSafeInteger(map?.tileset_id) || map.tileset_id <= 0) throw new Error(`Invalid Tileset reference from Map ${mapId}`);
      tilesetIds.add(map.tileset_id);
      const transfer = await record("MapTransfer", mapId);
      for (const targetMapId of transferTargets(transfer, mapId)) {
        if (!reachableMaps.has(targetMapId)) pendingMaps.push(targetMapId);
      }
    }

    for (const tilesetId of [...tilesetIds].sort((left, right) => left - right)) {
      const tileset = await record("Tileset", tilesetId);
      if (tileset?.id !== tilesetId || typeof tileset.tileset_name !== "string" || !Array.isArray(tileset.autotile_names)) {
        throw new Error(`Invalid Tileset dependency: ${tilesetId}`);
      }
      await include("resource", "Graphics", `Tilesets/${tileset.tileset_name}`);
      for (const name of tileset.autotile_names) {
        if (name !== null) {
          if (typeof name !== "string" || name.length === 0) throw new Error(`Invalid Autotile dependency in Tileset ${tilesetId}`);
          await include("resource", "Graphics", `Autotiles/${name}`);
        }
      }
    }

    await include("resource", "Graphics", `Characters/${characterName}`);
    const npcIds = new Set();
    for (const mapId of reachableMaps) {
      for (const placement of MAP_ONLY_NPC_PLACEMENTS[mapId] ?? []) npcIds.add(placement.npcId);
    }
    for (const npcId of [...npcIds].sort(codePointCompare)) {
      const npc = await record("NPC", npcId);
      if (npc?.sprite?.namespace !== "resource.Graphics" || typeof npc.sprite.key !== "string") {
        throw new Error(`Invalid NPC sprite dependency: ${npcId}`);
      }
      await include("resource", "Graphics", npc.sprite.key);
    }

    for (const ref of [...(presentation.styles ?? []), ...(presentation.scripts ?? [])]) {
      if (ref?.namespace !== "Presentation" || typeof ref.key !== "string") throw new Error("Invalid PokeMan Presentation dependency");
      await include("resource", ref.namespace, ref.key);
    }

    const content = [...selected.values()].sort((left, right) =>
      codePointCompare(left.kind, right.kind)
      || codePointCompare(left.namespace, right.namespace)
      || codePointCompare(left.key, right.key));
    assertUniquePwaContent(content);
    return Object.freeze(content);
  } finally {
    await db.close();
  }
}

export async function createPokeManPwaFixture(options = {}) {
  const root = options.exampleRoot ?? exampleRoot;
  const executablePaths = options.executablePaths;
  if (executablePaths === null || typeof executablePaths !== "object") throw new TypeError("executablePaths are required");
  const specifications = Object.freeze([
    Object.freeze({ logicalModule: "subsystems/base.mjs", path: executablePaths.base }),
    Object.freeze({ logicalModule: "subsystems/map.mjs", path: executablePaths.map }),
    Object.freeze({ logicalModule: "subsystems/dialogue.mjs", path: executablePaths.dialogue }),
  ]);
  for (const specification of specifications) {
    if (typeof specification.path !== "string" || specification.path.length === 0) throw new TypeError(`Executable path is required for ${specification.logicalModule}`);
  }
  const [gameEntryText, launchManifestText, presentationText, executableSources, content] = await Promise.all([
    readFile(join(root, "game.json"), "utf8"),
    readFile(join(root, "launch.pwa.json"), "utf8"),
    readFile(join(root, "presentation.json"), "utf8"),
    Promise.all(specifications.map(async (specification) => Object.freeze({
      logicalModule: specification.logicalModule,
      mime: "text/javascript",
      source: await readFile(specification.path, "utf8"),
    }))),
    preparePokeManPwaContent(options),
  ]);
  const executables = Object.freeze(executableSources.map((executable) => Object.freeze({
    ...executable,
    contentVersion: `sha256:${createHash("sha256").update(executable.source).digest("hex")}`,
  })));
  return Object.freeze({
    gameEntryText,
    launchManifestText,
    presentation: JSON.parse(presentationText),
    executables,
    content: Object.freeze(content.map((entry) => Object.freeze({
      kind: entry.kind,
      namespace: entry.namespace,
      key: entry.key,
      mime: entry.mime,
      encoding: "base64",
      body: Buffer.from(entry.bytes).toString("base64"),
    }))),
  });
}
