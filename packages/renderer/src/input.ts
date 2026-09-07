import type {
  InputChannelV1,
  InputEventChannelV1,
  InputEventV1,
  InputStateChannelV1,
  InputStateV1,
} from "@loomrealm/data";

export type RendererInputSourceChange =
  | {
      readonly kind: "availability";
      readonly channel: InputChannelV1;
      readonly available: boolean;
    }
  | {
      readonly kind: "state";
      readonly channel: InputStateChannelV1;
      readonly payload: InputStateV1["payload"];
    }
  | {
      readonly kind: "event";
      readonly channel: InputEventChannelV1;
      readonly payload: InputEventV1["payload"];
    };

export interface RendererInputSource {
  start(emit: (change: RendererInputSourceChange) => void): () => void;
}
