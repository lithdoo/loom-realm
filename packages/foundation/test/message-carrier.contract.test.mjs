import { test } from "node:test";
import assert from "node:assert/strict";
import { createMemoryCarrierPair } from "../dist/testing/index.js";

async function collect(iterable) {
  const values = [];
  for await (const value of iterable) values.push(value);
  return values;
}

test("opaque strings round-trip exactly without interpretation or normalization", async () => {
  const pair = createMemoryCarrierPair();
  const payloads = ["", "not json", "{broken", "\n", "  spaced  ", "😀", "e\u0301", "é"];

  for (const payload of payloads) await pair.left.send(payload);
  await pair.left.close();

  assert.deepEqual(await collect(pair.right.messages()), payloads);
});

test("both directions preserve independent invocation order and message boundaries", async () => {
  const pair = createMemoryCarrierPair();

  const leftSends = ["A", "B", "C"].map((value) => pair.left.send(value));
  const rightSends = ["X", "Y", "Z"].map((value) => pair.right.send(value));
  await Promise.all([...leftSends, ...rightSends]);
  await pair.right.close();

  assert.deepEqual(await collect(pair.right.messages()), ["A", "B", "C"]);
  assert.deepEqual(await collect(pair.left.messages()), ["X", "Y", "Z"]);
});

test("send always returns a Promise and accepts exactly once before peer consumption", async () => {
  const pair = createMemoryCarrierPair();
  const accepted = pair.left.send("accepted");

  assert.ok(accepted instanceof Promise);
  await accepted;

  const iterator = pair.right.messages()[Symbol.asyncIterator]();
  assert.deepEqual(await iterator.next(), { done: false, value: "accepted" });
  await pair.left.close();
  assert.deepEqual(await iterator.next(), { done: true, value: undefined });
});

test("one logical reader owns the inbound stream", async () => {
  const pair = createMemoryCarrierPair();
  const first = pair.right.messages()[Symbol.asyncIterator]();

  assert.throws(
    () => pair.right.messages()[Symbol.asyncIterator](),
    /logical reader/,
  );

  await pair.left.close();
  assert.deepEqual(await first.next(), { done: true, value: undefined });
});

test("terminal state rejects new sends without creating inbound messages", async () => {
  for (const terminate of [
    (pair) => pair.left.close(),
    (pair) => pair.lose(new Error("offline")),
  ]) {
    const pair = createMemoryCarrierPair();
    await terminate(pair);

    await assert.rejects(pair.left.send("late"));
    await assert.rejects(pair.right.send("late"));
    assert.deepEqual(await collect(pair.right.messages()), []);
    assert.deepEqual(await collect(pair.left.messages()), []);
  }
});

test("an invoked send linearizes before a following close", async () => {
  const pair = createMemoryCarrierPair();
  const accepted = pair.left.send("before");
  const closed = pair.left.close();

  await accepted;
  await closed;
  await assert.rejects(pair.left.send("after"));
  assert.deepEqual(await collect(pair.right.messages()), ["before"]);
});

test("queued inbound messages drain before normal iterator completion on close", async () => {
  const pair = createMemoryCarrierPair();
  await pair.left.send("A");
  await pair.left.send("B");
  await pair.left.close();

  assert.deepEqual(await Promise.all([pair.left.closed, pair.right.closed]), [
    { kind: "closed" },
    { kind: "closed" },
  ]);
  assert.deepEqual(await collect(pair.right.messages()), ["A", "B"]);
});

test("queued inbound messages drain before normal iterator completion on loss", async () => {
  const pair = createMemoryCarrierPair();
  await pair.left.send("A");
  await pair.left.send("B");
  pair.lose();

  assert.deepEqual(await pair.right.closed, { kind: "lost" });
  assert.deepEqual(await collect(pair.right.messages()), ["A", "B"]);
});

test("a pending iterator completes normally when the carrier terminates", async () => {
  const pair = createMemoryCarrierPair();
  const iterator = pair.right.messages()[Symbol.asyncIterator]();
  const pending = iterator.next();

  pair.lose(new Error("transport lost"));

  assert.deepEqual(await pending, { done: true, value: undefined });
});

test("transport terminal is not thrown into the application message stream", async () => {
  const pair = createMemoryCarrierPair();
  pair.lose(new Error("diagnostic only"));

  await assert.doesNotReject(async () => collect(pair.left.messages()));
  assert.deepEqual(await collect(pair.right.messages()), []);
});
