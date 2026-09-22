# RPGMap v1：设计与 Agent 实施阅读入口

> **2026-09-22：v1 已按冻结需求完成 Runtime、数据生成、安全重导入和总验收。** 旧 MapAction 回退、全图真实 Bridge 转换、非阻挡 NPC 和非 nullable 快照只留 Git 历史。

按下列顺序阅读，避免多份文件重复定义同一接口：

1. [设计闭环及产品状态](./RPG_MAP_V1_FINAL_SCOPE_AND_CLOSURE.md)：交付范围、与 Subsystem/Content/Renderer/Hostra 的边界、设计冻结与产品闭环的区别。
2. [主方案](./RPG_MAP_GENERIC_MODULE_DESIGN.md)：唯一新版 Map、固定 Map21 Bridge、Ledge、NPC 最小定义以及碰撞/传送业务顺序；不维护第二套 API。
3. [唯一 API/执行/Renderer 合同](./RPG_MAP_PUBLIC_API_V1_EXECUTION_CONTRACT.md)：包根 Builder/Error/类型、方向/错误/快照/取消/fatal、多 Sprite、NPC 内部 key 永不复用及提交前容量检查；**业务 instanceId 不是 RenderNode key**。
4. [Agent 与 Essentials Local 端到端实施计划](./RPG_MAP_ESSENTIALS_LOCAL_TEST_PACKAGE_MIGRATION_PLAN.md)：源码和脚本清单、A→B→C→D 检查点、离线计划命令与已有回归、独立 `.local` staging/Presentation 同步/正式 FSDB 中断恢复、证据格式。

交付主链：全库新版 FSDB/Map21 安全转换与原创夹具 → 单 Runtime Builder/Handler → 静态阻挡 NPC + 4×4 帧 → RenderManager 合法拓扑/容量 → Browser 多 Sprite 实际可见 → 独立 staging 安全重导入 → 合成及真实 E2E 证据。

**交付证据必须来自实际验证。** `mapEntered` 不代表 Browser 绘制成功；`npm run test:rpgmap:v1` 是离线总入口，真实 v21.1 重导入与既有 M14/M15 回归提供独立证据。缺合法真实素材/Hostra/Electron 时本地项必须标记 NOT RUN，不能用合成测试替代；只有实际提交 SHA、运行命令、退出码与观察结果能证明产品交付。
