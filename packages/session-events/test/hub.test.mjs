import assert from "node:assert/strict";
import test from "node:test";
import {
  createSessionEventFatalLatch,
  createInMemorySessionEventBinding,
  createSessionEventClient,
  createSessionEventHub,
} from "../dist/index.js";

const turn = () => new Promise((resolve) => setTimeout(resolve, 10));

test("exact-channel routing, type non-filtering, multiplicity, self delivery, and zero-subscriber success", async () => {
  const hub = createSessionEventHub();
  const a = createSessionEventClient(createInMemorySessionEventBinding(hub, "a"));
  const b = createSessionEventClient(createInMemorySessionEventBinding(hub, "b"));
  const seenA = [];
  const seenB = [];
  await a.subscribe(["battle", "dialogue"], (event) => seenA.push(event));
  await a.subscribe(["battle"], (event) => seenA.push(event));
  await b.subscribe(["battle/main"], (event) => seenB.push(event));
  await a.publish("battle", "one", { n: 1 });
  await a.publish("battle", "two", { n: 2 });
  await a.publish("nobody", "ok", null);
  await turn();
  assert.deepEqual(seenA.map(({ type }) => type).sort(), ["one", "one", "two", "two"]);
  assert.equal(seenB.length, 0);
  assert.ok(seenA.every(({ source }) => source.subsystemKey === "a"));
  a.terminate();
  b.terminate();
  hub.terminate();
});

test("trusted delegated publication preserves exact channels and optional owner targeting", async () => {
  const hub = createSessionEventHub();
  const owner = createSessionEventClient(createInMemorySessionEventBinding(hub, "owner"));
  const other = createSessionEventClient(createInMemorySessionEventBinding(hub, "other"));
  const publisher = hub.createDelegatedPublisher("owner");
  const ownerSeen = [];
  const otherSeen = [];
  await owner.subscribe(["keyboard.state"], (event) => ownerSeen.push(event));
  await other.subscribe(["keyboard.state"], (event) => otherSeen.push(event));
  await other.subscribe(["keyboard.event"], (event) => otherSeen.push(event));

  await publisher.publish("keyboard.state", "input.state", { down: ["KeyW"] });
  await publisher.publish("keyboard.state", "owner-only", { down: [] }, "owner");
  await turn();

  assert.deepEqual(ownerSeen.map(({ type }) => type), ["input.state", "owner-only"]);
  assert.deepEqual(otherSeen.map(({ type }) => type), ["input.state"]);
  assert.ok([...ownerSeen, ...otherSeen].every(({ channel }) => channel === "keyboard.state"));
  assert.ok([...ownerSeen, ...otherSeen].every(({ source }) => source.subsystemKey === "owner"));
});

test("payload is detached from publisher and isolated between subscriptions", async () => {
  const hub = createSessionEventHub();
  const client = createSessionEventClient(createInMemorySessionEventBinding(hub, "source"));
  const payload = { nested: { value: 1 } };
  const seen = [];
  await client.subscribe(["x"], (event) => {
    seen.push(event.payload.nested.value);
    try { event.payload.nested.value = 99; } catch {}
  });
  await client.subscribe(["x"], (event) => seen.push(event.payload.nested.value));
  await client.publish("x", "t", payload);
  payload.nested.value = 7;
  await turn();
  assert.deepEqual(seen, [1, 1]);
});

test("one subscription lane is serial and listener failures are isolated", async () => {
  const hub = createSessionEventHub();
  const client = createSessionEventClient(createInMemorySessionEventBinding(hub, "source"));
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let active = 0;
  let maximum = 0;
  const seen = [];
  await client.subscribe(["x"], async (event) => {
    active += 1;
    maximum = Math.max(maximum, active);
    seen.push(event.type);
    if (event.type === "a") await gate;
    active -= 1;
    if (event.type === "b") throw new Error("listener-local");
  });
  await client.publish("x", "a", null);
  await client.publish("x", "b", null);
  await client.publish("x", "c", null);
  await turn();
  assert.deepEqual(seen, ["a"]);
  release();
  await turn();
  assert.deepEqual(seen, ["a", "b", "c"]);
  assert.equal(maximum, 1);
});

test("close is synchronous/idempotent and preserves an already-running callback", async () => {
  const hub = createSessionEventHub();
  const client = createSessionEventClient(createInMemorySessionEventBinding(hub, "source"));
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  const seen = [];
  const subscription = await client.subscribe(["x"], async (event) => {
    seen.push(event.type);
    await gate;
  });
  await client.publish("x", "a", null);
  await turn();
  await client.publish("x", "b", null);
  subscription.close();
  subscription.close();
  assert.deepEqual(await subscription.closed, { reason: "closed" });
  release();
  await turn();
  assert.deepEqual(seen, ["a"]);
});

test("count overflow terminals only the slow subscription and publish remains accepted", async () => {
  const hub = createSessionEventHub();
  const client = createSessionEventClient(createInMemorySessionEventBinding(hub, "source"));
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let healthy = 0;
  const slow = await client.subscribe(["x"], async () => gate);
  await client.subscribe(["x"], () => { healthy += 1; });
  await client.publish("x", "active", null);
  await turn();
  for (let index = 0; index < 65; index += 1) {
    await client.publish("x", `q${index}`, null);
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.deepEqual(await slow.closed, { reason: "overflow" });
  release();
  await turn();
  assert.equal(healthy, 66);
});

test("byte overflow is independent from count overflow and remains subscription-local", async () => {
  const hub = createSessionEventHub();
  const client = createSessionEventClient(createInMemorySessionEventBinding(hub, "source"));
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let healthy = 0;
  const slow = await client.subscribe(["bytes"], async () => gate);
  await client.subscribe(["bytes"], () => { healthy += 1; });
  const payload = "x".repeat(256 * 1024 - 2);
  await client.publish("bytes", "active", payload);
  await turn();
  for (let index = 0; index < 33; index += 1) {
    await client.publish("bytes", `q${index}`, payload);
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.deepEqual(await slow.closed, { reason: "overflow" });
  release();
  await turn();
  assert.equal(healthy, 34);
});

test("one client accepts 64 live subscriptions and rejects the 65th before installation", async () => {
  const hub = createSessionEventHub();
  const client = createSessionEventClient(createInMemorySessionEventBinding(hub, "source"));
  const subscriptions = [];
  for (let index = 0; index < 64; index += 1) {
    subscriptions.push(await client.subscribe([`channel-${index}`], () => {}));
  }
  await assert.rejects(client.subscribe(["channel-65"], () => {}), { code: "LIMIT_EXCEEDED" });
  subscriptions[0].close();
  const replacement = await client.subscribe(["channel-replacement"], () => {});
  replacement.close();
  for (const subscription of subscriptions.slice(1)) subscription.close();
});

test("listener reentrancy can publish, subscribe, and close itself without deadlock", async () => {
  const hub = createSessionEventHub();
  const client = createSessionEventClient(createInMemorySessionEventBinding(hub, "source"));
  const seen = [];
  let subscription;
  subscription = await client.subscribe(["outer"], async () => {
    const inner = await client.subscribe(["inner"], (event) => seen.push(event.type));
    await client.publish("inner", "nested", null);
    subscription.close();
    seen.push("outer-complete");
    await turn();
    inner.close();
  });
  await client.publish("outer", "start", null);
  await turn();
  await turn();
  assert.deepEqual(seen, ["outer-complete", "nested"]);
  assert.deepEqual(await subscription.closed, { reason: "closed" });
});

test("pre-visible candidate overflow rejects with no handle or callback", async () => {
  const hub = createSessionEventHub();
  const binding = createInMemorySessionEventBinding(hub, "source");
  const client = createSessionEventClient(binding);
  let calls = 0;
  const pending = client.subscribe(["x"], () => { calls += 1; });
  for (let index = 0; index < 65; index += 1) binding.publish("x", `q${index}`, null);
  await assert.rejects(pending, { code: "LIMIT_EXCEEDED" });
  await turn();
  assert.equal(calls, 0);
});

test("pre-visible binding, client, and Hub terminals reject without a handle or listener", async () => {
  for (const scenario of ["binding", "client", "hub"]) {
    const hub = createSessionEventHub();
    const binding = createInMemorySessionEventBinding(hub, "source");
    const client = createSessionEventClient(binding);
    let calls = 0;
    const pending = client.subscribe(["x"], () => { calls += 1; });
    if (scenario === "binding") binding.close();
    else if (scenario === "client") client.terminate();
    else hub.terminate();
    await assert.rejects(
      pending,
      { code: scenario === "binding" ? "BINDING_UNAVAILABLE" : "TERMINAL" },
    );
    await turn();
    assert.equal(calls, 0);
    client.terminate();
    hub.terminate();
  }
});

test("late old-binding delivery is fenced after replacement and after explicit close", async () => {
  let oldListener;
  let settleOldTerminal;
  const oldTerminal = new Promise((resolve) => { settleOldTerminal = resolve; });
  const oldBinding = {
    terminal: oldTerminal,
    close() { settleOldTerminal("binding-terminal"); },
    publish() { throw new Error("unused"); },
    async subscribe(_channels, listener) {
      oldListener = listener;
      return {
        closed: new Promise(() => {}),
        close() {},
      };
    },
  };
  const hub = createSessionEventHub();
  const client = createSessionEventClient(oldBinding);
  const seen = [];
  const old = await client.subscribe(["x"], (event) => seen.push(event.type));
  client.attach(createInMemorySessionEventBinding(hub, "source"));
  assert.deepEqual(await old.closed, { reason: "binding-terminal" });
  await oldListener(Object.freeze({
    channel: "x",
    type: "stale-after-replacement",
    payload: null,
    source: Object.freeze({ subsystemKey: "source" }),
  }));

  let currentListener;
  const current = await client.subscribe(["y"], (event) => seen.push(event.type));
  // Capture the Hub path independently, then assert explicit close remains local-immediate.
  const directBinding = {
    terminal: new Promise(() => {}),
    close() {},
    publish() { throw new Error("unused"); },
    async subscribe(_channels, listener) {
      currentListener = listener;
      return { closed: new Promise(() => {}), close() {} };
    },
  };
  client.attach(directBinding);
  const direct = await client.subscribe(["z"], (event) => seen.push(event.type));
  direct.close();
  await currentListener(Object.freeze({
    channel: "z",
    type: "stale-after-close",
    payload: null,
    source: Object.freeze({ subsystemKey: "source" }),
  }));
  assert.deepEqual(seen, []);
  assert.deepEqual(await current.closed, { reason: "binding-terminal" });
  hub.terminate();
  client.terminate();
});

test("binding replacement fences old subscriptions and Hub/client terminals are distinct", async () => {
  const hub = createSessionEventHub();
  const client = createSessionEventClient();
  const bindingA = createInMemorySessionEventBinding(hub, "source");
  client.attach(bindingA);
  const old = await client.subscribe(["x"], () => {});
  bindingA.close();
  assert.deepEqual(await old.closed, { reason: "binding-terminal" });
  await assert.rejects(client.publish("x", "lost", null), { code: "BINDING_UNAVAILABLE" });
  client.attach(createInMemorySessionEventBinding(hub, "source"));
  const fresh = await client.subscribe(["x"], () => {});
  hub.terminate();
  assert.deepEqual(await fresh.closed, { reason: "hub-terminal" });
  await assert.rejects(client.publish("x", "later", null), { code: "TERMINAL" });

  const secondHub = createSessionEventHub();
  const second = createSessionEventClient(createInMemorySessionEventBinding(secondHub, "second"));
  const subscription = await second.subscribe(["x"], () => {});
  second.terminate();
  assert.deepEqual(await subscription.closed, { reason: "client-terminal" });
});

test("Hub fatal self-terminals before reporting its one latched fatal fact", async () => {
  const reports = [];
  let hub;
  hub = createSessionEventHub({
    onFatal(fact) {
      reports.push({ fact, terminal: hub.terminal, ready: hub.ready });
    },
  });
  const client = createSessionEventClient(createInMemorySessionEventBinding(hub, "source"));
  const subscription = await client.subscribe(["x"], () => {});
  const cause = new Error("invariant");
  hub.reportFatal(cause);
  hub.reportFatal(new Error("ignored"));
  assert.deepEqual(await subscription.closed, { reason: "hub-terminal" });
  assert.equal(reports.length, 1);
  assert.equal(reports[0].fact.code, "SESSION_EVENT_HUB_FATAL");
  assert.equal(reports[0].fact.cause, cause);
  assert.equal(reports[0].terminal, true);
  assert.equal(reports[0].ready, false);
});

test("fatal latch is asynchronous, one-shot, unsubscribe-safe, and excludes pre-READY construction failure", async () => {
  const latch = createSessionEventFatalLatch();
  const calls = [];
  const current = () => calls.push("current");
  const detach = latch.source.subscribe(current);
  latch.report();
  latch.report();
  assert.deepEqual(calls, []);
  await Promise.resolve();
  assert.deepEqual(calls, ["current"]);
  detach();
  detach();

  const late = () => calls.push("late");
  const detachLate = latch.source.subscribe(late);
  assert.deepEqual(calls, ["current"]);
  await Promise.resolve();
  assert.deepEqual(calls, ["current", "late"]);
  detachLate();

  const cancelled = () => calls.push("cancelled");
  latch.source.subscribe(cancelled)();
  await Promise.resolve();
  assert.deepEqual(calls, ["current", "late"]);

  const reused = () => calls.push("reused");
  latch.source.subscribe(reused)();
  await Promise.resolve();
  assert.deepEqual(calls, ["current", "late"]);
  const detachReused = latch.source.subscribe(reused);
  await Promise.resolve();
  assert.deepEqual(calls, ["current", "late", "reused"]);
  detachReused();

  const constructionLatch = createSessionEventFatalLatch();
  assert.throws(() => createSessionEventHub({ onFatal: null }), TypeError);
  let constructionReported = false;
  constructionLatch.source.subscribe(() => { constructionReported = true; });
  await Promise.resolve();
  assert.equal(constructionReported, false);
});
