import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Web Presentation v2 declaration exposes orthogonal custom event options", async () => {
  const declaration = await readFile(new URL("../../packages/renderer/dist/internal/web-projector.d.ts", import.meta.url), "utf8");
  assert.match(declaration, /interface CustomEventOptions/);
  assert.match(declaration, /readonly broadcast\?: boolean/);
  assert.match(declaration, /readonly channel\?: string/);
  assert.match(declaration, /emitCustomEvent\(name: string, data\?: Readonly<Record<string, JsonValue>>, options\?: CustomEventOptions\): void/);
});

test("routing architecture forbids payload-based channel routing", async () => {
  const architecture = await readFile(new URL("../../doc/10-architecture/web-presentation-custom-event-routing.md", import.meta.url), "utf8");
  assert.match(architecture, /options\.channel/);
  assert.match(architecture, /Session Event type/);
  assert.match(architecture, /不得使用旧的“固定广播 Channel \+ `data\.channel` \+ 消费端过滤”模型/);
});
