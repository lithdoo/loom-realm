import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const read = (relative) => readFile(new URL(relative, import.meta.url), "utf8");

test("Desktop product wires viewport and trusted Presentation Events while Main selects Data Profile v2", async () => {
  const entry = await read("../src/renderer-entry.ts");
  assert.match(entry, /createDesktopRendererViewportSource\(window\)/);
  assert.match(entry, /createRendererControlHolder\([\s\S]*dataBinding,[\s\S]*viewportSource,[\s\S]*createRendererPresentationEventBinding\(presentationEventCarrier\)/);
  assert.doesNotMatch(entry, /inputSource|createDesktopRendererInputSource/);
  assert.match(entry, /presentationEventsEndpoint/);
  assert.doesNotMatch(entry, /viewport\.state/);

  const adapter = await read("../src/renderer-viewport-source.ts");
  assert.match(adapter, /@loomrealm\/renderer\/browser-window/);
  assert.match(adapter, /createBrowserRendererViewportSource\(target\)/);
  assert.doesNotMatch(adapter, /innerWidth|innerHeight|visibilitychange|devicePixelRatio/);

  const source = await readFile(new URL("../../../packages/renderer/src/browser-viewport-source.ts", import.meta.url), "utf8");
  assert.match(source, /innerWidth/);
  assert.match(source, /innerHeight/);
  assert.match(source, /visibilitychange/);
  assert.doesNotMatch(source, /devicePixelRatio/);

  const main = await readFile(new URL("../../../packages/main/src/internal/main-session.ts", import.meta.url), "utf8");
  assert.match(main, /RENDERER_DATA_PROFILE_V2 = "loomrealm\.renderer-data\/2"/);
  assert.doesNotMatch(main, /viewport\.state|innerWidth|innerHeight|scope\.viewport/);
  assert.equal(main.includes("renderer-data/1"), false);
});
