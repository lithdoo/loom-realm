# ADR 0038 — Developer Authority and Minimal Runtime Enforcement

> 状态：**Accepted by project direction; publication pending PR #135 merge**
> 日期：2026-10-30
> 触发证据：[Issue #133](https://github.com/lithdoo/loom-realm/issues/133) 的真实物理机性能诊断
> Current architecture：[Framework Responsibility and Validation Boundary](../10-architecture/framework-validation-boundary.md)
> 相关工作：[PR #135](https://github.com/lithdoo/loom-realm/pull/135)

## 背景

Issue #133 证明，大型 Render Data 在 Worker 与 Renderer 路径中承担了多轮完整 JSON traversal、Schema/representation 检查、depth/byte accounting、复制与序列化成本。

此前的优化方向默认认为所有严格验证都必须保留，只需合并遍历、缓存 metadata 和建立 Validated Immutable JSON。

该前提不充分。它把框架运行所需的安全与协议约束、开发者拥有的应用业务正确性检查混成了同一责任，并使所有应用无条件支付额外检查成本。

LoomRealm 的框架职责应由 authority partition 决定：框架维护自己的执行和协议不变量；开发者拥有应用业务语义。框架不能默认成为应用数据的全面监管者。

## 决定

### 1. Developer Authority

应用数据的业务 Schema、字段含义、跨字段约束、业务数值范围和领域状态不变量归开发者负责。Framework 不得在默认 Runtime 路径中推断并强制执行这些业务规则。

### 2. Minimal Runtime Enforcement

默认 Runtime Guard 仅保留：

- framework execution / state invariants；
- message envelope、protocol type/direction 与必要字段；
- authority / identity / generation / revision / lifecycle；
- candidate isolation、atomic commit 和 framework-owned consistency；
- 明确的 resource-safety guards；
- 当前 Frozen Contract 明确规定的 representation、hard limits 和 failure semantics。

没有 framework owner / protocol obligation / resource-safety justification 的完整应用数据审查，不应进入默认热路径。

### 3. Opt-in Strictness

更严格的 JSON / Schema / domain validation 由开发者显式选择，可作为独立模块或 diagnostic configuration 提供。默认 Runtime 不依赖该能力；其 API/package/configuration 另行设计。

### 4. Operation-first / Error-first

对开发者控制且处于受信任执行路径的数据，优先在实际操作时执行必要检查，而不是在每次更新前全量预检。操作错误可以在明确边界捕获，但失败的 candidate 必须被丢弃，不能部分提交。

Catch 不能替代 bounded resource guard。外部输入、消息解析、序列化、队列和可能消耗无界资源的路径仍需在资源被消耗前或过程中限制。

### 5. Ownership is explicit

不再把全量深复制、深冻结或强制 ValidatedJson wrapper 视为默认严格验证的必然组成部分。各 API 必须明确 caller/framework ownership、mutation 和 snapshot semantics；只有在 authority isolation 或当前 contract 要求时才执行必要复制/隔离。

## Frozen Contract 兼容范围

本 ADR 不静默修改已有 Frozen Contract。

当前 Render Update v1 明确规定：

- JSON representation 与 closed message schema；
- message / data / depth / member / node / tree hard limits；
- Patch 每个 operation 后的 bounded candidate；
- protocol-fatal representation/schema/limit failure；
- isolated candidate 与 atomic commit。

这些当前可观察语义在实现 PR 中继续有效。PR #135 的首要目标是在不改变 accept/reject、retire、limit 和 state outcome 的前提下，移除重复全量 traversal 和与当前 operation 无关的预检。

如果项目后续决定放宽或删除其中任何约束，必须单独提交 contract correction，评估 compatibility / migration，并更新 conformance 与 qualification。不能把“开发者拥有业务正确性”解释为可绕过当前协议。

## 后果

正面：

- Framework 热路径不再默认承担应用业务 Schema 审查；
- 验证成本必须由明确的 framework/protocol/resource-safety 理由支持；
- strict validation 可以独立演进，不强迫所有应用承担其成本；
- error-first 路径与 atomic commit 结合，避免无关的全量预检。

代价与约束：

- API 必须更清楚地定义 ownership / mutation；
- 外部边界仍需可靠的 bounded parsing / serialization；
- 当前 Frozen Contract 仍然约束已有协议行为；
- strict validation 的 public API 和 package 需要单独设计；
- 移除重复检查必须由行为等价和性能基准证明，不能只凭理论判断。

## 重新开启条件

以下情况需要重新评估本 ADR：

- 实际安全事件证明某个当前 Runtime Guard 不足；
- 新的跨进程 / 外部 peer threat model 要求新的 resource guard；
- Frozen Contract 与本原则冲突，需要明确修订；
- ownership contract 无法保证 authority isolation；
- opt-in strict validation 的使用需求形成真实公共 API。

本 ADR 不等于任何实现已经完成或通过 qualification。
