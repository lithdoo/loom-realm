# Viewport Core：Docs Freeze、Agent 执行与资格唯一账本

> 层级：Implementation / approval ledger；状态：**DOCS CANDIDATE PREPARED / FORMAL FREEZE HOLD / PRODUCTION NOT IMPLEMENTED / TESTS NOT RUN**；2026-09-18。  
> [Accepted ADR0036](../decisions/0036-preimplementation-viewport-profile-v1-correction.md)；唯一正式语义：[完整 Profile](../15-contracts/renderer-data-profile-v1.md)、[Viewport](../15-contracts/viewport-state-v1.md)；[完整 Profile revision3 conformance](../15-contracts/renderer-data-profile-conformance-v1.md)、[Viewport conformance](../15-contracts/viewport-state-conformance-v1.md)；[通信架构](../10-architecture/communication-system.md)、[Subsystem 架构](../10-architecture/subsystem-model.md)、[模块落点](../20-modules/viewport-core.md)、[Data 包窄修订单](../../packages/data/VIEWPORT-V1-CORRECTION.md)；[Agent 入口](../../VIEWPORT_CORE_INTERFACE_DESIGN_DRAFT.md)。

## 1. 冻结状态与可追溯主体

**G0 决策已通过：** 项目负责人 2026-09-18 确认 npm 包无外部依赖，批准首次发布前直接修订 `/1`。不再重查 npm，也不创建 `/2`。旧三-child、新四-child `/1` binaries **不准混连**；实际相连的 Data/Renderer/Subsystem/adapter 同一 build cohort。若出现具体必须互操作的非 npm 旧 peer，停止混版部署并单独处理。

**当前准备好的 immutable docs candidate：`f938fb7d15f6d101ea43bf6e155deb3f16e43661`。** 该 SHA 相对于最初草案 `ae7b149b9f4e18312dd44762ae943d7a68648acb`，累计包括自包含 Profile/conformance、V-04/P3-02 JSON 分类修复、架构原有细节保留、包内修订单、历史全文改为 immutable Git 引用及索引同步。该 SHA **仅为候选，不是审查或 owner 签署**；本账本随后 metadata-only 提交只记录候选，不改变候选本体。任何进一步文档语义或导航修订都必须更换 subject SHA，重新检查及审查；不得用 mutable branch HEAD 替代。

| Gate | 当前事实 | 必需退出条件 |
|---|---|---|
| G0 设计决策 | **ACCEPTED / 2026-09-18** | ADR0036 明确首次发布前同 identity、无 npm gate、cohort、既有协议不变边界。 |
| G1 文档材料 | **PREPARED / candidate `f938fb7...`** | Profile/Viewport、两 conformance 自包含且一致；历史原文通过 immutable Git 可追溯，架构/包内/index 不制造第二套 current norm。 |
| G1 文档链接自动检查 | **NOT RUN** | 对经审核的同一 docs candidate 执行 `npm run docs:check-links`，记录真实命令、exit 和 raw log；现无该 SHA 的 checkout/CI 证明。 |
| G2 独立技术复核 | **PENDING；不冒充独立 reviewer** | 非本次撰写者审查 exact SHA，逐条记录身份、日期、缺陷、结论及对应证据；发现问题修订后重跑 G1/G2。 |
| G3 Owner Docs Freeze | **PENDING / HOLD** | G1/G2 无阻断后，负责人对相同的最终 SHA 在 Git 可追溯明确批准；批准记录单独附于账本。批准前不得发 Agent 生产实施指令。 |
| C1–C4 architecture implementation | **NOT IMPLEMENTED / NOT RUN** | 最终 executable/cohort SHA 的 revision3、Viewport、旧回归、真实 vertical 测试有日志和 exit；旧 PASS 不转移。 |
| Desktop / Map product | **OUT OF SCOPE / NOT RUN** | 独立后续验收；不得宣称已实现 `play.bat` 真拖窗、地图覆盖和行走性能。 |

```text
Candidate docs subject: f938fb7d15f6d101ea43bf6e155deb3f16e43661
Relative scope baseline: ae7b149b9f4e18312dd44762ae943d7a68648acb
Documentation link check: NOT RUN (no exit/log)
Independent reviewer / reviewed exact SHA / date / findings: PENDING
Owner formal freeze approval / exact SHA / date: PENDING
Approved Docs Freeze subject: NONE / HOLD
Implementation executable SHA / commands / raw logs: NONE / NOT RUN
```

**冻结操作：** 检查 candidate diff 的 docs-only scope → 在该 subject 运行 `npm run docs:check-links` 并存证 → 独立 reviewer 审同一 SHA → 缺陷修正则创建新 subject 并重审 → owner 在 Git 中批准精确 immutable SHA → 后续仅向本账本补写真实批准事实/链接。元数据提交不需要等于所审批 subject，但其记录不得捏造 reviewer 或批准。新语义改动重新开启 Docs Freeze。

**分支合并提醒：** `dev/resize-viewport` 早先恢复过旧 baseline；本轮只核对相对 `ae7b149...` 的 docs-only 变化。若合并当前 `main`，应独立检查已有文档及 ADR 编号差异和分支恢复可能造成的额外变更；本轮冻结不授权无关文档回退。

## 2. 唯一规范与历史保全

| 领域 | 规范及责任 |
|---|---|
| 四 child identity、directions、preflight、single reader/writer、Data terminal、fresh | [自包含 Profile](../15-contracts/renderer-data-profile-v1.md)，不再向旧正文借 MUST。 |
| Raw/wire/schema/source、A→B→A publisher、retained API、participant/currentness | [Viewport child](../15-contracts/viewport-state-v1.md)，唯一算法/接口定义。 |
| Revision3 完整组合 + revision2 旧义务、Input/Render/Connection 契约 | [自包含 revision3 conformance](../15-contracts/renderer-data-profile-conformance-v1.md)；原 [revision2 Git 历史入口](../15-contracts/renderer-data-profile-conformance-v1-previewport-baseline.md)仅溯源。 |
| 旧三 child Profile 原文 | [immutable Git 历史入口](../15-contracts/renderer-data-profile-v1-previewport-baseline.md)；不是现行规范。 |
| V-01…V-14、真实 architecture vertical | [Viewport conformance](../15-contracts/viewport-state-conformance-v1.md)。 |
| 现有三包代码与新 target 的差异 | [Data package 修订单](../../packages/data/VIEWPORT-V1-CORRECTION.md)、[module placement](../20-modules/viewport-core.md)。`packages/data/DESIGN.md` 的旧 API 表仅描述 M8 改造前实现，不是四-child 目标。 |
| 决策理由与兼容边界 | [ADR0036](../decisions/0036-preimplementation-viewport-profile-v1-correction.md)。 |
| 执行顺序、签署和 evidence | 本账本；[根 Agent 入口](../../VIEWPORT_CORE_INTERFACE_DESIGN_DRAFT.md)仅导航。 |

规范内语义冲突按 topic owner 裁决：Profile 只管组合，Viewport child 管尺寸，conformance 只把规则转成断言；旧 Input/Render/Control/Connection 冻结规则不因日期、草案或旧 package DESIGN 被覆盖。特别是 invalid raw JSON → `profile`、合法 JSON 中 recognized `viewport.state` 的 schema/direction → `viewport`、trusted invalid local send → `local-fatal`，各测试不得混用来源。

## 3. Agent 唯一阶段与生产 allowlist

| 阶段 | Production allowlist | 必须退出的证据 |
|---|---|---|
| C1 Data | `packages/data/src/model.ts`、`src/index.ts`、新 `src/viewport-codec.ts`、`src/profile-codec.ts`、`src/peers.ts`、`src/runtime.ts`；包内 test | P3-01…08、V-04…07；旧 Data/Input/Render 回归。Shared writer capacity 不变。 |
| C2 Renderer | `packages/renderer/src/control.ts`、`src/index.ts`、新 `src/viewport.ts`、必要包内 helper/test | V-01…03、V-08；source bootstrap/current/fence；Input/Render 顺序不退化。 |
| C3 Subsystem | `packages/subsystem/src/model.ts`、`src/index.ts`、`src/host/run-subsystem.ts`、新 `src/internal/viewport-manager.ts`、包内 tests | V-09…13；current peer gate、Runtime terminal、Frame/InputTarget independence。 |
| C4 Real vertical | 三包 tests 与现有根 `test/**` 增量 | P3-09、V-14；必须**真 holder + 真 Data peers + 真 Subsystem host**；同一最终 executable SHA 回归。 |

硬禁止：`game-libs/map/**`、`apps/desktop/**`、PWA、示例 CSS、`play.bat`、Main、PlatformPorts、Foundation、Wire、RendererControl、RuntimeControl、M13 Projector/Store、旧 Input/Render wire。若须越界、改 handshake/ACK/Profile `/2`、第二 reader/writer、无界队列或 schema metadata，立即 **STOP**，提交独立设计变更而非自行推断。

## 4. 运行命令及可信证据

根 `package.json` 中已有：`npm run test:data`、`npm test -w @loomrealm/subsystem`、`npm test -w @loomrealm/renderer`、`npm run test:m10:qualification`、`npm run test:m11:qualification`、`npm run test:m13:qualification`、`npm run build:desktop-stack`、`npm run test:regression`、`npm run docs:check-links`。实施者新增明确 revision3/Viewport runner 后，应记录**真正可执行的入口名称**，不得猜测旧 runner 自动覆盖新增 child。

全部结论基于同一最终 executable/cohort SHA：保留命令、exit、Node/OS、fixture/source SHA、raw stdout/stderr 和 branch diff；代码变化后重跑受影响 suite。Fake source vertical 仅证明架构链，不证明 Desktop/Map 真实窗口功能。

## 5. G2 reviewer checklist（每项必须有证据）

- [ ] 两份正式 Profile/conformance 现为自包含完整正文，保留旧 §1–14 / revision2 不变可观测义务，旧 Git 历史不是第二份规范；逐项核对 wire、direction、preflight、terminal family。
- [ ] P3-02/V-04 区分 invalid JSON `profile`、valid recognized viewport invalid `viewport` 和 local invalid `local-fatal`；inherited/getter 不被伪装成 JSON wire 测试。
- [ ] `publishState:void` 不作为 ACK；A→B→A、already-admitted B、terminal、writer indefinitely blocked 均有可执行测试。
- [ ] participant start→source synchronous staging→current peer baseline→peer retire/reconnect→participant replacement 次序无漏；旧 source、old Promise/消息不可污染新身份。
- [ ] Scope 同步初始通知/getter-before-callback、reentrancy、listener reject containment、post-terminal inert 与 V-09…13 一致。
- [ ] `doc/10-architecture`、`doc/15-contracts`、`doc/decisions`、Data 包修订单、Agent 入口无旧三-child current 断言冲突；`docs:check-links` 提供 raw log 与 exit。
- [ ] P3-09/V-14 在真实组件链断言 currentness/backpressure/terminal，不以 mock-only、历史 PASS 或无 Map/Desktop 改动宣称产品 Closed。

Agent STOP：任一规范冲突、不可实现或需越界，记录文件/最小 fixture/expected/actual，经新的受审 docs SHA 重新冻结；不得以文档修订、旧 CI、虚构 reviewer 或 mock-only 测试替代资格。