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
00-overview
    产品目标 / 治理
        ↓
10-architecture
    authority / responsibility / topology
        ↓
15-contracts
    interoperable application contracts/profiles
        ↓
20-modules
    role/module realization
        ↓
30-implementation
    packages/tests/delivery
```

下层细化上层，不得反向定义上层。

---

## 2. 主要定义依赖必须是 DAG

文档 metadata区分：

```text
依赖
    本文的定义建立在该文档之上

正式化
    下层 Contract formalizes本文

被细化
    下层 Architecture进一步展开本文

被实现
    Module/Implementation realization

相关
    横向参考，不构成主要定义 dependency
```

不得让两个 Current 文档互相写“依赖”从而形成双事实源。

默认大方向：

```text
Overview
→ Architecture DAG
→ Contracts
→ Modules
→ Implementation
```

---

## 3. Document Status

| 状态 | 含义 |
|---|---|
| Normative | 当前实现/设计必须遵守 |
| Active Design | 当前有效但仍允许演进 |
| Draft | 尚未形成稳定实现承诺 |
| Reference | 背景/外部格式资料 |
| Tracking | 实施/开放问题追踪 |
| Superseded | 已被后续决策取代，仅保留历史 |

Normative表示“当前 first implementation 应遵守”，**不自动等于已经存在外部 compatibility obligation**。

---

## 4. Stability vs Compatibility Boundary

这两个概念必须分离。

### Stability

描述设计团队预期变化频率：

```text
Frozen / Stable
    semantic design closed by default

Stabilizing
    core closed; completing limits/conformance/implementation validation

Evolving
    direction clear; fields/process may change

Experimental
    validation stage; large redesign expected
```

### Real compatibility boundary

表示“改变会破坏真实消费者/互操作/持久数据”。只有它直接产生版本迁移义务。

因此：

```text
Frozen design
    != automatically shipped compatibility boundary
```

但 Frozen仍比 Stabilizing更严格：不得无 ADR静默做 incompatible correction。

---

## 5. 什么形成真实 Compatibility Boundary

至少出现一种：

```text
conformant implementation shipped/used
multiple independent implementations interoperate
third-party implementation relies on wire
persisted/on-disk/network data requires compatibility
public release explicitly promises protocol version
```

形成后：

```text
incompatible schema/identity/state/order/error/recovery/limit/encoding change
→ new version OR explicit migration/compatibility mechanism
```

不能用“文档还可以改”绕过。

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

这适用于 Normative + Stabilizing/Evolving 文档。

对于 Frozen 文档，额外要求见下一节。

---

## 7. Frozen Preimplementation Correction

Frozen意味着：

> **默认不再改变 semantic/wire compatibility；任何 incompatible correction必须被显式证明为“首次实现前纠错”，而不是普通编辑。**

在**尚无真实 compatibility boundary**时，Frozen文档仍可进行一次明确的 incompatible correction，但必须同时满足：

```text
1. Accepted ADR明确说明为什么 current v1错误/不闭环
2. ADR明确声明没有真实 compatibility obligation
3. correction scope最小且列出什么没有改变
4. current Contract直接更新，不保留 deprecated dual model
5. Conformance fixtureSetRevision更新/旧 fixture不能冒充 current
6. 所有 dependent Current docs同步传播
7. 导航/ADR明确历史决策已 superseded/updated
```

ADR 0018对 Frame v1 PWA transport mapping的 correction就是该机制的当前实例。

一旦 first conformant implementation baseline形成，Frozen incompatible change回到正常 version/migration规则，不能再次引用 ADR 0018或 ADR 0019作为通用豁免。

---

## 8. Non-Frozen Current-v1 Direct Reset

对于尚未形成真实 compatibility boundary、且稳定等级仍为 Stabilizing/Evolving 的 boundary：

```text
incorrect/incomplete first-implementation design
→ Accepted ADR when major
→ update current v1 directly
→ no fake v2
→ no deprecated alias
→ no dual parser
→ propagate through all Current docs/tests
```

ADR 0019 就是该机制在 Game/Platform launch boundary 上的应用：

```text
Game Package Descriptor {key,module}
→ Game Package Descriptor {key}
+ platform-specific Launch Manifest
+ exact key-set join
+ zero-side-effect preflight LaunchPlan
```

这不会降低 Frozen Frame / Call v1 的治理等级。

---

## 9. Frozen 允许的普通修改

不改变兼容性的：

```text
editorial clarification
correct link/current Profile reference
historical ADR relationship
non-semantic example cleanup
additional conformance fixture verifying already-defined behavior
```

可以直接修改。

默认不允许：

```text
method/field legality
identity/lifecycle
commit/causal order
error/recovery
limits
encoding/mapping
version binding
```

除非满足 §7 preimplementation correction 或正常新版本治理。

---

## 10. Change Propagation

Overview变更：

```text
Overview
→ Architecture
→ Contracts
→ Modules
→ Implementation/Tests/Navigation
```

Contract/Profile变更：

```text
ADR when major
→ current Contract
→ contract index/enclosing Profile
→ Architecture projection
→ Modules
→ package/roadmap/tests
→ navigation
```

Platform launch boundary这类跨层变化还必须同步：

```text
Game Package
→ Platform Launcher Profiles
→ Platform Composition / RuntimeHosting
→ Main/Subsystem module boundaries
→ package/repository layout
→ cross-platform E2E/conformance
```

不能只改一个协议文件留下其他 Current source继续旧模型。

---

## 11. Conflict Resolution

优先判断“这个主题的主要定义源”，而不是简单按最近 commit。

大致：

```text
Product scope/governance
→ topic Architecture
→ Current Normative Contract / Accepted current ADR
→ Modules
→ Implementation
```

`Superseded` ADR/Git history不能覆盖 Current Contract。

如果高层与 Contract冲突，应修正主要定义链，而不是选择对自己方便的一份。

对于 executable launch authority，current chain是：

```text
Product/Platform architecture
→ Game Package + Hostra/PWA Launcher Profiles
→ ADR 0019 provenance
→ Modules/Implementation
```

历史 ADR 0005/0007/0008/0018 中的旧 Game module shape不能覆盖 current Game Package v1。

---

## 12. ADR Governance

ADR记录：

```text
why
what changed
which old decision is superseded/updated/clarified
what remains unchanged
re-evaluation conditions
```

重大 breaking preimplementation correction必须有 ADR。

ADR不是另一个协议正文；Current Contract仍是实现依据。

被取代 ADR应明确标记 `Superseded` 或“某部分由 ADR xxxx更新”。

历史 ADR可以保留当时的完整推理，但必须在 current navigation/metadata 中清楚说明 supersession，不得伪装成 current implementable shape。

---

## 13. Current Reset History

当前项目的 direct-current-v1 closure包括：

```text
ADR 0018
    Desktop-first Game/Runner cleanup
    Subsystem SDK author/host mapping
    Renderer Data/Profile cleanup
    late Data provisioning
    Frame v1 PWA transport one-time correction
    direct-current-v1 governance precedent

ADR 0019
    Game Descriptor {key,module} → {key}
    Hostra/PWA independent Launch Manifests/Profiles
    exact Game↔Platform key-set join
    full zero-side-effect PlatformLaunchPlan preflight
    Main logical launch(key) boundary
    same ABI/semantics, artifact identity not required
```

ADR 0019 supersedes ADR 0018 only where 0018曾定义 Game `{key,module}` / Hostra-PWA same Definition artifact。Frame/Data/SDK/carrier/governance结论继续有效。

规则仍是：

```text
no v2 solely to preserve never-implemented draft
no deprecated alias
no dual parser
one current first implementation model
```

这不是未来破坏 compatibility 的永久许可证。

---

## 14. Superseded Cleanup

新模型接管后：

1. Current入口/交叉引用全部更新；
2. 旧完整协议正文不作为可实现入口长期并列；
3. ADR保留真实设计演进；
4. Superseded状态或 partial supersession必须显式；
5. Git history保留旧全文；
6. 导航不能把已取代协议伪装成 current contract；
7. tests/fixtures不得让 legacy parser/alias冒充 current behavior。

---

## 15. Current Authoritative Tree

```text
00-overview
10-architecture
15-contracts
20-modules
30-implementation
```

`decisions/` 保存 ADR；外部格式资料可放独立 reference tree。

当前主架构 DAG目标：

```text
product/governance
→ system overview
→ platform composition
→ runtime hosting
→ stack / communication
→ rendering
→ subsystem model
→ runtime bootstrap synthesis
→ contracts
→ modules
→ implementation
```

Platform launch boundary在该 DAG 中按：

```text
product/system/platform
→ Game Package + Platform Launcher Profiles
→ RuntimeHosting/Runner module design
→ package/repository/tests
```

向下传播。

---

## 16. Final Rules

1. Current first implementation只有一个模型；
2. 无真实 compatibility boundary时不制造虚假版本；
3. Frozen是设计关闭承诺，但真实 compatibility boundary才直接产生版本升级义务；
4. Frozen incompatible preimplementation correction必须走显式 ADR + conformance revision + 全树传播；
5. Stabilizing/Evolving 的 major direct-v1 reset也必须保留 ADR/provenance并全树传播；
6. 有真实 compatibility obligation后 incompatible change必须 version/migrate；
7. 主要定义 dependency必须 DAG；
8. Superseded history不能覆盖 Current Contract；
9. 下层实现不得反向重写上层 authority；
10. current Game/Platform launch模型不保留 `{key,module}` Game alias、universal launcher schema或 fake v2。
