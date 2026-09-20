# Terrain Behavior：可直接执行的 AG-01～04 任务卡

> **IMPLEMENTATION AUTHORIZED / FOUR PR DELIVERY / PRODUCT NOT YET IMPLEMENTED**。仓库所有者已授权停止无限期冻结准备并转向开发验收。本文件替换旧“必须六 FG PASS 才能派单”的**实施准入规则**；[交付合同](./TERRAIN_BEHAVIOR_DELIVERY_CONTRACT.md) 是准入及产品 Done 权威，[实施计划](./TERRAIN_BEHAVIOR_IMPLEMENTATION_PLAN.md) 管顺序，[候选合同](./TERRAIN_BEHAVIOR_CONTRACT_CANDIDATE.md) 管 C-01～08 设计细节，[门禁](./TERRAIN_BEHAVIOR_FREEZE_READINESS.md) 仍管正式 CONTRACT_V1／原版行为资格。历史 FZ-00～06 记录在[冻结执行](./TERRAIN_BEHAVIOR_FREEZE_EXECUTION.md)与[Issue #42](https://github.com/lithdoo/loom-realm/issues/42)，**不再阻止实施**。初始交接证据 SHA `62938013103b94c3b69786b66216440b1d49fb1c`；每个 PR 实际开始必须重新锁定最新目标 base SHA。

## 共用 Agent 工作协议（以下四卡均已获范围授权）

1. 开始读实际分支 HEAD、`git status --short --branch`、现有改动与最新文档；用户修改不能覆盖或混入。不得 reset --hard/clean/force-push/合并分支。每个 PR 仅提交对应改动，禁止顺手修改无关模块。
2. 先写本 PR 最小字段/接口差异及 producer→consumer，引用候选 C-01～08，写实际产品可观察 Given/When/Then；不另外造一份冗长规格。可以在已授权范围内选最小可逆技术方案，并将未 RGSS 实测的选择标 `PROJECT-DECISION-PROVISIONAL`，有测试并保留未来对照点。
3. 只允许 `tools/fixtures/essentials-v21.1`、相关既有 Content/schema、`game-libs/map` 源码/测试/自有 Browser 中的必要文件。禁止改原版 FSDB/passages，硬编码 map/event/tile ID 到 Runtime，执行 Ruby，通用事件解释器、插件/DSL 或向 framework/Renderer/Hostra 添加地图玩法。原始 rxdata/PBS/完整受限事件文本不可提交。
4. 本地 FSDB 存在时核对实际 SHA，运行真图输入；不存在时跑原创合成 fixture，并如实记录 live skip；不能为了 CI 绿提交受限素材。真实 Map7 是桥负例、Map21 八事件/93 tag15 桥正例、Map47 30 Ledge 正例，具体数值须以执行时素材重验。
5. 每 PR 验收 `changed API/schema + positive/negative tests + affected old regression + actual code SHA CI + product observation when applicable`，列精确命令/exit/pass/fail/skip、失败修复记录、可回滚方案。不能把旧取证 106 pass、旧 CI 100/0/6 或静态 `replayWorld` 当作新功能测试。代码失败当轮修复重跑；不得将可修本地问题包装成下一轮调研。
6. 触发停工只限**当前受影响 PR**：实际不兼容且没有安全迁移、无法可靠区分相关未知事件、真实产品测试失败、安全/许可问题、破坏性公开接口超出授权。固定最小复现、修正或局部 BLOCKED；不重新冻结整个项目。绝不可伪造 RGSS、CI、reviewer 或正式 FG PASS。

## AG-01 / PR1 — 数据流打通（**现在开始**）

**输入/依赖**：本任务卡 + C-01/C-03 候选、现有 Map/Tileset/MapTransfer producer-consumer、当前实际 HEAD。不需要 `CONTRACT_V1`、Game.exe、真图 CI 许可或六 FG PASS。

**主要允许**：`tools/fixtures/essentials-v21.1` 中 Tileset/MapTransfer/Event selective importer、相关 Content/schema、`game-libs/map/src/semantics.ts` 的记录类型/validator，以及对应 tests/fixture；不改 Runtime、Browser、Core 或历史 M14/M15 ledger。

**准确交付**：`struct.Tileset` 保留 `id,tileset_name,autotile_names,passages,priorities`，恰增 1D `terrain_tags`；对三张索引 Table 的 shape、length、tileId/tag 0～17 和缺损精确校验；旧五字段走显式版本迁移、创建新 subject，不对旧资产静默填零。MapAction 是狭义白名单的 On/Off occupied/page/trigger事实，仅映射可确定的脚本；相关不透明按 map/event/page fail-closed，无关 NPC 不导致整图死锁。保留 MapTransfer 已有 source/target mapId 与状态依赖连接；67/93 D0-false 只属于风险，不能臆造真实误删。保持 Content 实际生产与 Map consumer 字段对应。

**必须验收**：手写合成合法/坏 Table、旧五字段迁移、非法 tag/负 tile/缺事件/不透明脚本、MapTransfer 源/目标同坐标与跨图缺目标；原始素材存在则 Map7/21/47 源→prepared→Content→validator 的抽样比较；旧 Tileset 资源、原来 7 edge、`autotile_names` 不退化。对应 fixtures + map package 的数据测试及 CI 合成全绿。PR 记录 exact schema version、migration、内容 SHA、后续 AG-02 可直接 import 的真正类型；**不得只写接口草案不实现 producer+consumer。**

**DoD**：PR1 合入且以上用例通过/CI 关联当前代码 SHA；无未经说明的 schema 漂移。然后自动进入 AG-02，不要求用户再次确认。

## AG-02 / PR2 — 纯规则和普通移动

**依赖**：AG-01 已合入的实际 schema/MapAction 字段及 PR1 SHA。主要允许 `game-libs/map/src/semantics.ts`、纯 planner、`src/runtime.ts` 的 blocked/walk 最小接线和 map tests；不动 Browser jump、不执行桥脚本。

**准确交付**：两个纯查询 `resolveEffectiveTerrainTag` 和 `evaluatePassability` 分离，按 v21.1 有证据的逐层、priority、source direction/target reverse、边界与数据错误；None(0) 非空 tile passage 仍有效，Neutral(13) 只忽略本层，NoEffect(17) 不等于 Neutral，Bridge(15) level 0 忽略桥层、2 使用 passage；其它 tag 原值保留。本轮 MovementPlan 一次性定义 `blocked|walk|jump` 的合法判别联合类型和 JSON 反例，但 PR2 **只执行** blocked/walk（保留既有 250ms walk），jump 留 AG-04，绝不两次 walk 或空动作造假。

**必须验收**：方向双向、边界、层级/bridgeLevel 真值矩阵；Map7 无桥及正常传送；真实产品按键→Runtime→RenderDomain→Browser 普通 walk；resize/transfer/blocked/held input 与旧地图布局、Content 回归。jump type 可以测试其结构，不能称 jump 运行已验收。记录实际协议、motionId/epoch 现有约束与将供 AG-03/04 共用的单一 payload 方案。

**DoD**：所有可运行新增+旧回归与对应 CI 过；`MovementPlan` 类型明确且不可误用；自动进入 AG-03。

## AG-03 / PR3 — Bridge 纵向闭环

**依赖**：AG-02；C-03～06 候选的事件与 motion 联合 ABI 在修改共享 Runtime/Browser **之前**由本 PR 固定为一组 TypeScript/JSON 正反例，AG-04 后续消费，不保留两套通道。主要允许 map Runtime、必要自有 Browser depth、MapAction consumer、地图与 Browser 测试；禁止硬编码八事件 ID 到玩法源码。

**准确交付**：事件占用/size、through/page/`over_trigger?`、here/touch 与先通行后事件；`start` 与 interpreter execute 两检查点，不得同次先 On 后重判。Runtime 唯一 bridgeLevel `{0,2}`，On execute→2、Off execute/transfer→0，失败原子回滚。事件 busy、held input、多事件/重复启动采用确定、最小且可测试的产品策略，标 `PROJECT-DECISION-PROVISIONAL` 而非原版逐帧。bridgeLevel 原地变化使用一次 RenderDomain 更新一致提交人物、桥面 depth 和所需 viewport；相机与人物旧 motion ID/epoch 不得被迟到结果覆盖，Browser 不作通行判断。

**必须验收**：Map7 Bridge 负例；Map21 八脚本事件、四组 On/Off 与真 tag15、桥上桥下、折返、转图归零；size 长带重复、触碰阻挡和 event start/execute 次数；resize/cancel/切图/过期包；旧 walk/Transfer 与树冠屋檐遮挡不退化。除静态 E2E-21 外，必须有**真实 LoomRealm Runtime+Browser** 输入与可观察桥状态/深度日志或演示；本地合法 FSDB 可用就实图跑，没有时产品合成 E2E 必须先做，真图对照明示 BLOCKED 而不是把静态算产品通过。

**DoD**：PR3 功能、真实产品与负例回归绿，代码 SHA 对应 CI 绿；动态原版 RGSS 无法取得时仍可产品交付，但不得标原版保真通过。自动进入 AG-04。

## AG-04 / PR4 — Ledge 单动作与 Browser 动画

**依赖**：AG-02 + AG-03 已审核/合入的共享 motion ABI。主要允许 map planner/Runtime/自有 Browser、其测试；不能重造独立 Renderer 通道或把 jump 拆成两次 walk。

**准确交付**：前方 Ledge/方向及源通行、合法两格落点；一次 MovementPlan `jump` 跨越中格，落点事件一次；单 `motionId` 和数值 `durationMs` 在 Runtime 与 Browser 同一来源，用明确 `PROJECT-DECISION-PROVISIONAL` 产品设计值并测弧线/相机/帧/提交/完成。不可传 `'UNVERIFIED-pending-RGSS'` 字符串到 Browser，也不可把 walk 250ms 无依据当成原版 jump。取消、resize、切图和过期 completion 严格按已锁的共享 ABI；中间格不当普通 walk 触发。

**必须验收**：Map47 实图合法 `(16,9)→(16,11)` 与其它可复现格；逆向、源阻、落点阻、边界、中间/落点事件缺真实样本时采用明确标注的原创合成用例；真实产品一次跳跃动画+相机+落点事件；连续按键、resize/cancel/transfer/旧包负例；Map21 Bridge、Map7、普通 walk、布局旧回归。跨图 jump 不支持需有明确且可测拒绝，不得暗转为两次 walk。

**DoD**：AG-04 与前三 PR 实际合流；产品端到端 Map7→21 和 Map47 + 异常 + 旧回归 + 现代码 SHA CI 全绿，文档以真实类型和结果替换候选用语，报告 `IMPLEMENTED / BEHAVIOR QUALIFICATION PENDING`（若无 RGSS）。不可仅展示独立取证 CLI 或静态 trace。

## 完成交接：不再用原冻结门禁反复请求继续

原 FZ-00～06 的证据与最终 RGSS/许可/reviewer 缺口仍保留在冻结执行文档，FG-01～06 暂为 OPEN；但它们**不阻止**上述四张开发任务卡。四 PR 完成并有真实产品 E2E 后才更新 `IMPLEMENTED`；原版逐帧 RGSS、许可和 reviewer 按实际资源另做保真/正式冻结。除超范围/破坏性公共 ABI/许可授权外，Agent 不逐阶段向用户确认，依 PR 依赖自动推进并主动修复本地可复现问题。
