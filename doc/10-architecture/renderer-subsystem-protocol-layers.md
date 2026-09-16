# Renderer ⇄ Subsystem 协议分层

> 层级：系统架构 / Active Design  
> 稳定程度：Control、Connection、Input、Render、Profile v1 Frozen；Viewport v1/Profile v2 Candidate/Not Frozen  
> 主要定义：Control authority、Data current connection、Profile v1/v2、Input/Viewport/Render child ownership与 Platform provisioning分层  
> 依赖：[System overview](./system-overview.md) · [Viewport architecture](./viewport-capability.md) · [Platform composition](./platform-composition-system.md)  
> Formal：[Control v1](../15-contracts/main-renderer-control-v1.md) · [Connection v1](../15-contracts/renderer-subsystem-data-connection-v1.md) · [Profile v1](../15-contracts/renderer-data-profile-v1.md) · [Profile v2](../15-contracts/renderer-data-profile-v2.md) · [Input v1](../15-contracts/user-input-v1.md) · [Render v1](../15-contracts/render-update-v1.md) · [Viewport v1](../15-contracts/viewport-state-v1.md)  
> Decision：[ADR0036](../decisions/0036-viewport-state-and-renderer-data-profile-v2.md)；最近复核：2026-09-16

本文件是 authority/role map；exact wire、validation、callback、terminal与 source freshness以各 formal contract为准。保持 v1 immutable，不在 architecture层另造协议。

## 1. Layer map

```text
Main (Session / Runtime / Frame / Stack / Activation / InputTarget / DataAuthority)
 │ Renderer Control v1, committed authority snapshots
 ▼
Renderer (readonly Main mirror, input producer, layout viewport observation, Render replica)
 │ Broker paired installation according to exact (Session,Renderer,S,G,P)
 ▼
Renderer Data Profile
 ├─ /1 Frozen   Connection1 + Input1 + Render1
 └─ /2 Candidate Connection1 + Input1 + Render1 + Viewport1
 │ one reader/dispatcher, one serialized writer, shared Data-local terminal
 ▼
Subsystem Runtime (Input Interest, retained viewport, Render Domains)
```

Main不转发 Input、Viewport width/height或 Render payload；Broker不拥有 profile generation；physical transport不创造 authority。

## 2. DataAuthority and profile selection

Main发布 `{subsystemKey,generation,dataProfile:string}`；同一 Session/current Renderer/subsystemKey最多 0..1 current Data Connection。candidate在 paired readiness+commit-time authority revalidation成功前不可发送/接受应用消息。`P1→P2`需要 fresh generation；same G/P可换 carrier并重建 publication baselines，不重建业务 Runtime/Frame/Domain。Control与Data无 global total order。

Frozen Control v1 §13/Connection v1 §6 的“Phase 1 profile=/1”是当时实现基线，而不是限制 Control `dataProfile:string`未来永远只能 `/1`；Profile v1的专用类型仍只适用于 v1 peer。Target implementation subject Main policy对其所有 current Subsystem DataAuthorities统一选 `/2`，broker exact配对；不做 per-Subsystem profile preference、Game Entry request、feature negotiation或 silent `/1` fallback。若端点不共同支持当前 `/2`，Data absent而非偷偷降级。v1 exact acceptance集合保持不变。

## 3. Shared Profile mechanics / exact direction

```text
one unit = one UTF-8 JSON text string
common preflight: 1 MiB UTF-8 / JSON depth ≤64 / Wire representation
one connection-wide ordered inbound reader + exact type dispatcher
one serialized bounded writer (no direct child raw carrier writer)
terminal first-wins; old carrier queued work not replayed/migrated
```

Direction：Subsystem→Renderer `input.interest; render.domains/snapshot/patch/event`；Renderer→Subsystem `input.state/event/reset; viewport.state`（最后一种仅 `/2`）。Unknown/extra/known wrong direction Data-fatal；child exact-validation先于 semantic mutation。Input/Render/Viewport共享的是 unit ordering/reader/writer/terminal，**不是** revision、transaction、ACK、barrier、cross-plane causal join。`viewport.state`对 `/1` 必须 fatal而不是可忽略 optional extension。

Profile-v2 diagnostic：common/unknown `protocol:"profile"`，Input/Render沿 Frozen v1，已识别 `viewport.state` 后 child malformed/fatal统一 `protocol:"viewport"`。v2可用新的 terminal union表达而不扩大 v1 peer的 observable terminal类型；任一 Data child fatal只退休 Data，不自动 Main authority mutation、Runtime fail或 Frame unwind。Listener本地失败不是 protocol-invalid。

## 4. User Input: separate three lifetimes

```text
Desired Interest[F]       Frame-scoped / Subsystem-owned
Input lease(F,A)          Activation-scoped / Main InputTarget-owned / one-shot
wire publication state    current carrier-scoped Interest Registry + State + Event
```

`Effective = current Data(S,G,P) ∧ Main InputTarget(S,F,A) ∧ local/mirrored current active Activation ∧ channel in Interest[F] ∧ Producer available`。Interest/Producer只能缩小，不能从 DOM focus/component existence/Render status mint InputTarget。Subsystem再做本地 gate；well-formed stale input drop-only。

Input `.state` self-contained/latest-wins/coalescible before emitted；`.event` transient/ordered/no replay；`input.reset(F,A)`清 old lease retained State、不改 Interest、构成 global State coalescing barrier。标准 Keyboard/Pointer/Gamepad sibling state/event都 effective时，physical transition先 post-transition State后 Event。Direct A1→A2 old lease ends→best-effort Reset(A1)→A2 ordinary Input。Frozen标准输入只有 keyboard physical codes、Renderer input surface normalized fixed-point pointer、standard gamepad normalized values；不复制 DOM/OS API object。无法映射的其他能力可用 `x.*` ordinary channel，但 viewport的不同 lifetime已证明它不能如此表达。

## 5. Viewport: independent Runtime observation

v1一个 current Renderer participant只观察其**document layout viewport** `innerWidth/innerHeight` floor positive safe integer CSS pixels，所有 current `/2` Subsystem连接得到同 raw size；不支持 multi-surface identity。Viewport object为 Subsystem Runtime-scoped；author `current` = last accepted observation，wire cursor per current Data carrier。Frame suspend/InputTarget loss、blur/focus、Input Interest/Producer不 gate viewport。`current` non-null不证明 carrier/Renderer/paintability。

每 carrier Viewport sender至多一个 admitted/in-flight unit + 一个 not-yet-admitted latest slot。合法 resize burst覆盖 pending而不填满 shared writer，已 admitted不能撤回，fresh carrier独立取最新合法 sample作为 baseline；不能触动 frozen `/1` writer或加入 generic priority。旧 source/old carrier/old generation queued callbacks被 current identity fence；fresh Renderer同一 Runtime可短暂保留 last observation，必须由 matching fresh baseline最终收敛。无合法 sample不发0/null/default。详见 [Viewport State v1](../15-contracts/viewport-state-v1.md)。

Viewport value只能由业务据已提交 world facts决定如何投影，然后通过普通 RenderDomain提交；Viewport receiver不直接修改 Store/Projector，更不允许 suspended Frame借 resize自动进行 movement/transfer/call。

## 6. Fresh carrier / failure

```text
Input: fresh remote Interest registry, fresh State baseline, Event future-only
Render: first render.domains registry → snapshots → ordinary patch/event
Viewport (/2): fresh legal sample baseline when available; otherwise first legal later
```

三 child baseline独立，无 atomic super-snapshot或固定先后；Control/Data可任意相对顺序但按各 owner/currentness收敛。Same G reconnect不重建 business Domain/InputListener/Viewport capability；Render wire Domain lifetime沿 Frozen v1；Viewport last value保留，等值 baseline无 callback。fresh G Render wire universe遵循 Frozen语义，Viewport retained value在同 Runtime存活时保留等待新 current baseline。

Well-formed authority-inapplicable Input按 Frozen规则 drop；Input/Render/Viewport malformed各自 child fatal退休 Data；不自动创建 Frame unwind/Runtime failure/RenderDomain destroy。Data retire不使旧 renderer Store变第二份 authority；presentation保持/冻结沿 M13当前性规则。

## 7. Platform realization / exclusions

Hostra Broker通过 Runner provisioning IPC→Data WebSocket，PWA通过 MessageChannel→transferred Ports；只供 physical paired establishment，应用 payload都以 string unit传。Desktop/PWA viewport source均实现同一 layout-viewport CSS pixels观察，可独立于 keyboard focus；不暴露 DOM object给 Runtime、不存 width/height于 Main。窗口 reload=fresh Renderer participant；same-generation Data-only reconnect=同 Renderer逻辑身份、新 carrier。禁止 Environment service locator、viewport interest、InputTarget bypass、Main geometry mirror、cross-child ACK、generic queue manager或 multi-window routing。

## 8. Governance

Core Docs Freeze需要 formal contract + executable-ready conformance + docs-only SHA cross review；implementation PASS另在新的 executable subject资格 ledger记录。Map PR0性能证据是独立 Map Freeze gate，不能把 Core protocol自洽当作 payload/latency PASS。