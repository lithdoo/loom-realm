import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { downloadArchive } from "./lib/acquisition/download.mjs";
import { downloadEeveeExpoArchive, resolveMediaFireDownloadLink } from "./lib/acquisition/eevee-expo.mjs";
import { accountArchiveEntry } from "./lib/acquisition/zip.mjs";
import { parseArguments } from "./lib/cli.mjs";
import { ImportFailure } from "./lib/errors.mjs";
import { cleanupOutput, reserveOutput } from "./lib/fsdb/transaction.mjs";

test("modular CLI preserves the two-option contract", () => {
  assert.deepEqual(parseArguments([], "fixture-cwd"), { source: undefined, output: "fixture-cwd" });
  assert.deepEqual(parseArguments(["--output", "out", "--source", "source"], "fixture-cwd"), { source: "source", output: "out" });
  assert.throws(() => parseArguments(["--output", "a", "--output", "b"]), (error) => error instanceof ImportFailure && error.category === "INVALID_ARGUMENT");
});

test("download module follows bounded redirects and rejects HTML", async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), "essentials-download-module-test-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const archive = join(temporary, "fixture.zip");
  const payload = Buffer.from("ZIP payload");
  let requests = 0;
  await downloadArchive("https://example.test/start", archive, async () => {
    requests += 1;
    if (requests === 1) return new Response(null, { status: 302, headers: { location: "https://example.test/archive.zip" } });
    return new Response(payload, { status: 200, headers: { "content-type": "application/zip" } });
  });
  assert.equal(requests, 2);
  assert.deepEqual(await readFile(archive), payload);

  await assert.rejects(
    downloadArchive("https://example.test/landing", join(temporary, "html.zip"), async () => new Response("landing", {
      status: 200,
      headers: { "content-type": "text/html" },
    })),
    (error) => error instanceof ImportFailure && error.category === "DOWNLOAD_FAILURE",
  );
});

test("Eevee Expo resolver follows MediaFire landing and pins the ZIP", async (t) => {
  const temporary = await mkdtemp(join(tmpdir(), "essentials-eevee-module-test-"));
  t.after(() => rm(temporary, { recursive: true, force: true }));
  const destination = join(temporary, "fixture.zip");
  const payload = Buffer.from("pinned ZIP bytes");
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url.href);
    if (calls.length === 1) return new Response(null, { status: 302, headers: { location: "https://www.mediafire.com/file/key/fixture.zip/file" } });
    if (calls.length === 2) return new Response('<a id="downloadButton" href="https://download123.mediafire.com/token/fixture.zip">Download</a>', {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
    return new Response(payload, {
      status: 200,
      headers: { "content-length": String(payload.length), "content-type": "application/zip" },
    });
  };
  await downloadEeveeExpoArchive(destination, {
    fetchImpl,
    expectedIdentity: { size: payload.length, sha256: createHash("sha256").update(payload).digest("hex") },
  });
  assert.deepEqual(await readFile(destination), payload);
  assert.equal(calls.length, 3);
  assert.equal(resolveMediaFireDownloadLink(
    '<a id="downloadButton" href="https://download999.mediafire.com/file/test.zip?x=1&amp;y=2">Download</a>',
    "https://www.mediafire.com/file/key/test.zip/file",
  ).href, "https://download999.mediafire.com/file/test.zip?x=1&y=2");

  let wrongCalls = 0;
  const wrongFetch = async () => {
    wrongCalls += 1;
    if (wrongCalls === 1) return new Response(null, { status: 302, headers: { location: "https://www.mediafire.com/file/key/fixture.zip/file" } });
    if (wrongCalls === 2) return new Response('<a id="downloadButton" href="https://download123.mediafire.com/token/fixture.zip">Download</a>', {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
    return new Response(payload, {
      status: 200,
      headers: { "content-length": String(payload.length), "content-type": "application/zip" },
    });
  };
  await assert.rejects(
    downloadEeveeExpoArchive(join(temporary, "wrong.zip"), {
      fetchImpl: wrongFetch,
      expectedIdentity: { size: payload.length, sha256: "0".repeat(64) },
    }),
    (error) => error instanceof ImportFailure && error.category === "DOWNLOAD_INTEGRITY_FAILURE",
  );
});

test("ZIP extraction accounting rejects resource exhaustion", () => {
  const budget = { entries: 0, uncompressedBytes: 0 };
  accountArchiveEntry(budget, 1024);
  assert.deepEqual(budget, { entries: 1, uncompressedBytes: 1024 });
  assert.throws(
    () => accountArchiveEntry(budget, 33 * 1024 * 1024),
    (error) => error instanceof ImportFailure && error.category === "ARCHIVE_INVALID",
  );
});

test("transaction cleanup removes only importer-owned staging", async (t) => {
  const outputParent = await mkdtemp(join(tmpdir(), "essentials-transaction-test-"));
  t.after(() => rm(outputParent, { recursive: true, force: true }));
  const userFile = join(outputParent, "keep.txt");
  await writeFile(userFile, "keep");
  const transaction = await reserveOutput(outputParent);
  await writeFile(join(transaction.stagingPath, "partial.txt"), "partial");

  await cleanupOutput(transaction, outputParent);

  assert.deepEqual(await readdir(outputParent), ["keep.txt"]);
  assert.equal(await readFile(userFile, "utf8"), "keep");
});
