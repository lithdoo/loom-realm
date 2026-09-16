# Viewport State v1 / Revised Renderer Data Profile v1 Qualification Ledger

> 层级：Implementation / Qualification Ledger（唯一 live status）  
> 状态：**Preimplementation / Docs Closure In Progress / Not Frozen**  
> 日期：2026-09-16；Decision：[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)  
> Contracts：[Viewport v1](../15-contracts/viewport-state-v1.md) · [Revised Profile v1](../15-contracts/renderer-data-profile-v1.md)  
> Conformance：[Viewport](../15-contracts/viewport-state-conformance-v1.md) · [Profile v1 revision 3](../15-contracts/renderer-data-profile-conformance-v1.md)  
> Reviews：[Core historical](./viewport-core-docs-freeze-review-2026-09-16.md) · [Business boundary](./viewport-business-boundary-review-2026-09-16.md)

**Docs Frozen ≠ implemented ≠ qualified/closed。** `/2`被ADR0037取消，[old v2 ledger](./viewport-profile-v2-qualification.md)为历史指针，不得形成第二状态源。旧三child`/1` executable PASS不可转给新四child`/1`。

## 1. Current snapshot

```text
ADR0037 direction                Accepted, external compatibility evidence pending
Revised Profile /1 + Viewport v1 Draft normative candidates / Docs Freeze HOLD
Profile /2                       Superseded / never implemented or released
Old three-child /1 code         Historical executable still in current source
Main/Renderer/Subsystem/Desktop  revised four-child not implemented
Profile v1 fixtureSetRevision    3 spec only / not executed
Compatibility assessment         NOT VERIFIED
Product build-cohort proof       NOT VERIFIED
Docs Freeze subject SHA          PENDING
Executable subject / tests       PENDING / NOT RUN
```

## 2. Frozen-preimplementation external compatibility assessment

发布负责人逐项归档证据、owner/date/signoff，不因产品尚未正式发布或Repo Releases为空自动推断没人依赖：

- [ ] GitHub Releases与任何公开协议/版本承诺（Repo Releases无条目只覆盖此渠道）；
- [ ] npm alpha/pre-release tarball、私有分发及其他下游消费者；
- [ ] 独立互操作实现、下游仓库/forks；
- [ ] persisted profile identity、运行中旧peer、rollback/rolling upgrade/多版本共存需求；
- [ ] 明确无真实旧三child `/1`兼容义务，负责人签署结论。

```text
Compatibility owner/evidence: PENDING
Compatibility conclusion: NOT VERIFIED
```

**发现任何真实外部/混版义务→STOP direct v1 reset，重新评审显式profile version/migration。** 不得用未发GitHub Release或双方都声称 `/1`作兼容证明。

## 3. Docs Freeze gate（不需实现前PASS）

- [ ] ADR0037/历史ADR0025/0036 partial supersession、索引与旧`/2`历史状态一致；No dual parser/alias。
- [ ] Revised `/1` four-child exact direction/shape/preflight/diagnostic，single reader/writer、Control/Connection current authority不冲突；原Input/Render/Control/Connection wire不改。
- [ ] Viewport single designated CSS logical surface、floor/invalid size转换、bounded latest、source/carrier fencing、retained/fresh/terminal matrix一致。
- [ ] `scope.viewport`同步首发含null、getter更新先于callback、异常隔离/退订/终态可测试。
- [ ] Core不硬编码Window DOM、不包含map尺寸cap/camera/settle/chunks/menu policy；产品统一rollout归此ledger。
- [ ] Revised Profile v1 conformance fixtureSetRevision3 + Viewport child conformance executable-ready，旧revision2 PASS不继承。
- [ ] §2兼容性证据签署，§4 coherent deploy方式可行且不存在必须混版需求。
- [ ] 完成cross-contract/link/status review，记录docs-only SHA、reviewer/date。

```text
Docs Freeze subject SHA: PENDING
Review decision/date: PENDING
```

## 4. Product rollout and physical composition（不是通用协议）

本产品计划对全部**本次实际部署的** current DataAuthorities选择同一个修正后`loomrealm.renderer-data/1`，Main仍独占profile identity，Broker只按`(Session,Renderer,S,G,P)` exact match。但**P是逻辑profile，不含build fingerprint：旧三child与新四child都叫`/1`，wire无法自动鉴别或拒绝混版；没有handshake/feature bits。** 部署必须在连接前用受治理的同一个coherent release/build cohort，协调Main、Data peer、Renderer、Subsystem、Desktop/相应PWA，归档全部artifact provenance、subject SHA与测试路径。若必须rolling update、运行旧/新peer共存或独立第三方实现，则此direct reset不适用，转§2 STOP。旧peer收到viewport可能Data-fatal，那是错误部署，不是自动迁移成功；不得谎称Broker会根据P拒绝旧binary。

```text
Release cohort manifest + SHA: PENDING
Main/Data/Renderer/Subsystem/adapter artifacts: PENDING
No mixed-version deployment proof: PENDING
Rollout owner: PENDING
```

当前Desktop/PWA Web product指定document layout viewport，用`Window.innerWidth/innerHeight` floor CSS logical px观察；必须测试actual map content box、center/letterbox与source对应，hidden→visible/fresh source fencing。该DOM采样是本次物理composition实现，不进入通用Viewport wire；其他物理source必须明确同一single surface identity且有真实consumer证据。

## 5. Implementation/qualification（Docs Freeze后）

```text
Executable subject SHA: PENDING
```

最小实施：`@loomrealm/data`唯一`/1` codec/peers/dispatch/`protocol:"viewport"`/bounded sender、Renderer physical source、Subsystem retained author API、Main product `/1`组合、Desktop source/PWA对应平台。绝不创建`/2`、dual parser、Environment manager、map-special Core path或修改Frozen Input/Render/Connection/Control wire。

新executable SHA提供完整cohort artifact inventory、Node20/24（适用时）、Chromium/Hostra环境、commands/raw logs：revised `/1` fixture revision3 + Viewport conformance +原Connection/Input/Render regression，Main/Broker logical tuple与cohort composition，blocked writer burst/fresh source/carrier，M13/M14/M15受影响回归；PWA按后续平台里程碑验证。Map PR0 dense1080 payload/Core full-state validation/Browser raster/latency是独立Map证据，不得转写Core PASS。

## 6. Evidence table

| Gate | Subject | Result |
|---|---|---|
| External compatibility | PENDING | NOT VERIFIED |
| Coherent deployment cohort | PENDING | NOT VERIFIED |
| Core Docs Freeze | PENDING | HOLD |
| revised `/1` + Viewport + old regression | PENDING | NOT RUN |
| Desktop/Hostra + M13/M14/M15 | PENDING | NOT RUN |
| PWA source equivalence | PENDING | NOT RUN |
| Map PR0 / Map Freeze | separate Map subject | HOLD |

任何schema/currentness/source/diagnostic变化需new docs subject；executable变更需new executable SHA与affected rerun。