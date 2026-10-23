import {
  CONTROLS_STATE_REFRESH_MS, DEVICE_STATE_REFRESH_MS, isNonEmptyDeviceState,
  type ControlsStatePayloadV1, type DeviceInputChange, type DeviceStateChannel, type JsonObject, type JsonValue,
} from "../src/model.js";
import { createControlsInputSource, type ControlsInputChange } from "./controls-source.js";
import { createGamepadInputSource } from "./gamepad-source.js";
import { createKeyboardInputSource } from "./keyboard-source.js";
import { createPointerInputSource } from "./pointer-source.js";
import type { DeviceInputSource } from "./source-types.js";

interface PresentationContext {
  emitCustomEvent(name: string, data?: Readonly<Record<string, JsonValue>>, options?: { readonly broadcast?: boolean | "top-frame"; readonly channel?: string }): void;
}

const owners = new WeakMap<Window, Map<string, HTMLElement>>();

abstract class DeviceInputElement extends HTMLElement {
  private context?: PresentationContext;
  private stopSource?: () => void;
  private refreshTimer?: ReturnType<typeof setInterval>;
  private refresh?: { readonly channel: DeviceStateChannel; readonly payload: JsonObject };
  private claimed = false;
  protected abstract readonly device: string;
  protected abstract source(target: Window): DeviceInputSource;

  receiveRenderContext(context: PresentationContext): void {
    if (context === null || typeof context !== "object" || typeof context.emitCustomEvent !== "function") {
      throw new TypeError("Invalid WebPresentationContext");
    }
    this.context = context;
    this.startIfReady();
  }

  connectedCallback(): void { this.startIfReady(); }

  disconnectedCallback(): void {
    this.stopSource?.(); this.stopSource = undefined;
    this.stopRefresh();
    const target = this.ownerDocument.defaultView;
    if (target !== null && this.claimed) {
      const registry = owners.get(target);
      if (registry?.get(this.device) === this) registry.delete(this.device);
    }
    this.claimed = false;
  }

  private startIfReady(): void {
    if (!this.isConnected || this.context === undefined || this.stopSource !== undefined) return;
    const target = this.ownerDocument.defaultView;
    if (target === null) return;
    const registry = owners.get(target) ?? new Map<string, HTMLElement>();
    if (!owners.has(target)) owners.set(target, registry);
    const current = registry.get(this.device);
    if (current !== undefined && current !== this) {
      this.setAttribute("data-input-disabled", "duplicate");
      return;
    }
    this.removeAttribute("data-input-disabled");
    registry.set(this.device, this);
    this.claimed = true;
    this.stopSource = this.source(target).start((change) => this.emit(change));
  }

  private emit(change: DeviceInputChange): void {
    this.context?.emitCustomEvent(
      change.kind === "state" ? "input.state" : "input.event",
      change.payload,
      { broadcast: true, channel: change.channel },
    );
    if (change.kind !== "state") return;
    if (!isNonEmptyDeviceState(change.channel, change.payload)) { this.stopRefresh(); return; }
    this.refresh = { channel: change.channel, payload: change.payload };
    if (this.refreshTimer !== undefined) return;
    this.refreshTimer = setInterval(() => {
      const current = this.refresh;
      if (current !== undefined && this.isConnected) {
        this.context?.emitCustomEvent("input.state", current.payload, { broadcast: true, channel: current.channel });
      }
    }, DEVICE_STATE_REFRESH_MS);
  }

  private stopRefresh(): void {
    if (this.refreshTimer !== undefined) clearInterval(this.refreshTimer);
    this.refreshTimer = undefined; this.refresh = undefined;
  }
}

class GameKeyboardInputElement extends DeviceInputElement {
  protected readonly device = "keyboard";
  protected source(target: Window): DeviceInputSource { return createKeyboardInputSource(target); }
}
class GamePointerInputElement extends DeviceInputElement {
  protected readonly device = "pointer";
  protected source(target: Window): DeviceInputSource { return createPointerInputSource(target); }
}
class GameGamepadInputElement extends DeviceInputElement {
  protected readonly device = "gamepad";
  protected source(target: Window): DeviceInputSource { return createGamepadInputSource(target); }
}

class GameControlsInputElement extends HTMLElement {
  private context?: PresentationContext;
  private stopSource?: () => void;
  private refreshTimer?: ReturnType<typeof setInterval>;
  private refresh?: ControlsStatePayloadV1;
  private claimed = false;

  receiveRenderContext(context: PresentationContext): void {
    if (context === null || typeof context !== "object" || typeof context.emitCustomEvent !== "function") {
      throw new TypeError("Invalid WebPresentationContext");
    }
    this.context = context;
    this.startIfReady();
  }

  connectedCallback(): void { this.startIfReady(); }

  disconnectedCallback(): void {
    this.stopSource?.();
    this.stopSource = undefined;
    this.stopRefresh();
    const target = this.ownerDocument.defaultView;
    if (target !== null && this.claimed) {
      const registry = owners.get(target);
      if (registry?.get("controls") === this) registry.delete("controls");
    }
    this.claimed = false;
  }

  private startIfReady(): void {
    if (!this.isConnected || this.context === undefined || this.stopSource !== undefined) return;
    const target = this.ownerDocument.defaultView;
    if (target === null) return;
    const registry = owners.get(target) ?? new Map<string, HTMLElement>();
    if (!owners.has(target)) owners.set(target, registry);
    const current = registry.get("controls");
    if (current !== undefined && current !== this) {
      this.setAttribute("data-input-disabled", "duplicate");
      return;
    }
    this.removeAttribute("data-input-disabled");
    registry.set("controls", this);
    this.claimed = true;
    this.stopSource = createControlsInputSource(target).start((change) => this.emit(change));
  }

  private emit(change: ControlsInputChange): void {
    this.context?.emitCustomEvent(
      change.kind === "state" ? "input.state" : "input.event",
      change.payload,
      { broadcast: "top-frame", channel: change.kind === "state" ? "controls.state" : "controls.event" },
    );
    if (change.kind !== "state") return;
    if (change.payload.down.length === 0) { this.stopRefresh(); return; }
    this.refresh = change.payload;
    if (this.refreshTimer !== undefined) return;
    this.refreshTimer = setInterval(() => {
      if (this.refresh !== undefined && this.isConnected) {
        this.context?.emitCustomEvent("input.state", this.refresh, { broadcast: "top-frame", channel: "controls.state" });
      }
    }, CONTROLS_STATE_REFRESH_MS);
  }

  private stopRefresh(): void {
    if (this.refreshTimer !== undefined) clearInterval(this.refreshTimer);
    this.refreshTimer = undefined;
    this.refresh = undefined;
  }
}

customElements.define("game-keyboard-input", GameKeyboardInputElement);
customElements.define("game-pointer-input", GamePointerInputElement);
customElements.define("game-gamepad-input", GameGamepadInputElement);
customElements.define("game-controls-input", GameControlsInputElement);
