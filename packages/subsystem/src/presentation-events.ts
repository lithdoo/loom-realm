import type { JsonObject } from "@loomrealm/wire";
import type { Frame } from "./model.js";

export interface PresentationFrameEvent {
  readonly channel: string;
  readonly name: string;
  readonly data: JsonObject;
  readonly source: {
    readonly subsystemKey: string;
    readonly domainId: string;
    readonly targetKey: string;
  };
}

export type PresentationEventHandler = (
  event: PresentationFrameEvent,
) => void | Promise<void>;

export interface PresentationEventListener {
  on(channel: string, handler: PresentationEventHandler): () => void;
  setChannels(channels: readonly string[]): void;
  close(): void;
}

export interface PresentationEventClient {
  createListener(options: {
    readonly frame: Frame;
    readonly channels: readonly string[];
  }): PresentationEventListener;
}
