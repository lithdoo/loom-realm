# ADR 0007：Subsystem Descriptor MVP 收敛

> 状态：Accepted  
> 日期：2026-08-02  
> 影响范围：Game Entry、Subsystem Descriptor、Runtime Bootstrap、Launcher

## 背景

ADR 0005 已确定 Game Entry 声明 Subsystem Launcher、Main 启动 Subsystem、Subsystem 主动连接 Main Control Endpoint 的总体方向，但当时仍保留了以下未收敛内容：

- Descriptor 同时存在 `id` 和 `name`；
- Launcher Profile 暂称 `javascript`；
- 是否启动时一次读取全部 Descriptor；
- 是否立即启动全部 Subsystem；
- unsupported Launcher 是局部 unavailable 还是整体启动失败；
- 是否需要在 MVP 先冻结 `entry` 的路径基准和安全规则。

这些问题会直接影响 Game Package 新版本和 Main ⇄ Subsystem Bootstrap Protocol，因此先冻结 MVP 语义。

## 决定

### Descriptor 身份

Subsystem Descriptor 只保留一个稳定身份字段：

```ts
interface SubsystemDescriptor {
  readonly key: string;
  readonly launcher: NodejsLauncher;
  readonly env?: Readonly<Record<string, string>>;
}

interface NodejsLauncher {
  readonly type: "nodejs";
  readonly entry: string;
}
```

`key` 必须在 LoomRealm Subsystem 命名空间中全局唯一并保持稳定，例如：

```text
loom.map
loom.menu
```

MVP 不在 Descriptor 中保留独立 `id` 或 `name`。如果以后需要显示名称、本地化标签或描述信息，应作为独立显示元数据增加，不能改变 `key` 的协议身份。

精确字符集、大小写和命名空间格式由后续 Game Package Contract 冻结。

### Descriptor 读取

Main 在一次 Game Bootstrap 中一次性读取 Game Entry 中的全部 Subsystem Descriptor，并在启动任何业务 Subsystem 前建立完整 Descriptor Registry。

同一个 Game Entry 中出现重复 `key` 时启动失败。

### Launcher Profile

MVP 唯一支持的 Launcher Type 为：

```text
nodejs
```

它表示 Main 使用当前 LoomRealm 桌面运行环境选择的 Node.js Runtime 启动明确声明的 `entry`。

MVP 不预定义 `shell`、`executable`、`deno`、`bun` 或其他 Launcher Type。未来增加新 Launcher 时再扩展协议。

只要任一声明的 Subsystem 使用当前 Runtime 不支持的 Launcher Type，整个 Game Bootstrap 失败；不能把该 Subsystem 静默降级为 unavailable 后继续启动会话。

### Eager Bootstrap

MVP 中 Game Entry 声明的全部 Subsystem 都是启动必需项。

```text
read all descriptors
→ validate descriptor set
→ start all declared subsystems
→ wait until all declared subsystems are ready
→ subsystem bootstrap complete
```

Main 可以并行启动多个 Subsystem，但启动完成条件仍然是全部已声明 Subsystem 成功进入 ready。

MVP 不定义 `lazy` 字段，也不实现按首次调用再启动的语义。未来如果出现实际资源需求，可以在新契约中增加显式 `lazy` 或等价字段；不得把当前 eager 行为解释为隐式 lazy。

### `entry` 边界

MVP 暂不冻结 `launcher.entry` 的路径基准、路径安全、安装根边界或解析算法。

这意味着当前文档只确认 Node.js Launcher 存在一个 `entry` 字段，不把任何具体路径解析行为提升为稳定协议保证。相关安全和路径规则必须在进入可执行实现冻结前另行确定。

### 环境变量

Descriptor 可以声明额外 `env`。Main 还会注入 Subsystem 身份、Main Control Endpoint 等 LoomRealm 保留启动环境。

游戏声明的 `env` 不能覆盖 LoomRealm 保留环境。精确保留变量名称仍由后续 Bootstrap Contract 冻结。

## 结果

- Game Entry 可以在启动前提供完整且无歧义的 Subsystem Descriptor Registry；
- Descriptor 的运行身份只有 `key`，不再同时维护 `id` / `name`；
- 当前 Launcher 语义明确为 Node.js，而不是泛化 JavaScript Runtime；
- Main 不需要实现 lazy lifecycle 即可完成 MVP；
- unsupported Launcher 与任一必需 Subsystem 无法 ready 都阻止 Game Bootstrap 完成；
- PWA 如何映射 Subsystem Launcher 不在本 ADR 中冻结，当前 `nodejs` Profile 只覆盖桌面 MVP；
- `entry` 路径和安全边界仍是显式待冻结项。

## 与 ADR 0005 的关系

本 ADR **部分替代** ADR 0005 中以下内容：

- `id + name` Descriptor 结构；
- `javascript` Launcher Profile；
- Launcher Entry 已经拥有冻结路径安全规则的表述；
- 对 lazy / eager 尚未确定的状态。

ADR 0005 中以下结论继续有效：

- Game Entry 声明 Subsystem Launcher；
- Main 负责启动 Subsystem；
- Main 先提供 Control Endpoint；
- Subsystem 主动连接 Main；
- connected 与 ready 分离；
- Descriptor env 不能覆盖 LoomRealm 保留环境。

## 重新评估条件

- 需要按需启动或 idle 回收 Subsystem；
- 引入第二种 Launcher Type；
- 需要为 PWA 定义可互操作的 Launcher Descriptor；
- 需要在 Game Package Contract 中冻结 `entry` 的路径和安全语义；
- 需要显示名称、本地化标签或 Subsystem 元数据。
