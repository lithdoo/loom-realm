# Terrain Behavior：产品交付与原版资格门禁

> 当前状态：**PRODUCT IMPLEMENTED ON `feat/map-terrain-behavior` / MAIN MERGE SUBJECT TO PR & CURRENT CI / BEHAVIOR QUALIFICATION PENDING / NOT FORMALLY FROZEN**。`TERRAIN_BEHAVIOR_CONTRACT_V1.md` 未获正式签核；原版 RGSS 逐帧一致性不可由 LoomRealm 产品测试推导。实际当前实现、schema/ABI、产品 Done 以 [交付合同](./TERRAIN_BEHAVIOR_DELIVERY_CONTRACT.md)、[实施计划](./TERRAIN_BEHAVIOR_IMPLEMENTATION_PLAN.md)及最终 PR SHA 为准。历史冻结步骤和 [Issue #42](https://github.com/lithdoo/loom-realm/issues/42) 不再是产品编码或主分支交付的前置门禁。
>
> 固定原版 Pokémon Essentials v21.1 `ea7b5d56d2436591160983c4e641a2ceee2d875a`。结构化指纹及真实/合成区别见 [证据](./TERRAIN_BEHAVIOR_EVIDENCE.md) §1、§14–16；[复核](./TERRAIN_BEHAVIOR_EVIDENCE_REVIEW.md)说明原版证据等级。早期原始事件全文附录因许可未核清已从当前文档移除；仅保留事实、摘要及本地再生成入口。

## 1. 三个独立状态

| 项 | 当前状态 | 判断依据 |
|---|---|---|
| 开发授权 | AUTHORIZED | 用户授权 AG-01→04 实施；不依赖原版 RGSS 和全部 FG 先 PASS |
| 产品实现 | IMPLEMENTED ON FEATURE BRANCH；尚不能据此称已合入 main | 实际 importer→Content→Map→Runtime→Browser 与产品测试、试玩；main 合入以 PR 目标、当前 HEAD CI 和合并提交核实 |
| 原版资格 / 正式合同 | NOT QUALIFIED / NOT FROZEN | 原版动态对照、实际权利依据、经授权的 reviewer FG/DEC 签核；缺少任何一项不写 PASS |

旧 M14/M15 既有资格记录不等于新增 terrain-tags/schema/ABI 的历史资格；当前功能 SHA 的 CI 不可用早期静态取证 CI 替代。

## 2. 已验证事实与产品边界

Map7 是限定扫描内 Bridge 负例；Map21 93 个 tag15 格和八个 Bridge On/Off 事件，bridgeLevel 0/2 下 `over_trigger?` true 为静态计算；Map47 30 个 Ledge 格，404 为 choices 控制流。Map7 `(40,0)` 物化边→Map21 四组 Off/On→实际 tag15→反向 transfer 已由单状态 `replayWorld` 验证，属于 `STATIC-INFERRED`；旧分段 trace 不是 E2E。产品实际修复包括事件完成后继续消费 held input、bridgeLevel 切换重投影 Bridge 图块深度，以及阻挡触碰不能启动 walk-on 桥事件；验收以源码、产品试玩、新增回归测试和当前 CI 为准。

## 3. FG-01～06：仅管理原版保真资格

| Gate | 已获得的基础 | 正式升级所缺证据 |
|---|---|---|
| FG-01 原版事实 | Map7/21/47 静态数据与统一路线 | 原版 RGSS 动态事件/跳跃/转图日志，或获批缩窄资格 |
| FG-02 数据与导入 | 产品已有 terrain_tags、版本化迁移及狭义 MapAction | 针对正式新 schema subject 的独立资格审查 |
| FG-03 事件状态 | 产品已实现 Bridge 0/2、held input、触发模式及回归 | 与原版 interpreter/start 帧序逐帧对照或获批缩窄资格 |
| FG-04 运动显示 | 产品已有 jump ABI、Browser 弧线及 bridge depth 重投影 | 原版时长/遮挡精度核验或获批缩窄资格 |
| FG-05 素材与 CI | 原创合成 fixture、产品 CI、合法本地 live 入口 | 原始素材分发权利或明确批准 synthetic-only 资格；CI live skip 不算 PASS |
| FG-06 合同签署 | 候选合同与实际产品接口 | 正式版本与 ABI 审查、真实 reviewer 对 FG/DEC 授权签核 |

六项 FG 仍为 OPEN，但**不阻止产品合入 main**，只阻止宣称原版逐帧保真和 `CONTRACT FROZEN`。原版数据 `SOURCE-PROVEN/FSDB-OBSERVED`、静态推断 `STATIC-INFERRED`、产品试玩 `PRODUCT-OBSERVED`、原版 RGSS `DYNAMIC-OBSERVED` 不能混同。

## 4. 产品主分支交付准入

按 [交付合同](./TERRAIN_BEHAVIOR_DELIVERY_CONTRACT.md)：AG-01 数据/Content → AG-02 地形判定/walk → AG-03 Bridge→AG-04 Ledge。合入 main 前必须检查当前功能 HEAD 与 main 分支关系、PR base、实际合入文件、许可边界，以及当前 SHA 的 importer/M9/M12/M13/M14/M15 测试结果；不能把运行中 CI 写成 PASS。尤其覆盖 Map21 四组桥端和 held input/blocked front touch、桥上下人物相对深度、Map47 单次两格 jump、传送/resize/cancel/旧 motion 回归。原版素材仅在合法本地使用，不随 CI 发布。

产品合并成功后可记 `IMPLEMENTED ON MAIN / BEHAVIOR QUALIFICATION PENDING`，并记录实际 merge SHA；未经授权签署，不创建 `CONTRACT_V1`，不改变历史资格 ledger。
