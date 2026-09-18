# Viewport Core：Cursor 分支定向优化与再资格清单

> 层级：Implementation / code-review follow-up；性质：**非规范性整改文档**；状态：**待实施、待复测，不代表新的 Docs Freeze、代码修复或资格 PASS**；复核日期：2026-09-18。  
> 目标分支：`cursor/resize-viewport`；本清单依据实施代码提交 `d42bc6e7755330e74263d1ec55a14998e3718d43` 与复核时分支 HEAD `80ceecfdecde3854ee2e7b8804782e7d50f2a81c` 撰写。共同起点：`72de3efbb6ffffafdecefd6224273edb12ee02ed`。执行前先确认 HEAD；若后续已经修复，按真实代码与测试重新核对，不机械重复改动。  
> 唯一行为依据：[Viewport State v1](../15-contracts/viewport-state-v1.md)、[Profile /1](../15-contracts/renderer-data-profile-v1.md)、[Viewport conformance](../15-contracts/viewport-state-conformance-v1.md)、[Profile revision 3 conformance](../15-contracts/renderer-data-profile-conformance-v1.md)；冻结/资格事实仅以[账本](./viewport-core-freeze-ledger.md)及真实证据为准。本文件不能修改、替代或暗中扩大正式契约。

## 1. 收敛目标与不可变边界

保持 Cursor 已有链路和代码骨架：`RendererViewportSource → current RendererDataPeer.viewport.publishState → Data 既有单 writer/reader → current SubsystemDataPeer → Runtime scope.viewport`。保留 `packages/data/src/peers.ts` 内的每 peer `ViewportPublisher`，**不要**把 Viewport 专用游标搬进通用 `DataRuntime`；不添加第二 writer、ACK、timer/debounce、全局 viewport 服务或新对外抽象。GLM 分支只作为可参考的测试场景，不能整包复制其生产实现、账本、日志或测试 PASS。

生产修改仅限 `packages/data/**`、`packages/renderer/**`、`packages/subsystem/**`；测试限对应包和现有 `test/**`，必要时更新根 `package.json` 里已有 Viewport runner。严禁修改 Map、Desktop、PWA、examples、Main、Foundation、Wire、PlatformPorts、RendererControl、RuntimeControl、M13 Store/Projector 以及旧 Input/Render wire。修复不改变 `/1`、child 集合、wire 格式或文档规范；若证明必须改正式语义，停止实施并另行走设计复核。

以下为代码审查指出的**待验证缺陷或测试缺口**，不是已执行的失败用例；先写能复现的测试，再最小修复，不宣称本文件本身已解决它们。

## 2. 必修代码项

### C-01 / Data：本地 `publishState` 必须精确校验，且无效输入不能被合并掩盖（阻断）

位置：`packages/data/src/peers.ts`，`ViewportPublisher.publishState`、`isAdmissibleViewport`。

当前快速检查读取 `value.type/width/height` 并只要求 `Object.keys(value).length === 3`；它既不能证明自有键恰为 `type,width,height`，也可能触发 getter/Proxy trap。合法尺寸由 publisher 复制宽高，这一点保留；问题在于**无效 trusted outbound 消息必须立即经既有 local-fatal send 路径处理**，不允许因为 `inFlight`、`pending` 或 `lastSent` 去重而静默消失。

最小实现要求：在任意去重/入槽操作之前安全判定 exact own-key schema、类型和正安全整数。可复用现有 child 校验逻辑，避免维护第二套不一致的 wire 规则；捕获访问器或代理抛错，确保 `publishState(): void` 不向调用方同步泄漏异常。无效本地消息使用既有 `DataRuntime.send` 校验/terminal 语义处理，不得发送伪造的合法替代尺寸；由真正的 Data terminal 退休游标，旧 Promise 不得触发后续发送。有效消息进入状态机前复制不可变的宽高值，保持原有 A→B→A 和单 in-flight + 单 pending 算法。

**测试必须证明：**
- `{type:'viewport.state', width:640, height:480}` 发送后，同值合并仍正常；
- `{type:'viewport.state', width:640, height:480, extra:1}`、缺 `height`、错误 `type`、继承来的 `width/height` 加无关自有键、含 getter/Proxy trap 的对象，不会误当作合法消息或向调用方泄漏同步异常；合法性由正式约定分类，trusted invalid local 必须 `local-fatal`，且零非法 wire；
- 在 **in-flight=A** 时提交 invalid B，不能被随后合法 A 或 C 覆盖而逃过 terminal；在 **lastSent=A、当前 idle** 时提交 invalid A-like，也不能因尺寸相同而被吞掉；
- 不退化 valid A→B→A、writer FIFO、终止 first-wins、异步 settle fence 和既有 Input/Render 顺序。

### C-02 / Subsystem：监听器返回的恶意 thenable 也必须被隔离（阻断）

位置：`packages/subsystem/src/internal/viewport-manager.ts` 的 `deliver`。

当前 `listener(value)` 在 `try` 内，但随后读取 `result.then` 位于 `try` 外；若返回对象的 `then` getter 抛错，可能中断广播并将错误传播至 Data handler。把监听调用、thenable/Promise 处理全部纳入异常隔离；对 rejection 安装实际处理器，避免 unhandled rejection；不能仅捕获同步 listener throw。无需引入通用事件框架。

**测试必须证明：** 同一批监听器中依次存在同步 throw、`Promise.reject`、`then` getter throw、正常 listener；初始化同步回调与后续更新都不向 host 或 Data 传播故障，正常监听器仍按顺序收到值，Data peer 不 `local-fatal`；reentrant subscribe/unsubscribe、getter-before-callback、重复退订、Runtime terminal 后 inert 行为均保持。

### C-03 / Renderer：raw sample 的完整自有键判定（小范围加固）

位置：`packages/renderer/src/viewport.ts` 的 `normalizeViewportSample`。

当前使用 `Object.getOwnPropertyNames`，只覆盖 string-key；依正式规范 raw sample 不允许额外 own property，应核验 `Reflect.ownKeys` 对 symbol-key extra 的处理（以及对应 Proxy 异常）。保留通过 descriptor 而非 getter 读取数值、finite positive → floor → positive safe integer、同值抑制、invalid retain 的现行实现。只做与 exact-own 规范直接相关的最小修正，不强加额外对象原型/DOM 限制。

**测试必须证明：** 含额外 symbol-key 的 sample 被忽略；descriptor/getter 不被执行；普通合法数值保持原行为，非法样本不清除最新有效尺寸。

## 3. 必修测试与资格项

### T-01 / 删除两个“假 conformance”占位测试（阻断）

当前 `test/renderer-data-profile-v1/revision3.test.mjs` 与 `test/viewport-state-v1/qualification.test.mjs` 各仅有 `assert.ok(true)`，不能把它们的 PASS 作为 P3/V conformance 证据。将这两个入口改为**实质断言**：可以直接承载 P3-01…P3-09 / V-01…V-14 的测试，也可以使用明确的真实测试入口并在 runner 中保证确实执行；不得使用空断言、只检查文件存在、只引用测试文件名或冒用 package suite。`npm run test:viewport` 必须实际包括这些测试和真实 vertical。

建议仅参考 `glm/resize-viewport` 的 `test/renderer-data-profile-v1/qualification-revision3.test.mjs`、`test/viewport-state-v1/qualification.test.mjs` 所覆盖的场景，按 Cursor 的真实接口和 harness 重写/移植断言；不要直接复制 GLM 的产品实现和资格结论。把每个 P3/V ID 映射到具体测试名称或稳定选择器，确保失败能单独定位。

### T-02 / 强化 Cursor 原有真实纵向测试（阻断）

位置：`test/viewport-core-vertical.test.mjs`。现有 fake source→真实 holder→真实 Data peers→真实 Subsystem host 路径应保留，但一个合并测试不足以证明全部跨生命周期行为。增补**可观测的独立用例**：

1. Source 在 `start(emit)` 内同步发出合法初始样本，确认仅最新的 staging 值经真实 wire 到 factory 内的 `scope.viewport`；与 `start` 完成后才 emit 的场景分开测。
2. 可控共享 writer 在 send admission 后**真正阻塞**；在阻塞期间制造 10,000 次交替样本，并发真实 Input（含有效 target、Interest、state/event）和 Render（在相同测试窗口内产生业务数据）。同时记录 writer admission 数、实际 wire 数、最大物理并发和顺序；必须证明 Viewport 至多 1 admitted/in-flight + 1 pending、Input/Render FIFO 不退化、释放后最后尺寸收敛。不能在 gate 后才记录发送并以“阻塞期间数组为空”冒充有界证明。
3. Same-generation carrier 重连：新 peer 线上重新发送相同 baseline，Runtime 只保留一次业务通知；独立测试新 generation 的 peer 和 cursor。
4. Control participant replacement：旧 source stop，旧 callback/旧 peer/旧发送异步结果 inert，新 participant 不继承旧样本；Runtime 内 `scope.viewport` 对象身份不变。
5. Runtime terminal：所有 listener 清理，保留历史 `current`，post-terminal subscribe 无初始回调，旧消息和 promise 不发生副作用。

对每项同时断言 **wire、业务值及必要生命周期计数**，不能只断言 `waitFor` 最终成立。测试 harness 可模拟物理 source 与 broker 协调，但 holder、Data peers、carrier、Subsystem host 必须是真实生产实现。必要时从 GLM 测试借鉴测试场景，不机械照搬其可被空 wire 满足的宽松断言。

### T-03 / 负向覆盖与证据真实性（阻断）

将 C-01～C-03 的最小复现加入对应包内 suite 和必要的跨包 conformance。每个新增测试先在修复前证明确实能识别缺陷（记录 failing fixture / expected / actual），再实施最小代码修复并重跑；无法安全证明旧版失败时如实注明，不得虚构 RED。审查 `package.json` 实际 runner，确保根 conformance 不是死入口。

当前 Cursor 证据中的 `test:viewport` 曾记录 17/17 PASS，但其中两项为占位；该历史事实不等于补强后的 conformance 合格。原始日志只属于产生它的原 executable SHA，**不得迁移为优化后提交的 PASS**。不复制 GLM 的日志、G2/G3 批准记录或资格账本覆盖原证据。

## 4. 实施顺序与最小提交

1. 固定开始时 `cursor/resize-viewport` 的 HEAD 和 clean 状态；首先补 C-01/C-02 的负向测试，C-03 的 symbol-key 负向测试；明确测试是否复现。
2. 只在各自源文件里修复 C-01、C-02、C-03，不重构 DataRuntime 或重写现有架构；确保旧测试继续兼容。
3. 替换 T-01 两个空入口；按 T-02 强化独立 vertical；把 P3/V 测试矩阵映射写在新增测试顶部或测试证据中，而不是复制成第二套协议说明。
4. 审核 diff：只含三包相关代码/测试、根 `test/**`、必要 root `package.json` 和**真实执行后**的证据。不得修改正式 Profile、Viewport、ADR、Map/Desktop 或本账本已有批准事实来制造 PASS。
5. 在最终 executable SHA 上运行并留存 `npm run docs:check-links`、`npm run test:data`、`npm test -w @loomrealm/subsystem`、`npm test -w @loomrealm/renderer`、`npm run test:viewport`、`npm run test:m10:qualification`、`npm run test:m11:qualification`、`npm run test:m13:qualification`、`npm run build:desktop-stack`、`npm run test:regression`；额外 runner 按实际 `package.json` 确认。记录 OS/Node、命令、exit、原始 stdout/stderr、final SHA、失败及重跑情况。代码修改后重跑受影响 suite；资格需全部对应同一最终 code SHA。

## 5. 验收定义

- **Correctness：** trusted invalid outbound 不会被合并吞掉、只按 local-fatal 退出；正常消息值复制并保持 publisher 边界；listener 的同步错误、thenable getter 和 rejection 皆与 Data terminal 隔离；raw sample exact own-key 处理正确。
- **Completeness：** P3-01…09、V-01…14 均有真实可定位测试；两个占位测试消失；V-14 包括同步 bootstrap、真实同窗并发背压、reconnect/generation、participant stale fencing、terminal。
- **Maintainability：** ViewportPublisher 留在 per-peer 层，DataRuntime 保持通用 reader/writer，Subsystem 只暴露既有只读 `scope.viewport`；无新公共抽象及不必要文件改写。
- **Evidence：** 完整 raw log 和 exit 对应同一最终 executable SHA；任何 NOT RUN/FAIL 必须明示。只有重新通过后才能更新 Architecture Qualified 记录；这仍不代表 Map/Desktop/`play.bat` 产品验收。

**STOP：** 若修复要求更改冻结规范或越过生产 allowlist，保留最小复现和必要 diff，另行提交设计决策；不得在本优化文档中擅自变更合同或宣称已获授权。本文件仅说明整改目标，不表示代码已经修改、测试已经复跑或任何 gate 已新增通过。