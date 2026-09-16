# Renderer ⇄ Subsystem Data Application Profile v2

> 层级：正式契约 / Application Profile  
> 状态：Draft / Normative Candidate / Not Frozen  
> 标识：`loomrealm.renderer-data/2`  
> 主要定义：Connection1 + Input1 + Render1 + Viewport1 的完整兼容身份、exact demux、shared writer/terminal、DataAuthority currentness  
> 依赖：[Connection v1](./renderer-subsystem-data-connection-v1.md) · [Input v1](./user-input-v1.md) · [Render v1](./render-update-v1.md) · [Viewport v1](./viewport-state-v1.md)  
> 前身：[Profile v1](./renderer-data-profile-v1.md)；[ADR0036](../decisions/0036-viewport-state-and-renderer-data-profile-v2.md)；[Conformance](./renderer-data-profile-conformance-v2.md)  
> 最近复核：2026-09-16（CF-01..07 closure candidate）

**Profile v2 是新的完整 application-stack identity，并不是 `/1` 上的 optional extension。** 本文使用 `MUST / MUST NOT / SHOULD / MAY` 表达待冻结的规范约束。共享 carrier仅共享 application unit、ordering、reader/writer、bounded terminal；不建立 cross-child authority、transaction、revision、ACK、retry/replay或跨 Control/Data 原子性。

---

## 1. Composition / compatibility

```text
loomrealm.renderer-data/1 [Frozen compatibility]
  Data Connection v1 + User Input v1 + Render Update v1

loomrealm.renderer-data/2 [candidate target]
  Data Connection v1 + User Input v1 + Render Update v1 + Viewport State v1
```

声称支持 `/2` 必须完整实现四个 child，不能仅加入 `viewport.state` parser。`/1` 的 exact acceptance set、message direction、shared writer和现有接口语义保持不变，`/1` peer收到 `viewport.state` 仍是 protocol-invalid。Data Profile version与 npm semver/child version分离。

Frozen [Control v1](./main-renderer-control-v1.md) §13 `RendererDataAuthorityV1.dataProfile` 的真实 wire type 为 `string`；该文档的“Phase 1 profile `/1`”描述冻结当时 implementation baseline，**不是把 Control v1 的所有未来 DataAuthority 固定为 `/1`**。Frozen [Connection v1](./renderer-subsystem-data-connection-v1.md) §6 的 Phase 1 与 [Profile v1](./renderer-data-profile-v1.md) specialized TypeScript literal `dataProfile:".../1"` 同样只属于其当时 profile-v1 combination/peer。目标产品显式选择 `/2` 无需升级 Control/Connection wire，也不能把旧 Profile-v1 specialized SDK type误用于 v2 peer。不编辑旧 Frozen wire acceptance 集合。

---

## 2. Selection and authority

Main独占 `DataAuthority {subsystemKey,generation,dataProfile}` 的选择/currentness；目标 implementation subject 的 canonical product policy MUST 对其所有 current Renderer⇄Subsystem DataAuthorities统一选择 `loomrealm.renderer-data/2`。Platform Broker仅建立 paired exact `(Session,Renderer,S,G,P)`，不得 mint/upgrade/downgrade profile。`/1→/2` 为 DataAuthority replacement，fresh generation严格增加；same generation不能静默切换。当前 slice无 per-Subsystem profile preference、Game Entry request、carrier negotiation、feature bits、downgrade handshake。不能把 `/1` 作为 `/2` 不可用时的隐式 fallback：若无法两端匹配 `/2`，Data Connection absent，按 Frozen Connection恢复规则处理，不假造 viewport或修改 Main authority。

显式 `/1` compatibility composition可以继续存在，且新版 `scope.viewport`在从未接受 v2 observation时保持 `null`；一个已经收到 v2 size的存活 Runtime如果被显式改用 `/1`，其 retained migration semantics要求单独设计，不在 canonical target 偷做 fallback。Profile change既不自动终止 Runtime，也不自动创建 Frame authority。

---

## 3. One application unit / common preflight

沿用 v1：one carrier application unit = one UTF-8 JSON text string = one child message object；Hostra WebSocket one text message / PWA MessagePort `postMessage(string)`，不是 structured clone object/binary。receiver MUST先检查 actual UTF-8 bytes ≤1,048,576、Wire `parseJsonText`/representation valid、JSON container depth ≤64、exact top-level type+direction，然后 child exact validation；不得先无界 parse/buffer，或让 Viewport绕过 common preflight。上述 v1 limits不增加。Unknown type/namespace、wrong-direction、malformed child为 Data protocol-fatal。

---

## 4. Exact direction / routing

```text
Subsystem → Renderer:
  input.interest
  render.domains / render.snapshot / render.patch / render.event

Renderer → Subsystem:
  input.state / input.event / input.reset
  viewport.state
```

只有三个 namespace `input.* / render.* / viewport.*`。单一 inbound reader和 ordered dispatcher按 type/direction精确 demux：Subsystem侧 Input、Viewport；Renderer侧 Input Interest、Render。各 child禁止竞争 raw `carrier.messages()`；先 exact validate再 semantic mutation。Well-formed stale Input按其 Frozen child rule drop；Malformed Viewport不可当 Input reset，也不能被其它 handler消费。

---

## 5. One serialized writer / bounded latest viewport

各角色恰有一个 connection-wide serialized writer；所有 outbound child经过相同 writer queue，admitted顺序为唯一该方向 send order；不得 bypass raw carrier、interleave units、撤回已 admitted/emitted units、跨 carrier迁移 old queued traffic。Profile共享发送顺序不授予跨方向或跨 child业务因果/原子性。

Profile继承 v1 bounded writer queue与 terminal规则，**Viewport sender必须在 admission 之前实施 child-local bounded latest-state 规则**（精确定义见 [Viewport v1 §3](./viewport-state-v1.md)）：每 carrier最多一份 writer-admitted/in-flight viewport加一个 latest pending size，等待先前送达结算后才向 writer admit更新值。普通合法 resize burst自身不能排满 writer导致 Data local fatal；不能因此改变 frozen v1 writer、增加 generic priority scheduler，也不能长期饿死 Input/Render。Viewport无 request/ACK、cross-child barrier、shared revision、replay cursor。

---

## 6. Fresh carrier / currentness

每个 freshly paired/current carrier分别重建 child publication baseline：

```text
Input    → fresh remote Interest / fresh State / Event future-only
Render   → first render.domains, then current snapshots, then ordinary patch/event
Viewport → 有合法当前 layout viewport则 promptly enqueue fresh state baseline；
           否则无 synthetic 0/null/default，首次合法样本出现后发布
```

Baseline不组成 super-snapshot，不保证 Input/Viewport/Render 固定 child-first顺序。新 carrier viewport baseline取该 carrier admission时最新合法 sample；resize中间样本按 bounded latest规则折叠，最终收敛。旧 carrier queued send/read和旧 Renderer physical source均受 current identity fencing；不得迁移 replay或污染 fresh carrier。

same-generation reconnect：Input/Render/Viewport wire baseline全新；Render wire Domain identity沿 Frozen规则保持；Runtime-scoped `scope.viewport` object/value不因 carrier替换清空，fresh equal size不会重复 callback，changed size先更新current再 callback。

fresh generation或 fresh Renderer且同一 Runtime幸存：必须建立匹配新 authority的 carrier和 fresh viewport baseline，旧 source/carrier traffic inert；新的合法值到达前 author可暂时持有旧 observation，但它不是 current Renderer可绘制性证明。Control/Data无 global total order，不增加 shared barrier。Runtime terminal则停止 author delivery。正式 transition matrix以 [Viewport v1 §4](./viewport-state-v1.md) 为准。

---

## 7. Terminal / v2 diagnostic classification

Connection terminal first-wins。Common preflight/top-level discriminator失败使用 v1 已有 `protocol:"profile"`；Input/Render child invalid继续使用其 v1 `"input"/"render"`。**在 v2 peer 上，exact `viewport.state` 已识别后 child shape/value invalid或 Viewport child explicit protocol-fatal，public diagnostic MUST 是 `protocol:"viewport"`。**

v2 TypeScript peer可新增 `DataProtocolFamilyV2 = DataProtocolFamilyV1 | "viewport"` 和匹配的 `DataTerminalV2`（具体 private类型组织不属 wire）；不得通过原地放宽旧 `/1` peer的 observable terminal shape来声称改变 v1。三类 child malformed任一都 retire Data/stop traffic/settle writer；不会直接 Runtime fail、Frame unwind、RenderDomain destroy、Main authority mutation。Viewport subscription callback throw/returned rejection属 local containment，不能报告成 child protocol-invalid。

---

## 8. Implementation boundaries

最小实现职责：`@loomrealm/data`提供 profile-v2 exact binding/codec/dispatch与新的 viewport send/receive role seam；`@loomrealm/renderer` 接 trusted Renderer observation publisher；`@loomrealm/subsystem` 提供 retained current/Runtime-scoped subscription；`@loomrealm/main` canonical authority policy选 `/2` 但不存尺寸；Desktop/PWA physical composition按相同 layout-viewport semantics接源。现有 packages/wire、Frozen User Input v1、Render Update v1、Connection v1无 payload/model/limit 修改。不要公开 Environment manager、generic cross-child queue、profile negotiation或 map-specialized Core path。

---

## 9. Freeze/qualification boundary

Docs Freeze的门槛是正式文本与两份 **executable-ready conformance specifications** 互不矛盾，归档 docs-only subject/review；不是要求实现前生成 executable PASS。之后 implementation/qualification在新的可执行 SHA验证所有 conformance、v1 regressions、Main profile policy及 Desktop/Hostra，按 [qualification ledger](../30-implementation/viewport-profile-v2-qualification.md) 记录。当前仍是 candidate，不得声称已实现/Closed。

Final invariants：新完整 profile identity、旧 `/1` exact不变、Main selector+fresh G、single reader/writer、bounded child-local viewport、exact routing/diagnostic、independent child baselines、no cross-child transaction、Data-only protocol fatal、Runtime readonly observation。