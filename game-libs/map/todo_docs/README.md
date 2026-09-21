# RPGMap v1 设计文档阅读入口

> 状态：以下均为设计与实施计划；实际功能以 `game-libs/map/src`、生成脚本和对应提交的测试结果为准，未实施事项不得标记已完成。

建议按此顺序阅读：

1. **[最新范围与闭环决策](./RPG_MAP_V1_FINAL_SCOPE_AND_CLOSURE.md)**：2026-09-21 用户确认的修订，覆盖下列旧文件中相冲突的段落。**只生成一种新版 Map**，Runtime 不混读 `MapAction`；真实 Bridge 转换与逐条验收仅针对 Map21；静态 NPC 挡路且 `setNPC` 可设置 `direction + pattern`，缺省/`null` 的 pattern 为 0；明确提交失败、PR 顺序和静态范围。
2. [RPGMap 通用化主方案](./RPG_MAP_GENERIC_MODULE_DESIGN.md)：模块职责、Map/Bridge/Ledge 原始目标、NPC 最小定义及总 TODO。其旧版“新旧 Map/版本迁移”讨论、无 pattern 的接口片段或非 nullable 快照示例，以第 1 项修订为准。
3. [对外接口 v1 执行契约](./RPG_MAP_PUBLIC_API_V1_EXECUTION_CONTRACT.md)：Builder/Handler、Frame、进入准备、取消、错误与快照的**生命周期权威**。其中 NPCPlacement、碰撞和 RenderDomain 失败部分按第 1 项补充；`getSnapshot()` 为 `MapSnapshot | null`。
4. [Essentials Local 测试包与生成计划](./RPG_MAP_ESSENTIALS_LOCAL_TEST_PACKAGE_MIGRATION_PLAN.md)：文件范围、真实/合成素材生产、分 PR 交付与测试矩阵。其全地图 Bridge 审计、旧版数据准入与静态 NPC 碰撞暂缓等旧范围，按第 1 项缩减或更新。

**实现闭环：**完整脚本生成和校验新版 FSDB → Map21 Bridge 映射 → 唯一 Runtime 与 Builder/Handler → 初始与运行期 NPC `setNPC`（静态阻挡和指定图像帧）→ 一致的场景提交/失败处理 → 原创自动化与合法本地真实消费者验证。

对外 API 真正发布前须将第 1 项新增的 NPC 字段及规则合入 TypeScript 声明和自动化测试。以上链接不证明源码已更新，尤其不代表已经运行真实素材 E2E。