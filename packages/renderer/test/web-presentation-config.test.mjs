import assert from "node:assert/strict";
import test from "node:test";
import {
  prepareWebPresentationV1,
  validateWebPresentationConfigV1,
} from "../dist/internal/web-presentation-config.js";

const version = `sha256:${"a".repeat(64)}`;
const valid = {
  formatVersion: 1,
  scripts: [{ namespace: "presentation", key: "scripts/main.js" }],
  styles: [{ namespace: "presentation", key: "styles/main.css" }],
};

test("Web Presentation Config v1 accepts only its closed frozen shape", () => {
  assert.deepEqual(validateWebPresentationConfigV1(valid), valid);
  for (const candidate of [
    null,
    {},
    { ...valid, formatVersion: 2 },
    { ...valid, extra: true },
    { ...valid, scripts: [{ namespace: "presentation", key: "a.js", extra: true }] },
    { ...valid, scripts: [{ namespace: "presentation", key: "a.js" }, { namespace: "presentation", key: "a.js" }] },
    { ...valid, styles: [{ namespace: "presentation", key: "a.css" }, { namespace: "presentation", key: "a.css" }] },
  ]) assert.throws(() => validateWebPresentationConfigV1(candidate));
});

test("validation completes before prepared Content resolution begins", async () => {
  let calls = 0;
  await assert.rejects(prepareWebPresentationV1({ ...valid, unknown: true }, async () => {
    calls += 1;
    throw new Error("must not run");
  }));
  assert.equal(calls, 0);
});

test("preparation fixes declaration order, versions and exact MIME essence", async () => {
  const config = {
    formatVersion: 1,
    scripts: [
      { namespace: "presentation", key: "scripts/first.js" },
      { namespace: "presentation", key: "scripts/second.js" },
    ],
    styles: [
      { namespace: "presentation", key: "styles/first.css" },
      { namespace: "presentation", key: "styles/second.css" },
    ],
  };
  const prepared = await prepareWebPresentationV1(config, async (ref) => ({
    contentVersion: version,
    mime: ref.key.endsWith(".js") ? "text/javascript; charset=utf-8" : "text/css; charset=utf-8",
    browserSource: `private:${ref.key}`,
  }));
  assert.deepEqual(prepared.scripts.map(({ key }) => key), ["scripts/first.js", "scripts/second.js"]);
  assert.deepEqual(prepared.styles.map(({ key }) => key), ["styles/first.css", "styles/second.css"]);

  await assert.rejects(prepareWebPresentationV1(valid, async (ref) => ({
    contentVersion: version,
    mime: ref.key.endsWith(".js") ? "application/javascript" : "text/css",
    browserSource: "private:value",
  })));
  await assert.rejects(prepareWebPresentationV1(valid, async (ref) => ({
    contentVersion: version,
    mime: ref.key.endsWith(".js") ? "text/javascript" : "text/plain",
    browserSource: "private:value",
  })));
  await assert.rejects(prepareWebPresentationV1(valid, async (ref) => ({
    contentVersion: version,
    mime: ref.key.endsWith(".js") ? "text/javascript;" : "text/css",
    browserSource: "private:value",
  })));
});
