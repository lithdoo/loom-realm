# RPGMap v1：设计与 Agent 实施阅读入口

> **2026-09-22 状态：v1 实现已提交至开发分支；正在进行减法优先的最终结构收敛。** 本目录的「已完成」历史状态文字不是当前 HEAD 的独立测试或真实 E2E 通过证明。源码修改、测试及合并需单独取证。

按以下顺序阅读；各文档分工，不并列发明第二套公开接口：

1. [主方案](./RPG_MAP_GENERIC_MODULE_DESIGN.md)：唯一新版 Map、固定 Map21 Bridge、Ledge、NPC 最小定义以及碰撞/传送业务顺序，业务范围仍冻结。
2. [唯一公开 API 与执行契约](./RPG_MAP_PUBLIC_API_V1_EXECUTION_CONTRACT.md)：Builder/Error/类型、Frame 生命周期、取消、提交/fatal、Renderer key 与容量、多 Sprite 的不可退化要求。
3. [减法优先的整体简化与最终验证方案](./RPG_MAP_V1_SIMPLIFICATION_AND_CONVERGENCE_PLAN.md)：**当前优化执行入口**，专门决定本地 FSDB 工具的简化承诺、重复实现删除、职责归属、保留底线、实施顺序及最终验证。它取代旧实施计划中有关自动崩溃恢复、锁、事务日志和自动接管的实施要求；不改变上述业务与公开 API 契约。实施时需同步清理旧文档中的冲突与过时状态。
4. [设计闭环及交付状态](./RPG_MAP_V1_FINAL_SCOPE_AND_CLOSURE.md)：原冻结范围及框架边界；其中历史实施进度与恢复细节以本次实际验证和简化方案更新为准。
5. [Essentials Local 原 A→D 实施计划](./RPG_MAP_ESSENTIALS_LOCAL_TEST_PACKAGE_MIGRATION_PLAN.md)：原文件清单、范围和测试覆盖可作参考；**旧的多阶段恢复和自动锁要求已撤回**，不得按历史文字重新造出相关系统。

交付主链仍为：全库新版 FSDB/Map21 安全转换与原创夹具 → 单 Runtime Builder/Handler → 静态阻挡 NPC + 4×4 帧 → RenderManager 合法拓扑/容量 → Browser 多 Sprite 实际可见 → 独立 staging 验证、最小备份切换 → 合成及真实 E2E 证据。简化的是冗余机制，不是已冻结的核心功能。

**交付证据必须来自实际运行。** `mapEntered` 不代表 Browser 绘制成功；`npm run test:rpgmap:v1` 是离线总入口。缺合法真实素材、Hostra 或 Electron 时真实项写 `NOT RUN`，不可用合成测试替代；最终 SHA、命令、退出码和观察结果才构成交付依据。
