# Renderer Data Application Profile v1 Conformance — revision 3

> 层级：正式契约 / Conformance  
> 状态：Revision 3 normative candidate / Docs Freeze HOLD / not executed  
> Profile 版本：1  
> fixtureSetRevision：3  
> 适用 Profile：`loomrealm.renderer-data/1`  
> 依赖：[Renderer Data Profile v1](./renderer-data-profile-v1.md)、[Data Connection v1 Conformance](./renderer-subsystem-data-connection-conformance-v1.md)、[User Input v1 Conformance](./user-input-conformance-v1.md)、[Render Update v1 Conformance](./render-update-conformance-v1.md)、[Viewport State v1 Conformance](./viewport-state-conformance-v1.md)、[ADR 0025](../decisions/0025-renderer-data-profile-v1-preimplementation-closure.md)、[ADR 0029](../decisions/0029-user-input-v1-mutation-gate-state-convergence.md)、[ADR 0036](../decisions/0036-preimplementation-viewport-profile-v1-correction.md)  
> 最近复核：2026-09-18；冻结及资格：[Viewport Core Freeze Ledger](../30-implementation/viewport-core-freeze-ledger.md)。

本文件完整规定 `loomrealm.renderer-data/1` 的当前组合层 qualification；child protocol 的完整语义由各自 Conformance 定义。Revision 3 在原 revision 2 基础上增加 Viewport，保留原有全部义务。旧 revision 2 的可追溯全文留在 Git 历史；旧 executable 的 PASS 不自动转移到本修订。本文是待冻结的目标，不表示生产代码已支持四个 child。

---

## 1. Profile Binding

```text
loomrealm.renderer-data/1
= Data Connection v1
+ User Input v1
+ Render Update v1
+ Viewport State v1
```

Current child conformance：

```text
User Input protocolVersion = 1 / fixtureSetRevision = 2
Viewport State protocolVersion = 1 / fixtureSetRevision = 1
Profile fixtureSetRevision = 3
```

Profile identity 不因 fixture revision 变化。ADR 0029 的 Input convergence 不改变 Data Profile wire/version；ADR 0036 明确批准首次发布前协调修订同一个 `/1` identity。禁止旧三-child和新四-child二进制混连，不新增 `/2`、dual parser、协商或 fallback。

---

## 2. Required Claims

完整 Profile claim 至少证明：

```text
exact profile identity/version binding and complete four-child support
one inbound reader / exact namespace routing
one serialized outbound writer
role-exact direction legality
first-wins terminal / fail-closed carrier retirement
fresh-carrier Input + Render + Viewport independent baseline
all current child conformance obligations
Hostra/PWA abstract transport equivalence
```

仅通过 Data Connection、Input、Render 或 Viewport 其中一部分，不构成完整 Profile conformance。

---

## 3. Harness Observables

至少观察：

```text
carrier.messages() call count
max concurrent carrier.send count
sent application-unit order and actual wire text
role dispatch target / number of dispatches
terminal fact / child protocol family / close request
pending send settlement
fresh-peer child publication state and current peer identity
Runtime scope.viewport getter / callback trace
```

Application unit 始终是 one UTF-8 JSON text string；common bytes≤1,048,576、JSON container depth≤64、Wire representation 检查必须先于 child handling。非法输入不得影响任何 role state。

---

## 4. Identity / Direction

Required：

```text
profile-exact-identity
profile-unsupported-rejected-before-read/write
profile-change-requires-fresh-generation (真正不同 identity)
subsystem-outbound: input.interest + render.domains/snapshot/patch/event only
renderer-outbound: input.state/event/reset + viewport.state only
wrong-direction-message-protocol-fatal with exact child family
```

不允许 MessagePort structured object 扩大 application model。旧、新 `/1` binary 同步升级属于部署要求，不能因为字符串相同声称混版兼容。

---

## 5. Reader / Dispatcher

Required：

```text
one-reader-per-peer
input.* exact input dispatcher
render.* exact render dispatcher
viewport.state exact viewport dispatcher
unknown profile type rejected
one inbound unit dispatches exactly once
handler protocol-fatal retires current peer with its exact child family
handler throw/local-fatal retires peer unless child contains it before returning
```

未知 `viewport.foo`、未知 namespace、invalid JSON、非法顶层单位、bytes/depth/common representation → `profile` protocol-fatal；合法 JSON 中**已识别** `viewport.state` 但 width/height 非正 safe integer、缺失或多余成员、方向错误 → `viewport` protocol-fatal。`NaN`、`Infinity` 字面量不是 JSON：以原始 JSON text 注入时属于 `profile` 解析错误；以本地发送参数注入时属于 `local-fatal`，绝不可伪装为远端 `viewport` invalid。JSON 可表示但不合法的 `0`、负数、fraction、unsafe integer 等则由 viewport codec 分类。JSON 解析产生的普通对象不拥有 inherited member；inherited/getter 测试仅针对可信的本地 JS caller/source object，不是原始 JSON wire fixture。

M10 InputManager 必须 contain business handler failure，防止它逃逸到 Data dispatch；Profile runtime 无需识别 business callback。Viewport listener throw/reject 同样由 Subsystem manager 本地 contain。

---

## 6. Writer

Required：

```text
one serialized writer
max concurrent carrier.send = 1
exact outbound profile validation before send
terminal first-wins
no retry/replay/duplicate after failed send
```

Generic Data writer 的 finite capacity 是 fail-closed mechanical bound；User Input v1 revision 2 要求 Renderer 在进入 writer 前执行自身 bounded coalescing/drop，普通 Input backlog 不得依赖 generic writer overflow 作为 backpressure。Viewport 每 current peer ≤1 admitted/unsettled + ≤1 latest unadmitted pending；resize burst 不得逐条挤入 shared writer。Render 子协议的 barrier/revision 保留，Viewport 不引入跨 child priority、ACK、transaction 或第二 writer。

---

## 7. Child Ordering Independence

Input、Render、Viewport 共享 physical writer order，不共享 authority/revision/transaction。Required：

```text
input ordering obeys User Input v1
render ordering obeys Render Update v1
viewport ordering/coalescing obeys Viewport State v1
input message does not advance Render revision
render message does not change Input lease/Interest
viewport message does not change Input/Render/Frame/Store/Projector
child failure classification maps to correct DataTerminal.protocol family
```

---

## 8. Fresh Carrier

每个 fresh current peer：

```text
Input remote Interest/State/Event history = empty
Render remote Domain/Snapshot/Patch chain = empty
Viewport sender cursor lastSent/inFlight/pending = empty
```

Role-local desired business state MAY survive according to child lifetime rules，并 MUST 通过 fresh peer 重建 current baselines。Viewport Renderer participant 持有的 latest valid size 若存在，必须在 fresh peer current install 后重发；没有样本则等待首次合法观测。Subsystem Runtime 保留上次有效尺寸，equal fresh baseline 不重复发业务回调。

Required：

```text
fresh-carrier-input-interest-republication
fresh-carrier-input-state-baseline/no-event-replay
fresh-carrier-render-domains/snapshots
fresh-carrier-viewport-baseline-even-if-equal
same-generation-reconnect-fresh-child-publication
fresh-generation-replacement-fresh-child-publication
fresh-carrier-does-not-restart-runtime/frame
old-peer/source callbacks and send completions are inert
```

---

## 9. Terminal / Failure Boundary

Required：

```text
malformed/profile-invalid → profile protocol-fatal
input-invalid → input protocol-fatal
render-invalid → render protocol-fatal
recognized viewport-invalid → viewport protocol-fatal
invalid trusted local outbound value → local-fatal
carrier close/loss → carrier terminal
terminal first-wins
terminal closes current carrier best-effort
Data terminal != Runtime failure / Frame unwind
```

Fresh current carrier reacquisition 由 role/Platform lifecycle 负责，不属于 Profile retry/reconnect mechanics。

---

## 10. Platform Equivalence

完整 conformance 要求：

```text
Hostra WebSocket text
PWA MessagePort string
→ same profile application trace semantics
```

Adapter 不得 retry、duplicate、reorder 或将 structured object 直接交给 Profile Core。M10 可以在 Hostra/Desktop Data physical lifecycle 完成 current platform-independent Input role qualification；full Profile Hostra/PWA equivalence 直到 M16/M17，不能在仅 fake source 的本次架构资格中冒称物理平台等价已测。

---

## 11. Revision 2 保留义务

原 fixtureSetRevision=2 的新增组合义务完整保留：

```text
mutation-gate State convergence remains inside Subsystem Input role
business handler failure is contained before Data dispatch failure
Renderer Input backlog is bounded/coalesced before generic Data writer overflow
```

Profile identity、Data Connection version、Input/Render wire versions 均不变；revision 1/2 的历史结果不得冒充本次 revised `/1` revision3 的 complete conformance。

---

## 12. Revision 3 新增明确 fixture

| ID | 可控输入及必须断言 |
|---|---|
| P3-01 | 四 child 完整，唯一 `viewport.state` Renderer outbound，反方向 viewport fatal；不宣称混版兼容、不建 `/2`。 |
| P3-02 | exact wire `{type,width,height}`；合法 JSON 的 missing/extra/fraction/zero/negative/unsafe → viewport；非法 JSON（包括 NaN/Infinity 字面量）/unknown `viewport.foo` → profile；本地 invalid caller → local-fatal；原始 wire 不伪造 getter/inherited。 |
| P3-03 | 单 reader、exact 分流一次，common gate 先于 child，不合法消息零 role mutation。 |
| P3-04 | 单 serialized writer，physical concurrent send≤1，admitted FIFO、无 rollback，Input/Render 不因 Viewport burst 饥饿。 |
| P3-05 | 每 peer≤1 inFlight+1 pending；阻塞 send 下 10000 样本和并发 Input/Render，释放阻塞后 latest converge；A→B→A 清除 B，already-admitted B 不撤回；永远阻塞不要求收敛。 |
| P3-06 | fresh peer 同尺寸仍发 wire baseline，old pending/cursor 不迁移；same-G/new-G/participant 更替均正确隔离；Scope equal callback suppress。 |
| P3-07 | recognized viewport child invalid → DataTerminal.protocol=`viewport`；unknown/common → `profile`；Input/Render 仍归原 family；terminal first-wins 且仅退休 Data。 |
| P3-08 | 运行既有 revision2 全量断言、Connection/Input/Render child 全量 conformance，禁止修改原预期掩盖回归。 |
| P3-09 | fake source → 真实 Renderer holder → 真实 Data peer → 真实 Subsystem host → `scope.viewport`；覆盖 currentness、backpressure、terminal，mock-only 不算通过。 |

## 13. Qualification evidence

Profile 组合测试不能替代 [Viewport child conformance](./viewport-state-conformance-v1.md) 的 source/scope fixtures，反之也不能替代旧 child regressions。实施阶段新增显式 revision3/Viewport runner，记录命令、测试目录、退出码、最终**同一** executable/cohort SHA 与原始日志；旧历史 PASS 不迁移。本轮架构资格不能证明 Desktop/PWA 真实 source、`play.bat` 动态地图或运动性能；Docs Freeze 先按账本完成。