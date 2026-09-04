# ADR 0028：冻结 M9 Desktop DataConnectionBroker / Late Provisioning Core 首次实现边界

> 状态：Accepted  
> 日期：2026-09-04  
> 影响范围：M9 Desktop DataConnectionBroker、`@loomrealm/platform-ports`、`@loomrealm/main`、`@loomrealm/game-launcher-hostra`、`apps/desktop`  
> 依赖：[ADR 0024](./0024-renderer-subsystem-data-connection-v1-semantic-closure.md)、[ADR 0025](./0025-renderer-data-profile-v1-preimplementation-closure.md)、[ADR 0026](./0026-session-scoped-platform-instance.md)、[ADR 0027](./0027-freeze-renderer-control-v1-preimplementation.md)  
> 正式契约：[Renderer ⇄ Subsystem Data Connection v1](../15-contracts/renderer-subsystem-data-connection-v1.md)  
> 实施文档：仓库根目录 `M9_01_*` → `M9_05_*`

## 背景

M8 已关闭 Main ready-derived `DataAuthority(S,1,loomrealm.renderer-data/1)` 与 Renderer/Subsystem role-facing Data Binding/peer lifecycle，但明确没有实现：

```text
Main → Platform physical Data authority feed
Desktop candidate establishment
commit-time Renderer/Runtime/S/G/P revalidation
paired installation / cutover
Node Runner late provisioning IPC
real Data WebSocket
```

M9 必须把这些 logical seam 落到真实 Hostra physical path，同时避免三类错误扩张：

```text
1. 让 Renderer acquire/ticket/socket成为第二 authority source；
2. 把 Broker/Renderer/Data/Content塞进 game-launcher-hostra；
3. 为未来 PWA/M10/M11预建 generic connection/event/retry framework。
```

首次实现前评审还暴露两个必须关闭的歧义：

```text
DataConnectionAuthoritySink.replace() 若可抛异常，会把 Platform adapter异常带回 Main mutation；
Runner IPC commit 若与 Broker installation混为一个原子点，会产生 post-install send failure 的半提交/rollback歧义。
```

本 ADR 关闭这些问题并冻结 M9 first implementation boundary。

---

## 1. Main → Platform Data Authority 使用 Full-view Sink

`@loomrealm/platform-ports` 增加：

```ts
interface DataConnectionAuthorityEntry {
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: string;
  readonly runtime: HostedRuntime;
}

interface DataConnectionAuthorityView {
  readonly rendererControlToken: string;
  readonly entries: readonly DataConnectionAuthorityEntry[];
}

interface DataConnectionAuthoritySink {
  replace(view: DataConnectionAuthorityView | null): void;
}
```

`MainPlatform` 增加 optional：

```ts
readonly dataConnections?: DataConnectionAuthoritySink;
```

这是一个 **fact sink**，不是 Broker API、event stream、observer 或 service locator。

Main 在已有 serialized authority lane 内做 full replacement。`replace(null)` 表示当前没有 Renderer Data installation authority。

---

## 2. `replace()` 必须同步、非阻塞、不可抛异常

Frozen semantics：

```text
replace(view/null)
→ synchronously replace the sink's in-memory latest authority view
→ synchronously make stale Broker current/pending material non-current/non-installable
→ schedule/request physical cleanup afterward
```

`replace()`：

```text
MUST NOT await network/IPC
MUST NOT invoke business/user callbacks
MUST NOT throw
```

Ordinary Data transport/cleanup failure stays inside Platform/Data failure domain and cannot interrupt Main Runtime/Frame mutation。

Throwing provider is non-conforming and fails qualification；M9 does not create recovery semantics for a provider violating the shared port contract。

---

## 3. Current Renderer Correlation Reuses the Accepted Token Value Only as Inert Identity

M7 Renderer Control token T remains a one-shot authentication credential：

```text
hello acceptance consumes T
→ T can never authenticate another Renderer attempt
```

M9 permits Main to retain the accepted current participant's token value until that participant ceases current, solely because Platform already knows the same value for the physical candidate and therefore can correlate Data material without reopening `RendererControlBinding`。

This retained value：

```text
is not a credential after consumption
is not accepted from Renderer as Data proof
never enters Data application wire
is trusted by Broker only when current Main sink view names it
```

Main includes the retained current value in its live opaque-material duplicate guard and drops it when currentness ends。No historical token set、lease、epoch or heartbeat is added。

ADR 0027 Renderer currentness/authentication semantics remain unchanged。

---

## 4. Exact Runtime Identity Uses Existing `HostedRuntime` Object Identity

Main already owns the exact `HostedRuntime` returned for each current Runtime attempt。M9 sends that exact object in `DataConnectionAuthorityEntry.runtime`。

```text
same subsystemKey + new HostedRuntime object
→ different physical Runtime target
```

No PID/Worker ID/runtimeInstanceId is added to application wire or Main logical bootstrap。

---

## 5. Desktop Broker Lives in `apps/desktop`

M9 creates the first real Desktop composition workspace：

```text
apps/desktop
    DataConnectionAuthoritySink implementation
    Desktop DataConnectionBroker
    Renderer-side Data binding delivery cells
    two-sided loopback Data WebSocket relay
    deterministic M9 physical Renderer host/test composition
```

Root workspaces add `apps/*` only because this real consumer now exists。

Broker does not move into Main、Renderer、Subsystem、Data protocol package or `game-launcher-hostra`。

---

## 6. Hostra Launcher Exposes Only Runtime-scoped Provisioning Mechanics

`@loomrealm/game-launcher-hostra` owns the Node child and therefore adds：

```ts
interface HostraRuntimeDataPrepareRequest {
  readonly candidateId: string;
  readonly endpoint: string;
  readonly generation: number;
  readonly dataProfile: string;
}

interface HostraRuntimeDataProvisioner {
  prepare(request: HostraRuntimeDataPrepareRequest, signal: AbortSignal): Promise<void>;
  commit(candidateId: string, signal: AbortSignal): Promise<void>;
  revoke(candidateId: string): void;
}
```

`createHostraRuntimeHosting(...)` adds optional：

```ts
onRuntimeDataProvisioner?: (
  runtime: HostedRuntime,
  provisioner: HostraRuntimeDataProvisioner,
) => void;
```

The hook runs before successful `RuntimeHosting.launch()` resolves the exact `HostedRuntime`。Desktop may keep a private `WeakMap`；no public RuntimeDirectory/registry。

M6/headless callers omit the hook and remain unchanged。

---

## 7. Provisioning IPC Is Hostra-private and Separate from Runtime/Data Application Protocols

Dedicated Node IPC may express：

```text
provision
prepared
commit
committed
revoke
```

It may not carry Runtime Control/Frame/business/Input/Render/Main authority mutation。

Data endpoint/ticket/candidate material is never part of `RunnerBootstrapV1` or Game manifest。

---

## 8. Paired Installation Happens in Desktop Broker, Not Runner IPC

A candidate is prepared only when both role-specific WebSockets are physically ready and bound to the same Main view identity。

Per `(current Renderer, subsystemKey)` Broker serializes：

```text
commit-time latest-view revalidation
→ old current retires if present
→ candidate becomes sole current Data Connection
→ relay application gate opens
```

Role Binding waiter state is not part of the authority gate。

M8 Bindings continue to mean “wait for an already-current-deliverable carrier”。

---

## 9. Runner `commit()` Is Post-install Delivery Notification

`HostraRuntimeDataProvisioner.commit()` is deliberately **after** the Broker logical installation commit。

It resolves when the Runner acknowledges that exact installed candidate as current-deliverable to `SubsystemDataBinding`。

Therefore failure is unambiguous：

```text
B installed current
→ Runner commit delivery fails
→ B current→retired
→ close/revoke B
→ old A never resurrects
→ Runtime/Frame/Main DataAuthority unchanged
```

No rollback/2PC protocol is introduced。

If B is invalidated while commit delivery is pending, Broker aborts/revokes B；late ACK is stale and cannot restore it。

---

## 10. Desktop WebSocket Mapping

M9 concrete Hostra candidate：

```text
Renderer WS ─┐
             ├─ Desktop Broker opaque UTF-8 text relay
Runner WS   ─┘
```

Before installation：zero application traffic exposure。After installation：Broker relays text opaquely and does not parse `@loomrealm/data` messages。

Either side terminal/read/write failure retires the whole pair；one half can never remain current。

---

## 11. Same-generation Physical Replacement

While Main authority remains exact `S/G/P`：

```text
old physical pair may retire
fresh physical candidate may install
```

No new generation、Renderer revision、resume token、replay or old queue migration。

M9 only proves fresh Data peer/connection-local state。User Input fresh publication semantics remain M10；Render fresh publication semantics remain M11。

---

## 12. Qualification Claim Boundary

M9 qualifies the **Hostra/Desktop physical Broker slice** for applicable Data Connection v1 cases：authority binding、candidate boundary、paired install、commit races、cardinality/cutover、current→retired、same-generation physical recovery、parent invalidation、stale traffic and failure isolation。

M9 does not claim full Connection-v1 cross-platform qualification because production generation replacement/exhaustion、M10/M11 child baseline semantics and PWA Platform Mapping remain later work。

A small Broker-level contract harness may synthesize sink-view replacement without inventing production Runtime restart/generation allocation in Main。

---

## 13. Failure-domain Rule

The following do not directly fail Runtime or unwind Frame：

```text
candidate establishment failure
Broker authority-race rejection
Data WS loss
Runner provisioning IPC loss while child/Runtime Control remains valid
post-install Data delivery failure
same-generation replacement failure
child Data-fatal carrier retirement
```

Actual child process exit / Runtime Control failure remain existing Runtime facts。

---

## 14. Explicit Non-goals

M9 does not add：

```text
BrowserWindow / Electron full Renderer product
Hostra physical RendererControlBinding product realization
InputManager
RenderManager / Store
Content
PWA Data Broker
new generation allocator
EventBus / ObserverHub
ConnectionRegistry / ConnectionManager
GenericTransaction / 2PC
retry/backoff framework
second currentness protocol
Data application hello/ready/resume messages
```

---

## 15. Implementation / Reopen Rule

`M9_01`–`M9_05` + this ADR + existing Frozen Data Connection contract are the M9 first-implementation fact chain。

Coding-time freedom：private file/class names、candidate ID format、IPC encoding、WebSocket adapter internals。

Reopen only for：

```text
demonstrated correctness/security contradiction
conflict with a Frozen contract
real M9 consumer cannot be implemented through the exact frozen seams
```

Not reopen reasons：future PWA symmetry、framework reuse、naming preference、test convenience、reducing call sites。

---

## Final Invariants

1. Main remains the only Data authority owner。  
2. `DataConnectionAuthoritySink` is full-view、session-scoped、non-blocking and non-throwing。  
3. Current Renderer token retention is inert physical correlation after one-shot auth consumption, not reauthorization。  
4. Exact `HostedRuntime` object identity binds Data to the current physical Runtime attempt。  
5. Desktop Broker lives in `apps/desktop`；launcher owns only exact child provisioning mechanics。  
6. Runtime provisioning handoff occurs before successful `RuntimeHosting.launch()` returns the Runtime。  
7. Candidate is not current before paired Broker installation。  
8. Broker installation commit precedes role delivery notifications。  
9. Runner post-install delivery failure retires the newly installed pair and never resurrects old current。  
10. One relay side terminal retires the whole pair。  
11. Same-generation replacement has no replay/resume/generation/revision mutation。  
12. M9 does not claim M10/M11 child publication baseline or full PWA/cross-platform conformance。  
13. No generic authority/event/connection/retry/transaction framework。
