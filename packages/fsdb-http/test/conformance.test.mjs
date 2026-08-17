import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

// Traceability gate: behavioral groups live in fsdb.test.mjs. This list makes adding a
// frozen mandatory case without assigning it to the executable suite a test failure.
const assigned = new Set(`
FDB-001 FDB-002 FDB-003 FDB-004 FDB-005 FDB-006 FDB-007 FDB-008 FDB-009 FDB-010 FDB-011 FDB-012
ROOT-001 ROOT-002 ROOT-003 SAFE-001 SAFE-002 SAFE-003 SAFE-004 SAFE-005 SAFE-006
API-001 API-002 API-003 API-004 API-005 API-006 API-007 API-008 API-009
HTTP-001 HTTP-002 HTTP-003 HTTP-004 HTTP-005 HTTP-006 HTTP-007 HTTP-008 HTTP-009 HTTP-010 HTTP-011 HTTP-012 HTTP-013
STATUS-001 STATUS-002 STATUS-003 STATUS-004 STATUS-005 STATUS-006 STATUS-007
MIME-001 MIME-002 MIME-003 MIME-004 MIME-005 RESP-001 RESP-002 RESP-003
COND-001 COND-002 COND-003 COND-004 COND-005 COND-006 COND-007
CACHE-001 CACHE-002 CACHE-003 CACHE-004 CACHE-005
LIFE-001 LIFE-002 LIFE-003 LIFE-004 LIFE-005 LIFE-006 LIFE-007 LIFE-008 LIFE-009
BOUNDARY-001 BOUNDARY-002 BOUNDARY-003
`.trim().split(/\s+/));

test("CONFORMANCE mandatory cases are assigned to the executable suite", async () => {
  const contract = await readFile(new URL("../CONFORMANCE.md", import.meta.url), "utf8");
  const mandatory = new Set(contract.match(/(?:FDB|ROOT|SAFE|API|HTTP|STATUS|MIME|RESP|COND|CACHE|LIFE|BOUNDARY)-\d{3}/g));
  assert.deepEqual([...assigned].sort(), [...mandatory].sort());
});

test("BOUNDARY-001/002/003: package has no runtime dependency or higher-layer authority", async () => {
  const manifest = JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8"));
  assert.deepEqual(manifest.dependencies ?? {}, {});
  const source = await readFile(new URL("../src/public.ts", import.meta.url), "utf8");
  assert.equal(/express|koa|fastify|hono|installationId|game package/i.test(source), false);
});
