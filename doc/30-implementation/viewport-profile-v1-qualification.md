# Viewport State v1 / Revised Renderer Data Profile v1 Qualification Ledger

> 层级：Implementation / Qualification Ledger（唯一 live status）  
> 状态：**Preimplementation / Direct-v1 Docs Closure In Progress / Not Frozen**  
> 日期：2026-09-16；Decision：[ADR0037](../decisions/0037-direct-profile-v1-preimplementation-viewport-correction.md)  
> Contracts：[Viewport v1](../15-contracts/viewport-state-v1.md) · [Revised Profile v1](../15-contracts/renderer-data-profile-v1.md)  
> Conformance：[Viewport](../15-contracts/viewport-state-conformance-v1.md) · [Profile v1 revision 3](../15-contracts/renderer-data-profile-conformance-v1.md)  
> Historical review：[Core Freeze Review](./viewport-core-docs-freeze-review-2026-09-16.md) · [Business-boundary Review](./viewport-business-boundary-review-2026-09-16.md)

**Docs Frozen ≠ implemented ≠ qualified/closed。** `/2` 已被 ADR0037撤销，原 [v2 ledger](./viewport-profile-v2-qualification.md) 仅为历史转发，禁止成为第二状态源。旧三 child `/1` executable PASS不是此四 child `/1` 的 PASS。

## 1. Live snapshot

```text
ADR0037 direct-v1 correction          Accepted (compatibility evidence pending)
Revised Profile /1 + Viewport v1       Draft normative candidates / Docs Freeze HOLD
Profile v1 fixtureSetRevision          3 (spec updated, executable not run)
Profile /2                             Superseded / never implemented or released
Main /1 product composition            old 3-child code exists; revised 4-child not implemented
Desktop designated physical source     revised capability not implemented
PWA equivalent source                  not implemented
Docs Freeze subject                    PENDING
Executable qualification subject      PENDING
Local/hosted/product revised tests     NOT RUN
```

## 2. Frozen-preimplementation compatibility assessment — mandatory signoff

负责发布者逐项记录 artifacts/conclusion，不从“尚未发布产品”推定外部零使用：

- [ ] Releases/公开 protocol promises核对，链接/日期归档（Repo releases当前无条目，仅覆盖该渠道）；
- [ ] npm registry/pre-release tarballs、内部/私有分发、外部安装者及其他下载渠道核对；
- [ ] Independent implementations、downstream repositories/forks、API consumers核对；
- [ ] Persistent/on-disk/network data和跨部署版本共存/rollback要求核对；
- [ ] 每一项明确 no real compatibility obligation，签字/日期/证据。若任一真实义务存在，STOP direct-v1 reset，重新开 explicit version/migration ADR。

```text
Compatibility owner/evidence: PENDING
Compatibility conclusion: NOT VERIFIED
```

## 3. Core Docs Freeze Gate（不要求实现前 executable PASS）

- [ ] ADR0037与历史ADR0025/0036的 partial supersession一致，Current入口只指向唯一修正 `/1`；旧 `/2` 仅 history，no fake alias/dual reader；
- [ ] Profile v1 four-child exact schema/direction/preflight/diagnostic、single reader/writer、Connection authority不与 Frozen Control/Connection/Input/Render冲突；
- [ ] Viewport单一由 physical composition designated 的CSS logical surface、exact three fields、bounded latest、fresh carrier/source fencing、last observation retained/terminal transitions完整；
- [ ] Core不硬编码 Window DOM API或 map min/max/camera/100ms/chunks、menu gameplay政策；
- [ ] Viewport author `scope.viewport` synchronous subscription、exception isolation、unsubscribe/terminal完整；
- [ ] Profile v1 conformance revision3 + Viewport v1 conformance executable-ready，原 v1 revision2 historical PASS不得沿用；
- [ ] 产品 rollout（当前所有 current authorities统一 `/1`）仅写在本 ledger/产品 integration plan；不写为跨 consumer formal Profile MUST；
- [ ] Cross-document contradiction/link/status audit和**本 ledger §2 compatibility evidence**已签署；文档 Freeze subject SHA/reviewer/date归档。

```text
Docs Freeze SHA: PENDING
Reviewer/date/decision: PENDING
```

## 4. Current product implementation policy（非通用协议）

本次 canonical product build对所有**实际部署的** current Renderer⇄Subsystem DataAuthorities统一选择**修正后的** `loomrealm.renderer-data/1`，并原子协调 Main、Data peer、Renderer、Subsystem、Desktop/PWA产品端点，不以 subsystemKey/map presence动态选择或 runtime downgrade。此为**产品配置与发布策略**，Main owns authority、Broker按 exact `(S,G,P)`配对。候选 peer不匹配则 absent，不允许旧三 child `/1` 与修正四 child `/1` 在同一生产部署混跑；不要为了实现迁移建 `/2`、feature bits或dual parsers。

物理 composition：当前 Desktop/PWA单 Renderer participant指定 document layout viewport，Web source使用 Window `innerWidth/innerHeight`（floor CSS px）；验收必须证明真实 presentation content-box与当前例子居中/letterbox政策相容。此决定不进入通用 Viewport wire；其他产品若指定不同单一 logical surface须审查身份与分配一致性。

## 5. New executable subject / qualification after Docs Freeze

```text
Executable subject SHA: PENDING
```

在新 SHA 上实施 `@loomrealm/data`修正 `/1` peers/codec/dispatcher/child-local bounded sender、`@loomrealm/subsystem` retained `scope.viewport`、Renderer source integration、Main product policy、Desktop source与相应 PWA。无需改 Frozen Control/Connection wire、Input/Render子消息、common limits或 generic framework。

归档 actual commands、Node20/24（按仓库要求）、Desktop/Chromium/Hostra环境、raw logs/artifacts：revised `/1` revision3、Viewport child、历史 Connection/Input/Render regression、Main/Broker currentness/old executable mixing rejection、blocked writer burst/fresh carrier/source、M13 regression、M14 actual map consumer、M15 Hostra product；PWA后续 milestone另外证明。所有适用证据同 executable subject PASS才标 Qualified。Map PR0 1080p payload/full-state validation/Browser raster/latency由 map自己的 gate决策，不能转写为 Core PASS。

## 6. Evidence matrix

| Gate | Subject | Result |
|---|---|---|
| compatibility assessment | PENDING | NOT VERIFIED |
| Core Docs Freeze | PENDING | HOLD |
| revised `/1` + child/old-regression | PENDING | NOT RUN |
| Desktop/Hostra | PENDING | NOT RUN |
| M13/M14/M15 affected regression | PENDING | NOT RUN |
| PWA equivalent physical source | PENDING | NOT RUN |
| Map PR0 / Map Docs Freeze | separate map subject | HOLD |

修改 schema/currentness、surface identity、publication、diagnostic或 selection需新 docs subject；改变 executable建立新 SHA并重跑对应 evidence。