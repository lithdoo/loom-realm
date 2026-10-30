# game-controls-input CustomEvent input source proposal

> Status: **Proposed / Design / Not Implemented**
> Location: `game-libs/game-common-controls/game-controls-input-custom-source.md`
> Package: `@loomrealm-game/common-controls`
> Related implementation: [Unified Controls Input Web Component](./game-controls-input.md), [Controls Input v1 qualification](../../doc/30-implementation/game-controls-input-qualification.md)
> Related contract: [Game Common Controls Input v1](../../doc/15-contracts/game-common-controls-input-v1.md)

This proposal adds a development-only synthetic input source to the existing `<game-controls-input>` component. The component listens for a DOM `CustomEvent` on its own element, converts the event into the same internal keyboard/gamepad input model used by physical devices, and lets the existing Controls Machine produce the existing `controls.state` and `controls.event` publications.

The CustomEvent is an implementation detail of the browser component. It is **not** a Subsystem event, Session Event, Presentation channel, or new Controls ABI. No Subsystem process receives the CustomEvent or needs to know whether an input came from a physical device or the test driver.

This document defines a proposed design only. It does not claim that the listener, reducer changes, build flag, or tests already exist.

## 1. Background and motivation

`game-controls-input` currently combines two physical sources:

- Keyboard: trusted DOM `keydown` / `keyup` events, subject to the component's existing focus-capture rules.
- Gamepad: `navigator.getGamepads()` polling, subject to the existing canonical Gamepad support gate.

Both sources are normalized to the same 14 `ControlsButtonV1` buttons and enter one private Controls Machine. The component publishes only:

- `controls.state` — the current effective set of held buttons.
- `controls.event` — normalized down/up edges.

A real Android handheld can expose an additional automation problem before this component receives any input: after navigation or reload, Chrome may return an empty `navigator.getGamepads()` list until a physical controller button wakes the device. ADB and CDP can inspect and control the page, but they do not manufacture a trusted physical Gamepad wake-up.

The proposed CustomEvent source allows CDP, Playwright, or another page-level test driver to exercise the **LoomRealm controls pipeline** without first waking Chrome's physical Gamepad API.

It does not replace a small number of real-hardware tests for Android input drivers, Chrome Gamepad enumeration, device mapping, or physical wake-up behavior.

### Goals

- Allow a test driver to inject normalized button state through the existing `game-controls-input` element.
- Keep the injection listener and all source bookkeeping inside the component/browser input implementation.
- Feed injected input into the same Controls Machine as physical Keyboard and Gamepad input.
- Preserve the existing keyboard/gamepad OR semantics, edge generation, State-before-Event ordering, and Top Active Frame publication.
- Keep the current `controls.state` / `controls.event` channels and payloads unchanged.
- Make the feature available in local, staging, and qualification builds while excluding it from production builds.

### Non-goals

- Do not create a virtual OS device, Android input event, trusted DOM KeyboardEvent, or browser Gamepad object.
- Do not wake, populate, or modify `navigator.getGamepads()`.
- Do not emulate raw Keyboard codes, Gamepad IDs, axes, analog pressure, or vendor-specific button layouts.
- Do not publish the CustomEvent to Session Events or forward it to a Subsystem.
- Do not add a debug input channel, public Subsystem API, Framework service, or new Controls ABI.
- Do not change the existing physical Keyboard, Gamepad, Pointer, or Controls v1 contract semantics.
- Do not modify the frozen `game-controls-input.md` normative specification as part of this proposal.

## 2. Proposed architecture

The new source is a third **private component input source**, not a third public input protocol.

```text
Physical Keyboard ──> Keyboard adapter ──────┐
                                             │
Physical Gamepad ───> Gamepad adapter ───────┤
                                             ▼
CDP / Playwright                            Controls Machine
       │                                     ▲
       ▼                                     │
CustomEvent dispatched                      │
on <game-controls-input>                    │
       │                                     │
       ▼                                     │
Component-local CustomEvent adapter ────────┘
                                             │
                                             ▼
                                  Existing publication adapter
                                             │
                                  ┌──────────┴──────────┐
                                  ▼                     ▼
                           controls.state       controls.event
                                  │                     │
                                  └──────────┬──────────┘
                                             ▼
                                       Top Active Frame
                                             │
                                             ▼
                                         Subsystem
```

The CustomEvent listener belongs to the `game-controls-input` element instance. It must not be installed on `window`, `document`, or a global event bus. The element-local target makes it possible for CDP to select the component explicitly and avoids creating a page-wide input API.

The event is consumed synchronously by the component-local adapter. It is never passed to `WebPresentationContext.emitCustomEvent`. Only the Controls Machine's ordinary publications use the existing Frame-targeted Presentation path.

## 3. DOM event contract

### 3.1 Event name and target

Proposed event name:

`loomrealm:debug-input`

The test driver dispatches the event directly on the active component element:

```js
const controls = document.querySelector("game-controls-input");

controls.dispatchEvent(new CustomEvent("loomrealm:debug-input", {
  detail: {
    version: 1,
    sourceId: "cdp-gamepad",
    device: "gamepad",
    down: ["up"]
  },
  bubbles: false,
  composed: false,
  cancelable: false
}));
```

The event is intentionally non-bubbling and non-composed. The component listens on itself; no ancestor, sibling component, Subsystem host, or other process needs to observe it.

If multiple `game-controls-input` instances exist transiently, the existing duplicate-instance rule remains authoritative: only the active instance accepts input. Dispatching to a disabled duplicate must have no effect.

### 3.2 Detail shape

Proposed closed v1 detail:

```ts
interface DebugControlsInputDetailV1 {
  readonly version: 1;
  readonly sourceId: string;
  readonly device: "keyboard" | "gamepad";
  readonly down: readonly ControlsButtonV1[];
}
```

Field semantics:

| Field | Meaning |
| --- | --- |
| `version` | Detail schema version. The initial supported value is `1`. |
| `sourceId` | Stable identity for one injected source, e.g. `cdp-keyboard` or `cdp-gamepad`. |
| `device` | Which existing input bucket the source emulates: `keyboard` or `gamepad`. |
| `down` | Complete current held-button snapshot for this source. An empty array releases/removes this source. |

Validation requirements:

- `detail` must be a plain object with exactly the documented fields.
- `version` must equal `1`.
- `sourceId` must be a non-empty, bounded identifier (proposed maximum: 64 ASCII characters, matching `[A-Za-z0-9._:-]+`).
- `device` must be exactly `keyboard` or `gamepad`.
- `down` must be an array containing only members of `CONTROLS_BUTTONS_V1`, with no duplicates and no more than 14 entries.
- The component canonicalizes the accepted button list to `CONTROLS_BUTTONS_V1` order before applying it.
- A `sourceId` is bound to one `device` while active. Changing its device without first releasing it is rejected.
- The component bounds the number of simultaneous injected sources (proposed maximum: 16).
- Invalid details are rejected atomically. They must not partially change held state or emit a partial publication.

The detail deliberately contains no raw `KeyboardEvent.code`, Gamepad index, browser Gamepad ID, axis, pressure, vendor identity, Frame ID, Activation ID, or destination channel.

### 3.3 Snapshot semantics

Each event carries the complete current state of one source, not a single down/up edge. The component compares the new snapshot with that source's previous snapshot and derives the edges.

Examples:

```js
const controls = document.querySelector("game-controls-input");

function sendGamepadState(down) {
  controls.dispatchEvent(new CustomEvent("loomrealm:debug-input", {
    detail: {
      version: 1,
      sourceId: "cdp-gamepad",
      device: "gamepad",
      down
    },
    bubbles: false,
    composed: false
  }));
}

sendGamepadState([]);                 // neutral
sendGamepadState(["up"]);             // press Up
sendGamepadState(["up", "south"]);    // hold Up and press South
sendGamepadState(["south"]);          // release Up, keep South held
sendGamepadState([]);                 // release all buttons
```

Rules:

- The first non-empty snapshot for a previously unknown `sourceId` starts from neutral and creates the corresponding down edges.
- An empty snapshot releases and removes that source. Sending an empty snapshot for an unknown source is a no-op.
- Repeating an identical snapshot is idempotent: it does not create another down edge or a keyboard repeat event.
- A source may be registered again after it has been removed with an empty snapshot.
- The automation helper must send an empty snapshot in its cleanup/finally path. Component teardown also clears its local injected-source table.
- The initial proposal does not synthesize DOM auto-repeat. All injected edge events use `repeat: false`. If deterministic repeat testing becomes necessary, it should be specified as a separate, explicit extension rather than inferred from repeated snapshots.

Snapshot input is preferred over independent `keydown` / `keyup` commands because each accepted message repairs the complete state of that source. It reduces the chance that an interrupted test sequence leaves one source with a partially updated button set.

## 4. Keyboard and Gamepad source semantics

The `device` field determines which existing input bucket receives the injected snapshot. It does not create a new public input category.

### 4.1 `device: "keyboard"`

An injected Keyboard source follows the existing `keyboardCapture` availability rules:

- It is accepted only while the component's Keyboard capture is available.
- It is blocked by the same browser-interactive focus targets as physical Keyboard input.
- When Keyboard capture transitions from available to unavailable, all injected Keyboard sources are cleared.
- Clearing due to focus/capture reconciliation updates `controls.state` as required by the existing machine, but does not synthesize `controls.event` up edges.
- Regaining Keyboard capture does not restore the old injected state. The test driver must dispatch a fresh snapshot to press again.
- Injected Keyboard input does not create a DOM `KeyboardEvent` and is not subject to `event.isTrusted`. That check remains mandatory for the physical DOM Keyboard adapter; it must not be weakened.

This makes a test that targets Keyboard semantics behave like the component's current Keyboard path without fabricating trusted browser events.

### 4.2 `device: "gamepad"`

An injected Gamepad source follows the existing Gamepad availability rules:

- It is accepted while the component's Window is usable.
- It is not blocked merely because focus is inside an HTML input, button, or other Keyboard-capture-blocked element, matching physical Gamepad behavior.
- When the Window becomes unusable, all injected sources are cleared as part of the existing Window reconciliation.
- When the Window becomes usable again, previous injected state is not restored. A fresh CustomEvent snapshot is required.
- It represents only the 14 normalized digital buttons. It does not create a browser Gamepad object and does not affect physical Gamepad enumeration or polling.

### 4.3 Unified effective state

The Controls Machine must calculate one effective button set across all physical and injected sources:

```text
effectiveDown =
    physicalKeyboardDown
 OR injectedKeyboardDown
 OR physicalGamepadDown
 OR injectedGamepadDown
```

For each button, the effective value is true while **any** eligible source holds that button.

Consequences:

- Releasing an injected source cannot release a button that is still held by a physical Keyboard or Gamepad.
- Releasing a physical source cannot release a button that is still held by an injected source.
- Two injected sources holding the same button still produce one effective held button.
- Different buttons from different sources combine into one canonical State.
- Opposing directions remain independent; this proposal does not add directional cancellation.

The implementation must not encode an injected source as a fabricated numeric Gamepad index or insert it into the browser's `navigator.getGamepads()` result. Keep injected-source identity separate from physical Gamepad identity and merge at the existing Controls Machine boundary.

## 5. Publication semantics

The CustomEvent adapter feeds the existing private Controls Machine. It does not publish directly.

For each accepted snapshot:

1. Capture the previous effective button set.
2. Replace that source's held-button snapshot.
3. Recompute the effective set across physical Keyboard, physical Gamepads, and all injected sources.
4. If the effective set changed, publish one complete `controls.state` snapshot first.
5. Then publish one `controls.event` edge for each effective transition, in `CONTROLS_BUTTONS_V1` order.

For a source snapshot that changes multiple buttons, State is published once, followed by the changed button edges in canonical order.

A CustomEvent state change that changes the effective value from false to true produces `{ action: "down", button, repeat: false }`. A transition from true to false produces `{ action: "up", button, repeat: false }`. If another physical or injected source still holds the button, no effective edge is produced.

The resulting publication is indistinguishable from an equivalent normalized physical button transition to the Subsystem consumer. It retains the existing:

- `controls.state` and `controls.event` channel names.
- Payloads defined by `Controls Input v1`.
- State-before-Event ordering.
- Top Active Frame routing.
- Frame / Activation isolation and non-replay behavior.
- Fresh State refresh and stale-state fallback.

No `controls.debug`, `keyboard.debug`, `gamepad.debug`, or other new channel is introduced.

## 6. Lifecycle and fail-safe behavior

The injected source must not outlive the component's active input lifecycle.

| Condition | Required behavior |
| --- | --- |
| Window becomes unusable | Clear all injected Keyboard and Gamepad source state through the existing Window reconciliation; publish only the current State according to existing rules. |
| Keyboard capture becomes unavailable | Clear injected Keyboard sources; keep eligible injected Gamepad sources; publish State only if effective state changes. |
| Keyboard capture becomes available again | Do not restore cleared Keyboard source state. A new CustomEvent snapshot is required. |
| Window becomes usable again | Do not restore any injected source state. A new CustomEvent snapshot is required. |
| Component disconnects / stops | Remove its CustomEvent listener, cancel source timers, clear local injected-source state, and stop publishing, matching the existing component stop semantics. |
| Duplicate component instance is disabled | It must not accept or publish injected input. |
| Debug feature is disabled by build profile | No listener is installed and CustomEvent dispatch has no effect. |

The initial proposal uses explicit neutral snapshots rather than a time-based lease. Test helpers must release each active `sourceId` in a `finally` block. A later watchdog/lease can be considered if device testing shows that CDP disconnections leave the page alive with stale input; it is not part of this first design.

## 7. Build and exposure boundary

The listener is enabled by a build-time capability, proposed name:

`ENABLE_DEBUG_CONTROLS_INPUT_SOURCE`

Enable it only in:

- Local development builds.
- Staging builds used for device automation.
- Dedicated qualification/test builds.

Production builds must omit or hard-disable the listener and its source bookkeeping. The feature must not be enabled by an HTML attribute, query parameter, local storage value, or other page-controlled runtime toggle.

The build-time capability is a test-surface boundary, not an authorization mechanism against arbitrary JavaScript executing in a debug-enabled page. Staging pages should still use the repository's normal access controls.

No debug input method is added to `WebPresentationContext`, Subsystem scope, Session Events, or any package root export. The only entry point is the component-local DOM CustomEvent.

## 8. Implementation boundaries

A future implementation should remain inside `@loomrealm-game/common-controls` and reuse the existing component and machine.

Proposed change locations:

```text
browser/device-input.browser.ts
    Pass the active game-controls-input element to the input source.
    Keep the listener lifecycle attached to that element.

browser/controls-source.ts
    Install/remove the element-local CustomEvent listener.
    Validate DebugControlsInputDetailV1.
    Apply accepted snapshots to the same Controls Machine.
    Enforce build-time enablement and source lifecycle.

src/controls-machine.ts
    Keep injected Keyboard and Gamepad source maps separately.
    Include their states in effectiveDown().
    Derive the same State and edge publications as physical inputs.
    Clear injected states on the existing Window / Keyboard-capture transitions.

test/controls-machine.test.mjs
    Cover reducer merging and edge ordering for injected sources.

test/controls-browser.test.mjs
    Cover CustomEvent dispatch, validation, element scoping, and lifecycle.

test/browser.test.mjs
    Cover the production-disabled and debug-enabled component build behavior.
```

Exact helper names and private method signatures may be chosen during implementation. They must not become public package exports.

The implementation must not:

- Change `src/model.ts`, `CONTROLS_BUTTONS_V1`, `CONTROLS_INPUT_CHANNELS`, or the public Controls payload types.
- Change `game-controls-input.md` or the frozen `Game Common Controls Input v1` contract.
- Add a Session Event or Presentation channel.
- Send the CustomEvent through `emitCustomEvent`.
- Modify `game-keyboard-input`, `game-gamepad-input`, or `game-pointer-input` behavior.
- Add an OS input injector, virtual HID device, Android service, or Hostra bridge.
- Modify PokeMan's Subsystem input consumer.

## 9. Qualification and acceptance criteria

The implementation is complete only after all of the following are covered:

### Controls Machine

1. A first non-empty snapshot from an unknown source produces the expected down edge from neutral.
2. An empty snapshot releases and removes only the named source.
3. Repeating the same snapshot produces no duplicate edge.
4. Multiple injected sources combine by OR.
5. Physical Keyboard, physical Gamepad, injected Keyboard, and injected Gamepad holding the same button produce one effective button.
6. Releasing any one source does not produce up while another eligible source still holds the button.
7. A multi-button snapshot produces one State followed by edge events in canonical button order.
8. Injected Keyboard edges use the existing keyboard capture gate; injected Gamepad edges do not use that gate.
9. Window unusable and Keyboard capture loss clear the correct injected source sets without synthesizing reconciliation up Events.
10. No injected source state is restored after the relevant availability transition.

### Browser component

11. The listener is attached to the active `game-controls-input` element only; dispatching on `window`, `document`, or another element has no effect.
12. The event does not bubble or cross a shadow boundary.
13. Invalid versions, devices, source IDs, duplicate/unknown buttons, oversized source counts, and device changes for an active source are rejected atomically.
14. The component does not create or modify `navigator.getGamepads()` results.
15. Component stop/disconnect removes the listener and prevents later CustomEvents from publishing.
16. A disabled duplicate component cannot accept injected input.
17. A production build has no active listener; local/staging/qualification builds can enable it through the build-time capability.

### End-to-end device automation

18. After PWA navigation/reload on the Android handheld, CDP can dispatch a CustomEvent to the mounted component and move the PokeMan player without a physical Gamepad wake-up.
19. CDP can press/release Confirm and exercise Map ↔ Dialogue Frame transitions using the existing consumer.
20. The test can hold multiple buttons, change a held snapshot, and release all buttons deterministically.
21. The test helper always sends a neutral snapshot in cleanup.
22. A separate real-hardware smoke test still verifies Android device enumeration, Chrome Gamepad wake-up, the AYANEO mapping exception, and physical button delivery. The CustomEvent test must not be reported as evidence for those hardware behaviors.

Run the existing common-controls unit/browser tests and the existing Controls Input v1 qualification unchanged. Add a dedicated qualification for this optional source; do not redefine or silently expand the frozen v1 qualification subject.

## 10. Suggested CDP helper

The following is the intended test-driver experience once the proposal is implemented. It is illustrative only and will not work until a debug-enabled build contains the listener.

```js
const controls = document.querySelector("game-controls-input");

function sendControls(down, device = "gamepad", sourceId = "cdp-gamepad") {
  if (!controls) throw new Error("game-controls-input is not mounted");

  controls.dispatchEvent(new CustomEvent("loomrealm:debug-input", {
    detail: { version: 1, sourceId, device, down },
    bubbles: false,
    composed: false,
    cancelable: false
  }));
}

try {
  sendControls([]);                    // establish neutral
  sendControls(["up"]);                // hold Up
  sendControls(["up", "south"]);       // press Confirm while holding Up
  sendControls(["south"]);             // release Up
  sendControls([]);                    // release all
} finally {
  sendControls([]);                    // best-effort cleanup
}
```

For a Keyboard-path test, pass `"keyboard"` as the device. For a Gamepad-path test, use `"gamepad"`. The same helper drives both paths, while the component applies the corresponding availability rules.

## 11. Version and compatibility

This is an optional implementation capability layered below the existing Controls v1 publication contract.

- Controls v1 remains exactly 14 digital buttons and two publication channels.
- The CustomEvent detail is a private, debug-only DOM interface and is not part of the package root ABI.
- No migration is required for PokeMan or any other Subsystem.
- Existing physical Keyboard and Gamepad behavior must remain byte-for-byte compatible at the Controls publication boundary.
- If the event name or detail changes before implementation, update this proposal before code is written. Once implemented, version the private detail explicitly rather than silently changing its shape.

The proposal may move to Implemented only after the implementation and dedicated tests land. Qualification status must be recorded separately from implementation status.

## 12. References

- [Unified Controls Input Web Component](./game-controls-input.md)
- [Device Input Web Components](./device-input-components.md)
- [Game Common Controls Input v1](../../doc/15-contracts/game-common-controls-input-v1.md)
- [Game Controls Input qualification evidence](../../doc/30-implementation/game-controls-input-qualification.md)

