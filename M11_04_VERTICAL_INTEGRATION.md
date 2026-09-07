# M11 / 04 — Render Vertical Integration

> 状态：**Implementation Frozen / Ready**  
> 阶段：M11 Render  
> 落地顺序：04  
> 最近复核：2026-09-07  
> 前置：[M11 / 01](M11_01_SUBSYSTEM_RENDER_MANAGER.md) → [M11 / 02](M11_02_RENDER_PUBLICATION.md) → [M11 / 03](M11_03_RENDERER_STORE.md)  
> 目标：在真实 Main/Desktop/Hostra Data lifecycle 上验证 Render authority、publication 与 replica；不加入 physical presentation。

> **M11 vertical 复用现有 Runtime/Data authority，不建立第二套测试专用生命周期，也不为测试新增 Data generation allocator。**

---

## 1. Required Vertical

使用真实：

```text
Hostra prepare/Runtime hosting
Main Session/DataAuthority
Desktop DataConnectionBroker
Subsystem host + RenderManager responsibility
SubsystemDataPeer / RendererDataPeer
Renderer internal Render replica state
```

---

## 2. Core Scenario

至少证明：

```text
business Domain created
→ current Registry
→ fresh Snapshot
→ Renderer replica established
→ authoritative update commits
→ Renderer replica changes

business Domain close
→ immediately absent from desired business Registry
→ not-yet-emitted Domain work discarded
→ Registry removal
→ Renderer retires current replica

same-generation Data carrier closes
→ surviving business Domain remains
→ fresh carrier
→ fresh Registry + Snapshot
→ replica rebuilt
→ old carrier output cannot mutate current replica
```

---

## 3. Independence

必须加入对照：

```text
Frame close
→ business Domain remains unless business explicitly closes it

Data retire/reconnect
→ business Domain remains
```

Render stream failure不得升级成 Runtime terminal / Frame unwind。

fresh Data generation 语义不要求 M11 real vertical；它由 Frozen Render v1 sender/receiver deterministic fixtures证明：

```text
G1 → G2
→ fresh wire Render universe
→ surviving business Domain may be re-exported through fresh Registry/Snapshot
```

不得为了该 fixture 给 Main、Broker 或 Platform 增加 test-only generation rollover API。

Revision exhaustion 同样不要求真实 vertical 推进到 `Number.MAX_SAFE_INTEGER`；sender qualification 通过 package-private deterministic cursor state证明 no-wrap + fresh private wire-domain identity rollover，不增加 production testing authority。

---

## 4. Event / Ordering

至少覆盖：

```text
Snapshot/Patch establishes target before dependent Event
Event no replay after reconnect
removed Domain pending Event discarded
stale well-formed Event dropped
```

不要求 browser animation、paint cadence 或 DOM observable behavior。

---

## 5. Regression Gate

M11 vertical 建立在已关闭的 M10 baseline 之上：

```text
M10 full regression + qualification remains pass
M11 package semantics pass
M11 real same-generation Render vertical pass
```

不得修改 Input/Data authority semantics来换取 Render 实现便利。

---

## 6. Evidence

完成条件：

```text
real authority feed
real paired Data connection
create/update/close Registry lifecycle
fresh-carrier recovery
same-generation identity continuity
Frame/Data independence
old-stream isolation
no Event replay
Runtime/Input regressions remain pass
```

fresh-generation identity reset与 revision-exhaustion rollover属于 M11/05 sender/receiver deterministic conformance evidence，不属于 real vertical evidence。

通过后进入 M11/05 qualification and closure。
