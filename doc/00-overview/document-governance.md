# 文档分层与变更规则

> 层级：产品总览 / Normative · 稳定程度：Stable  
> 主要定义：主要定义依赖、状态、真实compatibility boundary、首次版本与Frozen preimplementation correction、变更传播和唯一evidence owner  
> 最近复核：2026-09-16（记录ADR0037 direct Profile v1 correction）

LoomRealm仍处首次实现阶段；治理目标是**真实兼容义务尚未存在时允许纠正错误设计，同时不把 Frozen/Normative降级为可静默重写的标签**。产品未正式发布仅是兼容核查输入之一，不自动证明没有npm/private/downstream消费者。

## 1. Document layers

```text
00-overview     product / governance
10-architecture roles / authority / responsibility / topology
15-contracts    cross-role interoperable contracts/profiles
20-modules      module/role realization
30-implementation packages / tests / delivery / qualification
```

下层细化上层，不能以实现反向定义authority。`decisions/`记录provenance，不是第二份formal wire SSOT。

## 2. Primary-definition dependencies must form DAG

Metadata：依赖=本文建立其上；正式化=下层Contract formalizes；被细化=下层Architecture展开；被实现=Module/Implementation；相关=横向reference而非主要定义dependency。两个Current文件不得互相拥有同一事实并形成循环。

## 3. Document status / maturity

| 状态 | 含义 |
|---|---|
| Normative | 当前设计/实现必须遵守的规范（候选应明确Not Frozen/Not Implemented） |
| Active Design | 当前有效但仍可演进 |
| Draft | 尚无稳定实现承诺 |
| Reference | 背景/外部格式 |
| Tracking | 实施/未闭合项 |
| Superseded | 被后续明确决策替代，仅历史 |

稳定度：Frozen/Stable=语义默认关闭；Stabilizing=核心已收、限额/验证中；Evolving=方向清楚可变化；Experimental=验证阶段。**Frozen design != automatically shipped compatibility boundary。Docs Frozen != executable implemented != qualified。** 各事实归各自SSOT/ledger，不得用历史PASS填新subject。

## 4. Real compatibility boundary

任何一项可形成真实兼容义务：

```text
conformant implementation shipped/used
multiple independent interoperating implementations
third-party implementation relies on wire
persisted/on-disk/network data requires compatibility
public release explicitly promises protocol identity/version
```

发布核查不能只查GitHub Releases，还须在相关变更中检查npm/pre-release tarballs、私有分发、下游/分支、持久化资料及运行中多版本共存/rollback。形成义务后 incompatible schema/identity/state/order/error/recovery/limit/encoding变化须explicit version或migration；不能以“文档没发版”规避。

## 5. First-implementation rule

尚无真实兼容义务时：

```text
incorrect/incomplete first-version design
→ correct current first-version model directly
→ no fake v2 / deprecated aliases / dual parser
→ update all current dependent docs/tests/navigation
→ retain provenance in ADR/Git
```

若曾Frozen，还必须满足§6；仅用户声明不发布v2不能自动代替兼容证据或Freeze签署。

## 6. Frozen preimplementation correction gate

任何Frozen incompatible correction仅在尚无真实compatibility obligation且同时满足时可实施：

1. Accepted ADR解释旧model为什么错误/不足、consumer gap与为何 direct correction。
2. 明确compatibility核查责任、范围、证据与结论；若有真实义务立即STOP并重评 version/migration。
3. Scope最小，列出未改变contracts/authority和业务/平台boundary。
4. 当前first-version model直接更新；旧implementation shape不得继续作为current，禁止假v2/deprecated dual mode。
5. Formal conformance及fixtures/evidence revision同步；未有formal fixture时以current qualification matrix承接；旧PASS不可迁移。
6. 所有dependent Current docs/modules/implementation/tests/navigation状态与链接同步传播。
7. ADR index与historical docs明确partial supersession；Docs Freeze记录docs-only subject SHA，implementation/qualification另立 executable SHA。

[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)是当前此类修正：原已Frozen的`renderer-data/1`三child计划直接更新为四child（增加独立Viewport State v1），旧`/2` proposal取消。其**外部compatibility核查仍PENDING**；当前authoritative maturity以 [revised-v1 ledger](../30-implementation/viewport-profile-v1-qualification.md) 为准，不能把ADR Accepted当Docs Frozen/Implemented。

## 7. Non-Frozen current-v1 direct reset

对于Stabilizing/Evolving且无真实compatibility obligation的incorrect current-v1：major修改需Accepted ADR，然后直接更新v1及Current docs/tests，不创造兼容表面；ADR0019/ADR0030为先例。

## 8. Ordinary changes to Frozen

无需协议reopen的修改：editorial clarification、correct link/current profile reference、historical ADR关系、non-semantic example cleanup、已定义行为的额外conformance evidence。默认不能静默修改method/field legality、identity/lifecycle、commit/causal order、error/recovery、limits、encoding/mapping、version binding、已Frozen physical owner。

## 9. Change propagation

```text
Overview change → Architecture → affected Contract → Module → Implementation/Tests/Navigation
Contract/Profile change → ADR when major → current Contract → contract index/Profile
                        → Architecture → Modules → packages/roadmap/tests → navigation
Platform ownership change → Product/Platform architecture → Launcher/RuntimeHosting
                          → affected Contract wording → Modules → plan/tests/ADR index
```

不能只改milestone SSOT，却让别的Current projection保持旧owner chain；业务consumer规则不得为了传播便捷反向上升为Core MUST。真正physical source/rollout属于product composition；formal wire只放跨角色不可缺少的observable事实。

## 10. Conflict resolution

首先找主题的主要定义源而非机械以最新commit覆盖：Product scope/governance→topic Architecture→Current Normative Contract→current Accepted ADR→current milestone physical SSOT（仅其具体实现）→Modules→Implementation。Superseded/historical ADR不得覆盖current。

Current runtime chain：Product/Platform architecture→Game Package+Launcher Profiles→ADR0019/0020/0026→RuntimeHosting。Conditional Electron事实：只有trusted RuntimeHosting composition process本身为Electron时ADR0033适用；canonical M15由ADR0034覆盖其作为主拓扑的假设：Hostra shell owns Electron/BrowserWindow/direct HOSTRA_SUBCMD，LoomRealm Desktop plain Node child，RuntimeHosting owns Runner。

## 11. ADR governance

ADR写 why、what changed、superseded/updated/clarified对象、unchanged范围与re-evaluation条件；Major breaking/preimplementation correction必须有ADR。ADR不是wire正文。被替代者明确Superseded或partially updated，historical reasoning可保留但current navigation必须展示最新关系。

## 12. Current reset history

```text
ADR0018: Desktop-first Game/Runner + SDK/Data initial cleanup
ADR0019: Game Descriptor {key,module}→{key}, Hostra/PWA separate manifests,
         exact join/zero-side-effect PREPARE/Main logical launch(key)
ADR0030: M12 prepared installation, readonly FSDB, no generic repository framework,
         hierarchical ResourceKey + exact contentVersion
ADR0033: conditional Electron Runner execPath + ELECTRON_RUN_AS_NODE
ADR0034: canonical M15 external Hostra Electron/BrowserWindow/HOSTRA_SUBCMD;
         LoomRealm Desktop plain Node, Runner RuntimeHosting child
ADR0037: explicit frozen-preimplementation Profile /1 correction:
         Connection1+Input1+Render1+Viewport1, no release of /2;
         uniform rollout & Window physical source stay product-owned;
         map gameplay/performance stay game-library-owned;
         external-compatibility evidence + new qualification required
```

ADR0033仍在自身Electron precondition成立时有效；ADR0034只supersede其作为canonical M15 product topology的使用。ADR0036关于Viewport不是Input的事实保留，其“必须Profile `/2`”decision由ADR0037 supersede。

## 13. Superseded cleanup

新模型接管时：Current入口/交叉引用全部更新；旧实现shape不可与新current长期并列；ADR/Git保存真实演进；partial updates显式；navigation不伪装history为current；tests/fixtures不能让legacy path冒充；qualification ledger分离historical和current subject。

## 14. Authoritative tree

```text
00-overview → 10-architecture → 15-contracts → 20-modules → 30-implementation
```

`decisions/`保存原因，topic主定义依赖构成DAG：product/governance→system overview→platform composition→runtime hosting→stack/communication→rendering/storage-content→subsystem model→contracts→modules→implementation。

## 15. Final rules

当前首次版本仅有一个模型；无真实兼容边界不造fake version；Frozen需显式治理但compatibility obligation决定版本迁移；Frozen preimplementation必须ADR+compat evidence+全树传播；Evolving major reset也留provenance；有真实义务后incompatible change必须version/migrate；依赖必须DAG；Superseded不能覆盖Current；implementation不反向重写authority；conditional physical不能伪装canonical；live milestone只由designated ledgers拥有。