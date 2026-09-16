# Renderer Data Application Profile v1 Conformance

> 层级：正式契约 / Conformance Specification  
> 状态：**Revised preimplementation / Executable-ready Candidate / Not Frozen**  
> Profile：`loomrealm.renderer-data/1`；`fixtureSetRevision = 3`（revision 1/2及其 PASS 为 historical，不得冒充修正版）  
> Contract：[Profile v1](./renderer-data-profile-v1.md) · [Connection v1](./renderer-subsystem-data-connection-v1.md) · [Input v1](./user-input-v1.md) · [Render v1](./render-update-v1.md) · [Viewport v1](./viewport-state-v1.md)  
> Decision：[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)；最近复核：2026-09-16

**Docs Freeze只要求可执行的规范/预期断言与兼容核查；实际 command、environment、raw PASS与 executable SHA属于实现后的 qualification。** 本次 revision 3保留 revision 2 User Input correction义务，并增加独立 Viewport child；不创建 Profile `/2` 或双实现。

## 1. Profile identity / compatibility gate

Exact identity `/1 = Connection1 + Input1 + Render1 + Viewport1`，四个 child必须完整支持。No `/2` advertised/selected/accepted、无 optional capability/feature negotiation。旧三 child 的 `/1` executable不可与修正后 peer混配；测试 harness必须识别并拒绝 mixed-old/new setup，不能把历史 `/1` PASS当 current proof。已存在真实外部兼容义务时 STOP direct reset、另评版本/迁移。

Main owns `(S,G,P)` selection；exact Broker matching，unsupported peer→Data absent，不自动 Runtime failure、不 mint authority。Profile自身不要求所有 arbitrary Subsystem共享 rollout：**当前产品统一部署 `/1`**仅归实施 ledger/产品 integration test。未来真实 identity replacement fresh generation规则仍沿 Connection v1。

## 2. Unit / routing / common gates

Hostra one WebSocket text unit、PWA `postMessage(string)`；one UTF-8 JSON text string = one exact child JSON object；not binary/structured object/Batch。Actual bytes≤1MiB、depth≤64、Wire representation/parser与child exact preflight MUST before mutation；non-string、wrong role/type、unknown type、malformed child均 first-wins Data-fatal。Instrumentation：`carrier.messages()` calls恰1、每合法入站 unit仅命中一个 child、无 raw bypass。Direction：Subsystem→Renderer `input.interest,render.domains/snapshot/patch/event`；Renderer→Subsystem `input.state/event/reset,viewport.state`。

## 3. Reader/child isolation/diagnostics

Exact `input.* / render.* / viewport.state` dispatcher；unknown type/wrong direction→Profile terminal；Input/Render child malformed沿既有 family；识别后的 Viewport invalid→`protocol:"viewport"`；common/unknown→`"profile"`。Well-formed stale Input按 Input contract drop，malformed不能跨 child吞掉。Viewport只更新 author retained observation，不通过 Renderer Store/Projector或 Input Manager，亦不修改 Main InputTarget/Activation。Listener throw/returned rejection必须独立 containment、不进入 Data reader error路径。

## 4. Single writer/backpressure

每 peer仅一 serialized writer，`max concurrent carrier.send=1`，admission order=send order；old-carrier pending不 replay/migrate；any terminal settle once。保留 Input revision2 sender bounded/coalescing与 Render ordering/barrier。Viewport在 writer admission前每 carrier至多一个 admitted/in-flight + 一个 latest pending slot；阻塞 writer、连续合法 resize burst（当前实现 fixture使用超过 `MAX_PENDING_SENDS=1024` 的样本，但 1024 **不是协议上限**）、穿插合法 Input/Render→Viewport队列不随 burst线性增长，不因 viewport 自身填爆 writer、Input/Render不被永久饿死；释放 writer后最终 size收敛。不得为测试改 writer limit、priority scheduler或 Input/Render语义。完整 sender assertions参照 [Viewport conformance](./viewport-state-conformance-v1.md)。

## 5. Independent baselines/currentness

Fresh current carrier：Input empty remote Interest/State/Event history→full current interest+fresh State/Event future-only；Render first `render.domains`→snapshots→ordinary work；Viewport有合法 sample发送fresh baseline，否则等首次合法 sample。无跨 child固定先后/事务；same G reconnect不重启 Runtime/Frame/InputListener/Domain/Viewport；old-carrier queued receive/send fenced。Fresh G/Renderer匹配新 current authority后 old source不可污染；Viewport current retained equal baseline无 callback、changed once；无 sample last value只是历史 observation。

## 6. Failure/authority

Malformed Input/Render/Viewport分别 child Data-fatal，carrier retire而不自动 Frame unwind/Runtime fail/RenderDomain destroy/Main authority change。First-wins terminal、best-effort close、pending settlement once；callback本地异常不能作为 malformed remote；Control/Data无 total order、没有 ACK/replay/join。

## 7. Platform/product qualification（实现后）

同一 executable SHA实测：original Connection/Input/Render regression，revised `/1` four-child suite，Viewport child conformance，Main selection/paired broker，Desktop designated layout viewport source、Hostra product；PWA在对应里程碑验证相同 abstract CSS logical size。必须存命令、Node20/24（如适用）、Chromium/Hostra环境、raw logs/artifacts/subject SHA。仅 current product integration断言所有当前 DataAuthorities统一采用 `/1`；不得把该 rollout政策反写为通用 Profile MUST。Map resize/menus/camera/chunks/latency由独立 map qualification证明，不是 Profile conformance。

## 8. Revision history

Revision 1：初始 Input+Render；Revision 2：User Input mutation-gate/handler containment/sender bounded proof；Revision 3：ADR0037首次发布前直接在 `/1` 添加独立 Viewport v1及其 currentness/backpressure/diagnostics，不新增 `/2`。旧版本历史证据保留但非 current PASS。