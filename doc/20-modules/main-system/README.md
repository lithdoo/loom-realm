# 程序主系统模块设计

> 层级：模块设计  
> 状态：M8 Implemented / Qualified；M9 Authority Feed Implementation Frozen  
> 稳定程度：M5/M7/M8 Qualified Baseline / M9 Preimplementation Frozen  
> 主要定义：Main authority/transaction/recovery、LogicalGameBootstrap、Main-facing narrow Platform view、Renderer authority projection/currentness、M8 DataAuthority policy、M9 Data physical authority projection  
> 依赖：[系统架构总览](../../10-architecture/system-overview.md)、[平台组合系统](../../10-architecture/platform-composition-system.md)、[运行时启动系统](../../10-architecture/runtime-bootstrap-system.md)、[ADR 0026](../../decisions/0026-session-scoped-platform-instance.md)、[ADR 0027](../../decisions/0027-freeze-renderer-control-v1-preimplementation.md)、[ADR 0028](../../decisions/0028-freeze-m9-desktop-data-broker-preimplementation.md)、[Runtime Control Profile v1](../../15-contracts/runtime-control-profile-v1.md)、[Frame / Call v1](../../15-contracts/frame-call-protocol-v1.md)、[Renderer Control v1](../../15-contracts/main-renderer-control-v1.md)  
> 最近复核：2026-09-04

Main 是 Session / Runtime / Frame / Activation / InputTarget / Renderer currentness / AuthorityRevision / DataAuthority 的 application authority。M9 only projects current physical-binding facts to Platform；it does not move authority to Broker。

---

## 1. Module Shape Through M9

```text
Main System
├── LogicalGameBootstrap installer
├── Runtime Registry / Launch Attempt authority
├── Runtime Control integration
├── Frame / Activation / Stack authority
├── serialized mutation lane
├── Runtime failure / fixed-point unwind
├── Renderer authority projector                 // M7
├── Renderer revision/current participant         // M7
├── bounded Renderer candidate loop               // M7
├── ready-derived DataAuthority projection        // M8
├── current Renderer correlation token            // M9, inert after auth consume
└── DataConnectionAuthoritySink projection        // M9
```

No Renderer/Data shadow authority registry、EventBus、StateReplicator、ConnectionRegistry or DataAuthority manager。

---

## 2. Logical Bootstrap Boundary

Main still receives only：

```ts
interface LogicalGameBootstrap {
  readonly subsystemKeys: readonly string[];
  readonly initial: {
    readonly subsystemKey: string;
    readonly input: JsonValue;
  };
}
```

No GameEntry/formatVersion/LaunchPlan/module/path/Node/Worker/endpoint/ticket/provisioner material。

---

## 3. Main-facing Platform View Through M9

```ts
interface MainPlatform {
  readonly scheduler: DeadlineScheduler;
  readonly opaqueMaterial: OpaqueMaterialGenerator;
  readonly runtimeHosting: RuntimeHosting;
  readonly rendererControl?: RendererControlBinding;
  readonly dataConnections?: DataConnectionAuthoritySink;
}
```

Both Renderer and Data physical capabilities remain optional。M6/headless providers need no fake values。

`dataConnections` is a Main→Platform full-view fact sink, not a Broker/service API。

---

## 4. Runtime / Frame Authority — Unchanged

Main retains all M5 Frozen semantics：

```text
Runtime launch/auth/ready authority
Frame/Stack/Activation/InputTarget authority
Response/ACK causal barriers
post-commit no rollback
ambiguous mutation → Runtime failure
fixed-point whole-suffix unwind
Session terminal + physical termination convergence
```

Data/Renderer physical failures cannot directly alter these semantics。

---

## 5. Renderer Control — M7 Baseline Preserved

`RendererControlBinding.acquire(T,signal)` only arms a candidate physical carrier slot。Renderer-control peer owns hello/version mechanics；Main owns token/currentness/revision。

Hello acceptance remains atomic：preflight exact Snapshot → consume token → install new current → retire old current from future publication。

No second currentness lease/epoch/heartbeat。

---

## 6. M8 DataAuthority

Current reachable policy：

```text
Runtime ready
→ DataAuthority(S,1,"loomrealm.renderer-data/1")

otherwise
→ no authority for S
```

No independent generation allocator/history/connection state。Data transport loss does not alter logical S/G/P or Renderer revision。

---

## 7. M9 Current Renderer Correlation

M9 keeps the accepted current Renderer token value only while that peer is current：

```text
hello acceptance consumes T as credential
→ T can never authenticate again
→ retain T only as inert Platform physical correlation
```

The retained current token participates in Main's live opaque-material duplicate defense。When currentness ends, drop it；no retired-token history。

This is not a new authority field exposed to Renderer or Data application wire。

---

## 8. M9 Data Physical Authority View

When a current Renderer exists, Main projects：

```ts
interface DataConnectionAuthorityView {
  readonly rendererControlToken: string;
  readonly entries: readonly {
    subsystemKey: string;
    generation: number;
    dataProfile: string;
    runtime: HostedRuntime;
  }[];
}
```

Entry source：existing ready-derived Main DataAuthority + exact `RuntimeRecord.hosted` object。

```text
no current Renderer → null
current Renderer + no DataAuthority → non-null view with empty entries
current Renderer + ready S → exact S/1/P + exact HostedRuntime
```

Order deterministic, authority semantics order-independent。

---

## 9. Sink Ordering

Conforming `DataConnectionAuthoritySink.replace()` is synchronous、non-blocking、non-throwing and performs no network/IPC wait。

Main call points：

```text
Session initialize → replace(null)
Renderer accepted/replaced → replace(full current view)
Runtime/DataAuthority visible change → replace(updated full view)
current Renderer terminal → replace(null)
Session terminal → replace(null)
```

All changes occur inside the existing serialized Main mutation/current-switch lane before it completes。

Sink replacement itself does not bump `rendererRevision` and never enters Renderer Snapshot。

---

## 10. Renderer Replacement / Data Invalidation

When Main accepts Renderer B over A：

```text
M7: B becomes current / A loses current authority
M9: retain B token / drop A token
M9: replace full B Data authority view
```

Therefore A physical Data current/pending material becomes stale synchronously in the same Main mutation through the sink。Physical close can converge later。

Old Control/Data late terminal events remain identity-safe and cannot clear B authority。

---

## 11. Runtime / Session Invalidation

Runtime leaves ready/fails/terminates：remove its DataAuthority and publish an updated full sink view if a Renderer is current。

Current Renderer terminal without replacement：clear current token and send null。

Session terminal：send null before asynchronous Renderer/Data/Runtime cleanup。Data sink cleanup does not delay Main result。

---

## 12. Failure / Representation Isolation

Renderer Control representation failure retains M7 semantics。Data sink transport/cleanup errors are absorbed by the conforming Platform sink and cannot throw through Main mutation。

A provider that throws from `replace()` is non-conforming and fails M9 qualification；Main does not define a new Runtime/Frame recovery/error taxonomy for that contract violation。

---

## 13. M9 Qualification

Must prove：

```text
MainPlatform.dataConnections optional
initial null
full view exact current Renderer correlation
current token auth-consumed yet retained inertly only while current
live token duplicate-material defense
exact HostedRuntime object identity in entries
unique/deterministic exact S/G/P entries
same-lane replacement on Renderer/Runtime/DataAuthority changes
current Renderer terminal/session terminal null
sink replacement does not bump Renderer revision
M1–M8 paths unchanged when capability absent
no Broker/ticket/endpoint/candidate state in Main
```

---

## 14. Final Invariants Through M9

1. Main remains platform-neutral and the single Runtime/Frame/Renderer/Data authority owner；
2. Game/LaunchPlan/transport material remain outside Main；
3. M7 Renderer authentication/currentness semantics remain unchanged；
4. M8 DataAuthority remains ready-derived S/1/P in current Phase 1 path；
5. M9 retains current Renderer token only as inert physical correlation after authentication consumption；
6. exact HostedRuntime object identifies current physical Data target without new wire identity；
7. DataConnectionAuthoritySink is optional/full-view/synchronous/non-blocking/non-throwing；
8. sink update shares existing Main serialized mutation discipline but does not create a new cross-plane protocol/revision；
9. Data physical failure cannot directly change Runtime/Frame authority；
10. no shadow authority/event/connection framework is introduced。
