# M11 Render 最终闭环评审结论

> 层级：实施评审 / Closure Review  
> 状态：**Closed / Requalified**
> 日期：2026-09-07  
> 适用范围：M11 Render implementation + qualification closure  
> 正式协议：[Render Update v1](../15-contracts/render-update-v1.md)  
> Conformance：[Render Update v1 Conformance](../15-contracts/render-update-conformance-v1.md)  
> Closure 入口：仓库根目录 `M11_05_QUALIFICATION_CLOSURE.md`

本评审不重新设计 M11，不修改 Frozen Render Update v1 authority、wire schema、lifetime、revision、Event 或 failure semantics。Production architecture 仍成立；评审发现的 **Render representation validation 实现闭环** 与 **formal qualification evidence 真实性闭环** 已按本文固定计划修复。

因此当前准确状态为：

```text
M11 production architecture        implemented / retained
M11 production Render core         implemented / validation closed
M11 formal qualification claim     requalified / closed
M11 transport-equivalence          still M16
```

本文定义的唯一 closure plan 与 `npm run test:m11` 已全量通过，当前结论为：

```text
M11 Render = Implemented / Qualified / Closed
```

---

## 1. 评审结论

问题不是五组独立补丁，而是两个根闭环没有贯彻到底：

```text
A. production validation closure
   Frozen representation/limits
   → author commit guard
   → Data outbound/inbound preflight
   → Renderer semantic application

B. qualification evidence closure
   Frozen Required corpus
   → exact catalog
   → exact role obligations
   → role-specific executable evidence
   → observable result
   → report/audit
   → root gate
```

当前 M11 的 authority/lifetime/abstraction shape 不需要变化。修复必须沿既有对象树完成：

```text
SubsystemHost
└── private RenderManager responsibility
    └── existing SubsystemDataPeer.render

Renderer ControlHolder
└── existing Data slot
    └── private RendererRenderStore

@loomrealm/data
└── existing Render codec / Data peer mechanics
```

禁止借本次修复新增新的 Render runtime、connection/session、replication、validation service 或通用 conformance framework。

---

## 2. Root Cause 1 — Render representation validation 未完整闭合

Frozen Render v1 要求 representation/schema/limit failure 在进入 authority/presentation semantics 前 fail-closed。当前 Render codec 已覆盖大部分 closed schema 与 hard limits，但 generic Render JSON data 与 Patch Delta 的静态 validation 仍存在缺口，尤其包括：

```text
generic data object key UTF-8 bytes 0..256
all JSON string values must be valid Unicode scalar sequences
Render Event data must satisfy the same representation boundary
Patch attrs/data Delta keys/values must satisfy their frozen static limits
```

### 2.1 唯一修复方式

在 `@loomrealm/data` **现有 Render codec 内部**增加一个 private Render JSON validation walker：

```text
Render JsonObject
→ existing plain-JSON validation
→ relative depth / member-count bounds
→ every object key UTF-8 bound
→ every string value Unicode-scalar validation
→ compact JSON byte bound
```

同一个 private Render-codec responsibility用于：

```text
RenderNode.data
RenderEvent.data
Patch JsonObjectDelta.set values
```

Patch `attrs` / Delta 自身继续由现有 Render codec 做 closed-schema validation，并补齐 frozen key/value limits。

固定：

```text
no new @loomrealm/data public export
no shared Validator service
no Render validation package
no generic schema framework
no second parser/tokenizer
```

如果需要复用一个 Unicode-scalar primitive，只允许 package-private/local helper；不得扩大 package root surface。

### 2.2 Subsystem author boundary

Subsystem author API 必须继续保证：

```text
successful createRenderDomain / replace / emit
→ value is Frozen Render v1 representable
```

因此 `RenderManager` 的 local author validation 同步补齐 generic JSON string Unicode-scalar validation。这里允许与 Data codec存在少量规则重复，因为两个 validator属于不同 trust boundary：

```text
Subsystem author validation
    owns synchronous business-call acceptance

@loomrealm/data Render validation
    owns final wire preflight / inbound representation safety
```

不得为了 DRY 把 author API 绑定到 Data send/codec result，也不得新增 public validator API。

### 2.3 Renderer boundary

`RendererRenderStore` 继续只负责：

```text
Registry/baseline/revision continuity
one-shot identity/tag
Patch precondition/algebra
isolated candidate structural validity
atomic commit
Event applicability
```

representation/schema/static-limit failure应由 Data peer在 handler 前挡住。Store 可保留必要 defensive structural checks，但不得形成第二套 wire codec。

---

## 3. Root Cause 2 — Normative catalog extraction 必须 fail-closed

Current runner直接读取 Frozen Conformance §§5–20，这是正确方向；错误在于 parser 对不符合 lowercase regex 的 Required 行进行 silent filter，导致合法 normative fixture `lastEmittedRevision-reset-per-carrier` 被遗漏。

### 3.1 修复规则

Catalog parser 固定为：

```text
read Frozen §§5..20 Required fixture blocks
→ trim non-empty lines
→ every line MUST parse as one fixture id
→ malformed/unexpected line = qualification fatal
→ duplicate fixture id merges only its role obligations
→ no silent filtering
```

不得维护第二份手写 fixture-name清单。

修复后 fixtureSetRevision 1 的 M11 application catalog 必须为：

```text
unique fixtures       = 203
subsystem-sender      = 82
renderer-receiver     = 185
role evidence pairs   = 267
transport             = 0
```

这些数字是 catalog exact audit 的结果，不得手工伪造为通过条件；如果 Frozen source后续合法 revision改变，runner必须以 source-derived set为准并显式暴露差异。

---

## 4. Root Cause 3 — Evidence identity 必须是 `(fixture, role)`

一个 fixture callback 成功不能自动扩散成该 fixture 所有 claimed roles 的 pass。

Formal evidence 的最小 identity 固定为：

```text
(protocol, protocolVersion, fixtureSetRevision, role, group, fixture)
```

### 4.1 最小实现形状

保留现有轻量 qualification harness，只把 evidence registry 从：

```text
fixture → callback
```

收紧为：

```text
(role, fixture) → callback
```

推荐实现只需要两个显式 role tables：

```text
senderEvidence
receiverEvidence
```

或一个等价的 pair-key Map。不得引入 scenario DSL / generic conformance engine。

Dual-role fixture 必须执行两个 role-specific assertions：

```text
fixture F / subsystem-sender
    → sender production seam observable assertion

fixture F / renderer-receiver
    → receiver production seam observable assertion
```

如果两侧共享 setup，可复用小型 scenario factory/helper；**pass 结果不能共享或 fan-out**。

### 4.2 Final audit

Runner 在执行前派生 expected obligation set：

```text
expected = catalog.flatMap(fixture.roles × fixture)
```

最终必须严格相等：

```text
expected role/fixture pairs
== registered role/fixture pairs
== executed role/fixture pairs
== passed role/fixture pairs
```

并拒绝：

```text
missing
unknown
duplicate
registered-but-unexecuted
executed-but-not-pass
automatic role fan-out
transport evidence in M11
```

Report 只在对应 role-specific assertion 成功后输出一条 pass record。

---

## 5. Root Cause 4 — Hard-limit proof 使用一个明确 matrix，而不是散落补丁

Frozen Conformance §4 是 cross-cutting obligation：每个 hard boundary 至少证明 exactly-at ACCEPT 与 one-over REJECT；inbound one-over 必须证明 current Data peer retire；UTF-8 boundary必须包含 multibyte case。

不要把这些边界继续散落到名称相近但并不精确的 fixture callback 中。增加一个 **M11-specific、table-driven hard-limit audit** 即可；它不是新协议 fixture catalog，也不是通用测试框架。

### 5.1 Matrix 固定覆盖

```text
application message UTF-8 bytes        1,048,576 / 1,048,577
JSON container depth                   64 / 65
Registry entries                       256 / 257
RenderNode count                       16,384 / 16,385
Render tree depth                      30 / 31
Patch operations                       4,096 / 4,097
attrs members                          256 / 257
Render data array elements             16,384 / 16,385
Render data object members             16,384 / 16,385
Render data compact bytes              262,144 / 262,145
Render data relative depth             32 / 33

domainId                               exact / one-over UTF-8 bytes
Node key                               exact / one-over UTF-8 bytes
tag                                    exact / one-over UTF-8 bytes
Event name                             exact / one-over UTF-8 bytes
attrs key                              exact / one-over UTF-8 bytes
attrs value                            exact / one-over UTF-8 bytes
generic data key                       exact / one-over UTF-8 bytes
zIndex                                 min/max / outside
revision                               positive safe / outside
```

String boundary至少包含一个 multibyte UTF-8 construction，防止把 JS UTF-16 `.length` 当作 wire bytes。

### 5.2 Observable rules

```text
exactly-at valid message
→ accepted / committed as applicable

one-over outbound
→ rejected before carrier emission

one-over inbound
→ real RendererDataPeer protocol-fatal
→ current Data peer retires
→ invalid handler/store commit not observed
```

例如 Event data 262,145-byte case必须发送一个**结构合法但 Event data 超限**的真实 Render Event，而不是用 1 MiB 非 JSON raw text代替。

JSON depth 64 必须构造一个**整体合法、global JSON depth恰好 64** 的 Render message并 ACCEPT；65 使用同构 message加一层并 fail-close。

---

## 6. Root Cause 5 — 每条 formal evidence 必须使用正确且判别性的 production seam

Evidence 的目标不是“callback 有 assert”，而是：如果 production implementation违反该 fixture，该 callback 必须失败。

只允许四类 seam，足以覆盖 M11，不需要第五种 abstraction：

### A. Wire / Data codec seam

用于：

```text
raw JSON
closed schema
Unicode
message/depth/string/container hard limits
outbound preflight
inbound protocol retirement
```

必须走真实 `createSubsystemDataPeer` / `createRendererDataPeer` 与 controlled carrier。

### B. Subsystem publication seam

用于：

```text
Registry-first
fresh Snapshot baseline
revision cursor
same-generation reconnect
fresh-generation sender universe
Event barrier/drop/no replay
backpressure
Domain removal
revision exhaustion
```

使用 production `RenderManager` + existing SubsystemDataPeer；controlled carrier只负责观察 ordered send boundary，不模拟额外 ACK protocol。

### C. Renderer authoritative seam

用于：

```text
Registry lifecycle
Snapshot/Patch continuity
Patch algebra/atomicity
one-shot identity/tag
Event applicability/order
fresh carrier/generation replica behavior
```

representation-invalid input仍必须先经过 real RendererDataPeer；已完成 Data codec validation 后的 authority-semantic fixtures可以使用现有 package-private `RendererRenderStore` qualification seam。

### D. Real integration seam

用于：

```text
Runtime/Frame independence
same-generation real reconnect
old-stream isolation
Control/Data lifetime composition
business Domain survives reconnect
close → Registry removal → replica retire
```

复用现有 Desktop/Hostra M11 vertical。不得用 `assert.doesNotThrow()`、手工 throw presentation error、直接清 Store 等方式替代一个本来要求 cross-role lifecycle 的 fixture。

### 6.1 判别性审计原则

代码评审时对每个 evidence pair只问一个问题：

> 若对应 Frozen fact 被实现错误，这个 assertion 是否必然失败？

答案不是明确的 `yes`，该 evidence 不得计入 pass。

---

## 7. Qualification 文件组织：显式，但不框架化

允许的最小组织：

```text
test/render-update-v1/
    fixtures-v1.mjs
    qualification.test.mjs
    evidence-wire.mjs
    evidence-sender.mjs
    evidence-receiver.mjs
    evidence-integration.mjs   # only if needed
    hard-limits.mjs
    helpers/render-fixtures.mjs
    helpers/qualification.mjs
```

实际文件名可不同，也可继续复用现有 `evidence-core/patch/runtime`；关键不是重命名，而是 ownership 清楚。

允许的小 helper：

```text
make valid boundary value
make fresh Data peer/carrier
baseline Store
expect protocol-fatal retirement
controlled in-flight send
fresh generation setup
```

禁止：

```text
ConformanceEngine
FixtureRuntime
Scenario DSL
Protocol Simulator
Generic Protocol Test Framework
Schema framework
shared production/test Render model
second Render parser/codec
```

显式 evidence 中适度重复是可接受的；不得为了 DRY 把语义再次藏回一个按 fixture name猜行为的 generic dispatcher。

---

## 8. 一次性实施顺序

严格按以下顺序完成，避免边修边重新定义验收标准：

### Step 1 — Production validation correctness

```text
@loomrealm/data Render codec private validation completion
+ Subsystem author generic JSON Unicode completion
+ package regressions
```

验收：非法 representation不能被 emit、send、deliver 或 commit。

### Step 2 — Exact catalog

```text
remove silent filter
fail-closed parse
recover lastEmittedRevision-reset-per-carrier
```

验收：source-derived unique fixture count = 203。

### Step 3 — Role-specific evidence identity

```text
fixture callback
→ role × fixture callback
```

验收：expected/registered/executed/passed pair sets exact equality。

### Step 4 — Hard-limit matrix

完成 §5 全部 exact/one-over/UTF-8 assertions。

### Step 5 — Replace non-discriminating evidence

逐 role obligation检查 observable seam；只改不能判别对应 Frozen fact 的 callback，不重构 production architecture。

### Step 6 — Root closure

```text
npm run test:m11
```

CI 必须在 Node 20 + Node 24 执行同一个 root gate并通过。

最终 report/audit必须确认：

```text
protocol                 loomrealm.render-update
protocolVersion          1
fixtureSetRevision       1
unique fixtures          203
subsystem-sender         82
renderer-receiver        185
role evidence records    267
transport                0
M10 regression           pass
M11 package/boundary      pass
M11 Desktop/Hostra        pass
```

### Step 7 — Restore closure claim

只有 Step 1–6 全部完成后：

```text
M11_05 → Implemented / Qualified / Closed
doc/30-implementation/m11-qualification.md → regenerated current evidence
Phase 1 / README navigation → M11 Closed
```

在此之前统一保持：

```text
M11 = Implemented / Qualification Pending
```

---

## 9. 不修改的 Frozen 边界

本轮明确不修改：

```text
Subsystem owns business Render authority
Main owns no Render state
Renderer is replica only
business Domain lifetime != wire Domain lifetime != carrier lifetime
exact Subsystem author public API
synchronous local author semantics
Registry/Snapshot/Patch/Event wire surface
same-generation identity history
fresh-generation wire universe
revision continuity/exhaustion semantics
Event barrier/drop/no-replay semantics
Renderer public boundary
M11 claims sender + receiver only
M16 owns transport equivalence
```

因此本轮属于 implementation correctness + qualification evidence correction，不需要新协议版本，也不需要为 Frozen semantic change新增 ADR。

如果修复过程中发现必须改变上述任一 Frozen fact，必须停止本计划并按文档治理显式 reopen；不得在测试代码中暗改语义。

---

## 10. 最终评审门槛

M11 再次声明 Closed 前，评审只使用以下固定 checklist，不再增加新的验收层：

```text
[x] Frozen contract unchanged
[x] no new public Render/Data API
[x] no new authority/currentness owner
[x] production Render representation validation complete
[x] author-success always wire-representable
[x] catalog fail-closed and source-derived
[x] 203 unique fixtures observed
[x] 267 exact role×fixture obligations observed
[x] no role pass fan-out
[x] hard-limit matrix exact/one-over complete
[x] invalid inbound is retired before semantic handler commit
[x] every formal evidence is discriminating for its Frozen fact
[x] same-generation/fresh-generation identity semantics proved on both claimed roles where required
[x] real Desktop/Hostra reconnect/removal vertical passes
[x] M10 regression passes
[x] npm run test:m11 passes on Node 20 and Node 24
[x] qualification record numbers/results regenerated from executable output
[x] transport role remains unclaimed
```

满足全部项目后，本评审结论为：

```text
M11 Render = Implemented / Qualified / Closed
→ proceed to M12 Content
```

任何一项未满足：

```text
M11 Render = Implemented / Qualification Pending
```

这份 checklist 是本轮最终 closure 标准；后续复核只验证这些已经冻结的条件是否满足，不再通过继续增加审查层制造新的补丁循环。
