# Viewport Core：Docs Freeze、Agent 执行与资格唯一账本

> 层级：Implementation / approval ledger；状态：**DOCS FROZEN / PRODUCTION IMPLEMENTATION IN PROGRESS**；2026-09-18。  
> [Accepted ADR0036](../decisions/0036-preimplementation-viewport-profile-v1-correction.md)；唯一正式语义：[完整 Profile](../15-contracts/renderer-data-profile-v1.md)、[Viewport](../15-contracts/viewport-state-v1.md)；[完整 Profile revision3 conformance](../15-contracts/renderer-data-profile-conformance-v1.md)、[Viewport conformance](../15-contracts/viewport-state-conformance-v1.md)；[通信架构](../10-architecture/communication-system.md)、[Subsystem 架构](../10-architecture/subsystem-model.md)、[模块落点](../20-modules/viewport-core.md)、[Data 包窄修订单](../../packages/data/VIEWPORT-V1-CORRECTION.md)；[Agent 入口](../../VIEWPORT_CORE_INTERFACE_DESIGN_DRAFT.md)。

## 1. 冻结状态与可追溯主体

**G0 决策已通过：** 项目负责人 2026-09-18 确认 npm 包无外部依赖，批准首次发布前直接修订 `/1`。不再重查 npm，也不创建 `/2`。旧三-child、新四-child `/1` binaries **不准混连**；实际相连的 Data/Renderer/Subsystem/adapter 同一 build cohort。若出现具体必须互操作的非 npm 旧 peer，停止混版部署并单独处理。

**Approved Docs Freeze subject：`5d74590fcde6d79d815f774cc1c6cffe33fd2952`。** 相对于草案 `ae7b149b9f4e18312dd44762ae943d7a68648acb`，累计包括自包含 Profile/conformance、P3-02/V-04 JSON 分类与 raw-source/wire 区分、恢复无关架构内容、包内修订单、历史全文改为 immutable Git 引用及索引同步。任何进一步语义或导航修改须替换 subject SHA 并重新审查；不得以可变分支 HEAD 代替。

| Gate | 当前事实 | 必需退出条件 |
|---|---|---|
| G0 设计决策 | **ACCEPTED / 2026-09-18** | ADR0036 明确首次发布前同 identity、无 npm gate、cohort、不变边界。 |
| G1 文档材料 | **PASS / subject `5d74590...`** | Profile/Viewport、两 conformance 自包含、一致；历史原文 Git 可溯源，架构/包内/index 不造第二套 current norm。 |
| G1 文档链接自动检查 | **PASS / exit 0** | `npm run docs:check-links` → `Documentation links OK: 523 relative link(s) across 102 Markdown file(s).`；raw log：`.viewport-freeze-evidence/g1-docs-check-links.log`。 |
| G2 独立技术复核 | **APPROVE / 2026-09-18** | Independent Agent (`generalPurpose` subagent `8bd3570b-ed89-4059-9b84-7aa576d03a3b`) 审 exact SHA `5d74590…`；checklist 1–5、7 PASS；item 6 CONCERN（账本当时仍写 NOT RUN，现已用真实 log 对账）；overall APPROVE；明确非 G3。 |
| G3 Owner Docs Freeze | **APPROVED / 2026-09-18** | 项目负责人在实施会话中明确批准 exact SHA `5d74590fcde6d79d815f774cc1c6cffe33fd2952`（原文「批准，继续完成所有任务」）；本账本登记可追溯。 |
| C1–C4 architecture implementation | **IN PROGRESS** | 最终 executable/cohort SHA 的 revision3、Viewport、旧回归、真实 vertical 有日志与 exit；旧 PASS 不转移。 |
| Desktop / Map product | **OUT OF SCOPE / NOT RUN** | 独立后续验收；不宣称已实现 `play.bat` 真拖窗、地图覆盖、行走性能。 |

```text
Candidate docs subject: 5d74590fcde6d79d815f774cc1c6cffe33fd2952
Relative scope baseline: ae7b149b9f4e18312dd44762ae943d7a68648acb
Documentation link check: PASS exit 0 (.viewport-freeze-evidence/g1-docs-check-links.log)
Independent reviewer: Independent Agent (generalPurpose 8bd3570b-ed89-4059-9b84-7aa576d03a3b)
Reviewed exact SHA / date / conclusion: 5d74590… / 2026-09-18 / APPROVE (tech only)
Owner formal freeze approval / exact SHA / date: APPROVED / 5d74590… / 2026-09-18
Approved Docs Freeze subject: 5d74590fcde6d79d815f774cc1c6cffe33fd2952
Implementation executable SHA / commands / raw logs: PENDING (in progress on cursor/resize-viewport)
```

**冻结操作：** 检查 candidate diff docs-only scope → 在该 subject 运行 `npm run docs:check-links` 留证 → 独立 reviewer 审同一 SHA → 缺陷修正则新 subject、新审查 → owner 在 Git 中批准精确 immutable SHA → 后续只在本账本补写真实批准事实/链接。元数据提交不需要等于受批准 subject，但绝不可虚构 reviewer/批准。新语义改动重新开启 Docs Freeze。

**分支合并提醒：** `dev/resize-viewport` 曾恢复旧 baseline；本轮只核对相对 `ae7b149...` 的 docs-only 变化。如合并当前 `main`，须独立检查历史文档、ADR 编号和恢复造成的额外差异；本冻结不授权无关回退。

## 2. 唯一规范与历史保全

| 领域 | 规范及责任 |
|---|---|
| 四 child identity、directions、preflight、single reader/writer、Data terminal、fresh | [自包含 Profile](../15-contracts/renderer-data-profile-v1.md)；不向旧正文借 MUST。 |
| Raw/wire/schema/source、A→B→A publisher、retained API、participant/currentness | [Viewport child](../15-contracts/viewport-state-v1.md)，唯一算法/接口定义。 |
| Revision3 全组合 + revision2 义务及旧 Input/Render/Connection | [自包含 revision3 conformance](../15-contracts/renderer-data-profile-conformance-v1.md)；原 [revision2 Git 历史](../15-contracts/renderer-data-profile-conformance-v1-previewport-baseline.md)仅溯源。 |
| 旧三 child Profile 原文 | [immutable Git 历史](../15-contracts/renderer-data-profile-v1-previewport-baseline.md)，非现行规范。 |
| V-01…V-14、真实 architecture vertical | [Viewport conformance](../15-contracts/viewport-state-conformance-v1.md)。 |
| 旧三包代码与新 target 差异 | [Data package 修订单](../../packages/data/VIEWPORT-V1-CORRECTION.md)、[module placement](../20-modules/viewport-core.md)。`packages/data/DESIGN.md` 旧 API 表仅描述 M8 改造前代码，不是四-child 目标。 |
| 决策与兼容边界 | [ADR0036](../decisions/0036-preimplementation-viewport-profile-v1-correction.md)。 |
| 顺序、签署与 evidence | 本账本；[根 Agent 入口](../../VIEWPORT_CORE_INTERFACE_DESIGN_DRAFT.md)仅导航。 |

规范冲突按 topic owner：Profile 管组合，Viewport 管尺寸，conformance 仅变断言；既有 Input/Render/Control/Connection 不因较新日期/草案/旧 package DESIGN 被静默覆盖。Invalid raw JSON → `profile`；valid JSON 中 recognized `viewport.state` 的 schema/direction → `viewport`；trusted invalid local send → `local-fatal`；source object 的 inherited/getter 不能伪装成 JSON wire fixture。

## 3. Agent 阶段与生产 allowlist

| 阶段 | Production allowlist | 必须退出的证据 |
|---|---|---|
| C1 Data | `packages/data/src/model.ts`、`src/index.ts`、新 `src/viewport-codec.ts`、`src/profile-codec.ts`、`src/peers.ts`、`src/runtime.ts`；包内 test | P3-01…08、V-04…07；旧 Data/Input/Render 回归；shared writer capacity 不变。 |
| C2 Renderer | `packages/renderer/src/control.ts`、`src/index.ts`、新 `src/viewport.ts`、必要包内 helper/test | V-01…03、V-08；source bootstrap/current/fence；Input/Render 顺序不退化。 |
| C3 Subsystem | `packages/subsystem/src/model.ts`、`src/index.ts`、`src/host/run-subsystem.ts`、新 `src/internal/viewport-manager.ts`、包内 tests | V-09…13；current peer gate、Runtime terminal、Frame/InputTarget independence。 |
| C4 Real vertical | 三包 tests 与已有根 `test/**` 增量 | P3-09、V-14；**真 holder + 真 Data peers + 真 Subsystem host**；同一最终 executable SHA 回归。 |

硬禁止：`game-libs/map/**`、`apps/desktop/**`、PWA、示例 CSS、`play.bat`、Main、PlatformPorts、Foundation、Wire、RendererControl、RuntimeControl、M13 Projector/Store、旧 Input/Render wire。若须越界、改 handshake/ACK/Profile `/2`、第二 reader/writer、无界队列或 schema metadata，立即 **STOP**，独立设计变更而非自行推断。

## 4. 运行命令及可信证据

根 `package.json` 已有：`npm run test:data`、`npm test -w @loomrealm/subsystem`、`npm test -w @loomrealm/renderer`、`npm run test:m10:qualification`、`npm run test:m11:qualification`、`npm run test:m13:qualification`、`npm run build:desktop-stack`、`npm run test:regression`、`npm run docs:check-links`。实施者新增明确 revision3/Viewport runner，记录真正入口名称，不猜测旧 runner 自动覆盖新增 child。

全部结论基于同一最终 executable/cohort SHA，记录命令、exit、Node/OS、fixture/source SHA、raw stdout/stderr、branch diff；代码变化后重跑受影响 suite。Fake source vertical 仅证明架构，不证明 Desktop/Map 真实窗口功能。

## 5. G2 reviewer checklist（每项需证据）

- [ ] 两份正式 Profile/conformance 现为自包含完整正文，保留旧 §1–14 / revision2 不变可观测义务，旧 Git 历史不是第二规范；逐条核 wire、direction、preflight、terminal family。
- [ ] P3-02/V-04 区分 invalid JSON `profile`、recognized valid viewport invalid `viewport`、trusted local invalid `local-fatal`；inherited/getter 不伪装 JSON wire。
- [ ] `publishState:void` 非 ACK；A→B→A、already-admitted B、terminal、writer indefinitely blocked 有 fixture。
- [ ] participant start→source synchronous stage→current peer baseline→peer retire/reconnect→participant replacement 无漏；old callback/Promise/消息不污染新身份。
- [ ] Scope 同步 initial/getter-before-callback、reentrancy、listener reject containment、post-terminal inert 对应 V-09…13。
- [ ] 通信/Subsystem/正式契约/ADR index、Data 包修订单、Agent 入口不与旧 three-child current 断言冲突；docs link raw log/exit 可见。
- [ ] P3-09/V-14 真实组件链有 currentness/backpressure/terminal 证据，不能用 mock-only/历史 PASS/无 Map/Desktop diff 宣称 Product Closed。

Agent STOP：任一规范冲突、不可实现或需要越界，记录文件/最小 fixture/expected/actual，经新的受审 docs SHA 重新冻结；不得以文档修订、旧 CI、虚构 reviewer 或 mock-only 测试替代资格。