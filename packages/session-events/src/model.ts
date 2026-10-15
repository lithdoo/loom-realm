import type { JsonValue } from "@loomrealm/wire";

export interface SessionEvent<T extends JsonValue = JsonValue> {
  readonly channel: string;
  readonly type: string;
  readonly payload: T;
  readonly source: {
    readonly subsystemKey: string;
  };
}

export type SessionEventListener =
  (event: SessionEvent) => void | Promise<void>;

export type SessionEventSubscriptionCloseReason =
  | "closed"
  | "overflow"
  | "binding-terminal"
  | "client-terminal"
  | "hub-terminal";

export interface SessionEventSubscriptionClose {
  readonly reason: SessionEventSubscriptionCloseReason;
}

export interface SessionEventSubscription {
  readonly closed: Promise<SessionEventSubscriptionClose>;
  close(): void;
}

export interface SessionEventClient {
  publish(channel: string, type: string, payload: JsonValue): Promise<void>;
  subscribe(
    channels: readonly string[],
    listener: SessionEventListener,
  ): Promise<SessionEventSubscription>;
}

export interface SessionEventBindingPublishDispatch {
  readonly dispatched: Promise<void>;
  readonly result: Promise<void>;
}

export type SessionEventBindingTerminalReason =
  | "binding-terminal"
  | "hub-terminal";

export interface SessionEventPhysicalBinding {
  publish(
    channel: string,
    type: string,
    payload: JsonValue,
  ): SessionEventBindingPublishDispatch;
  subscribe(
    channels: readonly string[],
    listener: SessionEventListener,
  ): Promise<SessionEventSubscription>;
  readonly terminal: Promise<SessionEventBindingTerminalReason>;
  close(): void | Promise<void>;
}
