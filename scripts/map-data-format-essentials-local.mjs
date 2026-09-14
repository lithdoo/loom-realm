import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { openFsdb, listFsdbEntries, openFsdbObject } from "@loomrealm/fsdb";
import { run as importEssentials } from "../tools/fixtures/essentials-v21.1/import.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const semanticsUrl = pathToFileURL(join(repoRoot, "game-libs/map/dist/semantics.js")).href;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

export const PRODUCTION_BASELINE = Object.freeze({
  mapCount: 69,
  referencedTilesetIds: Object.freeze([1, 2, 3, 4, 5, 6, 7, 10, 12, 14, 15, 20, 22]),
  autotileMapIds: Object.freeze([2, 5, 7, 21, 23, 28, 31, 35, 39, 40, 41, 44, 45, 52, 68, 69, 70, 71, 72, 73]),
  tileCounts: Object.freeze({ empty: 103470, reserved: 0, autotile: 6160, regular: 61739 }),
  tileUsedAutotileCount: 12,
  runtimeLoadedAutotileCount: 15,
  regularTilesetResourceCount: 12,
});

function parseCli(argv) {
  let source;
  let seen = false;
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index];
    if (name !== "--source") throw new Error(`Unknown argument: ${name}`);
    if (seen) throw new Error("Duplicate argument: --source");
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error("Missing value for --source");
    seen = true;
    source = value;
    index += 1;
  }
  if (!seen) throw new Error("Missing --source");
  return source;
}

async function readLease(db, identity, signal) {
  const lease = await openFsdbObject(db, identity, signal);
  if (lease === null) return null;
  try {
    const chunks = [];
    for await (const chunk of lease.stream) chunks.push(chunk);
    return Buffer.concat(chunks);
  } finally {
    await lease.close();
  }
}

function label(identity) {
  return `${identity.kind}/${identity.table}/${identity.key}`;
}

function pngSize(bytes, identityLabel) {
  if (bytes.length < 24) throw new Error(`illegal PNG header ${identityLabel}`);
  if (!bytes.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error(`illegal PNG header ${identityLabel}`);
  if (bytes.toString("latin1", 12, 16) !== "IHDR") throw new Error(`illegal PNG header ${identityLabel}`);
  return Object.freeze({
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
  });
}

function classifyAutotile(width, height) {
  if (height === 128 && width >= 96 && width % 96 === 0) {
    return Object.freeze({ layout: "block", frameWidth: 96, frameCount: width / 96 });
  }
  if (height === 32 && width >= 32 && width % 32 === 0) {
    return Object.freeze({ layout: "cell", frameWidth: 32, frameCount: width / 32 });
  }
  return Object.freeze({ layout: "unsupported", frameWidth: null, frameCount: null });
}

function sameNumbers(actual, expected) {
  if (actual.length !== expected.length) return false;
  return actual.every((value, index) => value === expected[index]);
}

function lookupGraphics(byKey, key, errors) {
  const matches = byKey.get(key) ?? [];
  if (matches.length === 0) {
    errors.push(`missing resource/Graphics/${key}`);
    return null;
  }
  if (matches.length > 1) {
    errors.push(`duplicate resource identity resource/Graphics/${key}`);
    return null;
  }
  return matches[0];
}

export async function auditFsdbRoot(root, baseline) {
  const { validateMapRecord, validateTilesetRecord, assertProjectable } = await import(semanticsUrl);
  const errors = [];
  const informational = [];
  const db = await openFsdb({ root });
  const signal = new AbortController().signal;
  try {
    const entries = listFsdbEntries(db);
    const maps = entries.filter((entry) => entry.identity.kind === "struct" && entry.identity.table === "Map")
      .sort((left, right) => Number(left.identity.key) - Number(right.identity.key) || left.identity.key.localeCompare(right.identity.key));
    const tilesets = new Map();
    for (const entry of entries.filter((item) => item.identity.kind === "struct" && item.identity.table === "Tileset")) {
      tilesets.set(entry.identity.key, entry.identity);
    }
    const graphics = new Map();
    for (const entry of entries.filter((item) => item.identity.kind === "resource" && item.identity.table === "Graphics")) {
      const list = graphics.get(entry.identity.key) ?? [];
      list.push(entry.identity);
      graphics.set(entry.identity.key, list);
    }

    const tileCounts = { empty: 0, reserved: 0, autotile: 0, regular: 0 };
    const referencedIds = new Set();
    const autotileMapIds = [];
    const tileUsedNames = new Set();
    const runtimeNames = new Set();
    const regularNames = new Set();
    const maxSourceIndex = new Map();
    const validatedTilesets = new Map();

    for (const entry of maps) {
      let map;
      try {
        map = validateMapRecord(JSON.parse(await readLease(db, entry.identity, signal)));
      } catch (error) {
        errors.push(`invalid ${label(entry.identity)}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      referencedIds.add(map.tileset_id);
      const tilesetKey = String(map.tileset_id);
      const tilesetIdentity = tilesets.get(tilesetKey);
      if (!tilesetIdentity) {
        errors.push(`missing struct/Tileset/${tilesetKey} referenced by ${label(entry.identity)}`);
        continue;
      }
      let tileset = validatedTilesets.get(tilesetKey);
      if (!tileset) {
        try {
          tileset = validateTilesetRecord(JSON.parse(await readLease(db, tilesetIdentity, signal)), map.tileset_id);
          if (tilesetIdentity.key !== String(tileset.id)) {
            throw new TypeError(`Tileset key ${tilesetIdentity.key} does not equal id ${tileset.id}`);
          }
          validatedTilesets.set(tilesetKey, tileset);
        } catch (error) {
          errors.push(`invalid ${label(tilesetIdentity)}: ${error instanceof Error ? error.message : String(error)}`);
          continue;
        }
      }
      try {
        assertProjectable(map, tileset);
      } catch (error) {
        errors.push(`unprojectable ${label(entry.identity)}: ${error instanceof Error ? error.message : String(error)}`);
        continue;
      }
      let hasAutotile = false;
      for (const tileId of map.data.values) {
        if (tileId === 0) {
          tileCounts.empty += 1;
          continue;
        }
        if (tileId >= 1 && tileId <= 47) {
          tileCounts.reserved += 1;
          continue;
        }
        if (tileId >= 48 && tileId <= 383) {
          tileCounts.autotile += 1;
          hasAutotile = true;
          const slot = Math.floor((tileId - 48) / 48);
          const name = tileset.autotile_names[slot];
          if (typeof name === "string") tileUsedNames.add(name);
          continue;
        }
        tileCounts.regular += 1;
        const sourceIndex = tileId - 384;
        const current = maxSourceIndex.get(tileset.tileset_name) ?? -1;
        if (sourceIndex > current) maxSourceIndex.set(tileset.tileset_name, sourceIndex);
      }
      if (hasAutotile) autotileMapIds.push(Number(entry.identity.key));
      for (const name of tileset.autotile_names) if (name !== null) runtimeNames.add(name);
      regularNames.add(tileset.tileset_name);
    }

    const runtimeAutotiles = [];
    for (const name of [...runtimeNames].sort()) {
      const identity = lookupGraphics(graphics, `Autotiles/${name}`, errors);
      if (!identity) continue;
      try {
        const size = pngSize(await readLease(db, identity, signal), label(identity));
        const classified = classifyAutotile(size.width, size.height);
        if (classified.layout === "unsupported" || classified.frameCount < 1) {
          errors.push(`unsupported autotile geometry ${label(identity)} ${size.width}x${size.height}`);
          continue;
        }
        runtimeAutotiles.push(Object.freeze({
          name,
          identity: label(identity),
          width: size.width,
          height: size.height,
          layout: classified.layout,
          frameCount: classified.frameCount,
        }));
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    const regularTilesets = [];
    for (const name of [...regularNames].sort()) {
      const identity = lookupGraphics(graphics, `Tilesets/${name}`, errors);
      if (!identity) continue;
      try {
        const size = pngSize(await readLease(db, identity, signal), label(identity));
        if (size.width !== 256 || size.height <= 0 || size.height % 32 !== 0) {
          errors.push(`illegal regular tileset bitmap ${label(identity)} ${size.width}x${size.height}`);
          continue;
        }
        const capacity = 8 * (size.height / 32);
        const maxIndex = maxSourceIndex.get(name) ?? -1;
        if (maxIndex >= capacity) {
          errors.push(`regular sourceIndex out of capacity ${label(identity)} sourceIndex=${maxIndex} capacity=${capacity}`);
          continue;
        }
        regularTilesets.push(Object.freeze({
          name,
          identity: label(identity),
          width: size.width,
          height: size.height,
          capacity,
          maxSourceIndex: maxIndex,
        }));
      } catch (error) {
        errors.push(error instanceof Error ? error.message : String(error));
      }
    }

    const inventory = { totalTilesets: tilesets.size, autotilePngs: 0, block: 0, cell: 0, unsupported: 0, durationSuffix: 0 };
    for (const [key, identities] of [...graphics.entries()].sort(([left], [right]) => left.localeCompare(right))) {
      if (!key.startsWith("Autotiles/")) continue;
      inventory.autotilePngs += 1;
      const base = key.slice(key.lastIndexOf("/") + 1);
      if (/\[\s*\d+\s*\]\s*$/.test(base)) inventory.durationSuffix += 1;
      const identity = identities[0];
      try {
        const size = pngSize(await readLease(db, identity, signal), label(identity));
        const classified = classifyAutotile(size.width, size.height);
        if (classified.layout === "block") inventory.block += 1;
        else if (classified.layout === "cell") inventory.cell += 1;
        else {
          inventory.unsupported += 1;
          informational.push(`informational unsupported autotile ${label(identity)} ${size.width}x${size.height}`);
        }
      } catch (error) {
        inventory.unsupported += 1;
        informational.push(`informational ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    const referencedTilesetIds = [...referencedIds].sort((left, right) => left - right);
    const summary = Object.freeze({
      mapCount: maps.length,
      referencedTilesetIds,
      totalTilesetCount: tilesets.size,
      autotileMapIds,
      tileCounts: Object.freeze({ ...tileCounts }),
      tileUsedAutotileNames: Object.freeze([...tileUsedNames].sort()),
      runtimeLoadedAutotiles: Object.freeze(runtimeAutotiles),
      regularTilesets: Object.freeze(regularTilesets),
      inventory: Object.freeze(inventory),
      informational: Object.freeze(informational),
    });

    if (summary.mapCount !== baseline.mapCount) errors.push(`baseline mapCount expected ${baseline.mapCount} actual ${summary.mapCount}`);
    if (!sameNumbers(referencedTilesetIds, [...baseline.referencedTilesetIds])) {
      errors.push(`baseline referencedTilesetIds expected ${baseline.referencedTilesetIds.join(",")} actual ${referencedTilesetIds.join(",")}`);
    }
    if (!sameNumbers(autotileMapIds, [...baseline.autotileMapIds])) {
      errors.push(`baseline autotileMapIds expected ${baseline.autotileMapIds.join(",")} actual ${autotileMapIds.join(",")}`);
    }
    for (const key of ["empty", "reserved", "autotile", "regular"]) {
      if (tileCounts[key] !== baseline.tileCounts[key]) {
        errors.push(`baseline tileCounts.${key} expected ${baseline.tileCounts[key]} actual ${tileCounts[key]}`);
      }
    }
    if (tileUsedNames.size !== baseline.tileUsedAutotileCount) {
      errors.push(`baseline tileUsedAutotileCount expected ${baseline.tileUsedAutotileCount} actual ${tileUsedNames.size}`);
    }
    if (runtimeNames.size !== baseline.runtimeLoadedAutotileCount) {
      errors.push(`baseline runtimeLoadedAutotileCount expected ${baseline.runtimeLoadedAutotileCount} actual ${runtimeNames.size}`);
    }
    if (regularNames.size !== baseline.regularTilesetResourceCount) {
      errors.push(`baseline regularTilesetResourceCount expected ${baseline.regularTilesetResourceCount} actual ${regularNames.size}`);
    }

    if (errors.length > 0) {
      const failure = new Error(errors.join("\n"));
      failure.errors = Object.freeze(errors);
      failure.summary = summary;
      throw failure;
    }
    return summary;
  } finally {
    await db.close();
  }
}

async function main(argv) {
  const source = parseCli(argv);
  const resolvedSource = isAbsolute(source) ? source : resolve(process.cwd(), source);
  const temporaryOutput = await mkdtemp(join(tmpdir(), "loomrealm-map-data-format-"));
  try {
    const fsdbRoot = await importEssentials(["--source", resolvedSource, "--output", temporaryOutput]);
    const summary = await auditFsdbRoot(fsdbRoot, PRODUCTION_BASELINE);
    process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  } finally {
    await rm(temporaryOutput, { recursive: true, force: true });
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
