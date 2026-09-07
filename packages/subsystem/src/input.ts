import type {
  GamepadEventPayloadV1,
  GamepadStatePayloadV1,
  InputStateV1,
  KeyboardEventPayloadV1,
  KeyboardStatePayloadV1,
  PointerEventPayloadV1,
  PointerStatePayloadV1,
} from "@loomrealm/data";
import type { Frame } from "./model.js";

export type InputStateChannel =
  | "keyboard.state"
  | "pointer.state"
  | "gamepad.state"
  | `x.${string}.state`;

export type InputEventChannel =
  | "keyboard.event"
  | "pointer.event"
  | "gamepad.event"
  | `x.${string}.event`;

export type InputChannel = InputStateChannel | InputEventChannel;

export type KeyboardStateInput = KeyboardStatePayloadV1;
export type KeyboardEventInput = KeyboardEventPayloadV1;
export type PointerStateInput = PointerStatePayloadV1;
export type PointerEventInput = PointerEventPayloadV1;
export type GamepadStateInput = GamepadStatePayloadV1;
export type GamepadEventInput = GamepadEventPayloadV1;

type CustomInputObject = InputStateV1["payload"];

export type InputPayload<C extends InputChannel> =
  C extends "keyboard.state" ? KeyboardStateInput :
  C extends "keyboard.event" ? KeyboardEventInput :
  C extends "pointer.state" ? PointerStateInput :
  C extends "pointer.event" ? PointerEventInput :
  C extends "gamepad.state" ? GamepadStateInput :
  C extends "gamepad.event" ? GamepadEventInput :
  C extends `x.${string}.state` | `x.${string}.event` ? CustomInputObject :
  never;

export type InputHandler<C extends InputChannel> =
  (value: InputPayload<C>) => void | Promise<void>;

export type Unsubscribe = () => void;

export interface CreateInputListenerOptions {
  readonly frame: Frame;
  readonly channels: readonly InputChannel[];
}

export interface InputListener {
  on<C extends InputChannel>(
    channel: C,
    handler: InputHandler<C>,
  ): Unsubscribe;
  setChannels(channels: readonly InputChannel[]): void;
  close(): void;
}
