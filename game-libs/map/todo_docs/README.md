# RPGMap v1：设计与 Agent 实施阅读入口

> **2026-09-22 状态：v1 的减法优先结构收敛已实现。** 本目录不充当某个提交的测试日志；最终 SHA、命令、退出码及真实 E2E 结果以交付报告为准。

按以下顺序阅读；各文档分工，不并列发明第二套公开接口：

1. [主方案](./RPG_MAP_GENERIC_MODULE_DESIGN.md)：唯一新版 Map、固定 Map21 Bridge、Ledge、NPC 最小定义以及碰撞/传送业务顺序，业务范围仍冻结。
2. [唯一公开 API 与执行契约](./RPG_MAP_PUBLIC_API_V1_EXECUTION_CONTRACT.md)：Builder/Error/类型、Frame 生命周期、取消、提交/fatal、Renderer key 与容量、多 Sprite 的不可退化要求。
3. [减法优先的整体简化与最终验证方案](./RPG_MAP_V1_SIMPLIFICATION_AND_CONVERGENCE_PLAN.md)：已实施的简化决策、职责归属、保留底线及最终验收要求；它取代自动崩溃恢复、锁、事务日志和自动接管等旧要求。
4. [设计闭环及交付状态](./RPG_MAP_V1_FINAL_SCOPE_AND_CLOSURE.md)：原冻结范围及框架边界；其中历史实施进度与恢复细节以本次实际验证和简化方案更新为准。
5. [Essentials Local 实施与测试包说明](./RPG_MAP_ESSENTIALS_LOCAL_TEST_PACKAGE_MIGRATION_PLAN.md)：当前文件清单、最小备份切换、人工恢复边界和测试入口。

交付主链仍为：全库新版 FSDB/Map21 安全转换与原创夹具 → 单 Runtime Builder/Handler → 静态阻挡 NPC + 4×4 帧 → RenderManager 合法拓扑/容量 → Browser 多 Sprite 实际可见 → 独立 staging 验证、最小备份切换 → 合成及真实 E2E 证据。简化的是冗余机制，不是已冻结的核心功能。

**交付证据必须来自实际运行。** `mapEntered` 不代表 Browser 绘制成功；`npm run test:rpgmap:v1` 是离线总入口。缺合法真实素材、Hostra 或 Electron 时真实项写 `NOT RUN`，不可用合成测试替代；最终 SHA、命令、退出码和观察结果才构成交付依据。
