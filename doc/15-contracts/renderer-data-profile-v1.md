# Renderer ⇄ Subsystem Data Application Profile v1

> 层级：正式契约 / Application Profile  
> 状态：**Revised preimplementation normative candidate / Docs Freeze HOLD**（原三-child Frozen baseline已被 ADR0037 显式 reopen；当前 executable仍为旧版）  
> Profile 版本：1；标识：`loomrealm.renderer-data/1`（唯一目标 identity）  
> 主要定义：Data Connection v1 + User Input v1 + Render Update v1 + Viewport State v1 的唯一完整组合、unit mapping、role direction、single reader/writer、currentness与Data-local terminal  
> 依赖：[Data Connection v1](./renderer-subsystem-data-connection-v1.md) · [User Input v1](./user-input-v1.md) · [Render Update v1](./render-update-v1.md) · [Viewport State v1](./viewport-state-v1.md)  
> Authority：[Main ⇄ Renderer Control v1](./main-renderer-control-v1.md)；测试：[Profile v1 Conformance](./renderer-data-profile-conformance-v1.md)；决定：[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)（更新 [ADR0025](../decisions/0025-renderer-data-profile-v1-preimplementation-closure.md)/[ADR0036](../decisions/0036-viewport-state-and-renderer-data-profile-v2.md)）  
> 最近复核：2026-09-16

**这是一项有记录、尚未完成实现与兼容核查的 Frozen preimplementation correction，不是声称旧 `/1` executable 已支持 viewport，也不是在已发布系统上静默修改协议。** 若有真实外部兼容义务，立即停止直接重置并重新评审版本/迁移。`MUST / MUST NOT / SHOULD / MAY` 表达候选的最终约束。

---

## 1. 唯一完整 Profile / 版本与职责

```text
loomrealm.renderer-data/1
├── Renderer ⇄ Subsystem Data Connection v1
├── User Input v1
├── Render Update v1
└── Viewport State v1        [新增 child，独立于 InputTarget]
```

任何声称实现**修正后** `/1` 的 peer MUST 完整支持四个 child；旧只实现三个 child 的 `/1` peer是 historical implementation，**不得与修正后 peer混配或宣称 conformant**。不发布 `/2`，不建 compatibility parser、deprecated alias、feature bits、profile negotiation或 silent fallback。npm semver、Profile identity、child versions、conformance fixture revision彼此独立。现有代码/历史 PASS不得充当修正后资格证据。

## 2. Main selection / current binding

Main唯一拥有 Session、Renderer participant、DataAuthority `{subsystemKey,generation,dataProfile}`及 profile selection；其 Control v1 wire `dataProfile: string` 不改变。Platform Broker仅建立经过 paired readiness和 commit-time current revalidation 的 exact `(Session,Renderer,S,G,P)` carrier；不 mint/upgrade/downgrade authority，也不从 Subsystem 名称或 map presence选择 profile。Profile peer仅消费已安装 current carrier；不能创建 Frame、InputTarget、Render authority。

**跨 consumer 协议义务：** 当 authority 指定 `loomrealm.renderer-data/1`，两端 MUST完整实现本修正版，身份不匹配或 endpoints不支持时 Data absent；Data absent本身不等于 Runtime/Frame failure。**当前产品部署决定**（统一选择 `/1`、协调升级全部 endpoints）属于 [Viewport qualification/implementation ledger](../30-implementation/viewport-profile-v1-qualification.md)，不是 profile 自身的 universal rollout MUST。旧 executable `/1` 与修正 `/1` 不允许运行时混搭；新 executable subject/资格证明后才启用。未来真正 P1→P2 仍遵守 Frozen Connection profile-replacement→fresh generation；本次首次实现前文档 correction不假装发生了一个 `/1→/2` 迁移。

## 3. Application unit / common preflight（原有机制不变）

```text
one carrier application unit = one UTF-8 JSON text string = one child message object
Hostra WebSocket: one complete text message; binary forbidden
PWA MessagePort: postMessage(string); structured clone/transfer仅 Platform bootstrap
```

Receiver MUST 在任何 child semantic mutation前进行：unit为 string→**actual UTF-8 bytes ≤1,048,576**→现有 Wire `parseJsonText`/representation gate→JSON container depth ≤64→exact top-level `type`/role direction→child exact validation。不得先无界 buffer/parse；不得改变既有 identifier/payload/Render limit。`undefined`、BigInt、NaN/Infinity、Function/Symbol、host objects、ArrayBuffer/Blob、JSON-RPC Batch与单 unit 多消息非法。Duplicate JSON keys沿既有 Wire/ECMAScript JSON.parse observable规则；不另造 parser。Viewport不能绕过通用前置验证。

## 4. Exact kind / direction

```text
Subsystem → Renderer:
    input.interest
    render.domains | render.snapshot | render.patch | render.event

Renderer → Subsystem:
    input.state | input.event | input.reset
    viewport.state
```

三个 namespace：`input.*`、`render.*`、`viewport.*`。`viewport.state` 的 exact own three fields `{type,width,height}`、CSS logical positive safe integers、retained/latest/fresh baseline等以 [Viewport State v1](./viewport-state-v1.md) 为唯一 child SSOT。Unknown type、known wrong direction、cross-namespace masquerade、malformed JSON、child exact-invalid均 Data protocol-fatal；不得忽略当可选扩展。将来改变 child 组合/方向/编码/identity须在形成兼容性义务后显式 version/migration，不能以本 preimplementation 例外无限静默修改。

## 5. Single reader and ordered dispatcher

每 current carrier恰有**一个** logical `carrier.messages()` reader：

```text
common preflight → exact type/direction discriminator
    input.*    → Input role handler
    render.*   → Render role handler
    viewport.* → Viewport role handler (Subsystem receive only)
```

任何 child不得竞争 raw reader；一份合法 unit只 dispatch到对应 child一次。Profile不是 JSON-RPC，无请求相关性。接收端先验证再 mutation；合法但过时 Input按 Frozen Input规则 drop，不能伪装为 Viewport reset。Viewport observation只更新 Subsystem readonly retained capability，不直接写 Renderer Store、Projector或 Main。

## 6. Single serialized writer / viewport bounded publisher

每 carrier每方向恰有一个 shared serialized writer，任一时刻最多一次 `carrier.send(string)` pending；所有 child走同一 validated writer，已 admitted顺序不可重排，不能 raw bypass/retry/duplicate/跨 carrier搬运。单 writer只授予同方向 unit顺序，不创建跨 child authority、transaction、revision、ACK、barrier或 replay。Input State/Event/Reset、Render publication自己的 barrier/priority由各 child维持。

Viewport sender **在进入 shared writer 前**实行 [Viewport v1 §3](./viewport-state-v1.md) 的小范围规则：每 current carrier至多一个 viewport unit writer-admitted/in-flight + 一个 not-yet-admitted latest slot，新的合法 size覆盖 slot；发送结算后继续最新值直到收敛。合法 burst不得单独线性填满 shared writer导致 terminal、无界积累或永久饿死 Input/Render。不修改既有 writer的 bounded capacity/fail-closed规则，不做 generic priority scheduler。发送成功不是 author ACK。

## 7. Child semantic outcome / diagnostic

Input唯一拥有 Interest/Activation/effective gate、State/Event/Reset与 stale-drop；Render唯一拥有 Domain registry、baseline/revision/patch/identity与 stale Event；Viewport唯一拥有 retained size、sender coalescing、source/currentness/author callback。Profile只拥有 common mapping、routing、writer、Data terminal。已通过 static validation的 child handler可 `accepted`（含各 child定义的 stale-drop）或显式 `protocol-fatal`；ordinary business/WC exception不等于 remote malformed。

Terminal diagnostic family：common preflight/unknown type→`protocol:"profile"`；Input/Render malformed或 explicit child-fatal→原有 `"input"/"render"`；exact `viewport.state` 已识别、child shape/value invalid或其 explicit fatal→`protocol:"viewport"`。修正后 `/1` 实现可扩展其终态类型为四种 family；旧 `/1` executable仍是历史、必须整体重验。Viewport listener throw/reject须在 author side containment，不变成 Data terminal。

## 8. Ordering / independent publication baselines

每方向保持 admitted application-unit顺序，不赋予跨方向或跨 child业务因果。Control/Data无 global total order。Fresh current carrier retire旧 reader/writer/publication cursor、丢弃 old not-emitted units、不 replay/migrate，并独立建立：

```text
Input: remote Interest empty → full desired registry → fresh effective State; Event future-only
Render: first render.domains → each current Domain snapshot → ordinary patch/event
Viewport: 有合法 current physical sample则 fresh baseline；否则首次合法出现时发布
```

不同方向/child没有固定 baseline 排列、atomic super-snapshot或 cross-child barrier。same-generation Data reconnect不自动重建 business Frame/InputListener/Domain/Viewport object；Render revision baseline遵 Frozen规则，Viewport保留 last observation，fresh equal size不通知、different size更新后通知。Fresh generation/Renderer同一 Runtime幸存时旧 carrier/source fenced、新 matching carrier fresh baseline最终收敛；未收到新合法 sample可暂留历史 size，但不代表当前 Renderer paintability。

## 9. Terminal / failure / bounded backpressure

Carrier close/loss、common/profile violation、child protocol-invalid/fatal、send failure、local mechanics fatal均 first-wins终止当前 peer：停止读写、pending operations只 settle一次、locally fatal时 best-effort close。只退休 Data binding，不自动 Runtime terminal/Frame unwind/InputTarget mutation/DataAuthority replacement/Renderer participant failure。仍 current 的 `(S,G,P)`可由 Platform另建 fresh paired carrier；Profile自身不负责 reconnect。

Writer/child queues须 bounded，terminal不得被 backlog无限阻塞；已 sent/admitted消息不可撤回/重排。Viewport的具体 slot限额是该 child的 producer obligation，**不是**把某一实现的 `MAX_PENDING_SENDS` 值冻结成通用协议参数。

## 10. Conformance / Freeze governance

当前测试 SSOT：[Profile v1 Conformance](./renderer-data-profile-conformance-v1.md)及各 child conformance；对应 fixture revision随本次 explicit correction递增。Docs Freeze只要求 compatibility assessment + cross-document一致 + executable-ready规范 + docs SHA，不要求提前捏造测试 PASS。实施后在新 executable SHA上重跑原 v1三 child、修正 `/1` 四 child、Main/paired carrier、Desktop/Hostra及后续 PWA适用测试，按 [唯一 qualification ledger](../30-implementation/viewport-profile-v1-qualification.md)归档。任何旧历史 PASS均不自动迁移。

**Final invariants：** `/1` 是唯一目标完整 Profile；四个 child，固定 unit/preflight、one reader/writer、role-exact direction、child独立 authority与fresh baseline、Data-local terminal、Viewport readonly/bounded、Main不保存 size；绝不引入 `/2`、Input bypass或 map vocabulary。