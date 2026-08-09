# 文档分层与变更规则

> 层级：产品总览  
> 状态：Active / Normative  
> 稳定程度：稳定  
> 主要定义：文档层级、依赖方向、状态、协议兼容边界和迁移规则  
> 最近复核：2026-08-09

LoomRealm仍处于早期设计/首次实现阶段。文档必须允许上层设计调整后有秩序地向下传播，同时明确区分“已经形成真实兼容边界的协议”和“尚未实现的设计版本”。

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

回答“系统如何划分、状态/authority归谁、系统之间如何协作”。示例流程不是正式 wire契约。

### 15-contracts

回答“独立实现如何互操作”。应覆盖 Schema、identity、state、ordering、error、recovery、limits、version/Profile与兼容性。

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
5. 同一结论只保留一个主要定义位置；
6. 上层变化必须检查直接依赖文档；
7. 已形成真实 compatibility boundary 的契约发生不兼容变化时必须提升协议版本或定义明确迁移；
8. 尚未实现/发布且无第三方依赖的设计版本可以通过明确 ADR **Abandon Before Implementation**，无需制造不存在的兼容层。

## 3. 文档状态

| 状态 | 含义 |
|---|---|
| **Normative** | 当前实现/设计必须遵守的正式范围或协议。 |
| **Active Design** | 当前有效设计，仍允许演进。 |
| **Draft** | 正在形成，不能作为稳定兼容承诺。 |
| **Reference** | 背景、来源格式或外部资料。 |
| **Tracking** | 待办、开放问题和交付追踪。 |
| **Legacy** | 旧入口，不再新增主要定义。 |
| **Abandoned Before Implementation** | 曾形成协议/Profile设计，但在真实互操作实现前明确废弃；不产生兼容义务。 |
| **Superseded** | 已被后续决定/契约替代，只保留历史追溯。 |

## 4. 稳定程度

状态描述用途，稳定程度描述预计变化频率：

- **Stable/Frozen**：已经承诺当前 compatibility boundary；不兼容变化需新版本/明确迁移；
- **Stabilizing**：核心语义已闭合，正在完成 limits/conformance/implementation validation；
- **Evolving**：方向明确，字段和流程仍可能调整；
- **Experimental**：用于验证，允许较大重构。

早期阶段允许 `Normative + Evolving/Stabilizing`：表示当前主线必须遵守，但在首次真实兼容承诺前仍可通过明确 ADR纠正设计边界。

## 5. 什么才算真实协议兼容边界

协议版本不是文档草稿编号。

以下任一事实通常意味着 compatibility boundary已经形成：

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

在以上事实全部不存在时，一个错误设计即使曾被文档标记 Frozen，也可以经 ADR明确：

```text
Abandoned Before Implementation
```

并选择新的 current version，而不实现 dual-stack/fallback。

这条规则已用于 [ADR 0017](../decisions/0017-abandon-subsystem-control-v1.md)：Subsystem Control v1从未实现，因此被明确废弃；Control v2成为唯一当前目标。

## 6. Frozen 不等于不可修正文档关系

Frozen协议的 **wire/semantic compatibility** 不得静默改变，但可以通过 clarification修正：

```text
current enclosing Profile reference
superseded architecture link
historical ADR relationship
editorial ambiguity
```

前提是 clarification不能改变已冻结：

```text
legal wire
identity/lifecycle
commit point
error/recovery
limits/version semantics
```

例如 Frame / Call v1仍保持 protocolVersion=1；Control主线切换到 v2后，通过 clarification把当前 enclosing Runtime Profile更新为 `Control v2 + Frame v1`，而不是升级 Frame版本。

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

历史 tombstone还应注明：

```text
当前替代：
决策记录：
```

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
3. 当前 Normative正式契约/Accepted ADR；
4. 模块设计；
5. 实施计划。

Legacy/Superseded/Abandoned文档永远不能覆盖 Current Contract。

如果 Current高层文档与 Current Contract冲突，应修正文档，而不是依赖“哪个提交更新”。

## 10. ADR 治理

重大决策记录：背景、方案、决定、原因/代价、重新评估条件。

Accepted ADR不通过删除历史表达新决定；后续变化新增 ADR并明确：

```text
supersedes
updates
clarifies
```

历史 ADR可以更新头部/醒目注记指向 superseding ADR，但正文应保留原决策上下文。

## 11. 旧文档迁移

1. 建立新的权威入口；
2. 旧详细文档暂留历史/过渡；
3. Current文档不复制多个互相竞争的主要定义；
4. 被替代路径改为 Legacy/Superseded/Abandoned tombstone或最终删除；
5. Git历史/ADR用于追溯设计演变；
6. 不为从未实现的历史版本保留无意义的 runtime compatibility code。

## 12. 当前治理实例

```text
Subsystem Control v1
    Abandoned Before Implementation

Subsystem Control v2
    Current

Runtime Control Profile v1
    Abandoned Before Implementation

Runtime Control Profile v2
    Current = Control v2 + Frame / Call v1

Frame / Call v1
    remains Frozen / version 1
```

这体现了两条不同规则：

> **没有真实消费者的错误设计可以明确废弃；已经形成真实 compatibility boundary 的协议必须严格版本化。**
