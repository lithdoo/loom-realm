# 程序主系统模块设计

> 层级：模块设计  
> 状态：M5 Implemented Baseline / M7 Implementation Frozen / M8+ Planned  
> 稳定程度：M5 Frozen Baseline / M7 Preimplementation Closed  
> 主要定义：Main authority/transaction/recovery、LogicalGameBootstrap、Main-facing narrow Platform view、M7 Renderer authority projection/currentness、M8+ DataAuthority evolution  
> 依赖：[系统架构总览](../../10-architecture/system-overview.md)、[运行时启动系统](../../10-architecture/runtime-bootstrap-system.md)、[ADR 0020](../../decisions/0020-game-entry-consumer-boundary.md)、[ADR 0026](../../decisions/0026-session-scoped-platform-instance.md)、[ADR 0027](../../decisions/0027-freeze-renderer-control-v1-preimplementation.md)、[Runtime Control Profile v1](../../15-contracts/runtime-control-profile-v1.md)、[Frame / Call v1](../../15-contracts/frame-call-protocol-v1.md)、[Renderer Control v1](../../15-contracts/main-renderer-control-v1.md)  
> 最近复核：2026-09-03

Main 是 Session / Runtime / Frame / Activation / InputTarget / Renderer currentness / AuthorityRevision 的 application authority。DataAuthority 也属于 Main，但真实 allocation/generation/profile policy 从 M8 才实施。

Main 不拥有 Game Entry document、Platform executable binding、WebSocket/MessagePort、Renderer presentation、Input Interest 或 Render Domain。

---

## 1. Current Module Shape Through M7

```text
Main System
├── LogicalGameBootstrap installer
├── Runtime Registry / Launch Attempt authority
├── Runtime Control integration
├── Frame / Activation / Stack authority
├── serialized mutation lane
├── Runtime failure / fixed-point unwind
├── Renderer authority projector                 // M7
├── Renderer revision/current-participant state  // M7
├── bounded optional Renderer candidate loop     // M7
└── Platform capability coordination
```

M7 **不得**新增：

```text
Renderer Runtime shadow registry
Renderer Frame shadow registry
Renderer InputTarget shadow state
RendererAuthorityManager
RendererControlPublisher framework
ConnectionRegistry
RendererHosting service
DataAuthority allocator/policy
```

M8 才增加真实 DataAuthority policy；M7 Snapshot 固定 `dataAuthorities=[]`。

---

## 2. Main Bootstrap Input

Main receives immutable logical facts only：

```ts
interface LogicalGameBootstrap {
  readonly subsystemKeys: readonly string[];
  readonly initial: {
    readonly subsystemKey: string;
    readonly input: JsonValue;
  };
}
```

Main MUST NOT重新执行 GameEntryV1 document validation，也不接收：

```text
formatVersion
ValidatedGameEntryV1
PlatformLaunchPlan
module/path/URL
Node/Worker/Runner options
```

Matching Platform PREPARE 已在 Main first side effect前闭合。

---

## 3. Main-facing Platform View Through M7

M7 Frozen target：

```ts
interface MainPlatform {
  readonly scheduler: DeadlineScheduler;
  readonly opaqueMaterial: OpaqueMaterialGenerator;
  readonly runtimeHosting: RuntimeHosting;
  readonly rendererControl?: RendererControlBinding;
}
```

`MainPlatform` 是 consumer-owned narrow capability bundle，不是 universal Platform contract。

### M5 → M7 mechanical migration

```text
bootstrapTokens / BootstrapTokenGenerator
→ opaqueMaterial / OpaqueMaterialGenerator
```

所有现有 Main/Hostra providers/fixtures 都必须迁移，但 Hostra Runtime-only composition 不需要 fake `rendererControl`。

### Optional Renderer capability

```text
rendererControl absent
→ no Renderer token/attempt
→ Runtime/Frame Session fully valid

rendererControl present
→ Main MAY arm exactly one future candidate slot
```

`RendererControlBinding` 只建立 candidate carrier；不认证 token、不协商 version、不决定 currentness、不创建/显示 BrowserWindow。

---

## 4. Runtime Launch Boundary

```text
create current Launch Attempt
→ OpaqueMaterialGenerator.generate()
→ Main validates/registers bootstrap credential
→ RuntimeHosting.launch({subsystemKey, bootstrapToken})
→ HostedRuntime
→ Main-side Runtime Control
→ identified / ready
```

Main MUST NOT把 executable material放入 Launch Attempt。

```text
launch != physical container created != connected != identified != ready
ready != Renderer exists
ready != Data current
```

---

## 5. Runtime Control / HostedRuntime

Runtime Control owns protocol mechanics；Main owns Runtime state/failure authority。

M5 `RuntimeHosting.launch()` 返回 attempt-scoped `HostedRuntime`，自然绑定：

```text
runtimeControl acquire
requestTermination()
terminated Promise
```

`terminated` resolve 才是 physical termination fact；request termination或 observation error都不等于 stopped。

No automatic Runtime restart；fresh Runtime = fresh Launch Attempt + fresh bootstrap credential + fresh HostedRuntime/Control lifetime。

---

## 6. Frame / Stack / Activation Authority

Main guarantees：

```text
frameId one-shot
subsystemKey immutable per Frame
caller immutable
Stack bottom→top
only active top Frame has current Activation
activationId one-shot
InputTarget derived from committed active top + Activation
```

Normal transactions与 failure recovery共享 serialized authority lane。

Causal barriers保持 Frozen Frame v1：

```text
Response-before-dependent-RPC
ACK-before-publication
post-commit no rollback
ambiguous mutation failure → Runtime failure
```

---

## 7. Runtime Failure / Unwind

Main alone computes：

```text
failedRuntimeKeys
→ lowest live failed-runtime occurrence
→ doomed whole suffix
→ Top→Bottom cleanup
→ fixed-point expansion
→ fresh healthy Caller resume or empty Stack
```

Platform/Renderer不得自行推导 unwind root或恢复 revoked Activation。

---

## 8. M7 Renderer Authority Projection

M7 Projector 是 pure function over committed Main facts：

```text
existing Runtime records
existing live Frame Stack
existing current Activation
existing derived InputTarget
M7 dataAuthorities=[]
        ↓
RendererAuthoritySnapshotV1
```

Projector不得拥有 transport、token、history或 parallel state。

Runtime projection Frozen mapping：

```text
no RuntimeRecord                         → declared
failure != null                          → failed
physicallyTerminated && expected stop    → stopped
starting                                 → starting
connected                                → connected
identified / initializing                → identified
ready                                    → ready
stopping                                 → stopping
```

Failure precedence > stopped。

---

## 9. AuthorityRevision / Commit Observation

Session 初始化：

```text
fresh sessionId
rendererRevision = 1
capture initial Renderer-visible payload
```

所有 Renderer-visible mutation必须进入 existing serialized mutation discipline：

```text
commit business authority
→ capture Renderer payload
→ compare previous payload excluding revision
→ changed ? revision++ : unchanged
→ submit latest Snapshot to current Renderer peer if any
```

Connection/token/candidate bookkeeping本身不 bump revision。

Main不得为 Renderer projection新增 EventBus / TransactionManager / StateReplicator。

---

## 10. M7 Candidate Slot / Current Renderer

仅当 `platform.rendererControl` 存在且未 terminal：

```text
fresh Renderer token
→ RendererControlBinding.acquire(token, signal)
→ candidate MessageCarrier
→ renderer-control Main peer validates hello/selects v1
→ Main authority acceptance
```

Bounded state：

```text
one current Renderer peer
+
one armed/pending/bound candidate attempt
```

Settlement：

```text
abort before acquire resolve
→ cancel slot only

non-abort acquire rejection
→ Binding terminal for this Main Session
→ no re-arm
→ Runtime/Frame Session continues

acquired candidate peer/protocol failure
→ candidate attempt terminal only
→ fresh slot MAY re-arm if Binding healthy
```

Main does not negotiate `protocolVersions`。

---

## 11. Hello Atomic Acceptance / Replacement

Renderer-control peer选定 v1 后，在 Main serialized lane：

```text
require Session live + exact candidate
validate exact issued token
capture current Snapshot R
exact prepare/preflight hello Result(R)

preflight fail
→ invalidate candidate
→ old current unchanged

preflight success
→ consume token
→ candidate becomes only current Renderer
→ old peer synchronously retired from future publication
→ commit R/prepared text
```

Transaction外发送 prepared hello text，并 request old carrier close。

Already-started old send MAY later settle/arrive，但无 current-authority effect；不得为此创建 cancelable writer/Renderer epoch/heartbeat。

---

## 12. Renderer Control Failure / Session Terminal

Current peer terminal：

```text
if peer === currentRendererPeer:
    clear current peer
else:
    ignore stale terminal for currentness
```

Terminal alone不改变 Runtime/Frame authority，不 bump revision。

Main Session terminal latch：

```text
stop fresh Renderer token/slot
abort pending acquire
invalidate pending token
retire candidate/current peers
stop publication
```

Renderer cleanup不延迟 Main Session result，也不是 Runtime shutdown coordinator。

---

## 13. Representation Isolation

Renderer Control wire limits不是 Runtime/Frame business limits。

```text
unrepresentable candidate hello
→ fail before current switch
→ healthy old current stays

unrepresentable later current Snapshot
→ current Renderer Control terminal
→ Main Runtime/Frame/Stack unchanged
```

No Frame depth cap、Runtime count cap、rollback、truncation或 Renderer-specific Frame error。

---

## 14. M8 DataAuthority Boundary

M7 formal wire已经包含：

```ts
interface RendererDataAuthorityV1 {
  subsystemKey: string;
  generation: number;
  dataProfile: string;
}
```

但 M7 implementation：

```text
dataAuthorities = []
```

M8 才实现：

```text
allocation/revocation policy
generation monotonicity
profile selection
Runtime replacement interaction
Renderer/SubSystem Data binding integration
```

M9 Desktop Broker只实现 physical provisioning，不拥有 generation/profile。

---

## 15. Platform Physical Realization Placement

```text
M6
    Hostra RuntimeHosting / Node Runner / Runtime Control WS ✅

M7
    logical optional RendererControlBinding contract + MemoryCarrier vertical

M14
    Hostra BrowserWindow + Renderer Control WS + full Desktop composition

M15
    PWA Worker Runtime vertical

M16
    PWA Renderer Control MessagePort + Data Broker/bindings + Content + full equivalence
```

Main-facing logical semantics在各 concrete Platform保持相同；PID/Worker/WS/MessagePort差异不进入 Main authority。

---

## 16. Qualification

M5 baseline继续验证：Runtime bootstrap、nested call/return、same-runtime recursion、failure unwind、root outcome/shutdown、physical termination facts。

M7 新增：

```text
OpaqueMaterialGenerator provider migration + output contract
rendererControl absent path
one candidate slot bound
hello/version ownership
pure Snapshot/revision
hello preflight/current-switch atomicity
replacement + old inFlight semantics
Binding rejection vs candidate failure
Session terminal Renderer retirement
representation isolation
M7 dataAuthorities=[]
```

Existing M6 Hostra e2e必须在 `bootstrapTokens→opaqueMaterial` 机械迁移后保持 green，且不新增 fake Renderer capability。

---

## 17. Final Invariants Through M7

1. Main core platform-neutral；
2. Main consumes LogicalGameBootstrap, not GameEntry/LaunchPlan；
3. Main owns Runtime/Frame/Activation/InputTarget/Renderer currentness/revision；
4. RuntimeHosting封闭 Platform executable plan；
5. Runtime Control owns mechanics, not Main authority；
6. Frame/Stack mutation serial；ambiguous mutation Runtime-fatal/no retry；
7. failure unwind Main-only；
8. stopped only from actual termination；
9. M7 Renderer Snapshot is pure projection, no shadow authority；
10. `RendererControlBinding` is optional Main-facing candidate carrier capability；
11. protocol peer owns Renderer version negotiation；Main owns token/currentness；
12. replacement actively retires old current but does not require send cancellation；
13. Renderer Control representation failure cannot mutate Frame/Runtime authority；
14. M7 DataAuthority implementation remains empty; real policy starts M8；
15. Main does not own Interest/Render Domain or physical Renderer hosting。
