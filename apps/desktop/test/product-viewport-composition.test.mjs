import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");

test("Desktop product wires one document-layout viewport source and Main only selects /1", async () => {
  const entry = await read("../src/renderer-entry.ts");
  assert.match(entry, /createDesktopRendererViewportSource\(window\)/);
  assert.match(entry, /createRendererControlHolder\(dataBinding, inputSource, viewportSource\)/);
  assert.doesNotMatch(entry, /viewport\.state/);

  const source = await read("../src/renderer-viewport-source.ts");
  assert.match(source, /innerWidth/);
  assert.match(source, /innerHeight/);
  assert.match(source, /visibilitychange/);
  assert.doesNotMatch(source, /devicePixelRatio/);

  const main = await readFile(new URL("../../../packages/main/src/internal/main-session.ts", import.meta.url), "utf8");
  assert.match(main, /RENDERER_DATA_PROFILE_V1 = "loomrealm\.renderer-data\/1"/);
  assert.doesNotMatch(main, /viewport\.state|innerWidth|innerHeight|scope\.viewport/);
  assert.equal(main.includes("renderer-data/2"), false);
});
