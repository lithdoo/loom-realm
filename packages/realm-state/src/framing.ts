import type { MessageCarrier } from "@loomrealm/foundation";

const FRAME_PROTOCOL = "loomrealm.realm-state.frame/1";
const DIRECT_MESSAGE_BYTES = 1024 * 1024;
const CHUNK_CODE_UNITS = 128 * 1024;

let nextStreamId = 1;

interface IncomingStream {
  readonly total: number;
  readonly chunks: string[];
}

function frameObject(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return record.protocol === FRAME_PROTOCOL ? record : null;
}

/** Dedicated physical framing; logical Realm State JSON and limits stay transport-independent. */
export async function sendRealmStateMessage(
  carrier: MessageCarrier,
  message: string,
): Promise<void> {
  if (new TextEncoder().encode(message).byteLength <= DIRECT_MESSAGE_BYTES) {
    await carrier.send(message);
    return;
  }
  if (nextStreamId === Number.MAX_SAFE_INTEGER) {
    throw new Error("Realm State physical stream identity exhausted");
  }
  const stream = nextStreamId++;
  const total = Math.ceil(message.length / CHUNK_CODE_UNITS);
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

export async function* receiveRealmStateMessages(
  carrier: MessageCarrier,
): AsyncGenerator<string> {
  const streams = new Map<number, IncomingStream>();
  for await (const unit of carrier.messages()) {
    if (typeof unit !== "string") throw new TypeError("Invalid Realm State physical unit");
    let parsed: unknown;
    try {
      parsed = JSON.parse(unit);
    } catch {
      throw new TypeError("Invalid Realm State physical unit");
    }
    const frame = frameObject(parsed);
    if (frame === null) {
      yield unit;
      continue;
    }
    if (
      Object.keys(frame).length !== 6 ||
      frame.type !== "chunk" ||
      !Number.isSafeInteger(frame.stream) || (frame.stream as number) <= 0 ||
      !Number.isSafeInteger(frame.index) || (frame.index as number) < 0 ||
      !Number.isSafeInteger(frame.total) || (frame.total as number) <= 0 ||
      (frame.index as number) >= (frame.total as number) ||
      typeof frame.chunk !== "string"
    ) {
      throw new TypeError("Invalid Realm State physical frame");
    }
    const streamId = frame.stream as number;
    const index = frame.index as number;
    const total = frame.total as number;
    let stream = streams.get(streamId);
    if (stream === undefined) {
      if (index !== 0) throw new TypeError("Out-of-order Realm State physical frame");
      stream = { total, chunks: [] };
      streams.set(streamId, stream);
    }
    if (stream.total !== total || stream.chunks.length !== index) {
      throw new TypeError("Out-of-order Realm State physical frame");
    }
    stream.chunks.push(frame.chunk);
    if (stream.chunks.length === total) {
      streams.delete(streamId);
      yield stream.chunks.join("");
    }
  }
  if (streams.size > 0) throw new TypeError("Truncated Realm State physical message");
}
