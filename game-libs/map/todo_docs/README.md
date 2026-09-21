# RPGMap v1：唯一设计阅读入口

> 2026-09-21：已将此前的覆盖型补充、旧签名和互相冲突的段落**直接整合**回下列正文。**设计闭环 ≠ 实现／测试闭环**；实际能力只看 `game-libs/map/src`、数据生成器、真实消费者和明确提交的测试记录。

建议依次阅读：

1. [设计闭环及实施状态](./RPG_MAP_V1_FINAL_SCOPE_AND_CLOSURE.md)：本次最终范围、合同归属、尚未交付事项。
2. [RPGMap 主方案](./RPG_MAP_GENERIC_MODULE_DESIGN.md)：唯一新版 Map、仅 Map21 Bridge 真实转换、Ledge、NPC 最小定义、移动/传送次序。
3. [公开 API 执行契约](./RPG_MAP_PUBLIC_API_V1_EXECUTION_CONTRACT.md)：唯一的 Builder/Handler 目标签名，pattern 默认值、碰撞、事务、取消、RenderDomain fatal 与快照。
4. [本地测试包与生成计划](./RPG_MAP_ESSENTIALS_LOCAL_TEST_PACKAGE_MIGRATION_PLAN.md)：PR A–D 文件任务、真实/原创数据分工及验收矩阵。

2026-09-21 之前的文档正文可在 Git 历史查看，不应将旧版 MapAction 回退、全图真实 Bridge 审计、非阻挡 NPC 或非 nullable `getSnapshot()` 继续视为现行规则。**本轮仅完成文档统一，尚未修改运行时代码、素材生成脚本，也未运行测试。**
