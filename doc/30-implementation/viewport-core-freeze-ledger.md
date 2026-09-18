# Viewport Core：Docs Freeze、Agent 执行与资格唯一账本

> 层级：Implementation / freeze ledger；状态：**DOCS FROZEN（负责人批准 2026-09-18）/ IMPLEMENTED / ARCHITECTURE QUALIFIED @ `047f758` / DESKTOP-MAP PRODUCT OUT OF SCOPE**；2026-09-18。  
> [Accepted ADR0036](../decisions/0036-preimplementation-viewport-profile-v1-correction.md)；唯一正式语义：[完整 Profile](../15-contracts/renderer-data-profile-v1.md)、[Viewport](../15-contracts/viewport-state-v1.md)；[完整 Profile revision3 conformance](../15-contracts/renderer-data-profile-conformance-v1.md)、[Viewport conformance](../15-contracts/viewport-state-conformance-v1.md)；[通信架构](../10-architecture/communication-system.md)、[Subsystem 架构](../10-architecture/subsystem-model.md)、[模块落点](../20-modules/viewport-core.md)、[Data 包窄修订单](../../packages/data/VIEWPORT-V1-CORRECTION.md)；[Agent 入口](../../VIEWPORT_CORE_INTERFACE_DESIGN_DRAFT.md)。

## 1. 冻结状态与文档主体

**G0 决策已通过：** 项目负责人 2026-09-18 确认 npm 包无外部依赖，批准首次发布前直接修订 `/1`。不再重查 npm，也不创建 `/2`。旧三-child、新四-child `/1` binaries **不准混连**；实际相连的 Data/Renderer/Subsystem/adapter 同一 build cohort。若出现具体必须互操作的非 npm 旧 peer，停止混版部署并单独处理。

**当前准备好的 immutable docs candidate：`5d74590fcde6d79d815f774cc1c6cffe33fd2952`。** 相对于草案 `ae7b149b9f4e18312dd44762ae943d7a68648acb`，累计包括自包含 Profile/conformance、P3-02/V-04 JSON 分类与 raw-source/wire 区分、恢复无关架构内容、包内修订单、历史全文改为 immutable Git 引用及索引同步。该 SHA **仅为候选**。本账本随后的 metadata-only 提交仅登记 subject，不改变其文档本体。任何进一步语义或导航修改须替换候选 SHA 并重跑 G1；不得以可变分支 HEAD 代替。G1 链接检查通过后，将该 SHA 记为 Docs Freeze subject 并开放 C1–C4 生产实施。

| Gate | 当前事实 | 必需退出条件 |
|---|---|---|
| G0 设计决策 | **ACCEPTED / 2026-09-18** | ADR0036 明确首次发布前同 identity、无 npm gate、cohort、不变边界。 |
| G1 文档材料 | **PREPARED / candidate `5d74590...`** | Profile/Viewport、两 conformance 自包含、一致；历史原文 Git 可溯源，架构/包内/index 不造第二套 current norm。 |
| G1 文档链接自动检查 | **NOT RUN** | 对同一 candidate subject 执行 `npm run docs:check-links`，保留真实命令、exit 和 raw log；现无该 SHA 的 checkout/CI 结果。G1 通过即 Docs Frozen。 |
| C1–C4 architecture implementation | **NOT IMPLEMENTED / NOT RUN** | 最终 executable/cohort SHA 的 revision3、Viewport、旧回归、真实 vertical 有日志与 exit；旧 PASS 不转移。 |
| Desktop / Map product | **OUT OF SCOPE / NOT RUN** | 独立后续验收；不宣称已实现 `play.bat` 真拖窗、地图覆盖、行走性能。 |

```text
Candidate docs subject: 5d74590fcde6d79d815f774cc1c6cffe33fd2952
Relative scope baseline: ae7b149b9f4e18312dd44762ae943d7a68648acb
Documentation link check: NOT RUN (no exit/log)
Docs Freeze subject: NONE / HOLD
Implementation executable SHA / commands / raw logs: NONE / NOT RUN
```

**冻结操作：** 检查 candidate diff docs-only scope → 在该 subject 运行 `npm run docs:check-links` 留证 → 缺陷修正则新 subject、重跑 G1 → G1 通过后将该 SHA 记为 Docs Freeze subject 并开放生产实施。元数据提交不需要等于 candidate subject。新语义改动重新开启 Docs Freeze。

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
| 顺序与 evidence | 本账本；[根 Agent 入口](../../VIEWPORT_CORE_INTERFACE_DESIGN_DRAFT.md)仅导航。 |

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

## 5. Docs Freeze 批准与实施资格（2026-09-18 真实记录）

**冻结主体：** 契约正文 `5d74590fcde6d79d815f774cc1c6cffe33fd2952`，由 metadata-only 重钉提交 `72de3ef` 登记；G2 独立审查确认两者契约字节一致（差异仅账本登记）。冻结批准不使用、也未核实任何其他分支上的旧批准声称（旧 PASS/批准不转移）。

**G1 真实证据：** `npm run docs:check-links` 分别对 `5d74590`、`72de3ef`、`6015076` 三个精确 subject 运行，均 exit 0；输出 `Documentation links OK: 523 relative link(s) across 102 Markdown file(s).`。原始日志：`%TEMP%\opencode\viewport-freeze-evidence\g1-candidate-5d74590.log`、`g1-repin-72de3ef.log`、`g1-head-6015076.log`。

**G2 独立审查：** 审查者为独立 opencode general-purpose subagent（session `ses_f4c2cebe3ffeZFB6AqPLEPfuj6`，非规范撰写者），2026-09-18 17:32 +08:00 对 `5d74590` 完成审查：契约检查 8 项全部 PASS（自包含 Profile/conformance、P3-02/V-04 三分类、publisher 状态机与有界性、lifecycle、Scope 语义、跨文档一致性、真实 vertical 要求）；流程记录 D1（该 SHA 树内账本仍 pin `f938fb7`，重钉在其后 metadata 提交 `72de3ef`）与两处非阻断措辞。报告：`%TEMP%\opencode\viewport-freeze-evidence\g2-independent-review.md`。

**G3 负责人批准：** 项目负责人审阅上述 G1/G2 证据后，于 2026-09-18 在本实施会话（session `ses_f4c475a21ffdzEuyg4KsJzjygk`）明确批准冻结并指示完成任务；该批准以本节落入 Git 账本。批准针对契约主体 `5d74590` / 登记提交 `72de3ef`；本记录不虚构签名，也不代表第三方独立 CI。

**实施与资格（同一最终 executable SHA）：**

```text
IMPLEMENTATION_SHA = 047f758fbbe866b252689eafbd8a9eaf910fe91b
branch = deepseek/resize-viewport
Node v22.12.0 / Windows 10.0.19044
```

| 命令 | 结果 |
|---|---|
| `npm run docs:check-links` | exit 0；523 links / 102 files |
| `npm run test:data` | exit 0；foundation 15 + wire 38 + data 52 全 PASS |
| `npm test -w @loomrealm/subsystem` | exit 0；63/63 PASS |
| `npm test -w @loomrealm/renderer` | exit 0；55/55 PASS |
| `npm run test:m10:qualification` | exit 0；16/16 PASS |
| `npm run test:m11:qualification` | exit 0；10/10 PASS |
| `npm run test:m13:qualification` | exit 0；5/5 PASS |
| `npm run build:desktop-stack` | exit 0 |
| `npm run test:regression` | exit 0；全部 workspace suite fail=0 |
| `npm run test:viewport:revision3` | exit 0；33 tests（P3-01…P3-09）PASS |
| `npm run test:viewport:state` | exit 0；14 tests（V-01…V-13）PASS |
| `npm run test:viewport:vertical` | exit 0；6/6 PASS（P3-09/V-14 真 holder + 真 Data peers + 真 carrier + 真 host，fake source） |
| `npm run test:viewport:qualification` | exit 0；47/47 PASS |

原始日志与退出码：`%TEMP%\opencode\viewport-freeze-evidence\final-047f758\*.log` 与 `SUMMARY.txt`。真实 vertical 覆盖 initial/equal/change/invalid、10,000 burst、背压（阻塞 carrier）、并发 Input/Render、断线重连、generation 与 participant 更换、旧回调和 Runtime terminal；未使用 mock manager 或只断言 emit。

**边界：** fake source 仅代表尚未实现的物理窗口采样；本次 **不** 宣称 Desktop/Map 真实 source、`play.bat` 动态地图覆盖或行走性能已验收（OUT OF SCOPE / NOT RUN）。旧 Input/Render wire、writer capacity、Control/Connection 行为未改变；未引入 `/2`、双解析器、ACK、第二 reader/writer 或无界队列。

Agent STOP：任一规范冲突、不可实现或需要越界，记录文件/最小 fixture/expected/actual，经新的 docs SHA 重跑 G1 后重新冻结；不得以文档修订、旧 CI 或 mock-only 测试替代资格。