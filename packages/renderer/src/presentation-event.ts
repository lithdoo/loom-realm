import {
  assertExactKeys,
  assertJsonObject,
  parseJsonText,
  stringifyJson,
  type JsonObject,
  type JsonValue,
} from "@loomrealm/wire";
import type { MessageCarrier } from "@loomrealm/foundation";

export const WEB_PRESENTATION_EVENT_CHANNEL_V2 =
  "x.loomrealm.web-presentation.event" as const;

export interface PresentationEventPublication {
  readonly sessionId: string;
  readonly ownerSubsystemKey: string;
  readonly generation: number;
  readonly domainId: string;
  readonly targetKey: string;
  readonly channel: string;
  readonly type: string;
  readonly broadcast: boolean;
  readonly payload: {
    readonly domainId: string;
    readonly targetKey: string;
    readonly data: Readonly<Record<string, JsonValue>>;
  };
}

/** Trusted Renderer-to-Platform publication capability. Business code never receives it. */
export interface RendererPresentationEventBinding {
  publish(event: PresentationEventPublication): Promise<void>;
}

export interface PresentationEventCarrierServer {
  readonly closed: Promise<void>;
  close(): Promise<void>;
}

export interface PresentationEventPublishRequestV1 {
  readonly formatVersion: 1;
  readonly type: "presentation-event.publish";
  readonly requestId: number;
  readonly event: PresentationEventPublication;
}

export interface PresentationEventPublishResultV1 {
  readonly formatVersion: 1;
  readonly type: "presentation-event.result";
  readonly requestId: number;
  readonly ok: boolean;
}

function text(value: JsonValue | undefined, label: string): string {
  if (typeof value !== "string") throw new TypeError(`Invalid ${label}`);
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit <= 0x1f || unit === 0x7f) throw new TypeError(`Invalid ${label}`);
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = value.charCodeAt(index + 1);
      if (next < 0xdc00 || next > 0xdfff) throw new TypeError(`Invalid ${label}`);
      index += 1;
    } else if (unit >= 0xdc00 && unit <= 0xdfff) throw new TypeError(`Invalid ${label}`);
  }
  if (value.length === 0) throw new TypeError(`Invalid ${label}`);
  return value;
}

function positiveSafeInteger(value: JsonValue | undefined, label: string): number {
  if (!Number.isSafeInteger(value) || Number(value) <= 0) throw new TypeError(`Invalid ${label}`);
  return value as number;
}

function object(value: JsonValue | undefined, required: readonly string[], label: string): JsonObject {
  try {
    assertJsonObject(value);
    assertExactKeys(value, required);
    return value;
  } catch {
    throw new TypeError(`Invalid ${label}`);
  }
}

function parseEvent(value: JsonValue | undefined): PresentationEventPublication {
  const event = object(value, [
    "sessionId", "ownerSubsystemKey", "generation", "domainId", "targetKey",
    "channel", "type", "broadcast", "payload",
  ], "Presentation Event publication");
  const payload = object(event.payload, ["domainId", "targetKey", "data"], "Presentation Event payload");
  // Data is open-schema even though the containing envelopes are closed.
  try { assertJsonObject(payload.data); } catch { throw new TypeError("Invalid Presentation Event data"); }
  const domainId = text(event.domainId, "Presentation Event domainId");
  const targetKey = text(event.targetKey, "Presentation Event targetKey");
  if (payload.domainId !== domainId || payload.targetKey !== targetKey) {
    throw new TypeError("Invalid Presentation Event provenance envelope");
  }
  if (typeof event.broadcast !== "boolean") throw new TypeError("Invalid Presentation Event broadcast");
  return Object.freeze({
    sessionId: text(event.sessionId, "Presentation Event sessionId"),
    ownerSubsystemKey: text(event.ownerSubsystemKey, "Presentation Event owner"),
    generation: positiveSafeInteger(event.generation, "Presentation Event generation"),
    domainId,
    targetKey,
    channel: text(event.channel, "Presentation Event channel"),
    type: text(event.type, "Presentation Event type"),
    broadcast: event.broadcast,
    payload: Object.freeze({ domainId, targetKey, data: payload.data as JsonObject }),
  });
}

function parseApplicationText(raw: string): JsonObject {
  if (typeof raw !== "string") {
    throw new TypeError("Invalid Presentation Event application unit");
  }
  try {
    const value = parseJsonText(raw);
    assertJsonObject(value);
    return value;
  } catch {
    throw new TypeError("Invalid Presentation Event application unit");
  }
}

export function encodePresentationEventPublishRequestV1(
  requestId: number,
  event: PresentationEventPublication,
): string {
  const parsed = parseEvent(event as unknown as JsonValue);
  const request: PresentationEventPublishRequestV1 = Object.freeze({
    formatVersion: 1,
    type: "presentation-event.publish",
    requestId: positiveSafeInteger(requestId, "Presentation Event requestId"),
    event: parsed,
  });
  return stringifyJson(request as unknown as JsonValue);
}

export function decodePresentationEventPublishRequestV1(raw: string): PresentationEventPublishRequestV1 {
  const request = parseApplicationText(raw);
  try { assertExactKeys(request, ["formatVersion", "type", "requestId", "event"]); }
  catch { throw new TypeError("Invalid Presentation Event publish request"); }
  if (request.formatVersion !== 1 || request.type !== "presentation-event.publish") {
    throw new TypeError("Invalid Presentation Event publish request");
  }
  return Object.freeze({
    formatVersion: 1,
    type: "presentation-event.publish",
    requestId: positiveSafeInteger(request.requestId, "Presentation Event requestId"),
    event: parseEvent(request.event),
  });
}

export function encodePresentationEventPublishResultV1(requestId: number, ok: boolean): string {
  if (typeof ok !== "boolean") throw new TypeError("Invalid Presentation Event result");
  return stringifyJson(Object.freeze({
    formatVersion: 1,
    type: "presentation-event.result",
    requestId: positiveSafeInteger(requestId, "Presentation Event requestId"),
    ok,
  }));
}

export function decodePresentationEventPublishResultV1(
  raw: string,
  expectedRequestId: number,
): PresentationEventPublishResultV1 {
  const result = parseApplicationText(raw);
  try { assertExactKeys(result, ["formatVersion", "type", "requestId", "ok"]); }
  catch { throw new TypeError("Invalid Presentation Event publish result"); }
  if (
    result.formatVersion !== 1 || result.type !== "presentation-event.result" ||
    result.requestId !== expectedRequestId || typeof result.ok !== "boolean"
  ) throw new TypeError("Invalid Presentation Event publish result");
  return Object.freeze({
    formatVersion: 1,
    type: "presentation-event.result",
    requestId: expectedRequestId,
    ok: result.ok,
  });
}

export function createRendererPresentationEventBinding(
  carrier: MessageCarrier,
): RendererPresentationEventBinding {
  if (carrier === null || typeof carrier !== "object" || typeof carrier.send !== "function" || typeof carrier.messages !== "function") {
    throw new TypeError("Invalid Presentation Event carrier");
  }
  const iterator = carrier.messages()[Symbol.asyncIterator]();
  let nextRequestId = 1;
  let terminal: unknown = null;
  let tail = Promise.resolve();
  void carrier.closed.then((fact) => { terminal = fact; });
  return Object.freeze({
    publish(event: PresentationEventPublication): Promise<void> {
      const requestId = nextRequestId;
      if (nextRequestId === Number.MAX_SAFE_INTEGER) {
        return Promise.reject(new Error("Presentation Event request identity exhausted"));
      }
      nextRequestId += 1;
      const operation = tail.then(async () => {
        if (terminal !== null) throw new Error("Presentation Event carrier is closed");
        await carrier.send(encodePresentationEventPublishRequestV1(requestId, event));
        const response = await iterator.next();
        if (response.done) throw new Error("Presentation Event carrier is closed");
        const result = decodePresentationEventPublishResultV1(response.value, requestId);
        if (!result.ok) throw new Error("Presentation Event publication was rejected");
      });
      tail = operation.then(() => undefined, () => undefined);
      return operation;
    },
  });
}

export function serveRendererPresentationEventCarrier(
  carrier: MessageCarrier,
  publish: (event: PresentationEventPublication) => boolean | Promise<boolean>,
): PresentationEventCarrierServer {
  if (
    carrier === null || typeof carrier !== "object" || typeof carrier.send !== "function" ||
    typeof carrier.messages !== "function" || typeof publish !== "function"
  ) throw new TypeError("Invalid Presentation Event server");
  let closed = false;
  const run = (async () => {
    try {
      for await (const raw of carrier.messages()) {
        const request = decodePresentationEventPublishRequestV1(raw);
        let ok = false;
        try { ok = await publish(request.event); } catch {}
        await carrier.send(encodePresentationEventPublishResultV1(request.requestId, ok));
      }
    } catch {
      // Malformed traffic and transport failure both fail the narrow binding closed.
    } finally {
      closed = true;
      try { await carrier.close(); } catch {}
    }
  })();
  return Object.freeze({
    closed: run,
    async close() {
      if (closed) return run;
      closed = true;
      try { await carrier.close(); } finally { await run; }
    },
  });
}
