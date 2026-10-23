for (const tag of ["game-keyboard-input", "game-pointer-input", "game-gamepad-input", "game-controls-input"]) { if (customElements.get(tag) !== undefined) throw new TypeError("Game Common Controls element collision: " + tag); }
"use strict";
(() => {
  // src/model.ts
  var DEVICE_INPUT_CHANNELS = Object.freeze([
    "keyboard.state",
    "keyboard.event",
    "pointer.state",
    "pointer.event",
    "gamepad.state",
    "gamepad.event"
  ]);
  var CONTROLS_INPUT_CHANNELS = Object.freeze([
    "controls.state",
    "controls.event"
  ]);
  var CONTROLS_BUTTONS_V1 = Object.freeze([
    "up",
    "down",
    "left",
    "right",
    "south",
    "east",
    "west",
    "north",
    "leftBumper",
    "rightBumper",
    "leftTrigger",
    "rightTrigger",
    "start",
    "select"
  ]);
  var EMPTY_CONTROLS_DOWN_V1 = Object.freeze([]);
  var EMPTY_CONTROLS_STATE_V1 = Object.freeze({ down: EMPTY_CONTROLS_DOWN_V1 });
  var CONTROLS_STATE_REFRESH_MS = 1e3;
  var KEYBOARD_CODES_V1 = Object.freeze([
    "KeyA",
    "KeyB",
    "KeyC",
    "KeyD",
    "KeyE",
    "KeyF",
    "KeyG",
    "KeyH",
    "KeyI",
    "KeyJ",
    "KeyK",
    "KeyL",
    "KeyM",
    "KeyN",
    "KeyO",
    "KeyP",
    "KeyQ",
    "KeyR",
    "KeyS",
    "KeyT",
    "KeyU",
    "KeyV",
    "KeyW",
    "KeyX",
    "KeyY",
    "KeyZ",
    "Digit0",
    "Digit1",
    "Digit2",
    "Digit3",
    "Digit4",
    "Digit5",
    "Digit6",
    "Digit7",
    "Digit8",
    "Digit9",
    "F1",
    "F2",
    "F3",
    "F4",
    "F5",
    "F6",
    "F7",
    "F8",
    "F9",
    "F10",
    "F11",
    "F12",
    "F13",
    "F14",
    "F15",
    "F16",
    "F17",
    "F18",
    "F19",
    "F20",
    "F21",
    "F22",
    "F23",
    "F24",
    "Numpad0",
    "Numpad1",
    "Numpad2",
    "Numpad3",
    "Numpad4",
    "Numpad5",
    "Numpad6",
    "Numpad7",
    "Numpad8",
    "Numpad9",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "Space",
    "Enter",
    "Escape",
    "Tab",
    "Backspace",
    "ShiftLeft",
    "ShiftRight",
    "ControlLeft",
    "ControlRight",
    "AltLeft",
    "AltRight",
    "MetaLeft",
    "MetaRight",
    "CapsLock",
    "Insert",
    "Delete",
    "Home",
    "End",
    "PageUp",
    "PageDown",
    "Minus",
    "Equal",
    "BracketLeft",
    "BracketRight",
    "Backslash",
    "Semicolon",
    "Quote",
    "Backquote",
    "Comma",
    "Period",
    "Slash",
    "NumpadAdd",
    "NumpadSubtract",
    "NumpadMultiply",
    "NumpadDivide",
    "NumpadDecimal",
    "NumpadEnter"
  ]);
  var DEVICE_STATE_REFRESH_MS = 1e3;
  function isNonEmptyDeviceState(channel, payload) {
    const value = channel === "keyboard.state" ? payload.down : channel === "pointer.state" ? payload.pointers : payload.gamepads;
    return Array.isArray(value) && value.length > 0;
  }

  // browser/source-types.ts
  function windowUsable(target) {
    return target.document.visibilityState === "visible" && target.document.hasFocus();
  }

  // browser/controls-source.ts
  var keyboardButtons = /* @__PURE__ */ new Map([
    ["ArrowUp", "up"],
    ["ArrowDown", "down"],
    ["ArrowLeft", "left"],
    ["ArrowRight", "right"],
    ["KeyZ", "south"],
    ["KeyX", "east"],
    ["KeyC", "west"],
    ["KeyV", "north"],
    ["KeyQ", "leftBumper"],
    ["KeyE", "rightBumper"],
    ["ShiftLeft", "leftTrigger"],
    ["ControlLeft", "rightTrigger"],
    ["Enter", "start"],
    ["Tab", "select"]
  ]);
  var gamepadButtons = Object.freeze([
    [12, "up"],
    [13, "down"],
    [14, "left"],
    [15, "right"],
    [0, "south"],
    [1, "east"],
    [2, "west"],
    [3, "north"],
    [4, "leftBumper"],
    [5, "rightBumper"],
    [6, "leftTrigger"],
    [7, "rightTrigger"],
    [9, "start"],
    [8, "select"]
  ]);
  var GAMEPAD_DOWN_THRESHOLD = 5e5;
  function normalizedButtonValue(gamepad, index) {
    const value = gamepad.buttons[index]?.value ?? 0;
    return Math.round(Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)) * 1e6);
  }
  function sampleGamepad(gamepad) {
    return new Set(gamepadButtons.filter(([index]) => normalizedButtonValue(gamepad, index) >= GAMEPAD_DOWN_THRESHOLD).map(([, button]) => button));
  }
  function deepestActiveElement(document) {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement != null) active = active.shadowRoot.activeElement;
    return active;
  }
  function composedParent(element) {
    if (element.parentElement !== null) return element.parentElement;
    const root = element.getRootNode();
    return root instanceof ShadowRoot ? root.host : null;
  }
  function isBlockedElement(element) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement || element instanceof HTMLButtonElement) return true;
    if (element instanceof HTMLAnchorElement && element.hasAttribute("href")) return true;
    return element instanceof HTMLElement && element.isContentEditable;
  }
  function keyboardCaptureAvailable(target) {
    if (!windowUsable(target)) return false;
    for (let element = deepestActiveElement(target.document); element !== null; element = composedParent(element)) {
      if (isBlockedElement(element)) return false;
    }
    return true;
  }
  function sameSet(left, right) {
    return left.size === right.size && [...left].every((button) => right.has(button));
  }
  function createControlsInputSource(target) {
    let subscribed = false;
    const read = typeof target.navigator.getGamepads === "function" ? target.navigator.getGamepads.bind(target.navigator) : null;
    return Object.freeze({
      start(emit) {
        if (subscribed) throw new TypeError("Controls input source already started");
        subscribed = true;
        let active = true;
        let usable = null;
        let captureAvailable = null;
        let frame = null;
        const keyboardDown = /* @__PURE__ */ new Set();
        const trackedGamepads = /* @__PURE__ */ new Map();
        let gamepadDown = /* @__PURE__ */ new Set();
        let effective = /* @__PURE__ */ new Set();
        const send = (change) => {
          if (active) emit(change);
        };
        const ordered = (buttons) => Object.freeze(CONTROLS_BUTTONS_V1.filter((button) => buttons.has(button)));
        const aggregateGamepads = () => {
          const aggregate = /* @__PURE__ */ new Set();
          for (const pressed of trackedGamepads.values()) for (const button of pressed) aggregate.add(button);
          return aggregate;
        };
        const nextEffective = () => /* @__PURE__ */ new Set([...keyboardDown, ...gamepadDown]);
        const state = () => send({ kind: "state", payload: { down: ordered(effective) } });
        const applyEffective = (physicalButtons, alwaysState = false) => {
          const previous = effective;
          const next = nextEffective();
          const changed = !sameSet(previous, next);
          effective = next;
          if (changed || alwaysState) state();
          if (!changed || physicalButtons === void 0) return;
          for (const button of CONTROLS_BUTTONS_V1) {
            if (!physicalButtons.has(button) || previous.has(button) === next.has(button)) continue;
            send({ kind: "event", payload: { action: next.has(button) ? "down" : "up", button, repeat: false } });
          }
        };
        const stopPolling = () => {
          if (frame !== null) target.cancelAnimationFrame(frame);
          frame = null;
        };
        const baselineGamepads = () => {
          trackedGamepads.clear();
          if (read !== null) for (const pad of read()) {
            if (pad && pad.connected && pad.mapping === "standard") trackedGamepads.set(pad.index, sampleGamepad(pad));
          }
          gamepadDown = aggregateGamepads();
        };
        const poll = () => {
          if (!active || usable !== true || read === null) return;
          const seen = /* @__PURE__ */ new Set();
          const physicalButtons = /* @__PURE__ */ new Set();
          for (const pad of read()) {
            if (!pad || !pad.connected || pad.mapping !== "standard") continue;
            seen.add(pad.index);
            const next = sampleGamepad(pad);
            const previous = trackedGamepads.get(pad.index);
            trackedGamepads.set(pad.index, next);
            if (previous === void 0) continue;
            for (const button of CONTROLS_BUTTONS_V1) if (previous.has(button) !== next.has(button)) physicalButtons.add(button);
          }
          for (const [index, previous] of trackedGamepads) {
            if (seen.has(index)) continue;
            trackedGamepads.delete(index);
            for (const button of previous) physicalButtons.add(button);
          }
          const previousGamepadDown = gamepadDown;
          gamepadDown = aggregateGamepads();
          if (!sameSet(previousGamepadDown, gamepadDown)) applyEffective(physicalButtons);
          frame = target.requestAnimationFrame(poll);
        };
        const reconcileWindow = () => {
          const next = windowUsable(target);
          if (next === usable) return;
          usable = next;
          stopPolling();
          keyboardDown.clear();
          trackedGamepads.clear();
          gamepadDown = /* @__PURE__ */ new Set();
          captureAvailable = next ? keyboardCaptureAvailable(target) : false;
          if (next) baselineGamepads();
          applyEffective(void 0, true);
          if (next && read !== null) frame = target.requestAnimationFrame(poll);
        };
        const reconcileCapture = () => {
          if (usable !== true) return;
          const next = keyboardCaptureAvailable(target);
          if (next === captureAvailable) return;
          const previous = captureAvailable;
          captureAvailable = next;
          if (previous === true && !next) {
            keyboardDown.clear();
            applyEffective();
          }
        };
        const keydown = (event) => {
          const button = keyboardButtons.get(event.code);
          if (captureAvailable !== true || !event.isTrusted || button === void 0) return;
          if (event.cancelable) event.preventDefault();
          if (!keyboardDown.has(button)) {
            keyboardDown.add(button);
            const previous = effective;
            applyEffective();
            if (!previous.has(button) && effective.has(button)) {
              send({ kind: "event", payload: { action: "down", button, repeat: false } });
            }
            return;
          }
          if (event.repeat && !gamepadDown.has(button)) {
            send({ kind: "event", payload: { action: "down", button, repeat: true } });
          }
        };
        const keyup = (event) => {
          const button = keyboardButtons.get(event.code);
          if (captureAvailable !== true || !event.isTrusted || button === void 0 || !keyboardDown.delete(button)) return;
          const previous = effective;
          applyEffective();
          if (previous.has(button) && !effective.has(button)) {
            send({ kind: "event", payload: { action: "up", button, repeat: false } });
          }
        };
        const focusout = () => queueMicrotask(reconcileCapture);
        target.addEventListener("focus", reconcileWindow);
        target.addEventListener("blur", reconcileWindow);
        target.addEventListener("keydown", keydown);
        target.addEventListener("keyup", keyup);
        target.document.addEventListener("focusin", reconcileCapture);
        target.document.addEventListener("focusout", focusout);
        target.document.addEventListener("visibilitychange", reconcileWindow);
        reconcileWindow();
        return () => {
          if (!active) return;
          active = false;
          subscribed = false;
          stopPolling();
          target.removeEventListener("focus", reconcileWindow);
          target.removeEventListener("blur", reconcileWindow);
          target.removeEventListener("keydown", keydown);
          target.removeEventListener("keyup", keyup);
          target.document.removeEventListener("focusin", reconcileCapture);
          target.document.removeEventListener("focusout", focusout);
          target.document.removeEventListener("visibilitychange", reconcileWindow);
          keyboardDown.clear();
          trackedGamepads.clear();
        };
      }
    });
  }

  // browser/gamepad-source.ts
  var buttonNames = Object.freeze([
    "south",
    "east",
    "west",
    "north",
    "leftBumper",
    "rightBumper",
    "leftTrigger",
    "rightTrigger",
    "select",
    "start",
    "leftStick",
    "rightStick",
    "dpadUp",
    "dpadDown",
    "dpadLeft",
    "dpadRight",
    "home"
  ]);
  function normalized(value, minimum, maximum) {
    return Math.round(Math.max(minimum, Math.min(maximum, Number.isFinite(value) ? value : 0)) * 1e6);
  }
  function sample(gamepad, canonicalId) {
    const value = (index) => normalized(gamepad.buttons[index]?.value ?? 0, 0, 1);
    const buttons = Object.freeze({
      south: value(0),
      east: value(1),
      west: value(2),
      north: value(3),
      leftBumper: value(4),
      rightBumper: value(5),
      leftTrigger: value(6),
      rightTrigger: value(7),
      select: value(8),
      start: value(9),
      leftStick: value(10),
      rightStick: value(11),
      dpadUp: value(12),
      dpadDown: value(13),
      dpadLeft: value(14),
      dpadRight: value(15),
      home: value(16)
    });
    return Object.freeze({
      gamepadId: canonicalId,
      axes: Object.freeze({
        leftX: normalized(gamepad.axes[0] ?? 0, -1, 1),
        leftY: normalized(gamepad.axes[1] ?? 0, -1, 1),
        rightX: normalized(gamepad.axes[2] ?? 0, -1, 1),
        rightY: normalized(gamepad.axes[3] ?? 0, -1, 1)
      }),
      buttons
    });
  }
  function pressedOf(value) {
    return new Set(buttonNames.filter((name) => value.buttons[name] >= 5e5));
  }
  function same(left, right) {
    return buttonNames.every((name) => left.buttons[name] === right.buttons[name]) && left.axes.leftX === right.axes.leftX && left.axes.leftY === right.axes.leftY && left.axes.rightX === right.axes.rightX && left.axes.rightY === right.axes.rightY;
  }
  function createGamepadInputSource(target) {
    let subscribed = false;
    const read = typeof target.navigator.getGamepads === "function" ? target.navigator.getGamepads.bind(target.navigator) : null;
    return Object.freeze({
      start(emit) {
        if (subscribed) throw new TypeError("Gamepad input source already started");
        subscribed = true;
        let active = true;
        let usable = null;
        let frame = null;
        let nextId = 1;
        const gamepads = /* @__PURE__ */ new Map();
        const send = (change) => {
          if (active) emit(change);
        };
        const state = () => send({ kind: "state", channel: "gamepad.state", payload: { gamepads: Object.freeze([...gamepads.values()].map(({ sample: sample2 }) => sample2).sort((a, b) => a.gamepadId - b.gamepadId)) } });
        const stopPolling = () => {
          if (frame !== null) target.cancelAnimationFrame(frame);
          frame = null;
        };
        const baseline = () => {
          gamepads.clear();
          if (read === null) return;
          for (const pad of read()) {
            if (!pad || !pad.connected || pad.mapping !== "standard" || gamepads.size >= 16) continue;
            const value = sample(pad, nextId++);
            gamepads.set(pad.index, { canonicalId: value.gamepadId, sample: value, pressed: pressedOf(value) });
          }
        };
        const poll = () => {
          if (!active || usable !== true || read === null) return;
          const seen = /* @__PURE__ */ new Set();
          let changed = false;
          const crossings = [];
          for (const pad of read()) {
            if (!pad || !pad.connected || pad.mapping !== "standard") continue;
            let tracked = gamepads.get(pad.index);
            if (tracked === void 0 && gamepads.size >= 16) continue;
            seen.add(pad.index);
            if (tracked === void 0) {
              const value2 = sample(pad, nextId++);
              gamepads.set(pad.index, { canonicalId: value2.gamepadId, sample: value2, pressed: pressedOf(value2) });
              changed = true;
              continue;
            }
            const value = sample(pad, tracked.canonicalId);
            const pressed = pressedOf(value);
            if (!same(value, tracked.sample)) changed = true;
            for (const button of buttonNames) if (pressed.has(button) !== tracked.pressed.has(button)) {
              crossings.push({ tracked, button, action: pressed.has(button) ? "down" : "up" });
            }
            tracked.sample = value;
            tracked.pressed = pressed;
          }
          for (const [index] of gamepads) if (!seen.has(index)) {
            gamepads.delete(index);
            changed = true;
          }
          if (changed) state();
          crossings.sort((a, b) => a.tracked.canonicalId - b.tracked.canonicalId || buttonNames.indexOf(a.button) - buttonNames.indexOf(b.button));
          for (const crossing of crossings) send({ kind: "event", channel: "gamepad.event", payload: {
            action: crossing.action,
            gamepadId: crossing.tracked.canonicalId,
            button: crossing.button,
            value: crossing.tracked.sample.buttons[crossing.button]
          } });
          frame = target.requestAnimationFrame(poll);
        };
        const reconcile = () => {
          const next = windowUsable(target);
          if (next === usable) return;
          usable = next;
          stopPolling();
          gamepads.clear();
          if (next) baseline();
          state();
          if (next && read !== null) frame = target.requestAnimationFrame(poll);
        };
        target.addEventListener("focus", reconcile);
        target.addEventListener("blur", reconcile);
        target.document.addEventListener("visibilitychange", reconcile);
        reconcile();
        return () => {
          if (!active) return;
          active = false;
          subscribed = false;
          stopPolling();
          target.removeEventListener("focus", reconcile);
          target.removeEventListener("blur", reconcile);
          target.document.removeEventListener("visibilitychange", reconcile);
          gamepads.clear();
        };
      }
    });
  }

  // browser/keyboard-source.ts
  var keyboardCodes = new Set(KEYBOARD_CODES_V1);
  function createKeyboardInputSource(target) {
    let subscribed = false;
    return Object.freeze({
      start(emit) {
        if (subscribed) throw new TypeError("Keyboard input source already started");
        subscribed = true;
        let active = true;
        let usable = null;
        const held = /* @__PURE__ */ new Set();
        const send = (change) => {
          if (active) emit(change);
        };
        const state = () => send({ kind: "state", channel: "keyboard.state", payload: { down: Object.freeze([...held].sort()) } });
        const reconcile = () => {
          const next = windowUsable(target);
          if (next === usable) return;
          usable = next;
          held.clear();
          state();
        };
        const keydown = (event) => {
          if (usable !== true || !event.isTrusted || !keyboardCodes.has(event.code)) return;
          const code = event.code;
          const repeat = held.has(code);
          if (!repeat) {
            held.add(code);
            state();
          }
          send({ kind: "event", channel: "keyboard.event", payload: { action: "down", code, repeat } });
        };
        const keyup = (event) => {
          if (usable !== true || !event.isTrusted || !keyboardCodes.has(event.code)) return;
          const code = event.code;
          if (!held.delete(code)) return;
          state();
          send({ kind: "event", channel: "keyboard.event", payload: { action: "up", code, repeat: false } });
        };
        target.addEventListener("focus", reconcile);
        target.addEventListener("blur", reconcile);
        target.addEventListener("keydown", keydown);
        target.addEventListener("keyup", keyup);
        target.document.addEventListener("visibilitychange", reconcile);
        reconcile();
        return () => {
          if (!active) return;
          active = false;
          subscribed = false;
          target.removeEventListener("focus", reconcile);
          target.removeEventListener("blur", reconcile);
          target.removeEventListener("keydown", keydown);
          target.removeEventListener("keyup", keyup);
          target.document.removeEventListener("visibilitychange", reconcile);
          held.clear();
        };
      }
    });
  }

  // browser/pointer-source.ts
  var pointerButtons = Object.freeze([
    [1, "primary"],
    [4, "auxiliary"],
    [2, "secondary"],
    [8, "back"],
    [16, "forward"]
  ]);
  function clampInteger(value) {
    if (!Number.isFinite(value)) return 0;
    return Math.max(-2147483648, Math.min(2147483647, Math.round(value)));
  }
  function coordinate(value, extent) {
    return !Number.isFinite(value) || !Number.isFinite(extent) || extent <= 0 ? 0 : clampInteger(value / extent * 1e6);
  }
  function kind(value) {
    return value === "mouse" || value === "touch" || value === "pen" ? value : null;
  }
  function buttonsOf(bits) {
    return Object.freeze(pointerButtons.filter(([bit]) => (bits & bit) !== 0).map(([, button]) => button));
  }
  function same2(left, right) {
    return left.pointerId === right.pointerId && left.kind === right.kind && left.x === right.x && left.y === right.y && left.buttons.length === right.buttons.length && left.buttons.every((value, index) => value === right.buttons[index]);
  }
  function createPointerInputSource(target) {
    let subscribed = false;
    return Object.freeze({
      start(emit) {
        if (subscribed) throw new TypeError("Pointer input source already started");
        subscribed = true;
        let active = true;
        let usable = null;
        let available = false;
        let nextPointerId = 1;
        const pointers = /* @__PURE__ */ new Map();
        const send = (change) => {
          if (active) emit(change);
        };
        const state = () => send({ kind: "state", channel: "pointer.state", payload: { pointers: Object.freeze([...pointers.values()].map(({ sample: sample2 }) => sample2).sort((a, b) => a.pointerId - b.pointerId)) } });
        const surfaceValid = () => target.innerWidth > 0 && target.innerHeight > 0;
        const reconcile = () => {
          const next = windowUsable(target);
          if (next === usable) return;
          usable = next;
          pointers.clear();
          available = next && surfaceValid();
          state();
        };
        const resize = () => {
          if (usable !== true) return;
          const next = surfaceValid();
          if (next === available) return;
          available = next;
          pointers.clear();
          state();
        };
        const pointer = (event) => {
          if (usable !== true || !available || !event.isTrusted) return;
          const pointerKind = kind(event.pointerType);
          if (pointerKind === null) return;
          let tracked = pointers.get(event.pointerId);
          if (tracked === void 0) {
            if (event.type !== "pointerdown" || pointers.size >= 32) return;
            const sample2 = Object.freeze({
              pointerId: nextPointerId++,
              kind: pointerKind,
              x: coordinate(event.clientX, target.innerWidth),
              y: coordinate(event.clientY, target.innerHeight),
              buttons: Object.freeze([])
            });
            tracked = { canonicalId: sample2.pointerId, kind: pointerKind, sample: sample2 };
            pointers.set(event.pointerId, tracked);
          }
          const nextButtons = event.type === "pointercancel" ? Object.freeze([]) : buttonsOf(event.buttons);
          const next = Object.freeze({
            pointerId: tracked.canonicalId,
            kind: tracked.kind,
            x: coordinate(event.clientX, target.innerWidth),
            y: coordinate(event.clientY, target.innerHeight),
            buttons: nextButtons
          });
          if (event.type === "pointercancel") {
            pointers.delete(event.pointerId);
            state();
            send({ kind: "event", channel: "pointer.event", payload: { action: "cancel", pointer: next, button: null } });
            return;
          }
          const ordered = pointerButtons.map(([, button]) => button);
          const removed = ordered.filter((button) => tracked.sample.buttons.includes(button) && !nextButtons.includes(button));
          const added = ordered.filter((button) => !tracked.sample.buttons.includes(button) && nextButtons.includes(button));
          const changed = !same2(tracked.sample, next);
          tracked.sample = next;
          if (nextButtons.length === 0) pointers.delete(event.pointerId);
          if (changed) state();
          for (const button of removed) send({ kind: "event", channel: "pointer.event", payload: { action: "up", pointer: next, button } });
          for (const button of added) send({ kind: "event", channel: "pointer.event", payload: { action: "down", pointer: next, button } });
        };
        target.addEventListener("focus", reconcile);
        target.addEventListener("blur", reconcile);
        target.addEventListener("resize", resize);
        target.addEventListener("pointerdown", pointer);
        target.addEventListener("pointermove", pointer);
        target.addEventListener("pointerup", pointer);
        target.addEventListener("pointercancel", pointer);
        target.document.addEventListener("visibilitychange", reconcile);
        reconcile();
        return () => {
          if (!active) return;
          active = false;
          subscribed = false;
          target.removeEventListener("focus", reconcile);
          target.removeEventListener("blur", reconcile);
          target.removeEventListener("resize", resize);
          target.removeEventListener("pointerdown", pointer);
          target.removeEventListener("pointermove", pointer);
          target.removeEventListener("pointerup", pointer);
          target.removeEventListener("pointercancel", pointer);
          target.document.removeEventListener("visibilitychange", reconcile);
          pointers.clear();
        };
      }
    });
  }

  // browser/device-input.browser.ts
  var owners = /* @__PURE__ */ new WeakMap();
  var DeviceInputElement = class extends HTMLElement {
    context;
    stopSource;
    refreshTimer;
    refresh;
    claimed = false;
    receiveRenderContext(context) {
      if (context === null || typeof context !== "object" || typeof context.emitCustomEvent !== "function") {
        throw new TypeError("Invalid WebPresentationContext");
      }
      this.context = context;
      this.startIfReady();
    }
    connectedCallback() {
      this.startIfReady();
    }
    disconnectedCallback() {
      this.stopSource?.();
      this.stopSource = void 0;
      this.stopRefresh();
      const target = this.ownerDocument.defaultView;
      if (target !== null && this.claimed) {
        const registry = owners.get(target);
        if (registry?.get(this.device) === this) registry.delete(this.device);
      }
      this.claimed = false;
    }
    startIfReady() {
      if (!this.isConnected || this.context === void 0 || this.stopSource !== void 0) return;
      const target = this.ownerDocument.defaultView;
      if (target === null) return;
      const registry = owners.get(target) ?? /* @__PURE__ */ new Map();
      if (!owners.has(target)) owners.set(target, registry);
      const current = registry.get(this.device);
      if (current !== void 0 && current !== this) {
        this.setAttribute("data-input-disabled", "duplicate");
        return;
      }
      this.removeAttribute("data-input-disabled");
      registry.set(this.device, this);
      this.claimed = true;
      this.stopSource = this.source(target).start((change) => this.emit(change));
    }
    emit(change) {
      this.context?.emitCustomEvent(
        change.kind === "state" ? "input.state" : "input.event",
        change.payload,
        { broadcast: true, channel: change.channel }
      );
      if (change.kind !== "state") return;
      if (!isNonEmptyDeviceState(change.channel, change.payload)) {
        this.stopRefresh();
        return;
      }
      this.refresh = { channel: change.channel, payload: change.payload };
      if (this.refreshTimer !== void 0) return;
      this.refreshTimer = setInterval(() => {
        const current = this.refresh;
        if (current !== void 0 && this.isConnected) {
          this.context?.emitCustomEvent("input.state", current.payload, { broadcast: true, channel: current.channel });
        }
      }, DEVICE_STATE_REFRESH_MS);
    }
    stopRefresh() {
      if (this.refreshTimer !== void 0) clearInterval(this.refreshTimer);
      this.refreshTimer = void 0;
      this.refresh = void 0;
    }
  };
  var GameKeyboardInputElement = class extends DeviceInputElement {
    device = "keyboard";
    source(target) {
      return createKeyboardInputSource(target);
    }
  };
  var GamePointerInputElement = class extends DeviceInputElement {
    device = "pointer";
    source(target) {
      return createPointerInputSource(target);
    }
  };
  var GameGamepadInputElement = class extends DeviceInputElement {
    device = "gamepad";
    source(target) {
      return createGamepadInputSource(target);
    }
  };
  var GameControlsInputElement = class extends HTMLElement {
    context;
    stopSource;
    refreshTimer;
    refresh;
    claimed = false;
    receiveRenderContext(context) {
      if (context === null || typeof context !== "object" || typeof context.emitCustomEvent !== "function") {
        throw new TypeError("Invalid WebPresentationContext");
      }
      this.context = context;
      this.startIfReady();
    }
    connectedCallback() {
      this.startIfReady();
    }
    disconnectedCallback() {
      this.stopSource?.();
      this.stopSource = void 0;
      this.stopRefresh();
      const target = this.ownerDocument.defaultView;
      if (target !== null && this.claimed) {
        const registry = owners.get(target);
        if (registry?.get("controls") === this) registry.delete("controls");
      }
      this.claimed = false;
    }
    startIfReady() {
      if (!this.isConnected || this.context === void 0 || this.stopSource !== void 0) return;
      const target = this.ownerDocument.defaultView;
      if (target === null) return;
      const registry = owners.get(target) ?? /* @__PURE__ */ new Map();
      if (!owners.has(target)) owners.set(target, registry);
      const current = registry.get("controls");
      if (current !== void 0 && current !== this) {
        this.setAttribute("data-input-disabled", "duplicate");
        return;
      }
      this.removeAttribute("data-input-disabled");
      registry.set("controls", this);
      this.claimed = true;
      this.stopSource = createControlsInputSource(target).start((change) => this.emit(change));
    }
    emit(change) {
      this.context?.emitCustomEvent(
        change.kind === "state" ? "input.state" : "input.event",
        change.payload,
        { broadcast: "top-frame", channel: change.kind === "state" ? "controls.state" : "controls.event" }
      );
      if (change.kind !== "state") return;
      if (change.payload.down.length === 0) {
        this.stopRefresh();
        return;
      }
      this.refresh = change.payload;
      if (this.refreshTimer !== void 0) return;
      this.refreshTimer = setInterval(() => {
        if (this.refresh !== void 0 && this.isConnected) {
          this.context?.emitCustomEvent("input.state", this.refresh, { broadcast: "top-frame", channel: "controls.state" });
        }
      }, CONTROLS_STATE_REFRESH_MS);
    }
    stopRefresh() {
      if (this.refreshTimer !== void 0) clearInterval(this.refreshTimer);
      this.refreshTimer = void 0;
      this.refresh = void 0;
    }
  };
  customElements.define("game-keyboard-input", GameKeyboardInputElement);
  customElements.define("game-pointer-input", GamePointerInputElement);
  customElements.define("game-gamepad-input", GameGamepadInputElement);
  customElements.define("game-controls-input", GameControlsInputElement);
})();
