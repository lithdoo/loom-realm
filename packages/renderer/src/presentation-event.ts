import type { JsonValue } from "@loomrealm/wire";

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
