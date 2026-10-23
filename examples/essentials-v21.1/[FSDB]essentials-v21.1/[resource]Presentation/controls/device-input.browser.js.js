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
  var EMPTY_CONTROLS_STATE_V1 = Object.freeze({
    down: Object.freeze([])
  });
  var CONTROLS_STATE_REFRESH_MS = 1e3;

  // src/controls-machine.ts
  var CONTROLS_KEYBOARD_CODE_V1 = Object.freeze({
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    KeyZ: "south",
    KeyX: "east",
    KeyC: "west",
    KeyV: "north",
    KeyQ: "leftBumper",
    KeyE: "rightBumper",
    ShiftLeft: "leftTrigger",
    ControlLeft: "rightTrigger",
    Enter: "start",
    Tab: "select"
  });
  var GAMEPAD_INDEX = Object.freeze([
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
    null,
    null,
    "up",
    "down",
    "left",
    "right",
    null
  ]);
  var CONTROLS_GAMEPAD_PRESS_THRESHOLD = 5e5;
  function controlsButtonFromKeyboardCode(code) {
    return CONTROLS_KEYBOARD_CODE_V1[code] ?? null;
  }
  function controlsButtonFromGamepadIndex(index) {
    return GAMEPAD_INDEX[index] ?? null;
  }
  function gamepadControlPressed(raw) {
    const normalized2 = Math.round(Math.max(0, Math.min(1, Number.isFinite(raw) ? raw : 0)) * 1e6);
    return normalized2 >= CONTROLS_GAMEPAD_PRESS_THRESHOLD;
  }
  var NONE = Object.freeze({ state: null, events: Object.freeze([]) });
  function edge(action, button, repeat) {
    return Object.freeze({ action, button, repeat });
  }
  function statePayload(down) {
    if (down.length === 0) return EMPTY_CONTROLS_STATE_V1;
    return Object.freeze({ down: Object.freeze([...down]) });
  }
  function publish(state, events) {
    if (state === null && events.length === 0) return NONE;
    return Object.freeze({ state, events: Object.freeze([...events]) });
  }
  function sameDown(left, right) {
    return left.length === right.length && left.every((button, index) => button === right[index]);
  }
  function pressedSet(pressed) {
    const result = /* @__PURE__ */ new Set();
    for (const button of CONTROLS_BUTTONS_V1) if (pressed.includes(button)) result.add(button);
    return result;
  }
  function createControlsMachine() {
    let windowUsable2 = false;
    let keyboardCapture = false;
    const keyboard = /* @__PURE__ */ new Set();
    let pads = /* @__PURE__ */ new Map();
    const gamepadDown = (button) => {
      for (const pressed of pads.values()) if (pressed.has(button)) return true;
      return false;
    };
    const effectiveDown = () => CONTROLS_BUTTONS_V1.filter((button) => keyboard.has(button) || gamepadDown(button));
    const changedState = (prev) => {
      const next = effectiveDown();
      return sameDown(prev, next) ? null : statePayload(next);
    };
    return Object.freeze({
      get windowUsable() {
        return windowUsable2;
      },
      get keyboardCapture() {
        return keyboardCapture;
      },
      keydown(button, domRepeat) {
        if (!keyboardCapture || !CONTROLS_BUTTONS_V1.includes(button)) return NONE;
        if (!keyboard.has(button)) {
          const wasEffective = gamepadDown(button);
          keyboard.add(button);
          if (wasEffective) return NONE;
          return publish(statePayload(effectiveDown()), [edge("down", button, false)]);
        }
        if (domRepeat === true && !gamepadDown(button)) return publish(null, [edge("down", button, true)]);
        return NONE;
      },
      keyup(button) {
        if (!keyboardCapture || !keyboard.delete(button)) return NONE;
        if (gamepadDown(button)) return NONE;
        return publish(statePayload(effectiveDown()), [edge("up", button, false)]);
      },
      applyGamepadFrame(samples) {
        if (!windowUsable2) return NONE;
        const prev = effectiveDown();
        const incoming = /* @__PURE__ */ new Map();
        for (const sample2 of samples) {
          if (!Number.isInteger(sample2.index) || sample2.index < 0) continue;
          incoming.set(sample2.index, pressedSet(sample2.pressed));
        }
        const physicalPress = /* @__PURE__ */ new Set();
        const physicalRelease = /* @__PURE__ */ new Set();
        const nextPads = /* @__PURE__ */ new Map();
        for (const [index, pressed] of incoming) {
          const existing = pads.get(index);
          nextPads.set(index, pressed);
          if (existing === void 0) continue;
          for (const button of CONTROLS_BUTTONS_V1) {
            const before = existing.has(button);
            const after = pressed.has(button);
            if (!before && after) physicalPress.add(button);
            else if (before && !after) physicalRelease.add(button);
          }
        }
        for (const [index, pressed] of pads) {
          if (incoming.has(index)) continue;
          for (const button of pressed) physicalRelease.add(button);
        }
        pads = nextPads;
        const next = effectiveDown();
        const events = [];
        for (const button of CONTROLS_BUTTONS_V1) {
          const was = prev.includes(button);
          const now = next.includes(button);
          if (!was && now && physicalPress.has(button)) events.push(edge("down", button, false));
          else if (was && !now && physicalRelease.has(button)) events.push(edge("up", button, false));
        }
        return publish(sameDown(prev, next) ? null : statePayload(next), events);
      },
      setWindowUsable(usable, baseline = []) {
        if (usable === windowUsable2) return NONE;
        const prev = effectiveDown();
        windowUsable2 = usable;
        keyboardCapture = false;
        keyboard.clear();
        pads = /* @__PURE__ */ new Map();
        if (usable) {
          for (const sample2 of baseline) {
            if (!Number.isInteger(sample2.index) || sample2.index < 0) continue;
            pads.set(sample2.index, pressedSet(sample2.pressed));
          }
        }
        return publish(changedState(prev), []);
      },
      setKeyboardCapture(available) {
        const next = windowUsable2 && available;
        if (next === keyboardCapture) return NONE;
        keyboardCapture = next;
        if (next || keyboard.size === 0) return NONE;
        const prev = effectiveDown();
        keyboard.clear();
        return publish(changedState(prev), []);
      }
    });
  }

  // browser/source-types.ts
  function windowUsable(target) {
    return target.document.visibilityState === "visible" && target.document.hasFocus();
  }

  // browser/controls-source.ts
  function deepestActiveElement(document) {
    let current = document.activeElement;
    const seen = /* @__PURE__ */ new Set();
    while (current !== null && !seen.has(current)) {
      seen.add(current);
      const inner = current.shadowRoot?.activeElement ?? null;
      if (inner === null) return current;
      current = inner;
    }
    return current;
  }
  function composedParent(element) {
    if (element.parentElement !== null) return element.parentElement;
    const root = element.getRootNode();
    return root instanceof ShadowRoot ? root.host : null;
  }
  function blockedFocusTarget(element) {
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement || element instanceof HTMLButtonElement) return true;
    if (element instanceof HTMLAnchorElement && element.hasAttribute("href")) return true;
    return element instanceof HTMLElement && element.isContentEditable;
  }
  function keyboardCaptureBlocked(document) {
    let node = deepestActiveElement(document);
    const seen = /* @__PURE__ */ new Set();
    while (node !== null && !seen.has(node)) {
      seen.add(node);
      if (blockedFocusTarget(node)) return true;
      node = composedParent(node);
    }
    return false;
  }
  function readPads(target) {
    const read = target.navigator.getGamepads;
    if (typeof read !== "function") return [];
    const samples = [];
    const seen = /* @__PURE__ */ new Set();
    for (const pad of read.call(target.navigator)) {
      if (pad === null || !pad.connected || pad.mapping !== "standard" || seen.has(pad.index)) continue;
      seen.add(pad.index);
      const pressed = [];
      for (let index = 0; index < pad.buttons.length; index += 1) {
        const button = controlsButtonFromGamepadIndex(index);
        if (button !== null && gamepadControlPressed(pad.buttons[index]?.value ?? 0)) pressed.push(button);
      }
      samples.push({ index: pad.index, pressed });
    }
    return samples;
  }
  function emitPublication(active, emit, publication) {
    if (!active() || publication.state === null && publication.events.length === 0) return;
    emit(publication);
  }
  function createControlsInputSource(target) {
    let subscribed = false;
    return Object.freeze({
      start(emit) {
        if (subscribed) throw new TypeError("Controls input source already started");
        subscribed = true;
        let active = true;
        let frame = null;
        const machine = createControlsMachine();
        const send = (publication) => emitPublication(() => active, emit, publication);
        const stopPolling = () => {
          if (frame !== null) target.cancelAnimationFrame(frame);
          frame = null;
        };
        const poll = () => {
          frame = null;
          if (!active || !machine.windowUsable) return;
          send(machine.applyGamepadFrame(readPads(target)));
          if (!active || !machine.windowUsable) return;
          frame = target.requestAnimationFrame(poll);
        };
        const reconcile = () => {
          if (!active) return;
          const nextWindow = windowUsable(target);
          const nextCapture = nextWindow && !keyboardCaptureBlocked(target.document);
          if (nextWindow !== machine.windowUsable) {
            stopPolling();
            send(machine.setWindowUsable(nextWindow, nextWindow ? readPads(target) : []));
            if (active && machine.windowUsable) frame = target.requestAnimationFrame(poll);
          }
          if (!active) return;
          if (nextCapture !== machine.keyboardCapture) send(machine.setKeyboardCapture(nextCapture));
        };
        const keydown = (event) => {
          if (!active || event.isTrusted !== true) return;
          const button = controlsButtonFromKeyboardCode(event.code);
          if (button === null) return;
          if (machine.keyboardCapture && event.cancelable) event.preventDefault();
          if (!machine.keyboardCapture) return;
          send(machine.keydown(button, event.repeat));
        };
        const keyup = (event) => {
          if (!active || event.isTrusted !== true) return;
          const button = controlsButtonFromKeyboardCode(event.code);
          if (button === null || !machine.keyboardCapture) return;
          send(machine.keyup(button));
        };
        const focusout = () => {
          queueMicrotask(reconcile);
        };
        target.addEventListener("keydown", keydown);
        target.addEventListener("keyup", keyup);
        target.addEventListener("focus", reconcile);
        target.addEventListener("blur", reconcile);
        target.document.addEventListener("focusin", reconcile);
        target.document.addEventListener("focusout", focusout);
        target.document.addEventListener("visibilitychange", reconcile);
        reconcile();
        return () => {
          if (!active) return;
          active = false;
          subscribed = false;
          stopPolling();
          target.removeEventListener("keydown", keydown);
          target.removeEventListener("keyup", keyup);
          target.removeEventListener("focus", reconcile);
          target.removeEventListener("blur", reconcile);
          target.document.removeEventListener("focusin", reconcile);
          target.document.removeEventListener("focusout", focusout);
          target.document.removeEventListener("visibilitychange", reconcile);
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
    refreshPayload;
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
      this.stopSource = createControlsInputSource(target).start((publication) => this.emit(publication));
    }
    emit(publication) {
      if (publication.state !== null) {
        const state = publication.state;
        this.context?.emitCustomEvent("input.state", state, { broadcast: "top-frame", channel: "controls.state" });
        if (state.down.length === 0) this.stopRefresh();
        else {
          this.refreshPayload = state;
          if (this.refreshTimer === void 0) {
            this.refreshTimer = setInterval(() => {
              const current = this.refreshPayload;
              if (current !== void 0 && this.isConnected) {
                this.context?.emitCustomEvent("input.state", current, { broadcast: "top-frame", channel: "controls.state" });
              }
            }, CONTROLS_STATE_REFRESH_MS);
          }
        }
      }
      for (const event of publication.events) {
        this.context?.emitCustomEvent("input.event", event, { broadcast: "top-frame", channel: "controls.event" });
      }
    }
    stopRefresh() {
      if (this.refreshTimer !== void 0) clearInterval(this.refreshTimer);
      this.refreshTimer = void 0;
      this.refreshPayload = void 0;
    }
  };
  customElements.define("game-keyboard-input", GameKeyboardInputElement);
  customElements.define("game-pointer-input", GamePointerInputElement);
  customElements.define("game-gamepad-input", GameGamepadInputElement);
  customElements.define("game-controls-input", GameControlsInputElement);
})();
