# M8 / 01 — Main DataAuthority

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M8 Renderer Data Profile + Data Connection Core  
> 落地顺序：01  
> 最近复核：2026-09-04  
> 前置：[M7 / 05](M7_05_QUALIFICATION_CLOSURE.md)  
> 正式契约：[Main ⇄ Renderer Control v1](doc/15-contracts/main-renderer-control-v1.md) · [Data Connection v1](doc/15-contracts/renderer-subsystem-data-connection-v1.md) · [Renderer Data Profile v1](doc/15-contracts/renderer-data-profile-v1.md)  
> 目标：在 `@loomrealm/main` 中实现 DataAuthority allocation / generation / profile / revocation，并通过既有 Renderer Snapshot 纯投影发布；不得建立第二套 Data authority registry 或 connection manager。

> **Main 只拥有 logical DataAuthority。Data carrier、candidate、paired installation、reconnect 与 child protocol state 都不属于 Main。**

---

## 1. Frozen Position

```text
Main committed Runtime authority
        ↓
DataAuthority {subsystemKey, generation, dataProfile}
        ↓
existing RendererAuthoritySnapshotV1
        ↓
Renderer Control
```

Phase 1 profile exactly：

```text
loomrealm.renderer-data/1
```

Main / Snapshot 中不得出现 endpoint、ticket、MessagePort、WebSocket、carrier、candidate 或 provisioning handle。

---

## 2. Ownership

Main owns：

```text
whether DataAuthority exists
generation allocation / historical high-water
profile selection
Runtime replacement interaction
revocation
Renderer-visible projection / revision
```

Main does not own：

```text
physical Data establishment
paired installation / cutover
same-generation reconnect attempt
Input Interest / Input State
Render Domain / Render revision
Data peer reader/writer/terminal mechanics
```

`@loomrealm/data` owns connection-local Profile mechanics；Platform owns physical pairing；Subsystem/Renderer own role-local current Data state。

---

## 3. Minimal Main State

Only：

```text
per subsystemKey:
    last allocated Data generation

per current Runtime record:
    data generation minted for this Runtime instance, if any
```

Current DataAuthority 由 existing Runtime authority + generation fact 直接投影；不得另存可漂移的 current DataAuthority DTO。

Forbidden：

```text
DataAuthorityManager
DataConnectionRegistry
DataConnectionState enum
reconnect counter
carrier attempt id
Renderer-side Data shadow state
```

---

## 4. Allocation / Revocation

Phase 1 policy：

```text
Runtime enters committed ready
→ if this Runtime instance has no generation:
     allocate fresh G
→ DataAuthority(S,G,"loomrealm.renderer-data/1") exists
```

DataAuthority exists only while that Runtime instance remains the current application-ready Runtime。

```text
ready → stopping / failed / stopped / replaced
→ DataAuthority removed
```

Session terminal revokes all DataAuthority；no final Data RPC。

Data carrier loss / provisioning failure：

```text
→ Main DataAuthority unchanged
→ rendererRevision unchanged solely for Data transport loss
```

Renderer participant replacement：

```text
→ does not allocate a fresh generation
```

Old Renderer Data retires because parent participant currentness is lost；a new Renderer may receive a fresh connection under the same `S/G/P`。

---

## 5. One Visible Commit

Runtime lifecycle and the DataAuthority consequence of that lifecycle MUST be committed in the same existing Main serialized mutation boundary。

Normal ready transition：

```text
identified/initializing
→ allocate G if needed
→ commit Runtime=ready + DataAuthority(S,G,P)
→ capture one Renderer-visible payload
→ advance rendererRevision once
```

There MUST NOT be a normal observable intermediate Snapshot：

```text
Runtime=ready + no DataAuthority
```

Normal exit from ready：

```text
Runtime=ready + DataAuthority(S,G,P)
→ commit Runtime=stopping/failed/stopped/replaced + no DataAuthority
→ capture one Renderer-visible payload
→ advance rendererRevision once
```

There MUST NOT be an observable intermediate Snapshot that keeps stale DataAuthority after the Runtime has left ready。

Only generation exhaustion may produce：

```text
Runtime=ready + no fresh DataAuthority
```

because exhaustion MUST NOT mutate Runtime/Frame authority。

No EventBus / TransactionManager / DataAuthorityManager is introduced；this reuses the existing Main serialized commit discipline。

---

## 6. Generation

`generation`：

```text
positive safe integer
Subsystem-scoped within one Session
strictly increasing on fresh DataAuthority epoch
never reused
not required to be contiguous
```

It is NOT：

```text
connection attempt number
reconnect count
carrier id
Renderer participant id
Frame / Activation id
Render revision
```

Fresh Runtime instance for the same subsystemKey：

```text
future G2 > every prior generation for that subsystemKey in this Session
```

If historical high-water is `Number.MAX_SAFE_INTEGER`：

```text
MUST NOT wrap/reuse
→ this Session cannot mint another DataAuthority for that subsystemKey
→ Runtime / Frame authority remains unchanged solely for this reason
→ a fresh Session is required for a new generation universe
```

Exhaustion does not become Runtime failure or Frame unwind and does not invent another generation。

---

## 7. Projection / Revision

M7 `dataAuthorities=[]` becomes a pure projection from committed Main state。

Projection MUST be deterministic；array ordering carries no authority semantics。Implementation MAY naturally follow existing subsystem iteration order but MUST NOT add a sorting registry or freeze that order as a cross-layer protocol fact。

```text
DataAuthority add / remove / generation change
→ rendererRevision advances exactly once with that visible commit

Data carrier loss / same-generation reconnect
→ no rendererRevision change
```

Wire/schema validation stays in `@loomrealm/renderer-control`；Main does not duplicate it。

---

## 8. Qualification

Must prove：

```text
not-ready Runtime → no DataAuthority
normal ready transition → ready + S/G1/P in one visible commit
no normal ready/no-authority intermediate Snapshot
ordinary Frame/Activation changes do not change G
Data carrier facts cannot mutate Main authority
normal ready exit → non-ready + authority removed in one visible commit
fresh Runtime same S → G2 > G1
Renderer replacement alone keeps G
DataAuthority visible commit bumps Renderer revision exactly once
Data loss/reconnect alone does not bump Renderer revision
profile exactly loomrealm.renderer-data/1
no generation reuse/wrap
exhaustion creates no fresh authority and does not fail Runtime/Frame
projection ordering deterministic but semantically irrelevant
no Data authority shadow registry/manager
```

---

## 9. Frozen Closure

M8/01 is implementation-ready when：

```text
Main has one DataAuthority policy
Runtime lifecycle and DataAuthority consequence share one visible commit
generation is logical authority epoch, never connection attempt
exhaustion is fail-closed without Runtime/Frame mutation
Renderer replacement/reconnect do not spuriously bump generation
Snapshot remains pure projection
no physical Data material enters Main
```

M9 Broker、M10 Input、M11 Render MUST NOT move these authority responsibilities out of Main。
