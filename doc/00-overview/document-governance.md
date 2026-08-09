# 文档分层与变更规则

> 层级：产品总览  
> 状态：Active / Normative  
> 稳定程度：稳定  
> 主要定义：文档层级、依赖方向、状态、协议兼容边界和迁移规则  
> 最近复核：2026-08-09

LoomRealm 仍处于早期设计/首次实现阶段。文档需要允许设计收敛，同时避免把“设计稿迭代”误当成“协议版本历史”。

## 1. 文档层级

```text
00-overview
    产品目标、范围、原则和文档治理
        ↓
10-architecture
    系统设计思想、职责和关系
        ↓
15-contracts
    跨系统/对外互操作正式契约
        ↓
20-modules
    系统内部模块设计
        ↓
30-implementation
    分包、测试和交付计划
```

### 00-overview

回答“为什么做、适用于什么、当前做什么、长期原则是什么”。

### 10-architecture

回答“系统如何划分、authority 归谁、系统之间如何协作”。示例流程不是正式 wire 契约。

### 15-contracts

回答“独立实现如何互操作”。应覆盖 Schema、identity、state、ordering、error、recovery、limits、version/Profile 与兼容性。

### 20-modules

回答“一个系统内部如何拆分与实现”。模块设计不得扩大系统职责或改写协议。

### 30-implementation

回答“当前仓库如何落地、如何测试和发布”。实现结构可以变化，但必须遵守上层架构/契约。

## 2. 单向依赖

```text
Overview → Architecture → Contracts → Modules → Implementation
```

规则：

1. 下层可以细化上层，不能悄悄改变上层；
2. 下层发现设计问题时先修改主要定义位置；
3. 实施包结构不能反向成为产品架构；
4. 路线图/待办不能替代正式设计；
5. 同一结论只保留一个当前主要定义位置；
6. 上层变化必须检查直接依赖文档；
7. 已形成真实 compatibility boundary 的契约发生不兼容变化时必须提升协议版本或定义明确迁移；
8. 尚未形成真实 compatibility boundary 的设计可以直接修订、重编号或删除，不为从未实现的草案制造兼容层。

## 3. 文档状态

| 状态 | 含义 |
|---|---|
| **Normative** | 当前实现/设计必须遵守的正式范围或协议。 |
| **Active Design** | 当前有效设计，仍允许演进。 |
| **Draft** | 正在形成，不能作为稳定兼容承诺。 |
| **Reference** | 背景、来源格式或外部资料。 |
| **Tracking** | 待办、开放问题和交付追踪。 |
| **Superseded** | 已被后续决定/契约替代，只保留决策历史。 |

当前文档树原则上不长期保留完整的 Legacy/Superseded 协议正文；已替代方案通过 ADR 与 Git history 追溯。

## 4. 稳定程度

状态描述用途，稳定程度描述预计变化频率：

- **Stable/Frozen**：已经承诺当前 compatibility boundary；不兼容变化需新版本/明确迁移；
- **Stabilizing**：核心语义已闭合，正在完成 limits/conformance/implementation validation；
- **Evolving**：方向明确，字段和流程仍可能调整；
- **Experimental**：用于验证，允许较大重构。

早期阶段允许 `Normative + Evolving/Stabilizing`：表示当前主线必须遵守，但尚未承诺长期 wire compatibility。

## 5. 什么才算真实协议兼容边界

协议版本不是文档草稿编号。

以下任一事实通常意味着 compatibility boundary 已形成：

```text
conformant implementation shipped/used
multiple independent implementations interoperate
third-party implementation depends on the wire
persisted/on-disk/network data requires compatibility
public release explicitly promises that protocol version
```

形成后：

```text
incompatible schema/identity/state/order/error/recovery/limit change
→ new protocol/profile version or explicit migration
```

形成前：

```text
design correction
→ update current first-version contract directly
→ update dependent docs
→ keep provenance in ADR / Git history
```

例如 Subsystem Control 与 Game Package 都在首次 conformant implementation 前完成了边界修订，因此当前真正的 first implementation contract 直接命名为 v1，而不是保留没有消费者的历史 v1/v2 双轨。

## 6. Frozen 的含义

Frozen 保护的是 **wire/semantic compatibility**，不是每一个文档句子或链接路径。

Frozen protocol 可以做不改变兼容性的 clarification/editorial update，例如：

```text
current enclosing Profile reference
superseded architecture link
historical ADR relationship
editorial ambiguity
```

但不得静默改变：

```text
legal wire
identity/lifecycle
commit point
error/recovery
limits/version semantics
```

## 7. 文档头部

新增设计文档应声明：

```text
层级：
状态：
稳定程度：
主要定义：
依赖：
被以下文档实现：
最近复核：
```

不适用字段可以省略。

## 8. 变更传播

修改产品/治理层：

```text
更新 Overview
→ 检查 Architecture
→ 检查 Contracts
→ 更新 Modules
→ 更新 Implementation / Tests / Navigation
```

修改协议主线/版本关系：

```text
ADR / current Contract
→ contract index
→ enclosing Profiles
→ architecture diagrams
→ module dependencies
→ implementation roadmap
→ test/conformance plan
→ documentation navigation
```

不能只修改某一个协议文件后留下其他 Current 文档继续指向旧版本。

## 9. 冲突解决

冲突处理优先级：

1. 产品范围/长期原则；
2. 主题对应架构；
3. 当前 Normative 正式契约/Accepted ADR；
4. 模块设计；
5. 实施计划。

被 Superseded 的决策或 Git 历史不能覆盖 Current Contract。

如果 Current 高层文档与 Current Contract 冲突，应修正文档，而不是依赖“哪个提交更新”。

## 10. ADR 治理

重大决策记录：背景、方案、决定、原因/代价、重新评估条件。

ADR 保存“为什么形成当前设计”，不是另一个协议正文副本。

后续变化应明确：

```text
supersedes
updates
clarifies
```

已经失去独立决策价值、只为短暂文档编号迁移产生的 ADR 可以在首次实现前清理；真正的架构决策应保留。

## 11. 旧文档清理

当新分层已经完整接管内容后：

1. 更新所有 Current 入口与交叉引用；
2. 删除被替代的完整旧协议/架构正文；
3. 不在站点导航中暴露旧协议作为可实现入口；
4. ADR 保存关键设计演变；
5. Git history 保存被删除文档全文；
6. 参考资料只有在仍具有独立价值时保留。

当前权威目录固定为：

```text
00-overview
10-architecture
15-contracts
20-modules
30-implementation
```

`decisions/` 保存 ADR；`fsdb/` 等外部格式参考可独立保留。
