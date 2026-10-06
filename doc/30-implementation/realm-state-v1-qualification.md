# Realm State v1 Qualification

> 状态：**Implemented / Qualified**
> Normative SSOT：[Realm State v1](../15-contracts/realm-state-v1.md)  
> Delivery plan：[Realm State v1 delivery plan](./realm-state-v1-delivery-plan.md)  
> 日期：2026-10-06
> 已验证实现 SHA：`1dba9857bb459218f626b29abee29d3c9fd08a8f`

## Subject

Realm State v1 的 executable subject 包含：

```text
packages/realm-state
packages/game-package
packages/game-launcher-hostra
packages/game-launcher-pwa
packages/subsystem
packages/main
apps/desktop
test/realm-state-v1
```

最终 review subject 以本 PR head SHA 与同一工作树的 CI 结果为准；不得把本 ledger 套用到后续未重跑 qualification 的提交。

## 实现闭环

```text
GameEntryV1.state
→ Hostra/PWA PREPARE projection
→ PreparedRealmStateDefinition
→ RealmStateAuthority
→ dedicated physical carrier
→ Runtime-scoped ReplaceableRealmStateClient
→ SubsystemScope.state
```

- `packages/realm-state` 持有 frozen types、identity/JSON accounting、reference Authority、OCC、materialization、subscriptions/backpressure、fatal、replaceable binding、generation fencing、carrier protocol 与 MessagePort realization。
- Game Package 只持有 closed document schema/validation；Launcher 显式投影 detached prepared definition，Main bootstrap 不含 State payload。
- Hostra 每个 Runtime 使用独立 private State WebSocket endpoint；不复用 Runtime Control、Renderer Data、Content bearer 或 Hostra application RPC。
- Main 只消费 `MainRealmStateFatalSource` fact 并独占 Session terminal/unwind；不读取 State value/revision/version。
- PWA full product 仍属于 M16/M17；Realm State v1 cross-platform qualification覆盖 shared core、PWA projection、Worker execution 与 MessagePort physical realization。

## Automated coverage

Package/qualification tests cover：

```text
Unicode scalar identity and UTF-8 boundaries
canonical unsigned UTF-8 ordering
exact JSON encoded bytes / depth / transaction payload
detached immutable prepared snapshots
read / readInitial / list / scan
materialization / null / deep-equal writes
whole-record cross-Collection OCC and concurrency
safe-integer revision/version exhaustion
subscription baseline/order/aggregation/reentrancy/failure containment
slow listener and slow physical carrier pressure
exact 64-event / 65th-overflow and 8-MiB backpressure profiles
terminal ordering after previously accepted events
Authority fatal vs pre-READY bootstrap failure
Runtime-scoped client / unbound fail-fast / rebind / terminal
required production State capability before business side effects
pre-dispatch no-commit / post-dispatch OUTCOME_UNKNOWN / no replay
generation fencing and old-subscription terminal
request-local invalidity vs binding-local framing/response corruption
atomic request correlation settlement after request-specific semantic decode
locally aborted request retention through definitive remote retirement
subscription active/closing tombstone/terminal/retired correlation lifecycle
close-before-baseline and close-with-in-flight-event races with ACK retirement
exact read/readInitial/commit identity-set and list/scan namespace correlation
subscription baseline exact-set and change non-empty-subset correlation
malformed success/failure responses drain all in-flight operations without hanging
serialized consecutive large multi-frame subscription events
bounded MessagePort/WebSocket receive queues and framed-stream bookkeeping
Game Package structured duplicate classification and Launcher sibling projection
Main fatal ownership and Subsystem lifetime
real multi-process Hostra vertical
Worker + MessagePort logical/evidence/backpressure equivalence
transparent physical framing for logical requests/snapshots above one carrier unit
Desktop product startup/cleanup regression
Renderer direct-State boundary exclusion
Save/Load bootstrap exclusion
```

## Qualification commands

The following commands are the canonical local gates for this subject：

```text
npm run test:realm-state
npm run test:realm-state:qualification
npm run test:game-package
npm run test:m9
npm run test:m12
npm run test:m13:pr
npm run test:m14:pr
npm run test:m15:pr
npm run build:packages
npm run test:packages
npm run docs:check-links
npm run docs:build
```

`.github/workflows/realm-state.yml` runs the package/vertical suite, frozen-contract qualification, Desktop composition tests, and package-surface checks on Ubuntu and Windows with Node 20 and 24.

The implementation subject SHA above passed every local command in this section。Its pull-request CI completed 20/20 workflows successfully, including the dedicated Realm State matrix on Ubuntu/Windows with Node 20/24。The final documentation-only status commit is rechecked on its exact HEAD before PR handoff。

## Result

Realm State v1 implementation is closed-loop and qualified against the frozen contract。Physical delivery/backpressure、commit evidence、request/subscription correlation lifecycles、request-vs-binding failure classification、Runtime bootstrap、recovery fencing and cross-boundary validation now have executable behavioral evidence rather than boundary-string evidence alone。

No remaining architecture/product decision is required for this v1 implementation.
