# Viewport Core：Docs Freeze、Agent 执行与资格唯一账本

> 层级：Implementation / approval ledger；状态：**DOCS PREPARED / FORMAL FREEZE HOLD / PRODUCTION NOT IMPLEMENTED / TESTS NOT RUN**；2026-09-18。
> 决策：[ADR0036](../decisions/0036-preimplementation-viewport-profile-v1-correction.md)；SSOT：[Profile](../15-contracts/renderer-data-profile-v1.md)、[Viewport](../15-contracts/viewport-state-v1.md)、[Profile conformance](../15-contracts/renderer-data-profile-conformance-v1.md)、[Viewport conformance](../15-contracts/viewport-state-conformance-v1.md)；[Agent 入口](../../VIEWPORT_CORE_INTERFACE_DESIGN_DRAFT.md)。

## 1. Gate 和真实性

项目负责人 2026-09-18 决定：npm 包无外部依赖，批准首次发布前直接修订 `/1`。**此项已关闭，不重查 npm。** 明确禁止旧三-child和新四-child `/1` binary 混连；相连角色和 adapter 必须采用同一构建批次。出现具体必须互操作的非 npm 旧 peer 则停止混版部署、独立处理，不泛化构造新调查。

| Gate | 当前记录 | 退出条件 |
|---|---|---|
| G0 设计决策 | OWNER DIRECTION RECORDED | ADR0036 说明范围、不变语义、兼容和无 `/2`。 |
| G1 契约与 conformance | DOC CONTENT PREPARED | Profile /1、Viewport child、Profile revision3、Viewport fixture 及旧全文备份一起在 docs-only subject，交叉一致。 |
| G2 独立技术终审 | PENDING；不得写 PASS | 非本文作者对最终 docs-only SHA 核旧 baseline crosswalk、所有方向、状态机、currentness、安装/retire 顺序、fixture ID 与导航，记录姓名/日期/结果/具体缺陷。 |
| G3 owner Docs Freeze | PENDING；不得写 Frozen | 独立复核之后负责人批准同一个 **最终** docs-only SHA，记录身份、日期、无阻断项；批准前不能发 Agent 实施指令。 |
| C1–C4 executable/qualification | NOT IMPLEMENTED / NOT RUN | 实现后新 executable SHA 的全部 fixture/regression/vertical 证据；不得复用历史 PASS。 |
| Desktop 真窗口 / Map | OUT OF SCOPE | 留独立产品 slice；本任务不宣称通过。 |

```text
Docs-only candidate commit SHA: to be filled after atomic commit
Cross-reviewer / reviewed exact SHA / date / findings: PENDING
Owner formal freeze approval / exact SHA / date: PENDING
Approved Docs Freeze subject: NONE / HOLD
Implementation executable SHA / commands / raw logs: NONE / NOT RUN
```

**冻结操作：** 先提交 docs-only 变更→核 Git diff 只含本账本所列文档→运行 `npm run docs:check-links` 并保存 exit/log（无法运行则 `NOT RUN`，不能写 PASS）→独立 reviewer 针对同 SHA 逐项审核→修订则生成新的 subject 并重新审核→Owner 在 Git 可追溯审批该 SHA→在账本后续提交记录批准事实、且引用被审批的 immutable subject。账本单独记录批准的新提交不是原被审批 docs subject；以实际审批记录为准，不伪造独立签名。一个新的语义变更会重新开启冻结。

## 2. 规范职责与已核对旧基线

| 领域 | 唯一语义定义 / 保全 |
|---|---|
| 四 child identity、方向、single reader/writer、Data terminal、fresh | [current Profile](../15-contracts/renderer-data-profile-v1.md)；继承原 [完整 Profile](../15-contracts/renderer-data-profile-v1-previewport-baseline.md) §2–13 未覆盖规则。 |
| Exact raw/wire/schema/source、publisher A→B→A、Retained API、participant/currentness | [Viewport child](../15-contracts/viewport-state-v1.md) §§1–6。 |
| Profile revision3、旧 revision2、旧 child suites | [Profile conformance](../15-contracts/renderer-data-profile-conformance-v1.md)、[完整 revision2](../15-contracts/renderer-data-profile-conformance-v1-previewport-baseline.md)。 |
| viewport V-01…V-14、真实 architecture vertical | [Viewport conformance](../15-contracts/viewport-state-conformance-v1.md)。 |
| 决策理由 / scope / no npm gate | [ADR0036](../decisions/0036-preimplementation-viewport-profile-v1-correction.md)。 |
| 实施工序、状态、批准、evidence | 本账本；根目录文件仅导航不复制 SSOT 算法。 |

冲突优先：先按文档治理判断 owner；同主题 Profile 负责 composition，Viewport child 负责尺寸行为，conformance 只能把行为变成断言，Agent 入口只负责顺序；不得由日期或新草案静默覆盖 Frozen Input/Render/Control/Connection。原备份是历史继承材料，不是 current peer。

## 3. Agent 可修改范围（硬限制）

| 阶段 | production allowlist | 必须退出的证据 |
|---|---|---|
| C1 Data | `packages/data/src/model.ts`, `src/index.ts`, 新 `src/viewport-codec.ts`, `src/profile-codec.ts`, `src/peers.ts`, `src/runtime.ts`（必要包内 test） | P3-01…08、V-04…07；旧 `@loomrealm/data`/Input/Render 回归。不得改变 shared writer 容量。 |
| C2 Renderer | `packages/renderer/src/control.ts`, `src/index.ts`, 新 `src/viewport.ts` 与包内有限 helper/tests | V-01…03、V-08、source startup/fence；旧 Input/Render 不退化。 |
| C3 Subsystem | `packages/subsystem/src/model.ts`, `src/index.ts`, `src/host/run-subsystem.ts`, 新 `src/internal/viewport-manager.ts` 与包内 tests | V-09…13、current peer gate、Runtime terminal、Frame/InputTarget independence。 |
| C4 vertical | 以上三包 tests 和现有根 `test/**` 新测试 | P3-09、V-14 真 holder+真实 Data peers+真实 Subsystem host；跨包旧回归；同 SHA。 |

**硬禁止：** `game-libs/map/**`、`apps/desktop/**`、PWA、示例 CSS、`play.bat`、Main、PlatformPorts、Foundation、Wire、RendererControl、RuntimeControl、M13 Projector/Store、原 Input/Render wire。需要改它们或增加 ACK、Profile `/2`、第二 reader/writer、无限队列、schema metadata 时 STOP 并提交独立设计变更。文档范围仅原协议/child/conformance/ADR/导航/账本的精确变化；不大范围重写无关平台/里程碑文档。

## 4. 最小执行命令和证据要求

根 `package.json` 存在 `npm run test:data`、`npm test -w @loomrealm/subsystem`、`npm test -w @loomrealm/renderer`、`npm run test:m10:qualification`、`npm run test:m11:qualification`、`npm run test:m13:qualification`、`npm run build:desktop-stack`、`npm run test:regression`、`npm run docs:check-links`。实施时创建新的 revision3/Viewport conformance runner，并记录真实入口名称；不能假定旧 runner 已经覆盖。需针对最终**同一个** executable SHA 报告完整命令、exit code、Node/OS、fixture/source SHA、raw stdout/stderr 和分支 diff；变化后重跑受影响集合。只测模拟尺寸源证明架构路径，不能把 fake source 当 Desktop/Map 实际功能资格。没有权限/环境运行时记录 `NOT RUN` 并保持 NOT CLOSED。

## 5. 最终独立 reviewer 清单（每项需证据）

- [ ] 精确合同 `width/height` 与 `ViewportStateV1` shape / direction / common preflight / terminal family 一致；旧基线内容完整且 §1–14 差异表无遗漏。
- [ ] `publishState:void` 不作逐样本 ACK；publisher A→B→A、already-admitted B、terminal、writer permanently blocked 的不变量明确且 V-05…07 可证。
- [ ] participant start→source synchronous stage→peer current→fresh baseline→peer retire/reconnect→participant replace 次序无漏洞；旧 source、旧 Promise 不污染新身份。
- [ ] `scope.viewport` synchronous initial/getter-before-callback、stable snapshot subscribe reentrancy、listener reject containment、post-terminal subscribe inert 与 V-09…13 对应。
- [ ] 当前 Profile revision3 保留旧 revision2 完整语义与相关旧 child 全套，未假造旧三-child compatible/new protocol PASS。
- [ ] 入口链接、ADR index/contract index、根草案状态一致；`docs:check-links` exit/log 已记录，若缺则 HOLD。
- [ ] 真实 vertical 的 currentness、backpressure、source/peer lifecycle 可在**真实角色链**观测；不会因无 Desktop/Map 改动宣称 Product Closed。

**Agent STOP：** 任一规范冲突/不可实现/需要越界，应报告文件+最小 fixture+expected/actual，要求设计另行修订并重新冻结。绝不以“修了几个测试”、虚构 Reviewer/CI、历史 run 或本 ledger 本身当作批准。