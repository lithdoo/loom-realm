# 文档分层与变更规则

> 层级：产品总览  
> 状态：Active / Normative  
> 稳定程度：Stable  
> 最近复核：2026-10-09

LoomRealm 已进入 product-maintenance 阶段。治理目标是让 **Current product truth、work tracking、decision provenance、qualification evidence** 分别拥有唯一位置，避免阶段计划和历史 PASS 演化成第二套事实源。

## 1. Current 文档层级

```text
00-overview      product / governance
      ↓
10-architecture  authority / responsibility / topology
      ↓
15-contracts     interoperable contracts / profiles / ABI
      ↓
20-modules       current realization / code ownership
      ↓
30-development   development / tests / qualification / performance
```

`decisions/` 记录为什么；GitHub Issue/PR 记录进行中的工作；历史 ledger/evidence 只保存 provenance，不参与 Current definition precedence。下层可以细化上层，不得反向定义上层 authority。

## 2. 不再使用 milestone 作为 Current 信息架构

禁止新增 `M18/M19/...` 式 Current plan、roadmap、qualification navigation。大型改动按 capability 管理：

```text
Capability / Problem
→ Scope + Non-goals
→ Authority impact
→ Contract impact
→ ADR when needed
→ Implementation
→ Tests
→ Qualification subject/evidence
```

任务完成后，Issue/PR 关闭；仍有效事实进入 Architecture/Contract/Module/Development。纯过程 plan/review 默认由 Git 历史保存。

## 3. Document Status

| 状态 | 含义 |
| --- | --- |
| Normative | 当前实现/设计必须遵守 |
| Active Design | 当前有效但仍允许演进 |
| Draft | 尚未形成稳定实现承诺 |
| Reference | 背景、外部格式或研究资料 |
| Tracking | 临时实施/开放问题；优先使用 Issue/PR |
| Superseded | 已被后续决策取代，仅保留兼容或历史 |
| Historical Evidence | 只证明某 subject/环境下发生过什么 |

稳定等级仍使用 Frozen / Stable / Stabilizing / Evolving / Experimental。`Frozen != Implemented != Qualified`。

## 4. 主要定义必须形成 DAG

```text
Product/Governance
→ Architecture
→ Contract
→ Module
→ Development/Test
```

两个 Current 文档不得互相声明同一事实的最终 authority。横向“相关”链接不构成定义 dependency。

## 5. Real Compatibility Boundary

出现 shipped/used conformant implementation、多个独立实现互操作、第三方依赖、持久/网络数据兼容义务或公开版本承诺后，incompatible schema/identity/order/error/recovery/limit/encoding change 必须 version 或显式 migration。

没有真实 compatibility obligation 时，允许通过 Accepted ADR 修正错误的 current-v1 设计，但必须同步所有 dependent Current docs/tests/navigation；不得用 fake v2、deprecated dual parser 或平行协议规避治理。

## 6. Frozen change rule

Frozen 文档允许 editorial clarification、链接修正、历史关系说明和已有行为的新增证据。以下变化默认不能静默修改：

```text
method/field legality
identity/lifecycle
commit/causal order
error/recovery
limits
encoding/mapping
version binding
frozen physical ownership
```

重大修正需要 ADR，并明确旧决定被 supersede/update 的范围、未改变内容、compatibility obligation 和 qualification 影响。

## 7. Change propagation

Architecture change：

```text
Overview when product scope changes
→ topic Architecture
→ Contracts when observable semantics change
→ Modules
→ Development/tests/navigation
```

Contract/Profile change：

```text
ADR when major
→ current Contract
→ Architecture projection
→ affected Modules
→ tests / qualification
→ navigation
```

Platform/host ownership change同样必须传播到 launcher/runtime hosting、相关 contract、module 与 qualification，不得只更新一次性实施文档。

## 8. Qualification 与历史 PASS

Qualification 使用 subject/staleness 模型：

```text
behavior or qualification-input change
→ new subject
→ determine affected capabilities
→ run required gates
→ attach exact evidence
```

文档-only editorial commit 不自动产生新 executable subject。历史 PASS 只对其记录的 subject、输入与环境有效，不能自动迁移到新实现。

## 9. Evidence retention

默认 archive 是 Git 历史。只有具备以下不可替代价值时，才在工作树保留 Historical Evidence：

```text
exact external provenance
machine/environment identity
raw/sanitized digest
sample counts / P95
legal-local qualification boundary
independent interoperability result
```

完成的 prompt、计划、review、scope repair、阶段总结若没有上述价值，应删除而不是搬到另一个垃圾目录。

## 10. Package / App / Example 文档边界

Package-local：

```text
README.md       usage / exports / quick boundary / links
DESIGN.md       optional internal realization/invariants
CONFORMANCE.md  optional independently useful conformance contract
```

Package 文档不拥有 system authority、cross-package ABI、project status 或 roadmap。App README 只说明运行/构建/entry/config，并链接 Module/Contract。Example 根目录不得作为历史项目档案馆。

## 11. Conflict resolution

优先按主题的 authoritative source，而不是按“最近 commit”覆盖：

```text
Product/Governance
→ topic Architecture
→ Current Normative Contract
→ Accepted current ADR as provenance
→ Module realization
→ Development/Test
```

Superseded ADR、legacy milestone ledger、old review 或 Historical Evidence 永远不能覆盖 Current source。

## 12. 最终规则

1. Current product truth 只有一套；
2. Current 导航不使用 milestone/progress 组织；
3. Issue/PR 承担工作进度；
4. ADR 记录 why，不替代 Contract；
5. Git 是默认历史归档；
6. Frozen、Implemented、Qualified 分离；
7. 真实 compatibility obligation 出现后必须 version/migrate；
8. authority 定义自上而下传播；
9. qualification PASS 不跨 subject 自动继承；
10. 文档重构必须通过链接检查与 VitePress build。
