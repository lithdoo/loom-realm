import type { MessageCarrier } from "@loomrealm/foundation";
import type { JsonObject, JsonValue } from "@loomrealm/wire";

export const RENDERER_DATA_PROFILE_V1 = "loomrealm.renderer-data/1" as const;
export type RendererDataProfileV1 = typeof RENDERER_DATA_PROFILE_V1;

export interface DataCurrentBindingV1 {
  readonly carrier: MessageCarrier;
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: RendererDataProfileV1;
}

export type StandardInputChannelV1 =
  | "keyboard.state" | "keyboard.event"
  | "pointer.state" | "pointer.event"
  | "gamepad.state" | "gamepad.event";
export type CustomInputStateChannelV1 = `x.${string}.state`;
export type CustomInputEventChannelV1 = `x.${string}.event`;
export type InputStateChannelV1 = "keyboard.state" | "pointer.state" | "gamepad.state" | CustomInputStateChannelV1;
export type InputEventChannelV1 = "keyboard.event" | "pointer.event" | "gamepad.event" | CustomInputEventChannelV1;
export type InputChannelV1 = InputStateChannelV1 | InputEventChannelV1;

export interface FrameInputInterestV1 {
  readonly frameId: string;
  readonly channels: readonly InputChannelV1[];
}
export interface InputInterestV1 {
  readonly type: "input.interest";
  readonly frames: readonly FrameInputInterestV1[];
}
export interface InputStateV1 {
  readonly type: "input.state";
  readonly frameId: string;
  readonly activationId: string;
  readonly channel: InputStateChannelV1;
  readonly payload: JsonObject;
}
export interface InputEventV1 {
  readonly type: "input.event";
  readonly frameId: string;
  readonly activationId: string;
  readonly channel: InputEventChannelV1;
  readonly payload: JsonObject;
}
export interface InputResetV1 {
  readonly type: "input.reset";
  readonly frameId: string;
  readonly activationId: string;
}
export type UserInputMessageV1 = InputInterestV1 | InputStateV1 | InputEventV1 | InputResetV1;

export const KEYBOARD_CODES_V1 = [
  "KeyA", "KeyB", "KeyC", "KeyD", "KeyE", "KeyF", "KeyG", "KeyH", "KeyI", "KeyJ",
  "KeyK", "KeyL", "KeyM", "KeyN", "KeyO", "KeyP", "KeyQ", "KeyR", "KeyS", "KeyT",
  "KeyU", "KeyV", "KeyW", "KeyX", "KeyY", "KeyZ",
  "Digit0", "Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6", "Digit7", "Digit8", "Digit9",
  "F1", "F2", "F3", "F4", "F5", "F6", "F7", "F8", "F9", "F10", "F11", "F12",
  "F13", "F14", "F15", "F16", "F17", "F18", "F19", "F20", "F21", "F22", "F23", "F24",
  "Numpad0", "Numpad1", "Numpad2", "Numpad3", "Numpad4", "Numpad5", "Numpad6", "Numpad7", "Numpad8", "Numpad9",
  "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "Space", "Enter", "Escape", "Tab", "Backspace",
  "ShiftLeft", "ShiftRight", "ControlLeft", "ControlRight", "AltLeft", "AltRight", "MetaLeft", "MetaRight", "CapsLock",
  "Insert", "Delete", "Home", "End", "PageUp", "PageDown",
  "Minus", "Equal", "BracketLeft", "BracketRight", "Backslash",
  "Semicolon", "Quote", "Backquote", "Comma", "Period", "Slash",
  "NumpadAdd", "NumpadSubtract", "NumpadMultiply", "NumpadDivide", "NumpadDecimal", "NumpadEnter",
] as const;
export type KeyboardCodeV1 = typeof KEYBOARD_CODES_V1[number];
export interface KeyboardStatePayloadV1 { readonly down: readonly KeyboardCodeV1[]; }
export interface KeyboardEventPayloadV1 { readonly action: "down" | "up"; readonly code: KeyboardCodeV1; readonly repeat: boolean; }
export type PointerKindV1 = "mouse" | "touch" | "pen";
export type PointerButtonV1 = "primary" | "auxiliary" | "secondary" | "back" | "forward";
export interface PointerSampleV1 { readonly pointerId: number; readonly kind: PointerKindV1; readonly x: number; readonly y: number; readonly buttons: readonly PointerButtonV1[]; }
export interface PointerStatePayloadV1 { readonly pointers: readonly PointerSampleV1[]; }
export interface PointerEventPayloadV1 { readonly action: "down" | "up" | "cancel"; readonly pointer: PointerSampleV1; readonly button: PointerButtonV1 | null; }
export interface GamepadAxesV1 { readonly leftX: number; readonly leftY: number; readonly rightX: number; readonly rightY: number; }
export interface GamepadButtonsV1 {
  readonly south: number; readonly east: number; readonly west: number; readonly north: number;
  readonly leftBumper: number; readonly rightBumper: number; readonly leftTrigger: number; readonly rightTrigger: number;
  readonly select: number; readonly start: number; readonly leftStick: number; readonly rightStick: number;
  readonly dpadUp: number; readonly dpadDown: number; readonly dpadLeft: number; readonly dpadRight: number; readonly home: number;
}
export interface GamepadSampleV1 { readonly gamepadId: number; readonly axes: GamepadAxesV1; readonly buttons: GamepadButtonsV1; }
export interface GamepadStatePayloadV1 { readonly gamepads: readonly GamepadSampleV1[]; }
export type GamepadButtonNameV1 = keyof GamepadButtonsV1;
export interface GamepadEventPayloadV1 { readonly action: "down" | "up"; readonly gamepadId: number; readonly button: GamepadButtonNameV1; readonly value: number; }

export interface RenderDomainsV1 { readonly type: "render.domains"; readonly domains: readonly string[]; }
export interface RenderNodeV1 {
  readonly key: string;
  readonly tag: string;
  readonly attrs: Readonly<Record<string, string>>;
  readonly data: JsonObject;
  readonly children: readonly RenderNodeV1[];
}
export interface RenderSnapshotV1 { readonly type: "render.snapshot"; readonly domainId: string; readonly revision: number; readonly zIndex: number; readonly roots: readonly RenderNodeV1[]; }
export interface RenderNodeInsertV1 { readonly op: "insert"; readonly parentKey: string | null; readonly beforeKey: string | null; readonly node: RenderNodeV1; }
export interface RenderNodeRemoveV1 { readonly op: "remove"; readonly key: string; }
export interface RenderNodeMoveV1 { readonly op: "move"; readonly key: string; readonly parentKey: string | null; readonly beforeKey: string | null; }
export interface StringMapDeltaV1 { readonly set?: Readonly<Record<string, string>>; readonly remove?: readonly string[]; }
export interface JsonObjectDeltaV1 { readonly set?: Readonly<Record<string, JsonValue>>; readonly remove?: readonly string[]; }
export interface RenderNodeUpdateV1 { readonly op: "update"; readonly key: string; readonly attrs?: StringMapDeltaV1; readonly data?: JsonObjectDeltaV1; }
export type RenderPatchOpV1 = RenderNodeInsertV1 | RenderNodeRemoveV1 | RenderNodeMoveV1 | RenderNodeUpdateV1;
export interface RenderPatchV1 { readonly type: "render.patch"; readonly domainId: string; readonly baseRevision: number; readonly revision: number; readonly zIndex?: number; readonly ops: readonly RenderPatchOpV1[]; }
export interface RenderEventV1 { readonly type: "render.event"; readonly domainId: string; readonly targetKey: string; readonly name: string; readonly data: JsonObject; }
export type RenderUpdateMessageV1 = RenderDomainsV1 | RenderSnapshotV1 | RenderPatchV1 | RenderEventV1;
export type RendererDataMessageV1 = UserInputMessageV1 | RenderUpdateMessageV1;

export type DataProtocolFamily = "profile" | "input" | "render";
export type DataTerminal =
  | { readonly kind: "carrier-closed" }
  | { readonly kind: "carrier-lost"; readonly cause?: unknown }
  | { readonly kind: "protocol-fatal"; readonly protocol: DataProtocolFamily; readonly cause?: unknown }
  | { readonly kind: "local-fatal"; readonly cause: unknown };
export type DataSendOutcome = { readonly kind: "sent" } | { readonly kind: "terminal"; readonly terminal: DataTerminal };
export type DataInboundDisposition = { readonly kind: "accepted" } | { readonly kind: "protocol-fatal"; readonly cause?: unknown };

export interface SubsystemDataHandlers {
  onInputState(message: InputStateV1): DataInboundDisposition | Promise<DataInboundDisposition>;
  onInputEvent(message: InputEventV1): DataInboundDisposition | Promise<DataInboundDisposition>;
  onInputReset(message: InputResetV1): DataInboundDisposition | Promise<DataInboundDisposition>;
}
export interface SubsystemDataPeerOptions { readonly binding: DataCurrentBindingV1; readonly handlers: SubsystemDataHandlers; }
export interface SubsystemInputDataPeer { sendInterest(message: InputInterestV1): Promise<DataSendOutcome>; }
export interface SubsystemRenderDataPeer {
  sendDomains(message: RenderDomainsV1): Promise<DataSendOutcome>;
  sendSnapshot(message: RenderSnapshotV1): Promise<DataSendOutcome>;
  sendPatch(message: RenderPatchV1): Promise<DataSendOutcome>;
  sendEvent(message: RenderEventV1): Promise<DataSendOutcome>;
}
export interface DataBindingViewV1 { readonly subsystemKey: string; readonly generation: number; readonly dataProfile: RendererDataProfileV1; }
export interface SubsystemDataPeer {
  readonly binding: Readonly<DataBindingViewV1>;
  readonly input: SubsystemInputDataPeer;
  readonly render: SubsystemRenderDataPeer;
  readonly terminal: Promise<DataTerminal>;
  close(): Promise<void>;
}

export interface RendererDataHandlers {
  onInputInterest(message: InputInterestV1): DataInboundDisposition | Promise<DataInboundDisposition>;
  onRenderDomains(message: RenderDomainsV1): DataInboundDisposition | Promise<DataInboundDisposition>;
  onRenderSnapshot(message: RenderSnapshotV1): DataInboundDisposition | Promise<DataInboundDisposition>;
  onRenderPatch(message: RenderPatchV1): DataInboundDisposition | Promise<DataInboundDisposition>;
  onRenderEvent(message: RenderEventV1): DataInboundDisposition | Promise<DataInboundDisposition>;
}
export interface RendererDataPeerOptions { readonly binding: DataCurrentBindingV1; readonly handlers: RendererDataHandlers; }
export interface RendererInputDataPeer {
  sendState(message: InputStateV1): Promise<DataSendOutcome>;
  sendEvent(message: InputEventV1): Promise<DataSendOutcome>;
  sendReset(message: InputResetV1): Promise<DataSendOutcome>;
}
export interface RendererDataPeer {
  readonly binding: Readonly<DataBindingViewV1>;
  readonly input: RendererInputDataPeer;
  readonly terminal: Promise<DataTerminal>;
  close(): Promise<void>;
}
