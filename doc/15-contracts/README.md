# LoomRealm 正式契约目录

> 层级：正式契约索引  
> 状态：Active Design  
> 稳定程度：Evolving per-contract  
> 主要定义：current 跨角色协议/Profile、版本绑定、兼容边界与成熟度  
> 依赖：[系统架构总览](../10-architecture/system-overview.md)、[平台组合系统](../10-architecture/platform-composition-system.md)、[ADR 0027](../decisions/0027-freeze-renderer-control-v1-preimplementation.md)、[ADR 0029](../decisions/0029-user-input-v1-mutation-gate-state-convergence.md)  
> 最近复核：2026-09-07

契约层只保留跨角色/跨实现必须一致的 observable semantics；physical provisioning、Process/Worker、endpoint/ticket/Port creation默认不形成 application protocol。

---

## 1. Current Contract Map

```text
Game Package v1
Hostra Launcher / Node Runner Profile v1
PWA Launcher / Worker Runner Profile v1
Subsystem Control v1
Runtime Control Application Profile v1
Frame / Call v1                         Active / Normative / Frozen
Main ⇄ Renderer Control v1              Active / Normative / Frozen
Renderer Data Application Profile v1    Active / Normative / Frozen
Renderer ⇄ Subsystem Data Connection v1 Active / Normative / Frozen
User Input v1                           Active / Normative / Frozen
Render Update v1                        Active / Normative / Frozen
Readonly Content API v1                 Active / Normative / Evolving
```

Current User Input：

```text
protocolVersion = 1
fixtureSetRevision = 2
ADR 0023 + ADR 0029
```

ADR 0029 只修正 Subsystem mutation-gate期间 same-Activation `.state` 的 local retention/convergence；wire schema、authority、Renderer Effective、Data profile identity不变。

---

## 2. Bootstrap Boundary

```text
Game Entry
→ matching Platform Launcher full PREPARE
→ Platform-private LaunchPlan
→ LogicalGameBootstrap
→ Main narrow capability view
```

Main不读取 Game document/formatVersion/module/path/URL/Node/Worker options。

---

## 3. Runtime / Frame

Runtime Control owns protocol mechanics：one UTF-8 JSON text unit、one reader、one writer、strict sender IDs、finite deadlines、terminal first-wins、Response causal barrier、no retry/replay/reconnect。

Frame / Call v1：Main owns Frame/Stack/Activation/InputTarget；ACK-before-publication；post-commit no rollback；timeout/loss ambiguity→Runtime failure；fresh surviving Caller Activation。

---

## 4. Renderer Control

Renderer Control v1：

```text
one current Renderer participant
optional RendererControlBinding candidate slot
renderer.hello id=1
Main token authentication/currentness/revision
full authority Snapshot
atomic replacement
0..1 inFlight + 0..1 pendingLatest
fail-closed terminal
```

Renderer local holder不是 Main remote-currentness proof；不增加 lease/epoch/heartbeat。

---

## 5. Renderer Data Profile

```text
loomrealm.renderer-data/1
= Data Connection v1
+ User Input v1
+ Render Update v1
```

Data Connection identity：Session + current Renderer + subsystemKey + generation/profile。Data loss/provision failure != Runtime failure/Frame unwind。

Profile application unit统一 UTF-8 JSON text string。

---

## 6. User Input v1

Effective：

```text
current Data
× Main InputTarget(F,A)
× active mirrored F/A
× Interest[F]
× Producer(C)
```

Three lifetimes：

```text
Desired Interest = Frame scoped
Input Lease      = Activation scoped
Wire Publication= Data carrier scoped
```

Current revision 2 clarification：

```text
commit-sensitive mutation gate closed
    .state → retain latest if same current F/A/C, suppress business delivery
    .event → drop
    reset  → clear retained/suppressed State

known-no-commit + same Activation reopen
    → local-deliver latest retained State
    → no Event replay
```

Renderer不感知 Subsystem mutation gate。

---

## 7. Render Update

Render Domain/revision/presentation replication与 Frame/Input lifetime独立：

```text
Frame close != Domain destroy
Data retire != authoritative Domain destroy
```

fresh carrier通过 Registry + Snapshot重新建立 Render baseline。

---

## 8. Authority Summary

```text
Game Package      document validation
Launcher/Platform PREPARE + physical realization
Protocol packages wire/profile mechanics
Main              Session/Runtime/Frame/Activation/InputTarget/DataAuthority
Subsystem         business state / Desired Input Interest / Render authoritative state
Renderer          read-only Main mirror + Input/Render role behavior
```

---

## 9. Current Implementation Order

```text
M6 Hostra Runtime          ✅
M7 Renderer Control       ✅
M8 Data Role/Core         ✅
M9 Desktop Data Broker    ✅
M10 User Input            preimplementation closed / implementation next
M11 Render                pending
M12 Content               pending
M13 loom.map              pending
M14 Desktop Full E2E      pending
M15 PWA Runtime           pending
M16 PWA Full E2E          pending
```

M10 implementation依据：`M10_01`–`M10_05` + User Input `fixtureSetRevision=2`。

---

## 10. Freeze Governance

Frozen contract只有 demonstrated correctness/security contradiction、cross-contract conflict 或 real consumer capability failure 才能 reopen。

ADR 0029 按 document-governance §7 是首次 conformant implementation前的 current-v1 correction；它不授权未来继续修改 v1，也不制造 fake v2。
