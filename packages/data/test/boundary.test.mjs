import test from "node:test";
import assert from "node:assert/strict";
import {
  createSubsystemDataPeer,
  RENDERER_DATA_PROFILE_V1,
} from "../dist/index.js";

const accepted = () => ({ kind: "accepted" });

test("invalid trusted binding fails before claiming the carrier reader", () => {
  let messagesCalls = 0;
  const carrier = {
    closed: new Promise(() => {}),
    async send() {},
    messages() {
      messagesCalls += 1;
      return { async *[Symbol.asyncIterator]() {} };
    },
    async close() {},
  };
  assert.throws(
    () => createSubsystemDataPeer({
      binding: {
        carrier,
        subsystemKey: "map",
        generation: 0,
        dataProfile: RENDERER_DATA_PROFILE_V1,
      },
      handlers: {
        onInputState: accepted,
        onInputEvent: accepted,
        onInputReset: accepted,
      },
    }),
    TypeError,
  );
  assert.equal(messagesCalls, 0);
});

test("one Data peer claims exactly one logical carrier reader", async () => {
  let messagesCalls = 0;
  let resolveClosed;
  const closed = new Promise((resolve) => { resolveClosed = resolve; });
  const carrier = {
    closed,
    async send() {},
    messages() {
      messagesCalls += 1;
      return { async *[Symbol.asyncIterator]() { await closed; } };
    },
    async close() { resolveClosed({ kind: "closed" }); },
  };
  const peer = createSubsystemDataPeer({
    binding: {
      carrier,
      subsystemKey: "map",
      generation: 1,
      dataProfile: RENDERER_DATA_PROFILE_V1,
    },
    handlers: {
      onInputState: accepted,
      onInputEvent: accepted,
      onInputReset: accepted,
    },
  });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(messagesCalls, 1);
  await peer.close();
});
