# ADR 0038 — Developer Authority and Minimal Runtime Enforcement

> 状态：Accepted by project direction; publication pending PR #135 merge
> 日期：2026-10-30
> 触发证据：[Issue #133](https://github.com/lithdoo/loom-realm/issues/133) 的真实物理机性能诊断
> Current architecture：[Framework Responsibility and Validation Boundary](../10-architecture/framework-validation-boundary.md)
> 相关工作：[PR #135](https://github.com/lithdoo/loom-realm/pull/135)

## 背景

Issue #133 的真实物理机诊断表明，大型 Render Data 在 Worker 与 Renderer 路径中承担了多轮完整 JSON traversal、Schema/representation 检查、depth/byte accounting、复制与序列化成本。

此前的优化方向默认认为所有严格验证都必须保留，只需合并遍历、缓存 metadata 和建立 Validated Immutable JSON。

该前提不充分。它把框架运行所需的协议与状态约束、开发者拥有的应用业务正确性检查，以及框架自行设定的容量限制混成了同一责任，使所有应用无条件支付额外检查成本，也使平台本来能够处理的数据被框架拒绝。

LoomRealm 的框架职责应由 authority partition 决定：框架维护自己的协议和状态正确性；开发者拥有应用业务语义、数据规模和资源使用决策。框架不能默认成为应用数据的全面监管者。

## 决定

### 1. Developer Authority

应用数据的业务 Schema、字段含义、跨字段约束、业务数值范围、领域状态不变量和数据规模选择归开发者负责。Framework 不得在默认 Runtime 路径中推断并强制执行这些业务规则或自行设定的容量规则。

### 2. Minimal Runtime Enforcement

默认 Runtime Guard 仅保留：

- framework execution / state invariants；
- message envelope、protocol type/direction 与必要字段；
- authority / identity / generation / revision / lifecycle；
- candidate isolation、atomic commit 和 framework-owned consistency；
- 当前 Contract 明确规定的 JSON representation、protocol invariants 和 failure semantics。

默认 Runtime 不建立 message bytes、JSON depth、Node count、tree depth、Patch operation count、member count、string bytes、payload bytes、queue count、retained bytes 或 candidate growth 的人为上限。

不以 local resource budget、ResourceBudgetPolicy、bounded serializer、raw-byte gate 或 bounded queue 替代已删除的固定数值限制。平台自身的实际能力和原生 API 行为不由 LoomRealm 重新定义。

没有 framework owner / protocol obligation 的完整应用数据审查，不应进入默认热路径。

### 3. Opt-in Strictness

更严格的 JSON / Schema / domain validation 由开发者显式选择，可作为独立模块或 diagnostic configuration 提供。默认 Runtime 不依赖该能力；其 API/package/configuration 另行设计。

开发者可以在 Strict Validation 中自行选择深度、成员、字符串、payload 或其他业务约束。此类约束仅属于主动启用的验证流程，不成为默认 Runtime 或跨实现协议要求。

### 4. Operation-first / Error-first

对开发者控制且处于受信任执行路径的数据，优先在实际操作时执行必要检查，而不是在每次更新前全量预检。操作错误在明确边界传播或捕获；失败的 candidate 必须被丢弃，不能部分提交。

- malformed wire representation / exact-schema violation 仍按协议拒绝；
- authority、identity、revision 和 Patch precondition failure 仍按 continuity semantics 处理；
- 开发者输入、实际序列化或本地操作异常不得被伪装成 peer protocol-fatal；
- carrier / host API 的真实失败按 transport failure 处理；
- 不以人为 byte、depth、count 或 queue cap 提前拒绝操作。

Catch 不能保证捕获进程级 OOM；框架不承诺把宿主进程无法恢复的故障转换成普通异常。

### 5. Ownership is explicit

不再把全量深复制、深冻结或强制 ValidatedJson wrapper 视为默认严格验证的必然组成部分。各 API 必须明确 caller/framework ownership、mutation 和 snapshot semantics；只有在 authority isolation 或当前 contract 要求时执行必要复制/隔离。

必要 ownership isolation 应与该 API 实际需要的类型检查融合，避免同一对象图被重复遍历。Renderer candidate 仍须隔离并原子提交，以免失败 Patch 污染 current state。

## Frozen Contract 兼容范围

本 ADR 不静默修改已有 Frozen Contract。

Render Update v1 原有的 numeric hard limits 和容量触发的队列行为曾影响跨实现可观察的 accept/reject/drop 结果。它们由 [ADR 0039](./0039-render-update-v1-resource-budget-correction.md) 作为首次发布前 correction 明确删除，而不是替换为另一套 local resource budgets。

同一协议 identity 的 correction 仅在确认不存在 deployed/independent old peers、rolling/rollback cohorts 或 persisted compatibility obligations 时成立；否则必须停止 same-identity correction 并提交显式 version/migration ADR。

继续保留：

- JSON representation 与 exact closed message schema；
- authority / identity / generation / revision / lifecycle；
- Patch operation preconditions、candidate isolation 与 atomic commit；
- framework-owned tree/identity invariants；
- Event ordering、transient applicability 与 carrier-loss semantics。

首次正式发布后，wire-observable accept/reject/drop semantics 变化仍须版本化。不能把“开发者拥有业务正确性”解释为可以绕过 protocol invariants。

## 后果

正面：

- Framework 热路径不再默认承担应用业务 Schema 审查；
- 平台能够处理的数据不再因框架自行设定的容量数字被拒绝；
- 严格验证由开发者选择，不强迫所有应用承担其成本；
- operation-first 路径减少无关全量预检；
- error-first 路径与 atomic commit 结合，避免失败操作污染已提交状态。

代价与约束：

- API 必须更清楚地定义 ownership / mutation；
- JSON representation 与 protocol invariants 仍须正确实现；
- 实际平台/transport failure 必须准确传播；
- strict validation 的 public API 和 package 需要单独设计；
- 移除重复检查必须由行为等价和性能基准证明，不能只凭理论判断。

## 重新开启条件

以下情况需要重新评估本 ADR：

- 实际安全或正确性事件证明某个 protocol/framework invariant 定义不足；
- 新的 wire contract 引入新的、明确拥有的语义约束；
- Frozen Contract 与本原则冲突，需要明确修订；
- ownership contract 无法保证 authority isolation；
- opt-in strict validation 的使用需求形成真实公共 API。

本 ADR 不等于任何实现已经完成或通过 qualification。
