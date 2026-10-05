# Realm State v1 Qualification

> 状态：**Implemented / Qualified**  
> Normative SSOT：[Realm State v1](../15-contracts/realm-state-v1.md)  
> Delivery plan：[Realm State v1 delivery plan](./realm-state-v1-delivery-plan.md)  
> 日期：2026-10-05

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
64-event and 8-MiB backpressure profiles
Authority fatal vs pre-READY bootstrap failure
Runtime-scoped client / unbound fail-fast / rebind / terminal
pre-dispatch no-commit / post-dispatch OUTCOME_UNKNOWN / no replay
generation fencing and old-subscription terminal
Game Package closed schema and Launcher sibling projection
Main fatal ownership and Subsystem lifetime
real multi-process Hostra vertical
Worker + MessagePort logical equivalence
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
npm run test:m9
npm run test:m12
npm run test:m13
npm run test:m14:pr
npm run test:m15:pr
npm run build:packages
npm run test:packages
npm run docs:check-links
npm run docs:build
```

`.github/workflows/realm-state.yml` runs the package/vertical suite, frozen-contract qualification, Desktop composition tests, and package-surface checks on Ubuntu and Windows with Node 20 and 24.

Final command results and the exact head SHA are reported in the PR handoff after the final-tip run。

## Result

Realm State v1 implementation is closed-loop and qualified against the frozen contract.

No remaining architecture/product decision is required for this v1 implementation.
