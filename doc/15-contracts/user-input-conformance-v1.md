# User Input Protocol v1 Conformance Profile

> 层级：正式契约 / Conformance Profile  
> 状态：Active / Normative / Frozen  
> Profile 版本：1  
> 适用协议：`loomrealm.user-input / 1`  
> fixtureSetRevision：1  
> 依赖：[User Input Protocol v1](./user-input-v1.md)、[Renderer Data Application Profile v1](./renderer-data-profile-v1.md)、[ADR 0023](../decisions/0023-user-input-v1-semantic-closure.md)  
> 最近复核：2026-08-21

本文固定 User Input v1 独立实现必须证明的 observable behavior。与主协议冲突时以 [User Input Protocol v1](./user-input-v1.md) 为准。

---

## 1. Conformance Claims

完整角色声明：

```text
LoomRealm User Input v1 Subsystem Interest Sender Conformant
LoomRealm User Input v1 Renderer Input Sender Conformant
LoomRealm User Input v1 Subsystem Input Receiver Conformant
```

报告至少包含：

```text
protocol = loomrealm.user-input
protocolVersion = 1
fixtureSetRevision = 1
role = subsystem-interest-sender | renderer-input-sender | subsystem-input-receiver
result = pass
```

不得声明：

```text
keyboard-only v1 conformant
no-reset v1 conformant
state-only v1 conformant
DOM-event compatible = User Input v1 conformant
```

若实现声称支持完整 `loomrealm.renderer-data/1`，还必须满足对应 Data Profile 的全部 child protocol要求。

---

## 2. Harness Observable State

Renderer harness至少观察：

```text
current Data carrier identity/current-retired
current Control mirror/InputTarget
published Interest Registry
Producer availability
per (F,A,C) Effective
outbound User Input application trace
```

Subsystem harness至少观察：

```text
local Frame existence/lifecycle/current Activation
local Desired Interest
retained State by (F,A,state-channel)
business-delivered State/Event trace
Reset application
current Data carrier identity
```

测试比较协议可观察事实，不要求暴露真实内部 Map/queue/DOM/native object。

---

## 3. Fixture Manifest

```ts
interface UserInputFixtureManifestV1 {
  readonly fixtureFormatVersion: 1;
  readonly protocol: "loomrealm.user-input";
  readonly protocolVersion: 1;
  readonly fixtureSetRevision: 1;
  readonly fixtures: readonly UserInputFixtureDescriptorV1[];
}

interface UserInputFixtureDescriptorV1 {
  readonly id: string;
  readonly role:
    | "subsystem-interest-sender"
    | "renderer-input-sender"
    | "subsystem-input-receiver";
  readonly group:
    | "wire-schema"
    | "limits"
    | "interest"
    | "authority"
    | "lifetime"
    | "state-event"
    | "reset"
    | "producer"
    | "keyboard"
    | "pointer"
    | "gamepad"
    | "custom"
    | "failure"
    | "transport-equivalence";
}
```

`fixtureSetRevision` 不进入 wire，也不是 replay cursor/version negotiation。

---

## 4. Wire / Closed Schema

Required：

```text
wire-valid-interest
wire-valid-state
wire-valid-event
wire-valid-reset
wire-top-level-not-object
wire-invalid-json
wire-unknown-input-type
wire-extra-top-level-member
wire-missing-required-member
wire-wrong-member-type
wire-state-channel-event-suffix-rejected
wire-event-channel-state-suffix-rejected
wire-reserved-unknown-standard-channel-rejected
wire-source-duplicate-member-follows-wire-semantics
wire-message-exact-byte-limit
wire-message-one-byte-over
wire-json-depth-exact-limit
wire-json-depth-one-over
```

Protocol-invalid application unit MUST retire current Data carrier；不得作为普通 stale/drop处理。

---

## 5. Channel Grammar

Required：

```text
channel-six-standard-exact
channel-custom-single-segment
channel-custom-multi-segment
channel-custom-max-total-length
channel-custom-one-byte-over
channel-custom-segment-max
channel-custom-segment-one-over
channel-custom-uppercase-rejected
channel-custom-leading-digit-rejected
channel-custom-empty-segment-rejected
channel-custom-wildcard-rejected
channel-unknown-non-x-rejected
channel-case-sensitive
```

Standard channel不可通过 `x.*` grammar改变其语义。

---

## 6. Interest Registry

Required：

```text
interest-empty-registry-valid
interest-full-replacement
interest-frame-absence-means-empty
interest-empty-frame-channels-rejected
interest-duplicate-frame-rejected
interest-duplicate-channel-rejected
interest-frame-order-canonical
interest-channel-order-canonical
interest-exact-frame-limit
interest-one-over-frame-limit
interest-exact-channels-per-frame
interest-one-over-channels-per-frame
interest-exact-total-pairs
interest-one-over-total-pairs
interest-latest-unsent-coalescing
interest-local-update-before-publication
interest-frame-close-removes-local-desired-before-success
```

Unknown/stale Control Frame的 well-formed Interest必须 inert，而不是 protocol fatal。

---

## 7. Three-lifetime Separation

Required：

```text
lifetime-interest-survives-suspension
lifetime-interest-survives-fresh-activation
lifetime-old-state-does-not-survive-activation
lifetime-old-event-does-not-survive-activation
lifetime-desired-interest-survives-same-generation-reconnect
lifetime-desired-interest-survives-fresh-generation-when-frame-live
lifetime-remote-interest-resets-on-fresh-carrier
lifetime-retained-state-resets-on-fresh-carrier
lifetime-event-history-not-replayed-on-fresh-carrier
lifetime-data-reconnect-does-not-create-frame
lifetime-data-reconnect-does-not-create-activation
```

---

## 8. Cross-plane Authority Convergence

Required：

```text
authority-interest-first-inert
authority-then-interest-starts-effective
authority-first-no-send-without-interest
authority-then-later-interest-starts-effective
authority-null-target-no-send
authority-wrong-subsystem-no-send
authority-non-active-frame-no-send
authority-activation-mismatch-no-send
authority-producer-unavailable-no-send
authority-interest-cannot-create-target
authority-render-focus-cannot-create-target
authority-no-push-pop-interpretation
```

Control/Data arrival order不得改变最终 Effective结果。

---

## 9. Effective Transition / State Baseline

Required：

```text
state-interest-expand-false-to-true-fresh-baseline
state-inputtarget-false-to-true-fresh-baseline
state-fresh-activation-false-to-true-fresh-baseline
state-fresh-carrier-republish-fresh-baseline
state-producer-return-fresh-baseline
state-self-contained
state-does-not-require-previous-state
state-latest-pending-coalescing
state-effective-true-to-false-stops-new-send
```

Event false→true只允许 future Event，无 historical replay。

---

## 10. Standard State-before-Event Causality

Required：

```text
causal-keyboard-down-state-before-event
causal-keyboard-up-state-before-event
causal-keyboard-repeat-no-required-state-transition
causal-pointer-down-state-before-event
causal-pointer-up-state-before-event
causal-pointer-cancel-state-before-event
causal-gamepad-down-state-before-event
causal-gamepad-up-state-before-event
causal-event-without-sibling-state-interest-does-not-force-state
causal-retained-event-blocks-state-coalescing-across-it
causal-dropped-unemitted-event-removes-barrier
```

如果 sibling State同时 Effective，Event handler观察的 retained State必须已经是 post-transition State。

---

## 11. Event / Reset Ordering

Required：

```text
event-order-preserved
event-not-coalesced
event-may-drop-before-emitted
event-drop-never-replayed
event-overflow-not-runtime-failure
event-overflow-not-frame-unwind
reset-clears-all-retained-state-for-activation
reset-does-not-modify-interest
reset-is-global-state-coalescing-barrier
stale-reset-dropped
```

Trace：

```text
State S1
State S2
Event E
State S3
State S4
Reset
State S5
```

允许：

```text
State S2
Event E
State S4
Reset
State S5
```

不允许 State跨 E/Reset移动到另一侧。

---

## 12. InputTarget Replacement

Required：

```text
lease-a1-revoked-stops-a1-input-immediately
lease-one-shot-a1-never-regranted
lease-same-carrier-a1-to-a2-reset-before-a2-ordinary-input
lease-control-coalesced-no-null-still-tears-down-a1
lease-different-carriers-no-cross-carrier-order-required
lease-reset-best-effort-carrier-loss-still-ends-old-state
lease-a2-state-fresh-baseline
lease-a2-event-future-only
```

Renderer不得依赖一定观察到中间 `InputTarget=null`。

---

## 13. Producer Loss / Return

Required：

```text
producer-state-loss-stops-channel
producer-state-loss-best-effort-reset
producer-state-loss-rebaseline-other-effective-state-channels
producer-state-return-fresh-baseline
producer-event-loss-stops-future-event
producer-event-return-future-only
producer-loss-does-not-change-main-authority
producer-loss-does-not-retire-data
producer-loss-does-not-fail-runtime
```

---

## 14. Keyboard Canonical Payload

Required：

```text
keyboard-state-empty
keyboard-state-unique-sorted-codes
keyboard-state-duplicate-code-rejected
keyboard-state-unsorted-rejected
keyboard-state-max-count
keyboard-state-over-count
keyboard-code-key-range
keyboard-code-digit-range
keyboard-code-function-range
keyboard-code-fixed-control-set
keyboard-code-unknown-rejected
keyboard-event-first-down-repeat-false
keyboard-event-repeat-down-repeat-true
keyboard-event-up-repeat-false
keyboard-event-up-repeat-true-rejected
keyboard-text-character-not-standard-payload
```

Keyboard code语义是 physical/control identity，不是 locale text。

---

## 15. Pointer Canonical Payload

Required：

```text
pointer-state-empty
pointer-state-multiple-sorted-by-id
pointer-state-duplicate-id-rejected
pointer-state-unsorted-id-rejected
pointer-state-exact-count-limit
pointer-state-one-over-count-limit
pointer-id-positive-safe-integer
pointer-id-zero-rejected
pointer-id-one-shot-within-activation
pointer-kind-enum
pointer-buttons-unique-canonical-order
pointer-coordinate-zero-left-top
pointer-coordinate-million-right-bottom
pointer-coordinate-negative-off-surface-valid
pointer-coordinate-int32-min-max
pointer-coordinate-outside-int32-rejected
pointer-event-down-button-required
pointer-event-up-button-required
pointer-event-cancel-button-null
pointer-event-invalid-cancel-button-rejected
```

v1 fixture不得要求 wheel/pressure/tilt/gesture字段。

---

## 16. Gamepad Canonical Payload

Required：

```text
gamepad-state-empty
gamepad-state-sorted-by-id
gamepad-state-duplicate-id-rejected
gamepad-state-exact-count-limit
gamepad-state-one-over-count-limit
gamepad-id-positive-safe-integer
gamepad-id-one-shot-within-activation
gamepad-axes-all-required
gamepad-buttons-all-required
gamepad-axis-min-max
gamepad-axis-over-range-rejected
gamepad-button-min-max
gamepad-button-over-range-rejected
gamepad-threshold-499999-released
gamepad-threshold-500000-pressed
gamepad-event-released-to-pressed-down
gamepad-event-pressed-to-released-up
gamepad-event-value-post-transition
```

vendor-specific extra button/axis不得偷加到 standard payload closed schema。

---

## 17. Custom Channel

Required：

```text
custom-state-json-object
custom-event-json-object
custom-payload-non-object-rejected
custom-payload-exact-byte-limit
custom-payload-one-byte-over
custom-payload-exact-relative-depth
custom-payload-one-over-relative-depth
custom-state-self-contained-contract
custom-event-no-replay-contract
custom-obeys-interest-and-activation-gate
```

Core不验证 custom业务 member语义。

---

## 18. Interest Shrink / Late Input

Required：

```text
interest-shrink-local-gate-updates-before-wire-publication
interest-shrink-late-state-dropped
interest-shrink-late-event-dropped
interest-shrink-state-retained-value-cleared
interest-remove-frame-clears-frame-retained-state
interest-shrink-does-not-change-inputtarget
interest-shrink-does-not-close-frame
```

---

## 19. Failure Taxonomy

Required：

```text
failure-malformed-json-retires-data
failure-invalid-schema-retires-data
failure-invalid-standard-payload-retires-data
failure-invalid-channel-retires-data
failure-hard-limit-retires-data
failure-stale-activation-state-drops-only
failure-stale-activation-event-drops-only
failure-stale-reset-drops-only
failure-unknown-local-frame-input-drops-only
failure-not-interested-input-drops-only
failure-unknown-frame-interest-inert
failure-business-handler-error-not-wire-error
failure-data-retire-not-runtime-failure
failure-data-retire-not-frame-unwind
```

Malformed Event不能因为 Event本来可丢而被宽容接受。

---

## 20. Fresh Carrier Recovery

Required：

```text
fresh-carrier-interest-registry-empty
fresh-carrier-no-mandatory-immediate-interest
fresh-carrier-republish-current-desired-interest
fresh-carrier-state-empty
fresh-carrier-event-history-empty
fresh-carrier-current-target-plus-interest-fresh-state
same-generation-reconnect-no-old-event-replay
fresh-generation-no-old-wire-state-replay
fresh-carrier-does-not-restart-runtime
fresh-carrier-does-not-restart-frame
```

---

## 21. Transport / Platform Equivalence

User Input application mapping由 Renderer Data Profile统一。

Required abstract trace equivalence：

```text
websocket-text-application-unit
messageport-string-application-unit
messageport-structured-object-does-not-widen-model
per-direction-order-preserved
adapter-no-retry
adapter-no-duplicate
hostra-pwa-same-interest-authority-input-trace
hostra-pwa-same-standard-payload-meaning
```

平台 adapter可以不同，但同一 canonical input facts必须产生同一 User Input observable model。

---

## 22. Frozen Compatibility Boundary

fixtureSetRevision 1 固定验证：

```text
message/schema
channel grammar
three lifetimes
Interest replacement/canonical form
Effective gate
State/Event/Reset ordering
standard payload mapping
standard numeric ranges
producer loss behavior
failure/drop/recovery
hard limits
```

未来 executable corpus可扩充更多等价案例，但不得通过修改 expected behavior改变 Frozen v1 semantics；不兼容 semantic change需要新 protocol version/profile combination。