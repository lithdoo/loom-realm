# 文档分层与变更规则

> 层级：产品总览  
> 状态：Active / Normative  
> 稳定程度：Stable  
> 主要定义：文档层级、主要定义依赖、设计稳定状态、真实 compatibility boundary、首次实现前 current-v1 收口与版本治理  
> 最近复核：2026-09-11

LoomRealm仍处于 first-implementation阶段。治理目标同时满足：

```text
允许在没有真实 compatibility obligation 时修正错误设计
AND
不让 Frozen / Normative 退化成可以静默改写的标签
```

---

## 1. 文档层级

```text
00-overview
    product / governance
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
    packages/tests/delivery/qualification
```

下层细化上层，不得反向定义上层 authority。

---

## 2. 主要定义依赖必须是 DAG

Metadata语义：

```text
依赖
    本文定义建立在该文档之上

正式化
    下层 Contract formalizes本文

被细化
    下层 Architecture展开本文

被实现
    Module/Implementation realization

相关
    横向参考，不构成主要定义 dependency
```

不得让两个 Current 文档互相依赖而形成双事实源。

---

## 3. Document Status / Stability

| 状态 | 含义 |
|---|---|
| Normative | 当前实现/设计必须遵守 |
| Active Design | 当前有效但仍允许演进 |
| Draft | 尚未形成稳定实现承诺 |
| Reference | 背景/外部格式资料 |
| Tracking | 实施/开放问题追踪 |
| Superseded | 已被后续决策取代，仅保留历史 |

稳定等级：

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

```text
Frozen design
!= automatically shipped compatibility boundary
```

Frozen仍要求显式治理；但真正版本兼容义务取决于是否已形成 real compatibility boundary。

---

## 4. Real Compatibility Boundary

至少出现一种：

```text
conformant implementation shipped/used
multiple independent implementations interoperate
third-party implementation relies on wire
persisted/on-disk/network data requires compatibility
public release explicitly promises protocol version
```

形成后，incompatible schema/identity/state/order/error/recovery/limit/encoding change必须 version 或显式 migration；不能用“文档可修改”规避。

---

## 5. First Implementation Rule

真实 compatibility boundary形成前：

```text
design correction
→ update current first-version model directly
→ no fake v2 / deprecated alias / dual parser
→ update all dependent Current docs/tests/navigation
→ preserve provenance in ADR/Git
```

Frozen preimplementation correction还必须满足下一节。

---

## 6. Frozen Preimplementation Correction

Frozen incompatible correction只有在尚无真实 compatibility obligation时才允许，并必须同时满足：

```text
1. Accepted ADR说明 current model 为什么错误/不闭环
2. ADR声明 correction boundary 尚无真实 compatibility obligation
3. correction scope最小并列出未改变内容
4. current first-version model直接更新，不保留 deprecated dual model
5. 已存在 formal conformance revision 时同步 fixture/evidence
6. 所有 dependent Current docs同步传播
7. navigation/ADR index明确 supersession/update
```

没有 formal fixture revision时，第5项由 current qualification matrix/evidence承担；不为了治理形式预造第二套 protocol。

---

## 7. Non-Frozen Current-v1 Direct Reset

对于 Stabilizing/Evolving 且尚无 compatibility obligation 的 boundary：

```text
incorrect/incomplete current-v1 design
→ Accepted ADR when major
→ update current v1 directly
→ propagate through Current docs/tests
→ no fake compatibility surface
```

ADR0019、ADR0030是该类 first-implementation correction 示例。

---

## 8. Frozen 允许的普通修改

可直接修改：

```text
editorial clarification
correct link/current Profile reference
historical ADR relationship
non-semantic example cleanup
additional conformance evidence for already-defined behavior
```

默认不可静默修改：

```text
method/field legality
identity/lifecycle
commit/causal order
error/recovery
limits
encoding/mapping
version binding
physical owner when that ownership is frozen
```

---

## 9. Change Propagation

Overview change：

```text
Overview
→ Architecture
→ Contracts when observable semantics are affected
→ Modules
→ Implementation/Tests/Navigation
```

Contract/Profile change：

```text
ADR when major
→ current Contract
→ contract index/enclosing Profile
→ Architecture projection
→ Modules
→ package/roadmap/tests
→ navigation
```

Platform launch/host ownership change：

```text
Product/Platform architecture
→ Launcher/RuntimeHosting projection
→ affected Contract/Profile wording
→ Modules
→ package/repository layout
→ milestone plan/testing/qualification
→ navigation/ADR index
```

不能只修改 milestone SSOT 而让其他 Current projection继续旧 owner chain。

---

## 10. Conflict Resolution

优先判断主题的主要定义源，不按“最近 commit”机械覆盖：

```text
Product scope/governance
→ topic Architecture
→ Current Normative Contract
→ Accepted current ADR
→ current milestone SSOT when it owns concrete physical realization
→ Modules
→ Implementation
```

Superseded/historical ADR不得覆盖 current source。

Current executable/runtime chain：

```text
Product/Platform architecture
→ Game Package + Platform Launcher Profiles
→ ADR0019 / ADR0020 / ADR0026 provenance
→ RuntimeHosting
```

Conditional Electron composition fact：

```text
trusted RuntimeHosting composition process is Electron
→ ADR0033 applies to Runner execution mode
```

Canonical M15 Desktop outer composition：

```text
ADR0034
→ Hostra shell owns Electron / BrowserWindow / direct HOSTRA_SUBCMD
→ LoomRealm Desktop plain Node child
→ existing RuntimeHosting owns Runner
```

ADR0033 must not override ADR0034 by reintroducing LoomRealm-owned Electron main into canonical M15。

---

## 11. ADR Governance

ADR记录：

```text
why
what changed
which old decision is superseded/updated/clarified
what remains unchanged
re-evaluation conditions
```

Major breaking/preimplementation correction必须有 ADR。ADR不是协议正文；Current Contract/Architecture/Milestone SSOT仍是实现依据。

被取代 ADR必须明确标记 Superseded 或 partial update；历史推理可以保留，但 current navigation必须展示最新关系。

---

## 12. Current Reset History

当前主要 direct-current-v1 / frozen-preimplementation corrections：

```text
ADR0018
    early Desktop-first Game/Runner + SDK/Data cleanup

ADR0019
    Game Descriptor {key,module} → {key}
    Hostra/PWA independent Launch Manifests
    exact key-set join
    zero-side-effect PlatformLaunchPlan PREPARE
    Main logical launch(key) boundary

ADR0030
    M12 prepared installation view
    @loomrealm/fsdb readonly core
    no mandatory generic content/repository framework
    hierarchical ResourceKey + exact contentVersion

ADR0033
    conditional Electron composition correction
    process.execPath remains Runner executable
    Electron composition synthesizes ELECTRON_RUN_AS_NODE=1
    no configurable Node executable / UtilityProcess second RuntimeHosting

ADR0034
    canonical M15 outer-host correction
    external lithdoo/hostra owns Electron/BrowserWindow/direct child
    LoomRealm Desktop is plain Node HOSTRA_SUBCMD
    Runner remains existing LoomRealm RuntimeHosting child
    Hostra RPC remains host-control only
    M10–M14 logical/business contracts remain unchanged
```

ADR0033 remains valid when its Electron-composition precondition exists；ADR0034 supersedes its use as the canonical M15 product topology。

---

## 13. Superseded Cleanup

新模型接管后：

1. Current入口/交叉引用全部更新；
2. 旧完整实现 shape不得作为 current implementation长期并列；
3. ADR/Git保留真实设计演进；
4. Superseded/partial update必须显式；
5. navigation不得把历史 decision伪装成 current；
6. tests/fixtures不得让 legacy path冒充 current behavior；
7. qualification ledger必须明确 historical evidence 与 current subject。

---

## 14. Current Authoritative Tree

```text
00-overview
10-architecture
15-contracts
20-modules
30-implementation
```

`decisions/`保存 provenance。主架构 DAG目标：

```text
product/governance
→ system overview
→ platform composition
→ runtime hosting
→ stack / communication
→ rendering / storage-content
→ subsystem model
→ contracts
→ modules
→ implementation
```

---

## 15. Final Rules

1. Current first implementation只有一个模型；
2. 无真实 compatibility boundary时不制造虚假版本；
3. Frozen是设计关闭承诺，但 compatibility obligation决定版本迁移义务；
4. Frozen incompatible preimplementation correction必须显式 ADR + evidence + 全树传播；
5. Stabilizing/Evolving major reset也必须保留 provenance 并传播；
6. 有真实 compatibility obligation后 incompatible change必须 version/migrate；
7. 主要定义 dependency必须 DAG；
8. Superseded/history不能覆盖 Current source；
9. 下层实现不得反向重写上层 authority；
10. conditional physical correction不得被误写成不满足其 precondition 的 canonical product topology；
11. live milestone状态只由 designated qualification/delivery sources拥有，不在 index docs维护第二套 ledger。
