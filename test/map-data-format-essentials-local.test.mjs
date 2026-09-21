import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { auditFsdbRoot } from "../scripts/map-data-format-essentials-local.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const script = join(repoRoot, "scripts", "map-data-format-essentials-local.mjs");

function pngHeader(width, height) {
  const bytes = Buffer.alloc(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.writeUInt32BE(13, 8);
  bytes.write("IHDR", 12);
  bytes.writeUInt32BE(width, 16);
  bytes.writeUInt32BE(height, 20);
  return bytes;
}

function table1d(size, fill = 0) {
  return { dimensions: 1, xSize: size, ySize: 1, zSize: 1, values: Array(size).fill(fill) };
}

function tilesetValue({
  id = 1,
  tileset_name = "Outside",
  autotile_names = [null, null, null, null, null, null, null],
  size = 385,
} = {}) {
  return {
    id,
    tileset_name,
    autotile_names,
    passages: table1d(size),
    priorities: table1d(size),
    terrain_tags: table1d(size),
  };
}

function mapValue({ tileset_id = 1, width = 1, height = 1, values = [384, 0, 0] } = {}) {
  return {
    tileset_id,
    width,
    height,
    data: { dimensions: 3, xSize: width, ySize: height, zSize: 3, values },
  };
}

const validBaseline = Object.freeze({
  mapCount: 1,
  referencedTilesetIds: Object.freeze([1]),
  autotileMapIds: Object.freeze([1]),
  tileCounts: Object.freeze({ empty: 2, reserved: 0, autotile: 1, regular: 0 }),
  tileUsedAutotileCount: 1,
  runtimeLoadedAutotileCount: 1,
  regularTilesetResourceCount: 1,
});

async function writeFsdb(configure) {
  const parent = await mkdtemp(join(tmpdir(), "loomrealm-map-data-format-test-"));
  const root = join(parent, "[FSDB]audit");
  const mapDir = join(root, "[struct]Map");
  const tilesetDir = join(root, "[struct]Tileset");
  const graphicsDir = join(root, "[resource]Graphics");
  await mkdir(join(graphicsDir, "Autotiles"), { recursive: true });
  await mkdir(join(graphicsDir, "Tilesets"), { recursive: true });
  await mkdir(mapDir, { recursive: true });
  await mkdir(tilesetDir, { recursive: true });
  await writeFile(join(mapDir, ".info.meta"), '{"type":"object"}');
  await writeFile(join(tilesetDir, ".info.meta"), '{"type":"object"}');
  await writeFile(join(graphicsDir, ".desc.meta"), "graphics\n");
  const files = {
    async map(key, value) { await writeFile(join(mapDir, `${key}.json`), JSON.stringify(value)); },
    async tileset(key, value) { await writeFile(join(tilesetDir, `${key}.json`), JSON.stringify(value)); },
    async autotile(name, bytes) { await writeFile(join(graphicsDir, "Autotiles", `${name}.png`), bytes); },
    async tilesetPng(name, bytes) { await writeFile(join(graphicsDir, "Tilesets", `${name}.png`), bytes); },
  };
  await configure(files);
  return {
    root,
    async cleanup() { await rm(parent, { recursive: true, force: true }); },
  };
}

async function validTree(files, extra = async () => {}) {
  await files.map("1", mapValue({ values: [48, 0, 0] }));
  await files.tileset("1", tilesetValue({ autotile_names: ["Flowers1", null, null, null, null, null, null] }));
  await files.autotile("Flowers1", pngHeader(32, 32));
  await files.tilesetPng("Outside", pngHeader(256, 32));
  await extra(files);
}

function runCli(args) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], { cwd: repoRoot });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => { stdout += chunk; });
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    child.on("close", (code) => resolve({ code, stdout, stderr }));
  });
}

test("valid baseline PASS", async () => {
  const fsdb = await writeFsdb((files) => validTree(files));
  try {
    const summary = await auditFsdbRoot(fsdb.root, validBaseline);
    assert.equal(summary.mapCount, 1);
    assert.deepEqual(summary.referencedTilesetIds, [1]);
    assert.deepEqual(summary.autotileMapIds, [1]);
    assert.equal(summary.runtimeLoadedAutotiles.length, 1);
    assert.equal(summary.runtimeLoadedAutotiles[0].layout, "cell");
  } finally {
    await fsdb.cleanup();
  }
});

test("missing referenced Tileset names the identity", async () => {
  const fsdb = await writeFsdb(async (files) => {
    await files.map("1", mapValue({ tileset_id: 2, values: [384, 0, 0] }));
    await files.tileset("1", tilesetValue());
    await files.tilesetPng("Outside", pngHeader(256, 32));
  });
  try {
    await assert.rejects(() => auditFsdbRoot(fsdb.root, validBaseline), (error) => {
      assert.match(error.message, /missing struct\/Tileset\/2/);
      return true;
    });
  } finally {
    await fsdb.cleanup();
  }
});

test("missing Runtime-loaded unused autotile names the resource identity", async () => {
  const fsdb = await writeFsdb(async (files) => {
    await files.map("1", mapValue({ values: [48, 0, 0] }));
    await files.tileset("1", tilesetValue({ autotile_names: ["Flowers1", null, null, null, "Fountain1", null, null] }));
    await files.autotile("Flowers1", pngHeader(32, 32));
    await files.tilesetPng("Outside", pngHeader(256, 32));
  });
  try {
    await assert.rejects(() => auditFsdbRoot(fsdb.root, {
      ...validBaseline,
      runtimeLoadedAutotileCount: 2,
    }), (error) => {
      assert.match(error.message, /missing resource\/Graphics\/Autotiles\/Fountain1/);
      return true;
    });
  } finally {
    await fsdb.cleanup();
  }
});

test("missing regular tileset PNG names the resource identity", async () => {
  const fsdb = await writeFsdb(async (files) => {
    await files.map("1", mapValue({ values: [48, 0, 0] }));
    await files.tileset("1", tilesetValue({ autotile_names: ["Flowers1", null, null, null, null, null, null] }));
    await files.autotile("Flowers1", pngHeader(32, 32));
  });
  try {
    await assert.rejects(() => auditFsdbRoot(fsdb.root, validBaseline), (error) => {
      assert.match(error.message, /missing resource\/Graphics\/Tilesets\/Outside/);
      return true;
    });
  } finally {
    await fsdb.cleanup();
  }
});

test("truncated PNG header names the resource identity", async () => {
  const fsdb = await writeFsdb(async (files) => {
    await files.map("1", mapValue({ values: [48, 0, 0] }));
    await files.tileset("1", tilesetValue({ autotile_names: ["Flowers1", null, null, null, null, null, null] }));
    await files.autotile("Flowers1", Buffer.from([0x89, 0x50, 0x4e, 0x47]));
    await files.tilesetPng("Outside", pngHeader(256, 32));
  });
  try {
    await assert.rejects(() => auditFsdbRoot(fsdb.root, validBaseline), (error) => {
      assert.match(error.message, /illegal PNG header resource\/Graphics\/Autotiles\/Flowers1/);
      return true;
    });
  } finally {
    await fsdb.cleanup();
  }
});

test("unsupported autotile geometry names the resource identity", async () => {
  const fsdb = await writeFsdb(async (files) => {
    await files.map("1", mapValue({ values: [48, 0, 0] }));
    await files.tileset("1", tilesetValue({ autotile_names: ["Flowers1", null, null, null, null, null, null] }));
    await files.autotile("Flowers1", pngHeader(64, 64));
    await files.tilesetPng("Outside", pngHeader(256, 32));
  });
  try {
    await assert.rejects(() => auditFsdbRoot(fsdb.root, validBaseline), (error) => {
      assert.match(error.message, /unsupported autotile geometry resource\/Graphics\/Autotiles\/Flowers1 64x64/);
      return true;
    });
  } finally {
    await fsdb.cleanup();
  }
});

test("illegal regular tileset width names the resource identity", async () => {
  const fsdb = await writeFsdb(async (files) => {
    await files.map("1", mapValue({ values: [48, 0, 0] }));
    await files.tileset("1", tilesetValue({ autotile_names: ["Flowers1", null, null, null, null, null, null] }));
    await files.autotile("Flowers1", pngHeader(32, 32));
    await files.tilesetPng("Outside", pngHeader(128, 32));
  });
  try {
    await assert.rejects(() => auditFsdbRoot(fsdb.root, validBaseline), (error) => {
      assert.match(error.message, /illegal regular tileset bitmap resource\/Graphics\/Tilesets\/Outside 128x32/);
      return true;
    });
  } finally {
    await fsdb.cleanup();
  }
});

test("regular sourceIndex capacity names the resource identity", async () => {
  const fsdb = await writeFsdb(async (files) => {
    await files.map("1", mapValue({ values: [392, 0, 0] }));
    await files.tileset("1", tilesetValue({ size: 400 }));
    await files.tilesetPng("Outside", pngHeader(256, 32));
  });
  try {
    await assert.rejects(() => auditFsdbRoot(fsdb.root, {
      mapCount: 1,
      referencedTilesetIds: [1],
      autotileMapIds: [],
      tileCounts: { empty: 2, reserved: 0, autotile: 0, regular: 1 },
      tileUsedAutotileCount: 0,
      runtimeLoadedAutotileCount: 0,
      regularTilesetResourceCount: 1,
    }), (error) => {
      assert.match(error.message, /regular sourceIndex out of capacity resource\/Graphics\/Tilesets\/Outside sourceIndex=8 capacity=8/);
      return true;
    });
  } finally {
    await fsdb.cleanup();
  }
});

test("tileId 1..47 names the map identity", async () => {
  const fsdb = await writeFsdb(async (files) => {
    await files.map("1", mapValue({ values: [1, 0, 0] }));
    await files.tileset("1", tilesetValue());
    await files.tilesetPng("Outside", pngHeader(256, 32));
  });
  try {
    await assert.rejects(() => auditFsdbRoot(fsdb.root, validBaseline), (error) => {
      assert.match(error.message, /unprojectable struct\/Map\/1/);
      assert.match(error.message, /Unsupported map tile id 1/);
      return true;
    });
  } finally {
    await fsdb.cleanup();
  }
});

test("informational-only material changes are reported without failing", async () => {
  const fsdb = await writeFsdb((files) => validTree(files, async (inner) => {
    await inner.tileset("99", tilesetValue({ id: 99, tileset_name: "Cave" }));
    await inner.autotile("Ornament", pngHeader(96, 128));
  }));
  try {
    const summary = await auditFsdbRoot(fsdb.root, validBaseline);
    assert.equal(summary.totalTilesetCount, 2);
    assert.equal(summary.inventory.autotilePngs, 2);
    assert.equal(summary.inventory.block, 1);
    assert.equal(summary.inventory.cell, 1);
  } finally {
    await fsdb.cleanup();
  }
});

test("CLI unknown, duplicate, and missing arguments fail closed", async () => {
  const unknown = await runCli(["--help"]);
  assert.notEqual(unknown.code, 0);
  assert.match(unknown.stderr, /Unknown argument: --help/);

  const duplicate = await runCli(["--source", "a", "--source", "b"]);
  assert.notEqual(duplicate.code, 0);
  assert.match(duplicate.stderr, /Duplicate argument: --source/);

  const missingValue = await runCli(["--source"]);
  assert.notEqual(missingValue.code, 0);
  assert.match(missingValue.stderr, /Missing value for --source/);

  const missing = await runCli([]);
  assert.notEqual(missing.code, 0);
  assert.match(missing.stderr, /Missing --source/);
});
