# Content 与 FSDB（当前实现）

> 当前：M12 已实现；旧 Installation Registry / Repository / StorageAdapter 提案已被 ADR 0030 取代。本页只记录当前模块归属，不恢复旧设计。

## 结构

```text
Hostra PREPARE → immutable prepared installation
→ @loomrealm/fsdb（Node-only 只读 FSDB core）
→ apps/desktop Content Service（授权、Content HTTP）
→ @loomrealm/subsystem ContentClient（游戏作者端）
→ @loomrealm/renderer/resource-client（受信任的渲染集成端）
```

`@loomrealm/fsdb-http` 是独立 FSDB HTTP 投影，不是第二套文件扫描器或通用应用 Content authority。资源按逻辑 identity、版本与能力取用：Content capability 不等于 executable resolver，URL 不等于真实文件路径。失败通过[Content API v1](../../15-contracts/content-api-v1.md)规定的错误表达，不自动结束 Runtime/Frame。

**源码：** `packages/fsdb/`、`packages/fsdb-http/`、`packages/subsystem/`、`packages/renderer/`、`apps/desktop/`。**验证：** `npm run test:m12`、`test:fixtures`、当前 CI。确切 schema/错误/资源生命周期以[Content API v1](../../15-contracts/content-api-v1.md)与[存储系统](../../10-architecture/storage-system.md)为准；历史决策见[ADR 0030](../../decisions/0030-freeze-m12-content-preimplementation-closure.md)。

PWA Content 属后续 M17 physical realization，不能把 Node-only FSDB 机械复制为通用框架。交付与资格状态见[路线图](../../30-implementation/roadmap.md)。
