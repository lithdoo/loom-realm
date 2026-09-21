# RPGMap v1：设计与 Agent 实施阅读入口

> **2026-09-22：第一版需求和实施接口作为设计基线冻结；实现/测试/真实 E2E 未通过，不能称为产品闭环。** 现行正文只有以下四个入口；旧 MapAction 运行时回退、全图真实 Bridge 转换、非阻挡 NPC、非 nullable 快照等旧讨论只留 Git 历史。

建议按顺序阅读：

1. [闭环范围及状态](./RPG_MAP_V1_FINAL_SCOPE_AND_CLOSURE.md)：第一版明确交付什么、何时才能宣告完成，以及环境缺失时如何如实报告。
2. [RPGMap 主方案](./RPG_MAP_GENERIC_MODULE_DESIGN.md)：唯一新版地图、Map21 Bridge、Ledge、NPC 最小定义及碰撞/传送的产品行为。**不维护另一套 API 签名。**
3. [唯一公开接口执行契约](./RPG_MAP_PUBLIC_API_V1_EXECUTION_CONTRACT.md)：包根 Builder/Handler/Error 导出、方向默认、稳定错误码、诊断、生命周期、事务/fatal、`pattern`、Browser 多 Sprite 内部投影。Agent 不得私自改公共合同。
4. [Agent 完整实施与验收计划](./RPG_MAP_ESSENTIALS_LOCAL_TEST_PACKAGE_MIGRATION_PLAN.md)：源码/脚本文件清单、同一 Agent 按 A→B→C→D 连续实施的检查点、计划新增 `test:rpgmap:v1` 总命令、现有回归命令、真实本地环境和证据格式。

**交付路径：**整库新 FSDB/Map21 转换及原创夹具 → 一个 Runtime 的 Builder/Handler → 静态阻挡 NPC + 多图像帧 → Browser 多 Sprite 与显示失败观察 → 本地消费者/安全重导入 → 合成与真实 E2E 证据。`mapEntered` 的同步 Domain 成功不代表 Browser 真实绘制成功；真实素材不存在时相关验收为 NOT RUN，不得写 PASS。

本文和相关文档本身不提供已编译的新 Map 包；必须以实际源码、提交 SHA、测试命令、退出码及真实观察证明交付。
