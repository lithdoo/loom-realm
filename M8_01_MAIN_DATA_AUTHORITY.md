# M8 / 01 — Main DataAuthority

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M8 Renderer Data Profile + Data Connection Core  
> 落地顺序：01  
> 最近复核：2026-09-04  
> 前置：[M7 / 05](M7_05_QUALIFICATION_CLOSURE.md)  
> 正式契约：[Main ⇄ Renderer Control v1](doc/15-contracts/main-renderer-control-v1.md) · [Data Connection v1](doc/15-contracts/renderer-subsystem-data-connection-v1.md) · [Renderer Data Profile v1](doc/15-contracts/renderer-data-profile-v1.md)  
> 目标：在 `@loomrealm/main` 中关闭 Phase 1 当前可达的 DataAuthority policy，并通过既有 Renderer Snapshot 纯投影发布；不为尚未实现的 Runtime replacement/restart 预建 generation allocator、history 或 connection manager。

> **Main 只拥有 logical DataAuthority。Phase 1 M8 的 DataAuthority 是 committed Runtime authority 的纯派生事实，不新增独立 authority state。**

---

## 1. Frozen Position

```text
Main committed Runtime authority
        ↓
Runtime=ready ? DataAuthority(S,1,"loomrealm.renderer-data/1") : none
        ↓
existing RendererAuthoritySnapshotV1
        ↓
Renderer Control
```

Phase 1 exact values：

```text
generation  = 1
dataProfile = loomrealm.renderer-data/1
```

Main / Snapshot 中不得出现 endpoint、ticket、MessagePort、WebSocket、carrier、candidate 或 provisioning handle。

---

## 2. Ownership

Main owns：

```text
whether DataAuthority exists
Phase 1 generation/profile policy
Runtime lifecycle → authority derivation
Renderer-visible projection / revision
```

Main does not own：

```text
physical Data establishment
paired installation / cutover
same-generation reconnect
Input / Render business state
Data peer reader/writer/terminal mechanics
```

`@loomrealm/data` owns connection-local Profile mechanics；Platform owns physical pairing；Subsystem/Renderer own role-local Data peer state。

---

## 3. Minimal Main State

M8 adds **no Data-specific mutable authority registry**。

Current authority is derived directly：

```text
current Runtime for S exists
AND Runtime.phase == ready
→ { subsystemKey: S, generation: 1, dataProfile: "loomrealm.renderer-data/1" }

otherwise
→ no DataAuthority for S
```

Forbidden：

```text
generationHighWater Map
per-Runtime dataGeneration field
DataAuthorityManager
DataConnectionRegistry
DataConnectionState enum
reconnect counter
carrier attempt id
Renderer-side Data shadow state
```

The existing Runtime state is the single source of truth。

---

## 4. Lifecycle

Normal ready transition：

```text
identified/initializing
→ commit Runtime=ready
→ derived DataAuthority(S,1,P) exists in the same committed state
```

Normal exit from ready：

```text
Runtime=ready + derived DataAuthority(S,1,P)
→ commit Runtime=stopping/failed/stopped/removed
→ derived DataAuthority disappears in the same committed state
```

Session terminal removes all Runtime authority and therefore all DataAuthority；no final Data RPC。

Data carrier loss / provisioning failure：

```text
→ Runtime authority unchanged
→ DataAuthority unchanged
→ rendererRevision unchanged solely for that transport fact
```

Renderer participant replacement：

```text
→ DataAuthority S/1/P unchanged
```

Old participant Data becomes locally unusable through parent currentness；the new participant may obtain a fresh connection under the same `S/1/P`。

---

## 5. One Visible Commit

Runtime lifecycle and its derived DataAuthority consequence share the existing Main serialized mutation boundary。

Ready：

```text
before: Runtime != ready, no DataAuthority
commit: Runtime=ready + DataAuthority(S,1,P)
after: one Renderer-visible payload/revision observes both
```

There MUST NOT be a normal observable intermediate Snapshot：

```text
Runtime=ready + no DataAuthority
```

Exit from ready：

```text
before: Runtime=ready + DataAuthority(S,1,P)
commit: Runtime!=ready + no DataAuthority
after: one Renderer-visible payload/revision observes both
```

There MUST NOT be a Snapshot with non-ready Runtime and stale DataAuthority。

No EventBus、TransactionManager or DataAuthorityManager is introduced；this is ordinary projection from the existing serialized Main state。

---

## 6. Generation Boundary

Frozen Data Connection v1 defines generation as a logical authority epoch and requires future replacement epochs within the same `(Session, subsystemKey)` to increase。

Phase 1 M8 currently has no production path for：

```text
same-key Runtime restart/replacement inside one Session
multiple Runtime instances per key
profile replacement
```

Therefore M8 implements only the reachable epoch：

```text
first/current DataAuthority epoch for each (Session,S) = generation 1
```

It MUST NOT prebuild：

```text
generation allocator
historical generation storage
exhaustion handling
fake Runtime replacement path
```

If a future milestone introduces a second DataAuthority epoch for the same `(Session,S)`, that implementation MUST follow the already-Frozen contract (`G2 > G1`, no reuse/wrap) at the point the path becomes real。

Reconnect and Renderer replacement are not fresh DataAuthority epochs and remain generation 1。

---

## 7. Projection / Revision

M7 `dataAuthorities=[]` becomes a pure projection from committed Runtime state。

Projection MUST be deterministic；array ordering carries no authority semantics。Implementation MAY naturally follow existing subsystem iteration order and MUST NOT add a sorting registry solely for DataAuthority。

```text
Runtime ready/non-ready visible transition
→ DataAuthority add/remove is part of the same Renderer-visible commit
→ rendererRevision advances once for that payload change

Data carrier loss / same-generation reconnect
→ no rendererRevision change
```

Wire/schema validation remains in `@loomrealm/renderer-control`；Main does not duplicate it。

---

## 8. Qualification

Must prove：

```text
not-ready Runtime → no DataAuthority
ready commit → Runtime=ready + S/1/P in one visible commit
no ready/no-authority intermediate Snapshot
ordinary Frame/Activation changes do not change authority tuple
ready exit → Runtime non-ready + authority absent in one visible commit
no non-ready Snapshot retains stale DataAuthority
all M8 DataAuthority generations are exactly 1
Renderer replacement keeps S/1/P
Data transport loss/reconnect leaves authority/revision unchanged
profile exactly loomrealm.renderer-data/1
projection deterministic but ordering semantically irrelevant
no generation allocator/history/shadow authority registry
```

---

## 9. Frozen Closure

M8/01 is implementation-ready when Main adds no independent Data authority state and `Runtime=ready` directly yields `S/1/loomrealm.renderer-data/1` in the same existing visible commit。

Future Runtime restart/replacement work MUST satisfy Frozen generation monotonicity when that path is actually introduced；M8 does not implement speculative state for it。
