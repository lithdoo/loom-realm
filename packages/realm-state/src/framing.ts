import type { MessageCarrier } from "@loomrealm/foundation";

const FRAME_PROTOCOL = "loomrealm.realm-state.frame/1";
const DIRECT_MESSAGE_BYTES = 1024 * 1024;
const CHUNK_CODE_UNITS = 128 * 1024;

// The largest logical response is a full 16,384-Record scan whose values may
// each reach 256 KiB, plus identities and JSON envelope overhead. This private
// physical ceiling deliberately sits above that frozen logical maximum; it is
// not a new scan/API limit.
const MAX_LOGICAL_MESSAGE_BYTES = 5 * 1024 * 1024 * 1024;
const MAX_FRAME_UNITS = Math.ceil(MAX_LOGICAL_MESSAGE_BYTES / CHUNK_CODE_UNITS);
const MAX_OUTBOUND_MESSAGES = 256;

let nextStreamId = 1;

interface IncomingStream {
  readonly id: number;
  readonly total: number;
  readonly chunks: string[];
  bytes: number;
}

interface OutboundLane {
  tail: Promise<void>;
  failure: unknown | null;
  pendingMessages: number;
  pendingBytes: number;
}

const outboundLanes = new WeakMap<MessageCarrier, OutboundLane>();

function frameObject(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return record.protocol === FRAME_PROTOCOL ? record : null;
}

function utf8Bytes(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const first = value.charCodeAt(index);
    if (first <= 0x7f) bytes += 1;
    else if (first <= 0x7ff) bytes += 2;
    else if (first >= 0xd800 && first <= 0xdbff) {
      const second = value.charCodeAt(index + 1);
      if (second >= 0xdc00 && second <= 0xdfff) index += 1;
      bytes += second >= 0xdc00 && second <= 0xdfff ? 4 : 3;
    } else bytes += 3;
  }
  return bytes;
}

function laneFor(carrier: MessageCarrier): OutboundLane {
  let lane = outboundLanes.get(carrier);
  if (lane === undefined) {
    lane = {
      tail: Promise.resolve(),
      failure: null,
      pendingMessages: 0,
      pendingBytes: 0,
    };
    outboundLanes.set(carrier, lane);
  }
  return lane;
}

async function sendFramed(
  carrier: MessageCarrier,
  message: string,
  encodedBytes: number,
): Promise<void> {
  if (encodedBytes <= DIRECT_MESSAGE_BYTES) {
    await carrier.send(message);
    return;
  }
  if (nextStreamId === Number.MAX_SAFE_INTEGER) {
    throw new Error("Realm State physical stream identity exhausted");
  }
  const stream = nextStreamId++;
  const total = Math.ceil(message.length / CHUNK_CODE_UNITS);
  if (total > MAX_FRAME_UNITS) {
    throw new Error("Realm State physical frame count exceeded");
  }
  for (let index = 0; index < total; index += 1) {
    const chunk = message.slice(index * CHUNK_CODE_UNITS, (index + 1) * CHUNK_CODE_UNITS);
    await carrier.send(JSON.stringify({
      protocol: FRAME_PROTOCOL,
      type: "chunk",
      stream,
      index,
      total,
      chunk,
    }));
  }
}

/**
 * Dedicated physical framing with one bounded serialized lane per carrier.
 * Concurrent logical sends therefore cannot interleave their chunk streams.
 */
export function sendRealmStateMessage(
  carrier: MessageCarrier,
  message: string,
): Promise<void> {
  if (typeof message !== "string") {
    return Promise.reject(new TypeError("Invalid Realm State logical message"));
  }
  const encodedBytes = utf8Bytes(message);
  if (encodedBytes > MAX_LOGICAL_MESSAGE_BYTES) {
    return Promise.reject(new TypeError("Realm State physical message limit exceeded"));
  }
  const lane = laneFor(carrier);
  if (
    lane.pendingMessages + 1 > MAX_OUTBOUND_MESSAGES ||
    lane.pendingBytes + encodedBytes > MAX_LOGICAL_MESSAGE_BYTES
  ) {
    return Promise.reject(new Error("Realm State physical outbound queue exceeded"));
  }
  lane.pendingMessages += 1;
  lane.pendingBytes += encodedBytes;
  const operation = lane.tail.then(async () => {
    if (lane.failure !== null) throw lane.failure;
    try {
      await sendFramed(carrier, message, encodedBytes);
    } catch (error) {
      lane.failure = error;
      throw error;
    }
  });
  lane.tail = operation.catch(() => undefined);
  return operation.finally(() => {
    lane.pendingMessages -= 1;
    lane.pendingBytes -= encodedBytes;
  });
}

export async function* receiveRealmStateMessages(
  carrier: MessageCarrier,
): AsyncGenerator<string> {
  let stream: IncomingStream | null = null;
  for await (const unit of carrier.messages()) {
    if (typeof unit !== "string") throw new TypeError("Invalid Realm State physical unit");
    const unitBytes = utf8Bytes(unit);
    if (unitBytes > DIRECT_MESSAGE_BYTES) {
      throw new TypeError("Realm State physical unit limit exceeded");
    }
    let parsed: unknown;
    try {
      parsed = JSON.parse(unit);
    } catch {
      throw new TypeError("Invalid Realm State physical unit");
    }
    const frame = frameObject(parsed);
    if (frame === null) {
      if (stream !== null) {
        throw new TypeError("Interleaved Realm State physical message");
      }
      yield unit;
      continue;
    }
    if (
      Object.keys(frame).length !== 6 ||
      frame.type !== "chunk" ||
      !Number.isSafeInteger(frame.stream) || (frame.stream as number) <= 0 ||
      !Number.isSafeInteger(frame.index) || (frame.index as number) < 0 ||
      !Number.isSafeInteger(frame.total) || (frame.total as number) <= 0 ||
      (frame.total as number) > MAX_FRAME_UNITS ||
      (frame.index as number) >= (frame.total as number) ||
      typeof frame.chunk !== "string"
    ) {
      throw new TypeError("Invalid Realm State physical frame");
    }
    const streamId = frame.stream as number;
    const index = frame.index as number;
    const total = frame.total as number;
    if (stream === null) {
      if (index !== 0) throw new TypeError("Out-of-order Realm State physical frame");
      stream = { id: streamId, total, chunks: [], bytes: 0 };
    }
    if (
      stream.id !== streamId ||
      stream.total !== total ||
      stream.chunks.length !== index
    ) {
      throw new TypeError("Out-of-order Realm State physical frame");
    }
    stream.bytes += utf8Bytes(frame.chunk);
    if (stream.bytes > MAX_LOGICAL_MESSAGE_BYTES) {
      throw new TypeError("Realm State physical message limit exceeded");
    }
    stream.chunks.push(frame.chunk);
    if (stream.chunks.length === total) {
      const complete = stream.chunks.join("");
      stream = null;
      yield complete;
    }
  }
  if (stream !== null) throw new TypeError("Truncated Realm State physical message");
}
