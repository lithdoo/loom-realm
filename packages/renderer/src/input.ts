import type {
  CustomInputEventChannelV1,
  CustomInputStateChannelV1,
  GamepadEventPayloadV1,
  GamepadStatePayloadV1,
  InputChannelV1,
  InputEventV1,
  InputStateV1,
  KeyboardEventPayloadV1,
  KeyboardStatePayloadV1,
  PointerEventPayloadV1,
  PointerStatePayloadV1,
} from "@loomrealm/data";

export type RendererInputSourceChange =
  | {
      readonly kind: "availability";
      readonly channel: InputChannelV1;
      readonly available: boolean;
    }
  | {
      readonly kind: "state";
      readonly channel: "keyboard.state";
      readonly payload: KeyboardStatePayloadV1;
    }
  | {
      readonly kind: "event";
      readonly channel: "keyboard.event";
      readonly payload: KeyboardEventPayloadV1;
    }
  | { readonly kind: "state"; readonly channel: "pointer.state"; readonly payload: PointerStatePayloadV1 }
  | { readonly kind: "event"; readonly channel: "pointer.event"; readonly payload: PointerEventPayloadV1 }
  | { readonly kind: "state"; readonly channel: "gamepad.state"; readonly payload: GamepadStatePayloadV1 }
  | { readonly kind: "event"; readonly channel: "gamepad.event"; readonly payload: GamepadEventPayloadV1 }
  | { readonly kind: "state"; readonly channel: CustomInputStateChannelV1; readonly payload: InputStateV1["payload"] }
  | { readonly kind: "event"; readonly channel: CustomInputEventChannelV1; readonly payload: InputEventV1["payload"] };

export interface RendererInputSource {
  start(emit: (change: RendererInputSourceChange) => void): () => void;
}
