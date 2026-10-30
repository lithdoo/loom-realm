# Framework Responsibility and Validation Boundary

> 层级：系统架构 / Framework design principle
> 状态：Proposed in PR #135；合并后成为 Current Architecture 准则
> 决策：[ADR 0038 — Developer Authority and Minimal Runtime Enforcement](../decisions/0038-developer-authority-minimal-runtime-enforcement.md)
> 关联：[系统架构总览](./system-overview.md)、[Render Update v1](../15-contracts/render-update-v1.md)、[性能资格](../30-development/performance.md)

## 1. 核心原则

**LoomRealm 负责保证框架能够正确运行，不负责替开发者保证应用业务数据正确。**

框架必须维护自己的 authority、protocol、identity、lifecycle、state transition、atomicity 和 resource safety。应用数据的业务含义、业务 Schema、跨字段关系和领域规则由开发者负责。

框架不得仅因为应用数据经过某个 framework API，就默认对整个对象图执行额外的、与当前操作无关的严格正确性审查。

## 2. 三项设计准则

### 2.1 Developer Authority

开发者是应用业务正确性的 owner，包括：

- 应用数据的业务 Schema 与字段语义；
- 业务状态转换、跨字段约束和领域不变量；
- 游戏规则、业务数值范围、业务资源引用；
- 应用自身希望强制执行的严格数据质量规则。

框架不得推断并强制执行没有被 framework protocol 明确拥有的业务规则。

### 2.2 Minimal Runtime Enforcement

默认 Runtime Guard 仅执行框架运行所必需的约束：

- 当前操作实际读取/依赖的类型和字段前提；
- 消息 envelope、协议 discriminator、direction 和当前 contract；
- authority、identity、generation、revision、lifecycle 和 state continuity；
- Patch / Snapshot 的 candidate isolation、commit atomicity 和 framework-owned tree invariants；
- bounded parse/serialize、队列、内存和其他防止资源耗尽的约束；
- 当前正式契约明确规定的 representation、framework invariants 和 failure semantics；numeric resource budgets 由显式 local policy 管理，pre-release correction 按正式 ADR 修订。

默认 Runtime 不应额外执行：

- 应用业务 Schema 或跨字段业务语义审查；
- 与本次操作无关的完整 Snapshot preflight；
- 对已经处理过的数据重复进行全树 JSON / depth / byte traversal；
- 仅为证明业务数据“足够严格”而进行的无差别深复制或深冻结。

### 2.3 Opt-in Strictness

更严格的检查由开发者主动选择，可在开发、测试、CI 或明确配置的生产环境使用。

Strict Validation 可以提供 JSON representation、exact Schema、业务 validator、深度/成员/字符串限制和诊断信息，但必须满足：

- 默认不进入普通 Runtime 热路径；
- 不成为框架运行的强制依赖；
- 不改变既有 wire ABI；
- 不能绕过当前协议本身的强制约束；
- 具体 API / package / configuration 由独立设计决定。

## 3. Operation-first 与错误处理

对开发者拥有、处于受信任执行路径的数据，默认采用 operation-first：

1. 不为每次小更新预先完整扫描整个应用状态；
2. 在实际读取、应用、编码或提交时执行该操作所需的检查；
3. 让操作自身报告可捕获的类型、序列化或前置条件错误；
4. 在清晰的 API / subsystem / transport 边界处理错误；
5. 失败操作必须放弃候选状态，不得部分提交或污染 current state。

这不等于所有错误都可以事后捕获。对于可能导致无界内存分配、超大输入解析、无界队列或不安全 transport 的风险，必须在资源被消耗之前或消耗过程中执行 bounded guard。

## 4. Ownership 与不可变性

- 不得把深复制 / 深冻结当作默认业务严格验证，但也不得为了性能删除必要的 authority / ownership isolation。
- 当前 RenderManager authoring API 在异步 publication 前必须与 caller-owned input 脱离；API 返回后 caller mutation 不得改变 retained state、pending work 或 emitted message。
- 将必要的 shape/type validation、detached clone、freeze 和 retained-state accounting 融合为一次遍历；ownership transfer 仅能由显式的新 API contract 定义，不能推定为现有 API 行为。
- Renderer 收到的 JSON.parse object 已由 parser 创建；RenderStore 可在证明无外部别名后利用其 ownership，但仍必须通过 isolated candidate + atomic commit 保证 current state 不被失败 Patch 污染。
- Strict Validation 可以在 opt-in 模式检测业务 mutation / shape 问题。
- 缓存 metadata 只能用于它实际证明的内部计算或资源计量；metadata 不是业务正确性证明，也不是跨进程信任凭证。

## 5. 安全与资源边界

异常捕获不能替代资源保护。默认 Runtime 仍应在必要边界保留：

- raw message byte gate before parse；
- bounded serialization / byte accounting；
- bounded queues and retained work；
- finite local resource budgets：raw inbound bytes / parser work、candidate growth、retained state、queue count + retained payload/work、outbound serialization bytes；这些是 Host / Product / Runtime policy，不是跨实现统一 wire limits；
- operation-level candidate isolation and atomic commit。

优先将检查融合到实际 parse、serialize、Patch operation 或 commit 中，而不是在实际工作前增加一轮完整扫描。

硬限制应由明确的协议义务或平台 threat model 支持，不应仅因为“严格一些比较安全”就无限增加。

## 6. Frozen Contract 兼容规则

本原则不允许静默修改正式契约，但正式契约本身可以在首次发布前通过明确的 correction 重新评估历史 numeric limits。

当前 [Render Update v1](../15-contracts/render-update-v1.md) 保留 JSON representation、closed message schema、authority/identity/revision、Patch atomicity、framework structural invariants、failure/recovery semantics；active [Renderer Data Profile `/3`](../15-contracts/renderer-data-profile-v3.md) 的 message set 与 direction 也保持不变。Numeric capacity 是本地资源策略，不是 wire ABI：移除或放宽固定 numeric threshold 不要求创建新 protocol/profile version，也不要求仅因旧实现存在较小容量就停止 same-identity correction。旧接收端仍可能拒绝超过其自身容量的负载；这是 workload capacity mismatch，应通过部署预算与目标负载管理，而不是伪装成 schema incompatibility。

任何正式契约修订仍须：

1. 明确区分 framework invariant、wire semantics 与 local resource-safety policy；
2. 对真正改变 message schema、direction、authority、ordering、revision、atomicity 或 recovery semantics 的修改，提交独立 ADR / versioning plan；
3. 对 local budget 修改更新实现配置、诊断和相关测试，不要求协议版本升级；
4. 更新 conformance / qualification inputs，并按目标 Host/Product 重新验证容量与性能。

首次正式发布后，wire-observable protocol semantics 变化必须版本化；本地资源预算调整不属于此类变化。

## 7. 设计审查清单

新增或修改 framework validation 时，必须回答：

- 这个检查保护的是 framework invariant、protocol compatibility 还是 resource safety？
- 如果删除它，框架是否无法继续正确运行，或是否会违反当前 Frozen Contract？
- 检查能否融合到实际 parse / serialize / operation / commit？
- 是否对本次操作没有改变的数据做了全量重复遍历？
- 这是业务 Schema / domain invariant 吗？如果是，为什么不由开发者或 opt-in validator 拥有？
- 是否可以通过 operation-first error handling 和 atomic candidate commit 处理？
- 若需要 strict validation，它是否与默认 Runtime Guard 解耦？
- 如果涉及 Frozen Contract，是否有明确 correction / migration / qualification 计划？

若无法说明检查的 framework owner 和必要性，不应默认把它加入每次 Runtime 热路径。
