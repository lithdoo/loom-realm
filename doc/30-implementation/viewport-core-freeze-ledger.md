# Viewport Core：Docs Freeze、Agent 执行与资格唯一账本

> 层级：Implementation / approval ledger；状态：**DOCS CANDIDATE PREPARED / FORMAL FREEZE HOLD / PRODUCTION NOT IMPLEMENTED / TESTS NOT RUN**；2026-09-18。  
> [Accepted ADR0036](../decisions/0036-preimplementation-viewport-profile-v1-correction.md)；唯一正式语义：[Profile](../15-contracts/renderer-data-profile-v1.md)、[Viewport](../15-contracts/viewport-state-v1.md)；[Profile conformance](../15-contracts/renderer-data-profile-conformance-v1.md)、[Viewport conformance](../15-contracts/viewport-state-conformance-v1.md)；[上游通信架构](../10-architecture/communication-system.md)、[Subsystem 架构](../10-architecture/subsystem-model.md)、[模块落点](../20-modules/viewport-core.md)；[Agent 入口](../../VIEWPORT_CORE_INTERFACE_DESIGN_DRAFT.md)。

## 1. 冻结状态与可追溯主体

**G0 决策已通过：** 项目负责人 2026-09-18 确认 npm 包无外部依赖，批准首次发布前直接修订 `/1`。不再重查 npm，也不创建 `/2`。相连的旧三-child与新四-child `/1` binary **不准混连**；相关 Data/Renderer/Subsystem/adapter 使用同一 build cohort。若出现具体必须互操作的非 npm 旧 peer，停止混版部署并单独解决。

**Docs 内容候选的 immutable commit：`d03d248ae8e566b8960ce47b6ad466d932fe27ac`。** 它从上一次根草案提交 `ae7b149b9f4e18312dd44762ae943d7a68648acb` 开始累计完成本次规范/架构/模块/导航文档修订。此账本的**后续 metadata-only 提交不改变上述被审查的文档主体**，但如 reviewer 要求任何语义/导航修正，必须以修订后的新最终 SHA 替换候选并重新审查。只批准真正接受审核的 exact SHA，不能把分支可变 HEAD 误当 immutable subject。

| Gate | 当前事实 | 必需退出条件 |
|---|---|---|
| G0 设计决策 | **ACCEPTED / 2026-09-18** | ADR0036 记录预发布修订 `/1`、无 npm gate、受控 cohort、旧权责不变。 |
| G1 文档材料 | **PREPARED / subject `d03d248...`** | Profile/Viewport 两正式契约、两 conformance、旧正文保全、架构与 module/index 投影一致；不能据此写 Frozen。 |
| G1 文档链接自动检查 | **NOT RUN** | 在被审查的相同文档 subject 执行 `npm run docs:check-links`，留命令/exit/raw log。当前连接只允许 GitHub 文件读写，未得到 checkout/CI 本次 run 的证据。 |
| G2 独立技术终审 | **PENDING** | 非本文作者审核 exact subject、记录 reviewer 身份/日期/缺陷/结果、验证旧 baseline crosswalk 和所有 gate；无人实际签名不得代签。 |
| G3 Owner 正式 Docs Freeze | **PENDING / HOLD** | G1/G2 无阻断后，负责人对最终受审核 SHA 在 Git 可追溯批准；在下游单独记录批准事实和链接。未完成不得发放生产实施指令。 |
| C1–C4 架构实现与资格 | **NOT IMPLEMENTED / NOT RUN** | 新 executable/cohort SHA 的全部 conformance、真实 vertical 与回归有真实证据；旧结果不转移。 |
| Desktop / Map 产品资格 | **OUT OF SCOPE / NOT RUN** | 后续独立任务；本阶段禁止声称已解决 `play.bat` 真拖窗/地图/运动。 |

```text
Candidate docs subject: d03d248ae8e566b8960ce47b6ad466d932fe27ac
Relative scope baseline: ae7b149b9f4e18312dd44762ae943d7a68648acb
Documentation link check: NOT RUN (no exit/log)
Independent reviewer / reviewed SHA / date / findings: PENDING
Owner formal freeze approval / exact SHA / date: PENDING
Approved Docs Freeze subject: NONE / HOLD
Implementation executable SHA / commands / logs: NONE / NOT RUN
```

**冻结操作：** 确认 docs-only diff 与该 subject→执行 `npm run docs:check-links` 留证→独立 reviewer 逐项审核同一 subject→若修改则重新固定新 SHA 并重新验收→负责人在 Git 可追溯批准该 immutable SHA→单独提交本账本的批准记录，引用真正被批准 subject。最后一步账本元数据提交的 SHA 不必等于已签署的 docs subject，绝不可虚构独立签名。新的语义变更会重新打开 Docs Freeze。

**分支合并提醒：** `dev/resize-viewport` 的恢复基线曾回退原 main 后续设计文档；本账本只验证**相对 `ae7b149...` 的本轮文档修改**，不得假定直接对当前 main 开 PR 时 diff 仅包含这批文件。未来合并须另行核对 main 的历史文档、ADR 编号冲突和额外删除；不得通过本次冻结授权无关文档回退。

## 2. 语义单一来源与旧契约保全

| 领域 | 唯一语义来源 / 不变部分 |
|---|---|
| 四 child identity、direction、single reader/writer、Data terminal、fresh | [current Profile](../15-contracts/renderer-data-profile-v1.md)；原 [Profile 全文](../15-contracts/renderer-data-profile-v1-previewport-baseline.md) §2–13 未覆盖规则继续继承。 |
| Exact raw/wire/schema/source、publisher A→B→A、Retained API、participant/currentness | [Viewport child](../15-contracts/viewport-state-v1.md) §§1–6。 |
| Profile revision3 与旧 revision2/child suites | [Profile conformance](../15-contracts/renderer-data-profile-conformance-v1.md) 及[原 revision2 全文](../15-contracts/renderer-data-profile-conformance-v1-previewport-baseline.md)。 |
| Viewport V-01…V-14、真实 architecture vertical | [Viewport conformance](../15-contracts/viewport-state-conformance-v1.md)。 |
| 上游职责与包落点 | [通信架构](../10-architecture/communication-system.md)、[Subsystem 模型](../10-architecture/subsystem-model.md)、[module realization](../20-modules/viewport-core.md)；三者不定义另一套状态机。 |
| 决策理由、兼容边界 | [Accepted ADR0036](../decisions/0036-preimplementation-viewport-profile-v1-correction.md)。 |
| 实施工序、权限、签署与 evidence | 本账本；根目录 Agent 入口仅导航。 |

同主题 Profile 负责 composition，Viewport child 负责尺寸行为，conformance 将其写成断言，Agent 入口只管执行顺序；不能由较新日期/草案静默覆盖 Frozen Input/Render/Control/Connection。旧完整 baseline 保全未改变义务而不是提供另一种 current peer。

## 3. Agent 允许修改范围与唯一阶段

| 阶段 | Production allowlist | 必须退出的证据 |
|---|---|---|
| C1 Data | `packages/data/src/model.ts`、`src/index.ts`、新 `src/viewport-codec.ts`、`src/profile-codec.ts`、`src/peers.ts`、`src/runtime.ts`；必要包内 test | P3-01…08、V-04…07；旧 Data/Input/Render 回归。Shared writer capacity 不改。 |
| C2 Renderer | `packages/renderer/src/control.ts`、`src/index.ts`、新 `src/viewport.ts`、包内有限 helper/test | V-01…03、V-08；同步 bootstrap/current/fence；旧 Input/Render 顺序不退化。 |
| C3 Subsystem | `packages/subsystem/src/model.ts`、`src/index.ts`、`src/host/run-subsystem.ts`、新 `src/internal/viewport-manager.ts`、包内 tests | V-09…13；current peer、Runtime terminal、Frame/InputTarget 独立。 |
| C4 Real vertical | 以上三包的 tests 和已有根目录 `test/**` 的增量 | P3-09、V-14；**真 holder + 真 Data peers + 真 Subsystem host**；同一最终 executable SHA 的受影响回归。 |

硬禁止：`game-libs/map/**`、`apps/desktop/**`、PWA、示例 CSS、`play.bat`、Main、PlatformPorts、Foundation、Wire、RendererControl、RuntimeControl、M13 Projector/Store、旧 Input/Render wire。需要越界、改变 handshake/ACK/Profile `/2`、第二 reader/writer、无界队列或 schema metadata 时 **STOP** 并提交独立设计变更；不得自行修正常规测试标准。

## 4. 实际执行命令和证据

已从根 `package.json` 核对可用：`npm run test:data`、`npm test -w @loomrealm/subsystem`、`npm test -w @loomrealm/renderer`、`npm run test:m10:qualification`、`npm run test:m11:qualification`、`npm run test:m13:qualification`、`npm run build:desktop-stack`、`npm run test:regression`、`npm run docs:check-links`。实施时必须新增显式 revision3/Viewport conformance runner，记录真实入口名称；不能假定旧 runner 包含新子协议。对同一最终 executable/cohort SHA 报完整命令、exit、Node/OS、fixture/source SHA、raw stdout/stderr 和 branch diff；变更后重跑受影响集合。Fake source 只能证明架构路径，不证明 Desktop/Map 功能。

## 5. G2 独立终审 checklist（每条记录证据）

- [ ] Profile /1 revised closed child set、方向、common preflight、reader/writer、terminal family 与旧完整 Profile §1–14 差异 crosswalk 一致，无历史规则遗失。
- [ ] `publishState:void` 不作为 per-sample ACK；publisher A→B→A、already-admitted B、terminal、writer indefinitely blocked 的不变量明确，V-05…07 可实现。
- [ ] participant install→source synchronous staging→current peer→baseline→peer retire/reconnect→participant replacement 次序无泄漏；旧 source callback、旧 send Promise/消息不可污染新身份。
- [ ] Scope 同步初始回调/getter-before-callback、reentrancy、listener reject containment、post-terminal inert 与 V-09…13 对应。
- [ ] Profile revision3 完整继承 revision2、Input/Render/Connection conformance；旧三-child PASS 不充新版结果。
- [ ] `doc/10-architecture`、`doc/20-modules`、contract index、ADR index、`doc/README.md`、根 Agent 入口无旧三-child current 叙述矛盾；`docs:check-links` raw log 与 exit 可见。
- [ ] Real holder→Data peers→Subsystem host 的 currentness/backpressure/terminal 可在真实组件链断言；无 Map/Desktop diff 或产品 Closed 宣言。

Agent STOP：任一规范冲突/不可实现/需要越界，记录文件/最小 fixture/expected/actual 并经设计修订重新冻结。**不得以文档修订、历史 CI、虚构 reviewer 或 mock-only 测试代替资格。**