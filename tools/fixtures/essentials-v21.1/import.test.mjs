import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { serveFsdb } from "../../../packages/fsdb-http/dist/index.js";
import { ImportFailure, parseArguments, run, validateArchivePath } from "./import.mjs";

const TABLES = ["Graphics", "Audio", "Fonts", "Data", "PBS"];

async function makeSource(parent, invalidExtension = false) {
  const root = join(parent, "Pokemon Essentials v21.1");
  await mkdir(root);
  await writeFile(join(root, "mkxp.json"), '{"windowTitle":"Pokémon Essentials v21.1"}\n');
  for (const table of TABLES) {
    await mkdir(join(root, table));
    const name = invalidExtension && table === "Graphics" ? "sample.PNG" : "sample.bin";
    const directory = table === "Graphics" ? join(root, table, "nested") : join(root, table);
    if (table === "Graphics") await mkdir(directory);
    await writeFile(join(directory, name), Buffer.from(`${table}\0fixture`));
  }
  await mkdir(join(root, "Plugins"));
  await writeFile(join(root, "Plugins", "sample.rb"), "plugin bytes");
  const nfdDirectory = `caf${"é".normalize("NFD")}`;
  const nfdFile = `r${"é".normalize("NFD")}.bin`;
  await mkdir(join(root, "Graphics", nfdDirectory));
  await writeFile(join(root, "Graphics", nfdDirectory, nfdFile), "NFC target");
  return root;
}

test("CLI exposes only --source and --output", () => {
  assert.deepEqual(parseArguments(["--source", "source", "--output", "output"]), { source: "source", output: "output" });
  assert.throws(() => parseArguments(["--strict"]), (error) => error instanceof ImportFailure && error.category === "INVALID_ARGUMENT");
  assert.throws(() => parseArguments(["--source"]), (error) => error instanceof ImportFailure && error.category === "INVALID_ARGUMENT");
});

test("archive paths fail closed", () => {
  const root = join(tmpdir(), "archive-root");
  assert.equal(validateArchivePath("top/Graphics/a.png", root), join(root, "top", "Graphics", "a.png"));
  for (const path of ["../escape", "/absolute", "C:/absolute", "top\\escape", "top/./file"]) {
    assert.throws(() => validateArchivePath(path, root), (error) => error instanceof ImportFailure && error.category === "ARCHIVE_PATH_ESCAPE");
  }
});

test("local directory import is byte-preserving and never overwrites", async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), "essentials-import-test-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const source = await makeSource(temporary);
  const output = join(temporary, "output");

  const first = await run(["--source", source, "--output", output]);
  const second = await run(["--source", source, "--output", output]);
  assert.equal(first, join(output, "[FSDB]Essentials v21.1"));
  assert.equal(second, join(output, "[FSDB]Essentials v21.1 2"));
  assert.deepEqual(await readFile(join(first, "[resource]Graphics", "nested", "sample.bin")), Buffer.from("Graphics\0fixture"));
  assert.deepEqual(await readFile(join(second, "[resource]Graphics", "nested", "sample.bin")), Buffer.from("Graphics\0fixture"));
  assert.equal(await readFile(join(first, "[resource]Graphics", "café", "ré.bin"), "utf8"), "NFC target");
  assert.equal(await readFile(join(first, "[resource]Plugins", "sample.rb"), "utf8"), "plugin bytes");
  const provenance = JSON.parse(await readFile(join(first, "[struct]测试信息", "来源.json"), "utf8"));
  assert.equal(provenance.acquisition, "local-directory");

  const service = await serveFsdb({ root: first, host: "127.0.0.1", port: 0 });
  t.after(() => service.close());
  const endpoint = new URL("/fsdb/v1/resource/Graphics/nested/sample", service.origin);
  const get = await fetch(endpoint);
  assert.equal(get.status, 200);
  assert.equal(Number(get.headers.get("content-length")), 16);
  assert.deepEqual(Buffer.from(await get.arrayBuffer()), Buffer.from("Graphics\0fixture"));
  const head = await fetch(endpoint, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal((await head.arrayBuffer()).byteLength, 0);
  assert.equal((await fetch(endpoint, { headers: { "If-None-Match": get.headers.get("etag") } })).status, 304);
});

test("strict preflight leaves no final or staging output", async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), "essentials-import-test-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const source = await makeSource(temporary, true);
  const output = join(temporary, "output");

  await assert.rejects(
    run(["--source", source, "--output", output]),
    (error) => error instanceof ImportFailure && error.category === "INVALID_EXTENSION",
  );
  assert.deepEqual(await readdir(output), []);
});
