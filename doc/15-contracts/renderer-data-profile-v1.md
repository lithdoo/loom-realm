# Renderer ⇄ Subsystem Data Application Profile v1

> 层级：正式契约 / Application Profile  
> 状态：Revised normative candidate / Docs Freeze HOLD / not implemented  
> Profile 版本：1  
> Profile 标识：`loomrealm.renderer-data/1`  
> 稳定程度：Pending formal Docs Freeze  
> 主要定义：Renderer ⇄ Subsystem current Data Connection 上 Data Connection v1、User Input v1、Render Update v1、Viewport State v1 的固定版本组合、application-unit mapping、单 reader/dispatcher、单 writer、方向约束、fresh-carrier 组合与 Data-local terminal boundary  
> 依赖：[Renderer ⇄ Subsystem Data Connection v1](./renderer-subsystem-data-connection-v1.md)、[User Input v1](./user-input-v1.md)、[Render Update v1](./render-update-v1.md)、[Viewport State v1](./viewport-state-v1.md)  
> 上游 authority：[Main ⇄ Renderer Control v1](./main-renderer-control-v1.md)  
> Conformance：[Renderer Data Profile v1 Conformance, revision 3](./renderer-data-profile-conformance-v1.md)  
> 决策：[ADR 0025](../decisions/0025-renderer-data-profile-v1-preimplementation-closure.md)、[ADR 0036](../decisions/0036-preimplementation-viewport-profile-v1-correction.md)  
> 最近复核：2026-09-18；冻结与实施状态只看[唯一账本](../30-implementation/viewport-core-freeze-ledger.md)。

本文使用 `MUST`、`MUST NOT`、`SHOULD`、`MAY` 表达规范强度。本文是**自包含的新版组合合同**：保留旧 Profile 的全部不变语义，明确替换 closed child set、方向、fresh baseline 与 conformance；旧实现仍是三 child，本次文本不是代码已实现，也不表示 Docs Frozen。旧正文可通过 Git 历史追溯，不是另一份 current normative contract。

核心原则：

> **DataAuthority 选择一套完整 Data Application Profile；首次发布前经 ADR 0036 明确修订 Profile v1 静态绑定 Connection 1 + User Input 1 + Render Update 1 + Viewport State 1。一个 current carrier 只有一个 inbound reader/dispatcher 与一个 outbound serialized writer；共享 carrier 只共享 application-unit ordering 与 terminal boundary，不创建跨 child protocol authority、revision、transaction、ACK 或 replay。**

---

## 1. Composition / Identity

```text
Renderer Data Application Profile v1
├── Data Connection Contract v1
├── User Input Protocol v1
├── Render Update Protocol v1
└── Viewport State Protocol v1
```

固定版本：

```text
Data Connection = 1
User Input      = 1
Render Update   = 1
Viewport State  = 1
```

Profile 标识固定：`loomrealm.renderer-data/1`。任何实现声明支持**本修订后的** Profile，MUST 完整支持四个 child；不得缺一仍宣称符合新 `/1`。`npm package semver != Data Profile version != child protocol version`。

ADR 0036 明确批准无外部 npm 消费者的首次发布前同 identity 协调修订；旧三-child与新四-child `/1` binaries **不支持混连**，所有实际相连的 Data/Renderer/Subsystem/adapter 必须同一个 build cohort。没有 wire fingerprint、handshake、协商、dual parser 或自动降级。如果出现具体非 npm 旧 peer 必须互通，停止混版部署并另定迁移方案，不在本合同中偷偷引入 `/2`。

---

## 2. Selection / Authority Boundary

Main 通过 Renderer Control 发布：

```ts
interface RendererDataAuthorityV1 {
  readonly subsystemKey: string;
  readonly generation: number;
  readonly dataProfile: "loomrealm.renderer-data/1";
}
```

`dataProfile` 是 complete application-stack identity，不是 transport、endpoint 或 credential：`dataProfile != websocket != messageport != endpoint/ticket/Port`。

Profile 不 mint/mutate Session、Renderer participant、subsystemKey、generation、dataProfile、InputTarget、Frame/Activation 或 Render Domain business authority；Main 也不持有/转发 Viewport width/height。只有 Platform DataConnectionBroker 完成 paired installation，且 exact current `S/G/P` authority 仍成立后，该 carrier 才交给 Profile mechanics 作为 current application carrier。

若当前 `dataProfile` 任一端无法实现，不得将不受支持的连接冒充 current application binding，也不得尝试解析近似 Profile；Data Connection remains absent。这本身不等于 Runtime failure，也不改变 Frame authority。

Profile replacement `P1 → P2` MUST 作为 DataAuthority replacement 且使用 fresh generation，不能 same generation 静默换 application semantics。本次获批准的旧/新 `/1` 同 identity 修订是**部署构建批次整体替换**，不是支持在一个运行中的 generation 中混用两个实现。

---

## 3. Application Unit / Common Preflight

每个 current carrier application unit：

```text
one carrier application unit
= one UTF-8 JSON text string
= one child-protocol message object
```

Hostra/WebSocket：one complete WebSocket text message = one application unit，binary 禁止承载 Profile traffic。PWA/MessagePort：`postMessage(string)` = one application unit；不得 `postMessage(object)` 扩大 application value model。Structured Clone/Transferable 只用于 Platform bootstrap/provisioning，例如转移 MessagePort。

四个 child 共享同一 common hard gate：

```text
max application unit actual UTF-8 bytes  1,048,576
max JSON container nesting depth        64
```

Profile receiver MUST 在 child semantic handling 前统一：

```text
carrier unit is string
→ actual UTF-8 bytes <= 1 MiB
→ Wire parseJsonText
→ Wire representation validation
→ JSON container depth <= 64
→ top-level exact type discrimination
→ child exact validation
→ direction validation
→ role handler
```

实现不得先无界 buffer/parse 后拒绝。其余 identifier/count/payload/structural limits 由相应 frozen child 拥有；Profile 不建立冲突的第二份业务 limits。禁止 application model：`undefined`、`BigInt`、`NaN/Infinity`、`ArrayBuffer/Blob`、`MessagePort/Host object`、`Function/Symbol`、JSON-RPC batch、在同一 unit 装多个 application messages。

Source duplicate JSON members 继续遵循 frozen Wire/ECMAScript `JSON.parse` observable semantics；不得新增第二 tokenizer/parser。字面量 `NaN`/`Infinity` 并非有效 JSON，作为 inbound raw text 导致 `profile` parse fatal；若 trusted local caller 向 outbound send 传入非法 JS number，属于 local-fatal，不伪装成远端 viewport wire violation。

---

## 4. Exact Namespace / Direction Surface

Profile v1 的 application namespace 为 `input.*`（User Input）、`render.*`（Render Update）与**唯一已识别** `viewport.state`（Viewport State）；`viewport.*` 不等于开放扩展族。完整 exact message kinds：

```text
Subsystem → Renderer
    input.interest
    render.domains
    render.snapshot
    render.patch
    render.event

Renderer → Subsystem
    input.state
    input.event
    input.reset
    viewport.state
```

`viewport.state` exact own-key `{type,width,height}`，width/height 为 positive safe integer CSS logical pixels；child wire/schema 的唯一权威为 [Viewport State v1](./viewport-state-v1.md)。未知 top-level type、未知 `viewport.foo`/namespace 为 `protocol:"profile"`；known `viewport.state` 的 shape/value/direction/explicit semantic violation 为 `protocol:"viewport"`；既有 `input.*`/`render.*` 分类不变。Common JSON/encoding/byte/depth invalid 为 `profile`。错方向、cross-namespace masquerading、child exact-schema/representation/limit invalid 均 protocol-invalid / Data-fatal；不得猜测、downgrade 或忽略为未知扩展。合法 JSON 的负数、0、fraction、unsafe Viewport 数值属于 child invalid；wire 原始 JSON 无 inherited property/getter 概念，二者只对本地 caller/source validation 测试有意义。

未来增加另一种 Viewport message、第五 Render message、第五 Input message或改变方向，必须经过显式 child/Profile version/governance；不得静默扩张当前 `/1`。

---

## 5. One Connection-wide Reader / Dispatcher

每个 current Data carrier MUST 恰有一个 logical inbound reader：

```text
carrier.messages()
        ↓
one reader
        ↓
common preflight / parse
        ↓
exact type discrimination
       /      |       \
 input.*   render.*   viewport.state
```

Input/Render/Viewport 实现 MUST NOT 各自调用 `carrier.messages()` 竞争消费。Dispatcher 固定：`input.interest/state/event/reset` → User Input role handler；`render.domains/snapshot/patch/event` → Render role handler；`viewport.state` → Subsystem Viewport role handler。一个合法 unit 只 dispatch 一次；child disposition settle 后才开始下一条 protocol effect。

Response/RPC correlation 不存在，Data Profile 不是 JSON-RPC profile。Child role handler 可维护自己的 authority/state machine，但不能绕过 shared reader。

---

## 6. One Connection-wide Serialized Writer

每个 current Data carrier MUST 恰有一个 logical outbound serialized writer。所有 outbound Input/Render/Viewport units：

```text
child message validated/materialized
→ shared writer queue
→ carrier.send(string)
```

要求：at most one `carrier.send` pending at a time；accepted send order == writer dequeue order；no adapter/profile-created retry、duplicate 或旧 carrier verbatim migration。Single writer 只保证 shared carrier ordering 和 bounded terminal，不创建 shared revision、cross-child transaction、atomic commit、ACK 或 replay cursor。

Child protocol 自己的 barrier/coalescing 规则仍由 child sender mechanics 拥有（Input State/Event/Reset、Render Event/authoritative-state barrier），Profile writer 不得打乱。Viewport sender 在 shared writer **admission 前**执行 latest-wins，每 peer 最多一条 admitted/unsettled `inFlight` 和一条未 admission `pending`，唯一算法见 [Viewport State v1 §4](./viewport-state-v1.md)；不得 raw resize 每条进入 writer 再去重。`sent` 仅表示 current carrier local acceptance，不是远端 ACK。

---

## 7. Child Semantic Outcome Boundary

Profile 负责 representation、namespace/direction、shared dispatch/writer 与 Data-local terminal。Child 继续各自拥有 stateful semantics：

```text
User Input
    Interest/Activation/current-gate applicability
    State/Event/Reset semantics
    stale input drop

Render Update
    Domain registry/baseline/revision continuity
    Patch atomicity/one-shot identity
    stale Event drop

Viewport State
    last valid logical size + publisher coalescing
    Runtime retained readonly observation
    no Frame/Input/Render business authority
```

通过 Profile/static child validation 的消息，child handler 必须显式返回 `accepted/handled`（包含 child 契约允许的 well-formed stale/inapplicable drop）或 `protocol-fatal`（child 契约规定的 stateful semantic violation）。普通 business/presentation/Viewport listener exception 并非远端无效协议证据，不得伪造成 protocol-invalid；role 在自身本地 boundary contain callback throw/reject。

---

## 8. Ordering Boundary

Data carrier 每方向保持 application-unit order；同方向已 emitted child messages 有物理顺序，但 Profile 不赋予跨 child application meaning。User Input ordering/recovery → Input v1 owns；Render ordering/recovery → Render v1 owns；Viewport publication/retention → Viewport v1 owns。

不得建立 shared Data revision、Input↔Render↔Viewport ACK join、cross-domain transaction、resume-from-revision、Control/Data barrier RPC。Renderer Control Connection 与 Data Connection 依旧没有 global total order；Viewport fresh baseline 与 Input/Render fresh baseline 不构成 super-snapshot 或 fixed cross-child barrier。

---

## 9. Fresh Current Carrier Boundary

每个 newly installed current Connection instance 都是 fresh Profile publication boundary。旧 carrier retired 后 MUST stop reader/trust/send，未发旧队列 obsolete，无 replay/migration。

**Input fresh baseline：** remote Frame Interest Registry、retained Input State、Event history 视为空。Subsystem 若仍有 Desired Interest，重新发布 current full Registry；重新 Effective 的 `.state` 建 fresh baseline；`.event` future-only。

**Render fresh baseline：** first Render message = current `render.domains`，随后 each current Domain fresh `render.snapshot`，再 ordinary Patch/Event。Same-generation reconnect 不得沿用旧 carrier publication cursor/revision base 作 fresh authority。

**Viewport fresh baseline：** 每个新 current RendererDataPeer 的 publisher cursor 为空；安装 current 后，若 participant source 有最新合法归一化尺寸，必须发送该尺寸 baseline（即使 wire 值与旧 carrier 相等）；无合法观测则等待首个样本。Subsystem 的 Runtime-scope retained size 在 Data loss 时不清空，同值 fresh baseline 不重复通知业务；不同值先更新 getter 再通知。不能从旧 carrier 迁移 unsent pending、inFlight 或旧 Promise continuation。

独立性：fresh Input publication != fresh Frame lifetime；fresh Render publication != business Domain recreation；fresh Viewport publication != Runtime restart 或 Renderer participant replacement；same-generation reconnect != Runtime restart；fresh Data generation != automatic Activation replacement。Viewport 不受 InputTarget/Interest/Activation/Frame/focus gate。

---

## 10. Terminal / Failure Boundary

Profile application mechanics 遇到 carrier closed/lost、common preflight/JSON/profile namespace violation、child static schema/representation/limit invalid、child explicit stateful protocol-fatal、writer failure 或 local profile mechanics fatal，当前 peer MUST terminal。Terminal first-wins；停止普通 operations；pending writer work settle exactly once；本地发现 protocol/local fatal 时 best-effort close current carrier；terminal 后不可继续 parse/send。

Remote protocol invalid 的 family：common/unknown → `profile`；recognized Input → `input`；recognized Render → `render`；recognized Viewport → `viewport`。Trusted local invalid outbound → `local-fatal`。Viewport consumer listener throw/reject 必须在 Subsystem 本地 contain，不导致 Data protocol-fatal。

Profile terminal 仅表示当前 Data application binding 不可用；**不得直接**触发 Runtime terminal、Frame unwind、InputTarget mutation、DataAuthority replacement 或 Renderer participant failure，这些属于 Main/Supervisor/Platform 更高 authority。Connection Core 最终将 carrier 视为 retired；若 `S/G/P` 仍 current，Platform 可建立 same-generation fresh carrier。

---

## 11. Bounded Backpressure

Profile writer queue 与所有 child sender queues MUST bounded。Profile 不规定跨 child 固定 queue capacity，但保证 no unbounded accumulation、terminal/authority teardown 不被 backlog 永久阻塞、no retry/replay，且 child-prescribed priority/barrier enforceable。

Input/Render 可在 emitted 前依各自规则 coalesce/drop；Viewport 按 §6 引用的 child 算法在 writer admission 前 coalesce；一旦 `carrier.send()` accepted，该 unit 属于当前 carrier history，不得 retract/reorder/migrate。现有 DataRuntime writer 的 1024 capacity 只是实现事实，不是规范通用上限。Viewport 最多占每 peer 一个 admitted/unsettled slot，不得因尺寸风暴使其他 Input/Render 饥饿；若共享 writer 永远阻塞，不保证最终收敛。

---

## 12. Version Evolution

首次发布前经 [ADR 0036](../decisions/0036-preimplementation-viewport-profile-v1-correction.md) 显式批准的同 identity、全 cohort 修订，是对旧 frozen Profile closed child set 的一次有治理例外，**不是**允许未来静默更改。形成真实 compatibility boundary 后，以下任何改变必须显式新 Data Profile identity 或版本化迁移：Data Connection/Input/Render/Viewport child version、application-unit encoding/mapping、namespace ownership/direction、one-reader/one-writer、fresh-carrier composition、common terminal/fail-closed behavior。不在相同 generation 静默更换不同 application semantics。

---

## 13. Conformance

Normative qualification 由 [Renderer Data Profile v1 Conformance](./renderer-data-profile-conformance-v1.md) 的 `fixtureSetRevision=3` 固定，且必须满足 Input、Render、Data Connection、Viewport 各自当前 conformance；原 revision2 的完整义务（包括 User Input revision2 mutation gate 与 bounded backlog）仍是现行必须测试的义务。

至少证明：profile-exact-identity-and-four-child-binding；one-json-text-unit；common-1mib-depth64-preflight；single-reader-dispatcher；single-serialized-writer；exact-role-direction；input-render-viewport-type-routing；unknown-type-fail-closed；child-protocol-fatal-retires-profile-peer；fresh-carrier-child-baselines；old-unsent-not-migrated；terminal-first-wins；no-profile-retry-replay；control-data-no-total-order；Hostra/PWA same-data-profile-trace（最终跨平台 qualification 阶段）。

Executable fixture materialization 属 implementation qualification；本合同存在不表示本轮已经测试、已通过或正式 Frozen。新代码必须在同一 executable/cohort SHA 运行全部本轮及旧回归；fake viewport source vertical 只证明架构，不证明真实 Desktop/Map resize。

---

## 14. Final Invariants

1. `loomrealm.renderer-data/1` 修订目标 = Connection1 + Input1 + Render1 + Viewport1；旧 executable 仍是三 child，禁止混版互通。
2. Profile 不新增 Data handshake/RPC/ACK/revision；Main 仍不存尺寸。
3. `dataProfile` 是 complete application stack identity，不是 transport/credential；真实 Profile identity change 必须 fresh Data generation。
4. One carrier unit = one UTF-8 JSON text string；common preflight = 1 MiB + depth64 + frozen Wire parse/representation。
5. Exactly one connection-wide reader/dispatcher 与 one connection-wide serialized writer。
6. Direction fixed：Subsystem 发 Interest+Render，Renderer 发 Input State/Event/Reset+Viewport State。
7. Input/Render/Viewport 保持独立 authority/state/recovery；Viewport 是只读呈现尺寸观察，不授予 Frame mutation permit。
8. Fresh current carrier 重建三个 child publication baselines，不 replay/migrate 旧流量，也没有跨 child atomic baseline。
9. Data/Profile terminal 不等于 Runtime/Frame failure；Platform Broker 拥有 candidate/paired installation，Profile 只消费 already-current carrier。
10. 未来 incompatible observable change 必须版本化/迁移；Docs Freeze、实现、架构资格与产品资格分别验收。