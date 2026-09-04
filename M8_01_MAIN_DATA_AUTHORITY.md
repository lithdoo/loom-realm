# M8 / 01 — Main DataAuthority

> 状态：**Implementation Frozen / Preimplementation Closed**  
> 阶段：M8 Renderer Data Profile + Data Connection Core  
> 落地顺序：01  
> 最近复核：2026-09-04  
> 前置：[M7 / 05](M7_05_QUALIFICATION_CLOSURE.md)  
> 正式契约：[Main ⇄ Renderer Control v1](doc/15-contracts/main-renderer-control-v1.md) · [Data Connection v1](doc/15-contracts/renderer-subsystem-data-connection-v1.md) · [Renderer Data Profile v1](doc/15-contracts/renderer-data-profile-v1.md)  
> 目标：在 `@loomrealm/main` 中实现真实 DataAuthority allocation / generation / profile / revocation，并通过既有 Renderer Snapshot 纯投影发布；不得建立第二套 Data authority registry 或 connection manager。

> **Main 只拥有逻辑 DataAuthority；Data carrier、candidate、paired installation 与 reconnect 不属于 Main。**

---

## 1. Frozen Position

```text
Main Runtime authority
    ↓
DataAuthority {subsystemKey, generation, dataProfile}
    ↓
existing RendererAuthoritySnapshotV1
    ↓
Renderer Control
```

Phase 1 profile固定：

```text
loomrealm.renderer-data/1
```

M8 不把 endpoint、ticket、MessagePort、WebSocket、carrier 或 provisioning handle 放入 Main state / Snapshot。

---

## 2. Ownership

Main owns：

```text
whether DataAuthority exists
generation allocation / monotonicity
profile selection
Runtime replacement interaction
revocation
Renderer-visible projection / revision
```

Main does not own：

```text
physical Data establishment
paired carrier installation
same-generation reconnect attempt
Input Interest / Input State
Render Domain / Render revision
Data peer reader/writer/terminal mechanics
```

`@loomrealm/data` 继续拥有 connection-local Profile mechanics；Platform realization拥有 physical pairing；Subsystem/Renderer拥有各自 role state。

---

## 3. Minimal Main State

只增加真实需要的 authority facts：

```text
per subsystemKey:
    last allocated Data generation

per current Runtime record:
    data generation minted for this Runtime instance, if any
```

不得增加：

```text
DataAuthorityManager
DataConnectionRegistry
DataConnectionState enum
reconnect counter
carrier attempt id
Renderer-side Data shadow state
```

Current DataAuthority 由既有 Runtime authority + 上述 generation fact直接投影，不另存一份可漂移的 current DTO。

---

## 4. Allocation / Revocation Policy

Phase 1 固定：

```text
Runtime enters committed ready
→ if this Runtime instance has no Data generation:
     allocate fresh generation G
→ publish DataAuthority(S,G,"loomrealm.renderer-data/1")
```

DataAuthority 仅在 target Runtime 仍是 current application-ready Runtime 时存在。

因此：

```text
ready → stopping / failed / stopped / replaced
→ DataAuthority removed
```

Session terminal同样撤销全部 DataAuthority；无需 final Data RPC。

Data carrier loss / provisioning failure：

```text
→ Main DataAuthority unchanged
→ rendererRevision unchanged solely for Data transport loss
```

Renderer participant replacement：

```text
→ does not by itself allocate a new Data generation
```

旧 Renderer 的 Data connection因 parent participant currentness丢失而退役；新 Renderer可在同一 `S/G/P` 下获得 fresh current connection。

---

## 5. Generation

`generation`：

```text
positive safe integer
Subsystem-scoped within one Session
strictly increasing on fresh DataAuthority epoch
never reused
not required to be contiguous
```

明确不是：

```text
connection attempt number
reconnect count
carrier id
Renderer participant id
Frame / Activation id
Render revision
```

Fresh Runtime instance for same subsystemKey需要新的 DataAuthority 时：

```text
G2 > every prior generation for that subsystemKey in this Session
```

若已到 `Number.MAX_SAFE_INTEGER`：

```text
MUST NOT wrap/reuse
→ this Session cannot mint another DataAuthority for that subsystemKey
→ Runtime / Frame authority remains unchanged solely for this reason
→ a fresh Session is required for a new generation universe
```

Generation exhaustion只表示该 subsystemKey 在本 Session失去 fresh DataAuthority 能力；不得自行升级为 Runtime failure、Frame unwind或伪造 generation。

---

## 6. Projection / Revision

M7 `dataAuthorities=[]` 改为从 committed Main state直接投影。

Projection必须 deterministic；array ordering本身不携带 authority semantics。实现 MAY 直接沿用既有 `LogicalGameBootstrap.subsystemKeys` 遍历顺序，但不得为此创建额外 sorting registry或把该顺序冻结成跨层协议语义。

Renderer-visible payload变化规则保持 M7：

```text
DataAuthority add / remove / generation change
→ rendererRevision advances exactly once with that committed visible change

Data connection loss / reconnect
→ no revision change unless logical DataAuthority also changed
```

Snapshot validation与 wire representation继续由 `@loomrealm/renderer-control` 负责；Main不复制 schema validator。

---

## 7. Tests

必须覆盖：

```text
not-ready Runtime → no DataAuthority
ready commit → one S/G1/profile authority
ordinary Frame/Activation changes do not change G
Data carrier facts cannot mutate Main authority
Runtime stopping/failure → authority removed
fresh Runtime instance for same S → G2 > G1
Renderer replacement alone keeps G
DataAuthority visible change bumps Renderer revision exactly once
Data loss alone does not bump Renderer revision
profile exactly loomrealm.renderer-data/1
no generation reuse/wrap
generation exhaustion does not fail Runtime/Frame or invent a new generation
no Data authority shadow registry/manager
```

---

## 8. Frozen Closure

M8/01 complete when：

```text
Main owns one clear DataAuthority policy
ready creates logical authority
non-ready/replaced Runtime revokes it
generation is monotonic authority epoch, not connection attempt
generation exhaustion cannot wrap/reuse or mutate Runtime/Frame authority
Renderer replacement and Data reconnect do not spuriously bump generation
Snapshot remains pure projection
Renderer revision observes logical authority only
no physical Data material enters Main
```

M9 physical Broker、M10 Input、M11 Render不得反向改变本文件的 authority ownership。
