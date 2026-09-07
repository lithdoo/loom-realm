# M11 / 04 — Render Vertical Integration

> 状态：**Planned**  
> 阶段：M11 Render  
> 落地顺序：04  
> 最近复核：2026-09-07  
> 前置：[M11 / 01](M11_01_SUBSYSTEM_RENDER_MANAGER.md) → [M11 / 02](M11_02_RENDER_PUBLICATION.md) → [M11 / 03](M11_03_RENDERER_STORE.md)

M11/04只验证真实 Main/Desktop/Hostra Data lifecycle 上的 Render authority、publication 与 replica；不加入 physical presentation。

---

## 1. Required Vertical

使用真实：

```text
Hostra prepare/Runtime hosting
Main Session/DataAuthority
Desktop DataConnectionBroker
Subsystem host + RenderManager
SubsystemDataPeer / RendererDataPeer
Renderer Render Store
```

不得用第二套测试专用 Data lifecycle替代现有 M9/M10 vertical。

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

same-generation Data carrier closes
→ business Domain survives
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
→ business Domain remains unless business explicitly destroys it

Data retire/reconnect
→ business Domain remains

fresh Data generation
→ fresh wire universe
→ surviving business Domain re-exported through fresh Registry/Snapshot
```

Render stream failure不得升级成 Runtime terminal / Frame unwind。

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

M11 vertical必须建立在现有 M10 regression baseline 之上：

```text
M10 regression remains pass
M11 package semantics pass
M11 real Render vertical pass
```

M11 不得通过修改 Input/Data authority semantics来换取 Render 实现便利。

---

## 6. Evidence

完成条件：

```text
real authority feed
real paired Data connection
fresh-carrier recovery
same-generation identity continuity
fresh-generation identity reset
Frame/Data independence
old-stream isolation
no Event replay
Runtime/Input regressions remain pass
```

通过后进入 M11/05 qualification and closure。
