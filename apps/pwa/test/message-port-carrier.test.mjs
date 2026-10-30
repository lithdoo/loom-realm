import test from "node:test";
import assert from "node:assert/strict";
import { MessageChannel } from "node:worker_threads";
import { FifoQueue } from "../dist/types/fifo-queue.js";
import { createMessagePortCarrier } from "../dist/types/message-port-carrier.js";

test("two-stack FIFO retains only active entries across 200k sequential cycles", () => {
  const queue = new FifoQueue();
  let highWater = 0;
  for (let index = 0; index < 200_000; index += 1) {
    const value = { index };
    queue.enqueue(value);
    highWater = Math.max(highWater, queue.length);
    assert.equal(queue.dequeue(), value);
    assert.equal(queue.length, 0);
  }
  assert.equal(highWater, 1);
  const retained = { marker: true };
  queue.enqueue(retained);
  queue.clear();
  assert.equal(queue.length, 0);
  console.log("MESSAGE_PORT_QUEUE_COMPLEXITY", JSON.stringify({
    sequentialCycles: 200_000,
    waiterStorageHighWater: highWater,
    retainedAfterClear: queue.length,
  }));
});

test("MessagePort sequential wait/wake does not accumulate waiter history", { timeout: 30_000 }, async () => {
  const { port1, port2 } = new MessageChannel();
  const carrier = createMessagePortCarrier(port1);
  const iterator = carrier.messages()[Symbol.asyncIterator]();

  for (let index = 0; index < 20_000; index += 1) {
    const pending = iterator.next();
    port2.postMessage(String(index));
    assert.deepEqual(await pending, { done: false, value: String(index) });
  }

  const first = iterator.next();
  const second = iterator.next();
  port2.postMessage("first");
  port2.postMessage("second");
  assert.deepEqual(await Promise.all([first, second]), [
    { done: false, value: "first" },
    { done: false, value: "second" },
  ]);

  const pendingAtTerminal = iterator.next();
  await carrier.close();
  assert.deepEqual(await pendingAtTerminal, { done: true, value: undefined });
  assert.deepEqual(await iterator.next(), { done: true, value: undefined });
  console.log("MESSAGE_PORT_RECEIVE_LONGEVITY", JSON.stringify({
    receivedUnits: 20_002,
    concurrentWaitersVerified: 2,
    terminalReleasedPendingReader: true,
  }));
  port2.close();
});
