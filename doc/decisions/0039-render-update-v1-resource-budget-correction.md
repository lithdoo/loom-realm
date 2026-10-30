# ADR 0039 — Render Update v1 Local Resource-Budget Policy Correction

> 状态：Accepted direction / Local resource-policy correction; implementation and qualification pending
> 日期：2026-10-30
> 相关原则：[Framework Responsibility and Validation Boundary](../10-architecture/framework-validation-boundary.md)
> 相关决策：[ADR 0022 — Render Update v1 freeze closure](./0022-render-update-v1-freeze-closure.md)、[ADR 0038 — Developer Authority and Minimal Runtime Enforcement](./0038-developer-authority-minimal-runtime-enforcement.md)
> 相关契约：[Render Update v1](../15-contracts/render-update-v1.md)、[Render Update v1 Conformance](../15-contracts/render-update-conformance-v1.md)、[Renderer Data Profile v1](../15-contracts/renderer-data-profile-v1.md)

## 背景

Issue #133 的真实物理机诊断表明，Render Data 路径不仅承担重复遍历，还把许多固定数值限制当成协议级 accept/reject 规则：message bytes、JSON depth、identifier length、Domain/Node/operation counts、attrs members、data members/elements/bytes/depth 等。

这些数字并非全部来自 Render authority、wire interoperability 或业务语义。它们混合了历史实现容量、预先防御性验证和资源保护目标，使不同平台/产品不得不接受同一套与实际 capacity 不匹配的硬编码限制，也让开发者的数据形状被框架约束。

项目已确立 Developer Authority / Minimal Runtime Enforcement：框架拥有自己的协议和状态正确性；开发者拥有应用数据业务语义。框架仍必须防止无界资源消耗，但“必须有 bounded resource policy”不等于“所有平台必须采用同一组协议级数字”。

## 决定

### 1. 首次发布前修订同一 v1，不创建 v2

本 ADR 将 Render Update v1 的 numeric hard-limit policy 修订为 local resource-budget policy；Render Update identity 仍为 `loomrealm.render-update / 1`，conformance fixtureSetRevision 为 2。该修改不改变 wire representation、message kind、closed schema、direction、authority、identity、revision、Patch algebra、atomicity 或 Event semantics，因此**不需要创建 v2，也不需要仅因旧实现存在较小容量而执行 protocol migration**。

数值 threshold 原本是实现容量被误写成统一 accept/reject 规则；修订后它们是 Host / Product / Runtime 的本地容量选择。旧接收端可能仍保留较小的硬编码容量，发送端若给它发送超过该容量的负载，该 workload 可能失败；这属于 receiver capacity mismatch，而不是 wire ABI incompatibility。需要更大负载的产品应先确保接收端本地预算足够，再启用更大的发送负载。不得把“放宽限制”误解为可以向未知容量的 peer 无条件发送任意大消息。

本 ADR 不取消真正的版本治理：如果后续改变 wire schema、message direction、authority、identity、ordering、revision、atomicity、Event 或 recovery semantics，仍按正式版本治理处理。Renderer Data Profile v1 的三-child → 四-child composition correction 是 ADR0037 的独立事项，其 cohort 约束继续有效，不由本 ADR 改写。

### 2. 删除协议级固定 numeric hard limits

修订后 Render Update v1 不再规定统一数值上限：

- application message UTF-8 bytes 与 JSON container depth；
- Domain Registry entries；
- domainId、Node key、tag、Event name 的 UTF-8 byte length；
- RenderNode count、tree depth；
- Patch operation count；
- attrs key/value byte length 与 attrs member count；
- Render data array elements、object members、compact bytes、relative depth；
- generic data object key byte length。

revision/baseRevision 仍为 positive safe integer。zIndex 从 signed 32-bit 改为 signed safe integer，确保 JavaScript number 的精确性。身份字符串仍必须非空、Unicode scalar、opaque、case-sensitive、no normalization；不设协议级 byte cap。

### 3. 保留协议不变量与 wire representation

以下不是应用业务正确性限制，继续属于协议：

- one UTF-8 JSON text string = one exact Render message object；不增加 binary、Batch 或第五种 message kind；
- exact closed message / operation schema，未知字段拒绝；
- Wire JSON representation；Render attrs 是 string→string map，data 是 plain JSON object；
- Domain / Node identity uniqueness、one-shot history、stable live tag；
- Registry、Snapshot、Patch、Event 的 direction/lifecycle/baseline semantics；
- strict per-carrier revision continuity；
- Patch operation preconditions、ordered application、isolated candidate、atomic commit；
- final candidate 的 parent/sibling/reachability/cycle/identity/tree invariants；
- Event transient/drop/barrier semantics；
- Data authority、Frame/Input/Content separation。

不因取消 numeric caps 而取消框架实际依赖的类型前提、状态一致性或失败原子性。

### 4. 以 local resource budget 取代协议级数字

每个 Host / Product composition / Runtime implementation MUST 对可能随输入增长的工作配置有限、显式、可审计的 local resource budgets，至少覆盖：

- inbound/outbound carrier bytes；
- parser work/depth 与 candidate construction；
- retained Render state / nodes / strings / JSON members；
- Patch operation work / indexes / tombstones；
- outbound serialization、queues、pending messages 与 in-flight work；
- PWA MessagePort inbound retained-string queue；
- DataRuntime outbound pending count + encoded payload bytes；
- RenderManager pending-work count + retained-work weight。

规则：

- local budgets 可以因平台/产品 capacity 和 threat model 不同而不同；
- budget 不是 wire schema、业务 Schema 或跨实现统一 accept/reject threshold；
- bounded checks 必须融合到实际 parse/serialize/mutation/admission，避免先完整预检再重复处理；
- queue budget 至少同时约束 item count 与 retained payload/work；count-only cap 不足以证明内存有界；
- queue accounting 应在 admission/coalesce/settle/terminal 时增量更新，不得为每次 admission 重新扫描完整 Snapshot；
- resource budget exhaustion 不得报告为 peer malformed/protocol-invalid；
- inbound exhaustion 必须 no-partial-commit，并 retire current carrier，因为不能安全地继续消费后续 authoritative updates；
- outbound exhaustion 不得发出 partial application unit；尚未 emitted 的 desired state 可 coalesce，或在本地边界报告失败；
- v1 不增加 budget negotiation。Product cohort 必须记录 sender/receiver budget compatibility；独立 peers 超过接收端 local budget 时不保证交付。

### 5. Failure classification

- malformed JSON / invalid Wire representation / unknown message kind / exact closed-schema violation：protocol-fatal，retire current Data Connection；
- Domain lifecycle / revision / Patch precondition / candidate invariant violation：authoritative continuity failure，retire current Data Connection；
- local bounded-resource exhaustion：local-resource-exhaustion，不归咎于 peer protocol violation；inbound retire carrier、outbound 不发送部分消息；PWA Carrier、Codec parser 和 Renderer Store candidate 的 typed resource cause 必须穿过 DataRuntime terminal mapping，不能被 `carrier-lost` 或 `protocol-fatal` 覆盖；RenderManager pending-work exhaustion 必须产生 Subsystem-local diagnostic；
- well-formed Event applicability miss：drop only；
- presentation-local failure：不改变 authoritative Render validity。

### 6. Conformance reset

- Render Update conformance fixtureSetRevision 1 被 revision 2 supersede；移除固定数值边界 exactly-at / one-over fixtures。
- Revision 2 覆盖协议不变量、atomicity、identity、revision、Event 与 transport semantics，并测试 local budget exhaustion 的无 partial commit / no partial send / local diagnostic。
- Local numeric budgets 属 implementation/product qualification input，不属于跨实现 Render wire conformance corpus。
- Renderer Data Profile v1 的 common fixed message/depth gate 改为 local resource policy；其 conformance fixtureSetRevision 为 4。
- 当前 active Renderer Data Profile `/3` 的 common message/depth gate 与 generic pending queue 也必须使用 local resource policy；`/3` identity 不变，不创建 profile v4。
- Profile v1 三-child → 四-child 的 cohort/compatibility correction 继续由 ADR0037 单独治理；numeric budget correction 不增加该 gate。

## 后果

正面：

- Render wire contract 不再把历史实现容量伪装成业务/协议正确性；
- Desktop / PWA / future hosts 可按各自 capacity 选择 bounded budgets；
- 开发者可表达更大的业务数据结构，不受 arbitrary fixed caps 限制；
- Framework 仍然有界，且 resource failures 与 malformed peer errors 可区分；
- 通过 operation-first bounded work 避免全树预检的重复 CPU 成本。

代价：

- Product composition 必须明确选择 sender/receiver 兼容的预算；
- local exhaustion 的诊断与可观测性必须实现；
- independent peers 没有 budget negotiation；仅当某条消息超过 receiver 实际 local capacity 时，接收端才可能发生 Data-local resource exhaustion；这不是协议格式不兼容；
- 旧实现中的 hard-coded limits 必须改为可配置 resource budgets 或移除；
- revised-v1 必须重新 materialize conformance tests，并执行受影响 Desktop/Hostra/PWA qualification。

## 不在本 ADR 范围

- 改变 Render message kinds、exact envelope schema、authority direction；
- 改变 Domain/Node one-shot identity、revision semantics、Patch algebra、Event semantics；
- 引入 ACK/NACK、resync、history replay、budget negotiation；
- 放宽 JSON wire representation 为任意 JavaScript object；
- 将业务 Schema 强制塞进 Runtime；
- 实现 Map-specific Tile/Projection/Canvas policy。

本 ADR 不表示实现或 qualification 已完成。
