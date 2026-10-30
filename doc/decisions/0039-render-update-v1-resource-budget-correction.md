# ADR 0039 — Render Update v1 Pre-release Removal of Framework-Imposed Capacity Caps

> 状态：Accepted direction / pre-release correction; implementation and qualification pending
> 日期：2026-10-30
> 相关原则：[Framework Responsibility and Validation Boundary](../10-architecture/framework-validation-boundary.md)
> 相关决策：[ADR 0022 — Render Update v1 freeze closure](./0022-render-update-v1-freeze-closure.md)、[ADR 0038 — Developer Authority and Minimal Runtime Enforcement](./0038-developer-authority-minimal-runtime-enforcement.md)
> 相关契约：[Render Update v1](../15-contracts/render-update-v1.md)、[Render Update v1 Conformance](../15-contracts/render-update-conformance-v1.md)、[Renderer Data Profile v1](../15-contracts/renderer-data-profile-v1.md)、[Renderer Data Profile /3](../15-contracts/renderer-data-profile-v3.md)、[Frame-targeted Presentation Event v1](../15-contracts/frame-targeted-presentation-event-v1.md)

## 背景

Issue #133 的真实物理机诊断表明，Render Data 路径不仅承担重复遍历，还把许多固定数值限制当成 accept/reject 规则：message bytes、JSON depth、identifier length、Domain/Node/operation counts、attrs members、data members/elements/bytes/depth，以及 Presentation Interest 的 Frame/channel/pair counts 和 Presentation Event payload depth/member/byte limits 等。

这些数字并非全部来自 Render authority、wire interoperability 或业务语义。它们混合了历史实现容量、预先防御性验证和框架自行设定的资源上限，使不同平台/产品不得不接受同一套与实际平台能力不匹配的限制，也让开发者的数据形状被框架约束。

PR #135 的目标不是把固定数字改成可配置数字。**框架不应以 ResourceBudgetPolicy、local budget、bounded queue 或其他可配置机制重新建立同一类人为容量门槛。** 平台有能力处理更大的数据时，LoomRealm 不得因为自己的容量估计而拒绝它。

## 决定

### 1. 删除框架自行设定的 numeric capacity caps

Render Update v1 不再定义或要求框架实现以下容量上限：

- application message UTF-8 bytes；
- JSON container / application data nesting depth；
- Domain Registry entries；
- domainId、Node key、tag、Event name 的 UTF-8 byte length；
- RenderNode count、tree depth；
- Patch operation count；
- attrs key/value byte length 与 attrs member count；
- Render data array elements、object members、compact bytes、relative depth；
- generic data object key byte length；
- Presentation Interest Frame count、per-Frame Channel count、total pair count、Channel byte length；
- Presentation Event name / identity byte length、data depth、member count、payload bytes；
- pending message count、queue bytes、retained work、candidate growth 或其他框架自行设定的容量。

这些数字不得通过默认常量、可配置选项、Product composition policy、Host policy 或新的 ResourceBudgetPolicy 重新引入为框架拒绝条件。

以下数值约束仍保留，因为它们不是容量估计，而是协议语义或数值表示正确性：

- revision/baseRevision 为 positive safe integer，避免 JavaScript Number 精度丢失和 revision wrap；
- zIndex 为 signed safe integer，保证跨实现的精确整数排序；
- identity strings 必须非空且为 Unicode scalar strings；不定义 byte-length 上限；
- Viewport width/height 等字段继续遵循其自身 contract 的正数和 safe-integer 语义。

### 2. 保留协议不变量与 wire representation

以下不是应用资源容量限制，继续属于协议：

- one UTF-8 JSON text string = one exact Render message object；
- exact closed message / operation schema，未知字段拒绝；
- Wire JSON representation；Render attrs 是 string→string map，data 是 plain JSON object；
- Domain / Node identity uniqueness、one-shot history、stable live tag；
- Registry、Snapshot、Patch、Event 的 direction/lifecycle/baseline semantics；
- strict per-carrier revision continuity；
- Patch operation preconditions、ordered application、isolated candidate、atomic commit；
- final candidate 的 parent/sibling/reachability/cycle/identity/tree invariants；
- Event transient/applicability/order semantics；
- Data authority、Frame/Input/Content separation。

不因取消 numeric caps 而取消框架实际依赖的类型前提、状态一致性或失败原子性。结构合法性不等于结构规模限制：Tree 可以很大、很深，但仍必须满足 identity、parent、sibling、reachability 和 cycle invariants。

### 3. 不以 local resource budget 替代旧限制

本次明确不引入：

- Host / Product / Runtime ResourceBudgetPolicy；
- raw inbound byte gate；
- parser depth/work budget；
- bounded serializer 或 outbound byte accounting gate；
- candidate growth / retained-state budget；
- queue count / retained payload / in-flight capacity budget；
- ResourceBudgetExceeded / local-resource-exhaustion 作为人为容量限制的错误类别；
- sender/receiver budget negotiation 或预算兼容登记。

Host、浏览器、JavaScript engine、操作系统和实际 carrier API 自身的能力边界仍然存在。这些边界由平台决定，不由 LoomRealm 重新估算或缩窄。实际操作若因平台能力失败，框架应传播可观察到的真实异常；不可捕获的进程级 OOM 不承诺能够被 JavaScript catch。

### 4. Operation-first、single-pass 与 atomicity

- Parse 直接使用既定 Wire / ECMAScript JSON.parse 语义，不先执行 raw-byte gate 或 JSON depth preflight。
- Encode 在实际序列化过程中完成必要的 JSON representation 处理，不先完整扫描对象再重复 stringify；不得为 byte accounting 再遍历对象图。
- RenderManager 只执行 API ownership contract 和当前操作需要的检查；删除与当前 Patch 无关的完整 Snapshot probe。
- RenderStore 按 Patch operation 顺序处理实际目标和前置条件；不因每个 operation 或每次小更新重新扫描无关 subtree。
- Snapshot / structural Patch 仍须维护框架拥有的 Tree identity、parent/sibling、reachability 和 cycle invariants；不执行 node-count 或 tree-depth cap。
- 必要的 detached ownership isolation、COW、isolated candidate 和 atomic commit 保留；失败时丢弃 candidate，不污染 current state。
- 对未 emitted 的 authoritative desired state，只按既有语义允许的方式 coalesce；不得通过容量压力丢弃已接受的 Event 或跳过 authoritative operation。

### 5. Failure classification

- malformed JSON / invalid Wire representation / unknown message kind / exact closed-schema violation：protocol-fatal，retire current Data Connection；
- Domain lifecycle / revision / Patch precondition / candidate invariant violation：authoritative continuity failure，retire current Data Connection；
- developer-owned input、getter/Proxy、JSON serialization 或本地操作异常：在对应 API / authoring boundary 报告实际异常，不得自动伪装成 peer protocol-fatal，也不得仅因此终止整个 Data Connection；
- inbound candidate 的意外本地执行异常：丢弃 candidate，报告本地异常；若无法继续证明 authoritative continuity，可以退休当前 Data Connection，但必须标记为 local implementation failure，而不是 peer protocol violation；
- carrier / Host API 的实际 send/receive failure：按实际 transport failure 处理；
- well-formed Event applicability miss：drop only；
- 不定义 ResourceBudgetExceeded 或 local-resource-exhaustion，因为本 ADR 不建立人为资源预算。

序列化失败不得产生 partial application unit；Patch 失败不得 partial commit。错误分类必须说明实际失败位置和责任边界，不得为容量数字创造一套新错误体系。

### 6. Queue、backpressure 与 transient Event

- Data reader / writer 继续保持单 reader、单 serialized writer 和既有 FIFO/order semantics；这些是并发与协议顺序约束，不是队列容量上限。
- Render Update、Renderer Data Profile 和 DataRuntime 不定义通用 queue item count、retained bytes 或 pending-work cap。
- 不得因为 queue 达到框架设定的数字而拒绝 send、关闭 Data peer 或静默丢弃消息。
- Registry 和尚未 emitted 的 authoritative desired state 仍可按既有规则 coalesce；已 emitted 的 authoritative message 不得撤回、重排或跳过。
- Render Event 不因框架队列容量压力而丢弃；保留 Event ordering barrier。Event 仍是 transient、non-authoritative、no replay；carrier 在发送/交付前终止时不 replay，stale/inapplicable Event 仍按协议 drop。
- Presentation Event 不设置 256 等框架容量；保留 FIFO 和 single-writer ordering。
- Viewport latest-value coalescing 是该 state child 的语义，不是通用资源预算；仅未发送的旧 size 可由更新的 size 替代。
- PWA MessagePort queue terminal 时清空引用；可用 head-index/ring-buffer 改善队列操作成本，但不得增加容量 cap。
- 真实 carrier.send / host API failure 按 transport error 传播；不以 ResourceBudgetExceeded 替代。

### 7. Conformance correction

- Render Update conformance fixtureSetRevision 1 被 revision 2 candidate supersede；revision 2 删除 local-resource-budget fixtures。
- Revision 2 保留协议不变量、atomicity、identity、revision、Event 与 transport semantics，并增加超过历史 1 MiB / depth 64 / Node 16384 / tree depth 30 / Patch 4096 / data 256 KiB 等旧阈值的代表性有效 fixture，证明旧数字不再作为 protocol rejection rule。Fixture 只证明样本有效，不建立新的最大值。
- Conformance 不要求每个实现配置 local resource budgets，也不测试 ResourceBudgetExceeded。
- Renderer Data Profile v1 conformance fixtureSetRevision 4 candidate 删除 common message-byte/depth budget obligation；增加超过历史阈值的代表性 profile workload。
- Renderer Data Profile /3 删除 generic queue / message/depth budget obligation；保留单 reader、单 writer、FIFO、viewport latest-value coalescing 和既有 role semantics。
- Frame-targeted Presentation Event v1 删除 Interest 的 128 Frames / 64 Channels / 4096 pairs / 256-byte Channel caps，以及 Event identity/name byte、data depth/member/byte caps；保留 exact shape、Unicode scalar、C0/DEL、authority、activation、interest applicability 和 transient semantics。
- Design / conformance revision 尚未激活；实现和 qualification 完成后才能标记为 Active / Normative。

### 8. Same-identity pre-release compatibility gate

移除旧限制会改变旧实现的 accept/reject 行为；移除容量触发的 Event drop 也会改变可观察 delivery 行为。因此本 ADR 不声称这些修改“没有 wire-observable effect”。

保持 Render Update /1 与受影响 Renderer Data Profile identity 的前提是：它们仍处于首次正式发布前，并且 release owner 确认不存在：

- deployed old-cap Render Update /1, affected Renderer Data Profile /1 or /3 peers, or Frame-targeted Presentation Event v1 peers；
- independent implementations relying on old reject/drop behavior；
- rolling upgrade / rollback cohorts；
- persisted messages, recordings, or compatibility obligations requiring old behavior.

若任何一项存在，必须 STOP same-identity correction，另行提交 protocol version / migration ADR。不能只靠“新实现接受更多数据”推断旧新实现一定互操作。

如果兼容核查通过，可以在首次发布前用明确的 correction 更新同一 identity；PR 描述、ADR、contract 和 conformance 必须一致记录该 gate。

## 后果

正面：

- 开发者可使用平台本身能够处理的数据规模，不再受框架自行估计的容量数字限制；
- Framework 不会用可配置 budget 重新建立相同的强制门槛；
- 默认热路径减少 raw-byte scan、depth/member traversal、重复 stringify 和无关 Snapshot preflight；
- Queue 不会因人为容量数字丢弃应用消息或关闭 peer；
- Protocol invariants、ownership isolation 和 atomicity 仍然受到保护。

代价与边界：

- 平台实际失败可能发生在较晚的操作阶段；框架必须准确传播可观察异常；
- 不可恢复的 OOM / process termination 不能承诺被 catch；
- 应用若需要业务数据大小或深度限制，应自行启用 Strict Validation；
- 移除旧数字和容量触发的 drop 行为必须通过兼容性 gate 与 conformance correction；
- 性能收益必须由 Issue #133 同等工作负载证明，不能只凭删除代码推断。

## 不在本 ADR 范围

- 改变 Render message kinds、exact envelope schema、authority direction；
- 改变 Domain/Node one-shot identity、revision semantics、Patch algebra 和 structural invariants；
- 引入 ACK/NACK、resync、history replay 或 budget negotiation；
- 放宽 JSON wire representation 为任意 JavaScript object；
- 将业务 Schema 强制塞进 Runtime；
- 实现 Map-specific Tile/Projection/Canvas policy；
- 为替代旧限制而创建新的 ResourceBudgetPolicy、ResourceBudgetExceeded 或通用容量治理系统。

本 ADR 不表示实现或 qualification 已完成。
