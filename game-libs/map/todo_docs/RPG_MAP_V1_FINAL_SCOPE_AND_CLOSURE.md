# RPGMap v1：统一设计闭环与实施状态

> 修订日期：2026-09-21。**设计契约已收敛，产品实现和测试尚未完成；不得把本文件的“闭环”解释成已运行或交付。** 本文提供范围、文件权威和闭环准入；技术细节分别只写在下方指定文档中，避免多个版本的签名和相反的迁移政策。

## 一、唯一权威与历史资料

1. [通用化主方案](./RPG_MAP_GENERIC_MODULE_DESIGN.md)：架构、唯一 Map 格式、Map21 Bridge/Ledge、NPC 定义、地图行为和碰撞与传送的产品顺序。
2. [对外接口执行契约](./RPG_MAP_PUBLIC_API_V1_EXECUTION_CONTRACT.md)：**唯一的公开签名、`pattern`、快照类型、Frame、钩子、进入事务、并发和提交失败规则**。若实际导出与此不同，必须先通过代码审查与测试更新这一份契约。
3. [Essentials Local 实施计划](./RPG_MAP_ESSENTIALS_LOCAL_TEST_PACKAGE_MIGRATION_PLAN.md)：数据脚本、消费者改造、PR A–D 和测试矩阵；不重复维护接口或 Bridge 算法。
4. [阅读索引](./README.md)：导航与状态。2026-09-21 之前的旧签名和旧方案可查 Git 历史，但**不再构成并列的现行规范**。本次整合已直接替换上述三份正文，不再依赖“补充文件覆盖旧正文”判断何者有效。

## 二、已冻结的范围

- **只交付一种新版 Map。**生成器一次性构建并严格验证全库，无旧/新版共存、运行时 MapAction 读取或版本证明；Map 的 `behaviors` 仅显式 Bridge，Ledge 地形隐式。
- **固定 Essentials v21.1 真实桥验证仅 Map21。**八事件、四组路径，必须整页确认而非只抽取桥命令；其他地图全部通过新版 Schema/完整性，不强求每张做 Bridge 迁移审计。Map7 传送、Map47 Ledge 保留验收。
- **静态 NPC 支持挡路与显示帧。**定义只有 `name/sprite`；实例一格且互不重叠，不与 Player 重叠；`direction + pattern` 选择 4×4 图，pattern 缺失/null 默认为 0；`setNPC` 整批替换、移动期 busy。NPC 移动与 AI 暂缓。
- **移动/传送次序确定。**当前格的 Contact Transfer 先于运动及 NPC 前方占格；成功计划再检查目标 NPC，阻挡时无 Step/Bridge；成功到达先 Step Transfer 再 Bridge；Edge 仅由原越界规则触发；目标出生点与 NPC 冲突使切图准备失败。
- **失败边界确定。**准备失败保留旧场景；RenderDomain 提交异常若无可证明回滚则 Frame fatal、失效所有 Handler 命令并清理，不能继续使用疑似半提交地图。`mapEntered` 只在成功后发布，完成通知异常可诊断但不撤销提交。取消不会被不响应的钩子无限拖住，迟到结果不能覆盖新场景。

## 三、闭环检查口径

**设计闭环（本轮已完成的工作）：**数据生产→严格校验→Builder/Handler→进入准备与 NPC→唯一场景权威→呈现→失败和取消→合成 CI/合法本地 Hostra 验收，边界、职责和必测条件已写成可执行规范。未发现必须通过新增通用实体/事件框架才能解决的前置缺口。

**产品闭环（仍待实现）：**PR A 完整生成脚本/严格 Schema/Map21 审计/合成夹具；PR B 真实 Builder/Handler、钩子/Frame 接线、异常清理；PR C NPC 素材/碰撞/状态及 Local 消费者/安全重导入；PR D 合成和合法真实本地 E2E。必须提供各 PR 的 commit、命令、PASS/FAIL/NOT RUN、故障注入和回归证据。当前仅修订文档，没有代码更改或运行结果；不能把任何测试写成 PASS。

**后续明确不在本轮：**NPC 自主运动、对话/交互/AI、原版全部 Event/Page、通用数据迁移器、跨 Subsystem 控制及 RGSS 帧级等价。未来需求另起契约，不为了“完整”提前扩充公开 API。
