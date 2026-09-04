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

首次实现前评审进一步关闭四个 implementation-time 歧义：

```text
DataConnectionAuthoritySink.replace() 若可抛异常，会把 Platform adapter异常带回 Main mutation；
Runner IPC commit 若与 Broker installation混为一个原子点，会产生 post-install send failure 的半提交/rollback歧义；
Runner/Broker 若允许“reject 或 supersede”两种 pending-candidate策略，会把 winner policy泄漏到两层；
committed-undelivered Data carrier若允许无界 queue，会在合法 delayed acquire 窗口产生资源失控。
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

## 2. Published Authority View 是不可变 Snapshot

每个 non-null `DataConnectionAuthorityView` 必须是 fresh publication snapshot：

```text
view object immutable after publication
entries array detached from mutable Main containers and immutable after publication
entry scalar/reference fields immutable
HostedRuntime preserved by exact reference identity
```

`HostedRuntime` 自身不由 M9 clone/freeze；其 object identity 就是 physical Runtime correlation。

`replace(view)` 返回后，不允许通过修改 view/entries containers 改变该次已发布 authority。No authority history/event log is introduced。

---

## 3. `replace()` 必须同步、非阻塞、不可抛异常

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

## 4. Current Renderer Correlation Reuses the Accepted Token Value Only as Inert Identity

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

## 5. Exact Runtime Identity Uses Existing `HostedRuntime` Object Identity

Main already owns the exact `HostedRuntime` returned for each current Runtime attempt。M9 sends that exact object in `DataConnectionAuthorityEntry.runtime`。

```text
same subsystemKey + new HostedRuntime object
→ different physical Runtime target
```

No PID/Worker ID/runtimeInstanceId is added to application wire or Main logical bootstrap。

---

## 6. Desktop Broker Lives in `apps/desktop`

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

## 7. Broker Slot Storage 是 Per-S 且严格有界

Formal Connection cardinality remains：

```text
(Session, current Renderer participant, subsystemKey)
→ 0..1 current Data Connection
```

Because a Session has only one current Renderer participant, M9 Desktop production storage is exactly：

```text
Map<S, Slot>

Slot:
    0..1 current pair
    0..1 pending candidate
```

Exact candidate/current identity still contains：

```text
renderer token T
HostedRuntime R
S/G/P
```

`T` is not used as a second registry namespace。

Same-S second candidate request while `pending` exists：

```text
newcomer rejects/disposes
existing pending remains unchanged
```

If Broker wants different pending work, it explicitly invalidates/disposes the old pending candidate first, then starts the new one。No multi-pending queue/scheduler。

Frozen Data Connection v1 permits multiple establishment attempts but does not require them；this stricter state bound is conforming and removes unnecessary winner-state complexity。

---

## 8. Hostra Launcher Exposes Only Runtime-scoped Provisioning Mechanics

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

## 9. Provisioner 不拥有 Candidate Winner Policy

Runner provisioning layer is bounded to：

```text
0..1 prepared uncommitted candidate
0..1 committed current-deliverable carrier
0..1 SubsystemDataBinding waiter
```

If `prepare(C2)` arrives while `C1` is prepared-uncommitted：

```text
reject C2
keep C1
```

Provisioner MUST NOT implicitly supersede C1。Desktop Broker must revoke/invalidate C1 before requesting C2。

This keeps candidate selection/replace policy in exactly one owner: Desktop Broker。

---

## 10. Provisioning IPC Is Hostra-private and Separate from Runtime/Data Application Protocols

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

## 11. Paired Installation Happens in Desktop Broker, Not Runner IPC

A candidate is prepared only when both role-specific WebSockets are physically ready and bound to the same Main view identity。

Per `S` Broker slot serializes：

```text
commit-time latest-view revalidation
→ old current retires if present
→ candidate becomes sole current Data Connection
→ relay application gate opens
```

Role Binding waiter state is not part of the authority gate。

M8 Bindings continue to mean “wait for an already-current-deliverable carrier”。

---

## 12. Runner `commit()` Is Post-install Delivery Notification

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

## 13. Desktop WebSocket Mapping / Finite Resource Bound

M9 concrete Hostra candidate：

```text
Renderer WS ─┐
             ├─ Desktop Broker opaque UTF-8 text relay
Runner WS   ─┘
```

Before installation：zero application traffic exposure。After installation：Broker relays text opaquely and does not parse `@loomrealm/data` messages。

Role delivery may lag installation, therefore all Data carrier/relay application buffering MUST be finite。

```text
pre-install overflow/resource excess
→ dispose candidate

post-install overflow/resource excess
→ current pair retires whole
→ close/revoke pair
```

Exact byte/message bound is adapter-private。No BackpressureManager、application flow-control ACK、retry or replay protocol is added。

Either side terminal/read/write failure likewise retires the whole pair；one half can never remain current。

---

## 14. Same-generation Physical Replacement

While Main authority remains exact `S/G/P`：

```text
old physical pair may retire
fresh physical candidate may install
```

At most one replacement candidate is pending per S。

No new generation、Renderer revision、resume token、replay or old queue migration。

M9 only proves fresh Data peer/connection-local state。User Input fresh publication semantics remain M10；Render fresh publication semantics remain M11。

---

## 15. Qualification Claim Boundary

M9 qualifies the **Hostra/Desktop physical Broker slice** for applicable Data Connection v1 cases：authority binding、candidate boundary、paired install、commit races、bounded slot/cardinality、cutover、current→retired、same-generation physical recovery、parent invalidation、finite physical buffering、stale traffic and failure isolation。

M9 does not claim full Connection-v1 cross-platform qualification because production generation replacement/exhaustion、M10/M11 child baseline semantics and PWA Platform Mapping remain later work。

A small Broker-level contract harness may synthesize sink-view replacement without inventing production Runtime restart/generation allocation in Main or a production multi-candidate scheduler。

---

## 16. Failure-domain Rule

The following do not directly fail Runtime or unwind Frame：

```text
candidate establishment failure
same-S pending-slot rejection
Broker authority-race rejection
Data WS loss
finite-buffer overflow
Runner provisioning IPC loss while child/Runtime Control remains valid
post-install Data delivery failure
same-generation replacement failure
child Data-fatal carrier retirement
```

Actual child process exit / Runtime Control failure remain existing Runtime facts。

---

## 17. Explicit Non-goals

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
multi-pending candidate queue/scheduler
GenericTransaction / 2PC
retry/backoff framework
BackpressureManager / application flow-control protocol
second currentness protocol
Data application hello/ready/resume messages
```

---

## 18. Implementation / Reopen Rule

`M9_01`–`M9_05` + this ADR + existing Frozen Data Connection contract are the M9 first-implementation fact chain。

Coding-time freedom：private file/class names、candidate ID format、IPC encoding、finite buffer constants、WebSocket adapter internals。

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
2. Published Data authority view/entries are fresh immutable snapshots；HostedRuntime remains exact reference identity。  
3. `DataConnectionAuthoritySink` is full-view、session-scoped、non-blocking and non-throwing。  
4. Current Renderer token retention is inert physical correlation after one-shot auth consumption, not reauthorization。  
5. Exact `HostedRuntime` object identity binds Data to the current physical Runtime attempt。  
6. Desktop Broker lives in `apps/desktop`；launcher owns only exact child provisioning mechanics。  
7. Production Broker storage is one `Map<S,Slot>`；each S has at most one current and one pending candidate。  
8. Provisioner never implicitly supersedes pending work；pending replacement is an explicit Broker revoke-then-prepare decision。  
9. Runtime provisioning handoff occurs before successful `RuntimeHosting.launch()` returns the Runtime。  
10. Candidate is not current before paired Broker installation。  
11. Broker installation commit precedes role delivery notifications。  
12. Runner post-install delivery failure retires the newly installed pair and never resurrects old current。  
13. Data physical buffering is finite；overflow disposes/retire at the correct pre/post-install boundary。  
14. One relay side terminal retires the whole pair。  
15. Same-generation replacement has no replay/resume/generation/revision mutation。  
16. M9 does not claim M10/M11 child publication baseline or full PWA/cross-platform conformance。  
17. No generic authority/event/connection/retry/transaction/backpressure framework。
