import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { serveFsdb } from "../../../packages/fsdb-http/dist/index.js";
import { accountArchiveEntry, downloadArchive, ImportFailure, parseArguments, resolveMediaFireDownloadLink, run, validateArchivePath } from "./import.mjs";

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

test("archive budgets and MediaFire landing-page resolution fail closed", () => {
  const budget = { entries: 0, uncompressedBytes: 0 };
  accountArchiveEntry(budget, 1024);
  assert.deepEqual(budget, { entries: 1, uncompressedBytes: 1024 });
  assert.throws(
    () => accountArchiveEntry(budget, 33 * 1024 * 1024),
    (error) => error instanceof ImportFailure && error.category === "ARCHIVE_INVALID",
  );

  const landing = "https://www.mediafire.com/file/example/Pokemon_Essentials.zip/file";
  const html = '<a id="downloadButton" href="https://download123.mediafire.com/token/file/Pokemon%2BEssentials.zip?x=1&amp;y=2">Download</a>';
  assert.equal(
    resolveMediaFireDownloadLink(html, landing).href,
    "https://download123.mediafire.com/token/file/Pokemon%2BEssentials.zip?x=1&y=2",
  );
  assert.throws(
    () => resolveMediaFireDownloadLink('<a id="downloadButton" href="https://example.com/file.zip">Download</a>', landing),
    (error) => error instanceof ImportFailure && error.category === "DOWNLOAD_FAILURE",
  );
});

test("automatic acquisition follows landing page and enforces archive identity", async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), "essentials-download-test-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const destination = join(temporary, "fixture.zip");
  const payload = Buffer.from("pinned archive bytes");
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url.href);
    if (calls.length === 1) {
      return new Response(null, { status: 302, headers: { location: "https://www.mediafire.com/file/example/fixture.zip/file" } });
    }
    if (calls.length === 2) {
      return new Response('<a id="downloadButton" href="https://download123.mediafire.com/token/fixture.zip">Download</a>', {
        status: 200,
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    return new Response(payload, {
      status: 200,
      headers: { "content-length": String(payload.length), "content-type": "application/zip" },
    });
  };

  await downloadArchive(destination, {
    fetchImpl,
    initialUrl: "https://www.eeveeexpo.com/essentials/download",
    expectedArchive: { size: payload.length, sha256: createHash("sha256").update(payload).digest("hex") },
  });
  assert.deepEqual(calls, [
    "https://www.eeveeexpo.com/essentials/download",
    "https://www.mediafire.com/file/example/fixture.zip/file",
    "https://download123.mediafire.com/token/fixture.zip",
  ]);
  assert.deepEqual(await readFile(destination), payload);

  await assert.rejects(
    downloadArchive(join(temporary, "wrong.zip"), {
      fetchImpl: async () => new Response(payload, {
        status: 200,
        headers: { "content-length": String(payload.length), "content-type": "application/zip" },
      }),
      initialUrl: "https://www.eeveeexpo.com/essentials/download",
      expectedArchive: { size: payload.length, sha256: "0".repeat(64) },
    }),
    (error) => error instanceof ImportFailure && error.category === "DOWNLOAD_INTEGRITY_FAILURE",
  );
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
  const nfcDirectory = "café";
  const nfcFile = "ré.bin";
  assert.equal(nfcDirectory, nfcDirectory.normalize("NFC"));
  assert.equal(nfcFile, nfcFile.normalize("NFC"));
  assert.equal(await readFile(join(first, "[resource]Graphics", nfcDirectory, nfcFile), "utf8"), "NFC target");
  assert((await readdir(join(first, "[resource]Graphics"))).includes(nfcDirectory));
  assert((await readdir(join(first, "[resource]Graphics", nfcDirectory))).includes(nfcFile));
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
