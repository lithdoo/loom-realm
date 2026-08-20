# 文档分层与变更规则

> 层级：产品总览  
> 状态：Active / Normative  
> 稳定程度：Stable  
> 主要定义：文档层级、主要定义依赖、设计稳定状态、真实 compatibility boundary、首次实现前 current-v1 收口与版本治理  
> 最近复核：2026-08-20

LoomRealm仍处于首次实现阶段。治理目标同时满足：

```text
允许在没有真实消费者时修正错误设计
AND
不让 Frozen/Normative 变成可以随意改写的空标签
```

---

## 1. 文档层级

```text
00-overview      产品目标 / 治理
      ↓
10-architecture  authority / responsibility / topology
      ↓
15-contracts     interoperable contracts/profiles
      ↓
20-modules       role/module realization
      ↓
30-implementation packages/tests/delivery
```

下层细化上层，不得反向定义上层。

---

## 2. 主要定义依赖必须是 DAG

Metadata中：`依赖`表示 true definition dependency；`正式化`、`被细化`、`被实现`表示下游关系；横向参考不应形成双事实源。

默认：Overview → Architecture DAG → Contracts → Modules → Implementation。

---

## 3. Document Status

| 状态 | 含义 |
|---|---|
| Normative | 当前实现/设计必须遵守 |
| Active Design | 当前有效但允许演进 |
| Draft | 尚未稳定实现承诺 |
| Reference | 背景/外部资料 |
| Tracking | 实施/开放问题追踪 |
| Superseded | 已被后续决策取代，仅保留历史 |

Normative不自动等于已有外部 compatibility obligation。

---

## 4. Stability vs Compatibility Boundary

Frozen/Stable描述设计预期变化；真实 compatibility boundary表示改变会破坏真实消费者/互操作/持久数据。

```text
Frozen design != automatically shipped compatibility boundary
```

但 Frozen incompatible correction必须走显式治理。

---

## 5. 什么形成真实 Compatibility Boundary

至少一种：conformant implementation shipped/used、多个独立实现互操作、第三方依赖 wire、持久数据需要兼容、public release显式承诺版本。

形成后 incompatible schema/identity/state/order/error/recovery/limit/encoding change → new version或 explicit migration。

---

## 6. First Implementation Rule

真实 compatibility boundary形成前：

```text
design correction
→ update current first-version contract directly
→ do not manufacture unused v1/v2 dual track
→ update all dependent Current docs/tests/navigation
→ preserve provenance in ADR/Git
```

适用于 Normative + Stabilizing/Evolving 文档。

---

## 7. Frozen Preimplementation Correction

Frozen incompatible correction在无真实 compatibility boundary时必须同时满足：Accepted ADR说明根因/无兼容义务、scope明确、current contract直接更新、无 dual model、conformance更新、全部 dependent Current docs同步、导航/ADR历史关系清楚。

ADR 0018对 Frame PWA carrier mapping是该机制实例；Frame correction不因 ADR 0019重新开放。

---

## 8. Current-v1 Direct Reset for Non-Frozen Boundaries

Game Package / Platform launch boundary仍属 preimplementation Stabilizing/Evolving contract。ADR 0019直接把 current Game Package `{key,module}`收口为 `{key}` + platform-specific Launch Manifest。

依据仍是 §6：

```text
no real compatibility obligation
→ fix current v1 directly
→ no v2
→ no deprecated module alias
→ no dual parser
```

这不改变 Frozen Frame v1的治理等级。

---

## 9. Change Propagation

Overview变更：Overview → Architecture → Contracts → Modules → Implementation/Tests/Navigation。

重大 Contract/Profile变更：ADR → current Contract → contract index → Architecture projection → Modules → packages/roadmap/tests → navigation。

不能只改一个文件留下其他 Current source继续旧模型。

---

## 10. Conflict Resolution

优先找该主题的主要定义源：Product scope/governance → topic Architecture → Current Normative Contract/current Accepted ADR → Modules → Implementation。

Superseded ADR/Git history不能覆盖 Current Contract。

---

## 11. ADR Governance

ADR记录 why / changed / superseded/clarified / unchanged / re-evaluation。重大 breaking preimplementation correction必须有 ADR，但 ADR不是第二份协议正文。

---

## 12. Current Reset History

```text
ADR 0018
    Frame transport one-time correction
    Subsystem SDK / Data/Profile preimplementation closure
    direct-current-v1 governance precedent

ADR 0019
    Game Package {key,module} → {key}
    platform-specific launch manifests/profiles
    preflight LaunchPlan boundary
    no v2 / no legacy parser
```

ADR 0019 supersedes ADR 0018 only where 0018曾定义 Game `{key,module}` / same Definition artifact；Frame/Data/SDK结论继续有效。

---

## 13. Superseded Cleanup

新模型接管后：Current入口/交叉引用全部更新；旧完整协议正文不并列为可实现入口；ADR/Git保留历史；Superseded状态显式；导航不能把旧 shape伪装成 current contract。

---

## 14. Current Authoritative Tree

```text
00-overview
→ 10-architecture
→ 15-contracts
→ 20-modules
→ 30-implementation
```

`decisions/`保存 why/provenance。

---

## 15. Final Rules

1. Current first implementation只有一个模型；
2. 无真实 compatibility boundary时不制造虚假版本；
3. Frozen是设计关闭承诺，真实 compatibility boundary产生版本升级义务；
4. Frozen incompatible correction必须显式 ADR + 全树传播；
5. 有真实兼容义务后 incompatible change必须 version/migrate；
6. definition dependency必须 DAG；
7. Superseded history不能覆盖 Current Contract；
8. 下层实现不得反向重写上层 authority。
