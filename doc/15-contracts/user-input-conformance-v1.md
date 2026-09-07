# User Input Protocol v1 Conformance Profile

> 层级：正式契约 / Conformance Profile  
> 状态：Active / Normative / Frozen  
> Profile 版本：1  
> 适用协议：`loomrealm.user-input / 1`  
> fixtureSetRevision：2  
> 依赖：[User Input Protocol v1](./user-input-v1.md)、[Renderer Data Application Profile v1](./renderer-data-profile-v1.md)、[ADR 0023](../decisions/0023-user-input-v1-semantic-closure.md)、[ADR 0029](../decisions/0029-user-input-v1-mutation-gate-state-convergence.md)  
> 最近复核：2026-09-07

本文固定 User Input v1 独立实现必须证明的 observable behavior。与主协议冲突时以 [User Input Protocol v1](./user-input-v1.md) 为准。

---

## 1. Conformance Claims

完整角色 claim：

```text
LoomRealm User Input v1 Subsystem Interest Sender Conformant
LoomRealm User Input v1 Renderer Input Sender Conformant
LoomRealm User Input v1 Subsystem Input Receiver Conformant
```

报告至少包含：

```text
protocol = loomrealm.user-input
protocolVersion = 1
fixtureSetRevision = 2
role = subsystem-interest-sender | renderer-input-sender | subsystem-input-receiver
result = pass
```

不得用 revision 1 结果声明 current complete conformance，也不得声明 keyboard-only/state-only/no-reset/DOM-event-compatible 为 User Input v1 conformant。

完整 `loomrealm.renderer-data/1` claim还必须满足 Data Profile 全部 child/composition obligations。

---

## 2. Harness Observable State

Renderer harness至少观察：

```text
current Data carrier/current-retired
current Control mirror/InputTarget
published Interest Registry
Producer availability
per (F,A,C) Effective
outbound User Input application trace
publisher pending/inFlight bounds
```

Subsystem harness至少观察：

```text
local Frame lifecycle/current Activation/mutation gate
local Desired Interest
retained State by (F,A,state-channel)
business-delivered State/Event trace
Reset application
current Data carrier
listener configuration/lifetime
```

测试验证 observable behavior，不要求暴露真实 Map/queue/internal class。

---

## 3. Required Groups

```text
wire-schema
limits
channel
interest
author-usage
lifetime
authority
mutation-gate
state-event
reset
backpressure
producer
keyboard
pointer
gamepad
custom
listener
failure
fresh-carrier
transport-equivalence
```

---

## 4. Wire / Channel / Limits

Required：

```text
wire-valid-interest/state/event/reset
wire-invalid-json / top-level-not-object / unknown-input-type
wire-extra-member / missing-member / wrong-member-type
wire-state-event-suffix-mismatch
wire-reserved-unknown-standard-channel
wire-source-duplicate-member-follows-wire-semantics
wire-message-exact-byte-limit / one-over
wire-json-depth-exact-limit / one-over

channel-six-standard-exact
channel-custom-single/multi-segment
channel-custom-max-total / one-over
channel-custom-segment-max / one-over
channel-uppercase/leading-digit/empty-segment/wildcard rejected
channel-unknown-non-x rejected
channel-case-sensitive

payload-exact-byte/depth/member limits
```

Protocol-invalid MUST retire current Data；不能降级为 stale/drop。

---

## 5. Interest / Author Usage

Required：

```text
interest-empty-registry-valid
interest-full-replacement
interest-frame-absence-means-empty
interest-empty-frame-channels-rejected
interest-duplicate-frame/channel rejected
interest-frame/channel canonical order
interest-exact/over frame limit
interest-exact/over channels-per-frame
interest-exact/over total pairs
interest-latest-unsent-coalescing
interest-local-update-before-publication
interest-frame-close-local-cleanup-before-success
interest-unknown-control-frame-inert
```

M10 author projection additionally：

```text
author-invalid-channel-local-rejection
author-duplicate-contribution-local-rejection
author-union-over-frame-limit-local-rejection
author-registry-over-global-limit-local-rejection
author-invalid-update-preserves-old-config
author-invalid-update-wire-send-zero
author-invalid-update-does-not-retire-data
```

---

## 6. Three Lifetimes / Fresh Carrier

Required：

```text
lifetime-interest-survives-child-suspension
lifetime-interest-survives-fresh-activation
lifetime-old-state/event-do-not-survive-activation
lifetime-desired-interest-survives-same-generation-reconnect
lifetime-desired-interest-survives-fresh-generation-when-frame-live
lifetime-remote-interest-empty-on-fresh-carrier
lifetime-retained-state-empty-on-fresh-carrier
lifetime-event-history-empty-on-fresh-carrier
lifetime-data-reconnect-does-not-create-frame/activation
fresh-carrier-republish-current-desired-interest
fresh-carrier-current-target-plus-interest-fresh-state
same-generation-no-old-event-replay
fresh-generation-no-old-wire-state/event-replay
```

---

## 7. Cross-plane Authority

Required：

```text
authority-interest-first-inert
authority-then-interest-starts-effective
authority-first-no-send-without-interest
authority-later-interest-starts-effective
authority-null-target/wrong-subsystem/non-active-frame/activation-mismatch no-send
authority-producer-unavailable no-send
authority-interest-cannot-create-target
authority-render-focus-cannot-create-target
authority-no-push-pop-interpretation
```

Control/Data arrival order不得改变最终 Effective结果。

---

## 8. Mutation-gate State Convergence — Revision 2

Required：

```text
mutation-gate-state-retained-not-delivered
mutation-gate-state-latest-wins-while-suppressed
mutation-gate-event-dropped
mutation-gate-reset-clears-suppressed-state
mutation-gate-recoverable-no-commit-same-activation-reopens
mutation-gate-reopen-delivers-at-most-one-latest-state-per-channel
mutation-gate-reopen-does-not-replay-event
mutation-gate-commit-discards-suppressed-old-activation-state
mutation-gate-admin-suspend-discards-suppressed-state
mutation-gate-runtime-terminal-discards-suppressed-state
mutation-gate-data-retire-discards-suppressed-state
```

核心 trace：

```text
F/A active, retained S0
→ mutation gate closes for pending call
→ S1 arrives: retained, not business-delivered
→ Event arrives: dropped
→ explicit pre-commit rejection
→ same F/A gate reopens
→ business receives latest S1
→ no Event replay
```

成功 commit 对照必须证明 S1不进入旧 Activation business continuation。

---

## 9. State / Event / Reset

Required：

```text
state-interest-expand-fresh-baseline
state-inputtarget-fresh-baseline
state-fresh-activation-fresh-baseline
state-fresh-carrier-fresh-baseline
state-producer-return-fresh-baseline
state-self-contained / no-previous-state dependency
state-latest-pending-coalescing
state-effective-false-stops-new-send

event-order-preserved
event-not-coalesced
event-may-drop-before-emitted
event-drop-never-replayed

event-future-only-on-interest/authority/producer-return

reset-clears-all-retained-state-for-activation
reset-does-not-modify-interest
reset-stale-dropped
```

---

## 10. State-before-Event / Barrier / Backpressure

Required：

```text
causal-keyboard-down/up-state-before-event
causal-keyboard-repeat-no-required-state-transition
causal-pointer-down/up/cancel-state-before-event
causal-gamepad-down/up-state-before-event
causal-event-without-sibling-state-does-not-force-state

event-is-global-state-coalescing-barrier
reset-is-global-state-coalescing-barrier
state-cannot-coalesce-across-event
state-cannot-coalesce-across-reset
dropped-unemitted-event-removes-barrier

backpressure-all-input-queues-bounded
backpressure-event-overflow-drops-before-emitted
backpressure-surviving-event-order-preserved
backpressure-event-overflow-not-runtime-failure/frame-unwind
backpressure-input-backlog-does-not-overflow-generic-data-writer
backpressure-lease-retire-discards-obsolete-not-started-input
backpressure-data-retire-discards-publisher-state
```

允许 trace：

```text
State S1
State S2
Event E
State S3
State S4
Reset
State S5
```

coalesce 为：

```text
State S2
Event E
State S4
Reset
State S5
```

不得让 State越过 E/Reset。

---

## 11. InputTarget Replacement

Required：

```text
lease-a1-revoked-stops-immediately
lease-one-shot-a1-never-regranted
lease-same-carrier-a1-to-a2-reset-before-a2-input
lease-coalesced-no-null-still-tears-down-a1
lease-different-carriers-no-cross-carrier-order
lease-reset-best-effort-carrier-loss-still-ends-old-state
lease-a2-state-fresh-baseline
lease-a2-event-future-only
```

---

## 12. Producer

Formal conformance只冻结 Producer 对 User Input 的 observable role semantics；不要求 `RendererControlHolder`、`RendererInputSource`、construction-time injection 或任何特定内部 source object model。Exact M10 holder/source API 与 subscription lifecycle由 M10 role qualification独立证明。

Required：

```text
producer-current-authority-loss-disables-effective-input
producer-stale-facts-cannot-affect-fresh-renderer-authority-epoch
producer-fresh-facts-required-after-authority-replacement
producer-state-loss-stops-channel
producer-state-loss-best-effort-reset
producer-state-loss-rebaseline-other-effective-state
producer-state-return-fresh-baseline
producer-event-loss-stops-future-event
producer-event-return-future-only
producer-loss-does-not-change-main-authority/retire-data/fail-runtime
producer-cannot-choose-frame-or-activation
producer-cannot-bypass-input-sender-semantics
```

任意 Renderer 实现只要满足这些 observable semantics即可声明 formal User Input role conformance；M10 的 single construction-time source / current-Control subscription 是当前 `@loomrealm/renderer` implementation contract，不升级为协议结构要求。

---

## 13. Listener / Business Isolation — Revision 2

Required：

```text
listener-multiple-union
listener-close-isolation
listener-state-add-with-retained-state-gets-current-local-baseline
listener-state-expand-with-retained-state-gets-current-local-baseline
listener-event-add-no-history
listener-interest-shrink-clears-removed-state
listener-frame-remove-clears-frame-state
listener-frame-close-disables-before-protocol-success
listener-handler-throw-contained
listener-handler-rejected-promise-contained
listener-handler-failure-does-not-retire-data
listener-handler-failure-does-not-block-other-matching-listener
listener-retained-state-author-mutation-cannot-corrupt-future-baseline
```

---

## 14. Standard Keyboard

Required：

```text
keyboard-state-empty / unique-sorted / duplicate-rejected / unsorted-rejected
keyboard-state-max/over-count
keyboard-code-key/digit/function/fixed-control-set / unknown-rejected
keyboard-event-first-down-repeat-false
keyboard-event-repeat-down-repeat-true
keyboard-event-up-repeat-false / repeat-true-rejected
keyboard-text-character-not-standard-payload
```

---

## 15. Standard Pointer

Required：

```text
pointer-state-empty / sorted / duplicate-id-rejected / unsorted-rejected
pointer-state-exact/over-count
pointer-id-positive-safe / zero-rejected / one-shot-within-activation
pointer-kind-enum
pointer-buttons-unique-canonical-order
pointer-coordinate-zero/million/negative-off-surface/int32-min-max/outside-rejected
pointer-event-down/up-button-required
pointer-event-cancel-button-null / invalid-cancel-button-rejected
```

v1 fixture不得要求 wheel/pressure/tilt/gesture。

---

## 16. Standard Gamepad

Required：

```text
gamepad-state-empty / sorted / duplicate-id-rejected
gamepad-state-exact/over-count
gamepad-id-positive-safe / one-shot-within-activation
gamepad-axes/buttons-all-required
gamepad-axis-min-max / over-range-rejected
gamepad-button-min-max / over-range-rejected
gamepad-threshold-499999-released / 500000-pressed
gamepad-event-released-to-pressed-down
gamepad-event-pressed-to-released-up
gamepad-event-value-post-transition
```

---

## 17. Custom Channel

Required：

```text
custom-state-json-object
custom-event-json-object
custom-payload-non-object-rejected
custom-payload-byte/depth limits
custom-state-self-contained
custom-event-no-replay
custom-obeys-interest-and-activation
```

Core不验证 custom business members。

---

## 18. Failure Taxonomy

Required：

```text
failure-malformed-json/invalid-schema/invalid-standard-payload/invalid-channel/hard-limit → retire Data
failure-stale-activation-state/event/reset → drop only
failure-unknown-local-frame/not-interested → drop only
failure-unknown-frame-interest → inert
failure-mutation-gate-state → retain/suppress per revision 2
failure-mutation-gate-event → drop
failure-business-handler → local containment
failure-data-retire-not-runtime-failure/frame-unwind
```

Malformed Event不能因为 Event可丢而宽容接受。

---

## 19. Transport / Platform Equivalence

完整 formal conformance还要求 abstract mapping：

```text
websocket-text-application-unit
messageport-string-application-unit
messageport-structured-object-does-not-widen-model
per-direction-order-preserved
adapter-no-retry / no-duplicate
hostra-pwa-same-interest-authority-input-trace
hostra-pwa-same-standard-payload-meaning
```

M10 可以完成所有 platform-independent role fixtures并在 Hostra/Desktop Data lifecycle 上 qualification；完整 Hostra/PWA equivalence claim直到 M16 physical realization 后才成立。

---

## 20. Revision / Compatibility

`fixtureSetRevision = 2` 取代 revision 1 作为 current complete fixture set。Revision 2只增加 ADR 0029 所需 State convergence、listener/business isolation、author-local validation与明确 barrier/backpressure evidence；不改变 User Input wire version或 Data Profile identity。

未来 incompatible semantic change必须遵守 User Input v1 compatibility boundary，不能再次静默修改 expected behavior。
