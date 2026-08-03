# 游戏包与内容模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Manifest / Entry / Descriptor Loader、Launcher Entry 校验、Catalog、Repository、资源和 Validator 的模块边界  
> 依赖：[存储与内容系统](../../10-architecture/storage-system.md)、[Game Package v2](../../15-contracts/game-package-v2.md)、[Desktop Node.js Launcher Profile v1](../../15-contracts/nodejs-launcher-profile-v1.md)  
> 最近复核：2026-08-03

## 1. 建议模块

```text
Game Package
├── Safe Package Root
├── Manifest Loader
├── Entry Loader
├── Subsystem Descriptor Loader / Validator
├── Launcher Entry Validator
├── Catalog Builder
├── Repository Toolkit
├── Resource Metadata Service
└── Package Validator
```

Launcher 的 Process / Worker 创建属于 Main / Runtime Supervisor，不属于 Game Package Loader。

## 2. Safe Package Root

Safe Package Root 统一持有可信 Installation Root，并为内容路径与 Launcher Entry 提供底层 canonicalization / containment primitive。

注意：

```text
Content path policy
!=
Launcher executable path policy
```

二者可以复用安全路径 primitive，但 MUST 由各自正式契约决定允许的输入和能力。

其他模块不得自行拼接未经验证的本机路径。

## 3. Manifest Loader

- 读取 UTF-8 JSON；
- 校验格式、版本和公共字段；
- 返回规范化 Manifest；
- 不加载大型内容主体；
- 不启动 Subsystem。

## 4. Entry Loader

负责：

- 读取和校验 Game Entry 公共结构；
- 解析 initial target；
- 读取全部 `subsystems[]`；
- 保留业务调用 `params` 原样；
- 不解释地图或其他 Subsystem 业务字段。

## 5. Subsystem Descriptor Loader / Validator

Desktop v1 识别：

```ts
interface SubsystemDescriptor {
  readonly key: string;
  readonly launcher: {
    readonly type: "nodejs";
    readonly entry: string;
  };
  readonly env?: Readonly<Record<string, string>>;
}
```

职责：

- 校验 Descriptor Schema；
- 检测重复 `key`；
- 校验当前 Host Profile 支持的 Launcher Type；
- 校验 `launcher.entry` 逻辑语法；
- 校验 env 数量、Key/Value 和保留字段；
- 确保 initial target 引用已声明 Subsystem；
- 将规范化 Descriptor 集合交给 Main Descriptor Registry。

必须在任何业务 Subsystem Process spawn 前完成 Descriptor 集合级校验。

不负责：

- spawn Node.js Process；
- 生成 Bootstrap Token；
- 建立 Control Connection；
- 选择具体 Node executable。

## 6. Launcher Entry Validator

按照 [Game Package v2](../../15-contracts/game-package-v2.md) 与 [Node.js Launcher Profile v1](../../15-contracts/nodejs-launcher-profile-v1.md) 验证 Desktop executable Entry：

```text
entry syntax
→ Installation-relative resolution
→ reject symlink / junction / reparse redirect
→ regular-file check
→ canonical containment
→ supported extension (.js / .mjs / .cjs)
```

安装 / `validate` SHOULD 提前遍历全部 required Entry；正式 `start` MUST 在对应 Process spawn 前再次保证目标仍满足契约。

Validator 返回逻辑验证结果或 Host-private resolved target，不把物理路径暴露给业务模块。

## 7. Catalog Builder

扫描必要 Namespace 和轻量元数据，建立逻辑 ID 到安全内容位置的索引，不读取全部地图和图片主体。

Catalog 处理内容身份，不承担 Subsystem Launcher Registry，也不把 executable Entry 注册成普通 Resource。

## 8. Repository Toolkit

为具体 Subsystem 提供只读 Repository 基础能力：

- 异步读取；
- 解析和局部校验；
- 同 ID 并发去重；
- Container 级缓存；
- 不可变返回值；
- 关闭和取消。

具体业务 Repository 属于对应 Subsystem。

## 9. Resource Metadata Service

只处理逻辑资源元数据、MIME、Content Version 和 Package Index 关系。资源主体由 Content API 交付。

它不生成 Render State，也不绑定 Frame 生命周期。

## 10. Package Validator

`validate`：

```text
Manifest / Entry
→ Descriptor Schema
→ duplicate key
→ initial target references
→ Launcher Type support
→ Launcher Entry syntax + physical safety
→ env reserved-key conflicts
→ case-collision checks
→ 内容强引用
→ Catalog / Package Index
```

Validator 聚合错误，不创建正式 Frame，也不运行正式会话。

Descriptor 集合级错误 MUST 保证没有 Process / Worker side effect。

## 11. Trust Boundary

Game Package 与 Launcher 的安全责任必须分开：

```text
Package Validator
    校验声明、路径与内容输入

Main Launcher
    执行已验证 Entry

Desktop Node.js Process
    trusted executable code
    v1 不提供 OS sandbox
```

因此 Game Package 模块不能宣称“Entry 路径安全”意味着被执行 JavaScript 没有 OS 文件系统、网络或 child_process 权限。

普通 Content API 仍不暴露任意物理路径或执行能力。

## 12. 核心不变量

- Game Entry 一次性暴露当前会话全部 Subsystem Descriptor；
- Desktop v1 Descriptor identity = `key`；
- Desktop v1 Launcher Type = `nodejs`；
- Game Package 模块只加载/校验 Descriptor，不启动进程；
- Launcher Entry 在 spawn 前按正式契约安全解析；
- Launcher 是 Main 特权能力；
- Game Package 不能提供 Node executable / flags / argv；
- Descriptor env 不能覆盖 `LOOMREALM_*`、`NODE_OPTIONS`、`NODE_PATH`；
- 游戏包运行期间只读；
- Content API 与 Launcher 是不同能力边界；
- 公共 Loader 不解释业务 params；
- Catalog 不保存大型主体；
- Repository 不进入 Runtime Core；
- 物理路径不进入 Render State；
- 所有解析输入都有大小和深度限制。

## 13. 测试入口

- Manifest / Entry 成功与失败；
- duplicate Descriptor key；
- unsupported Launcher；
- initial target 指向未声明 Subsystem；
- absolute / traversal / URL / backslash Entry；
- missing / directory / unsupported extension Entry；
- symlink Entry / symlink ancestor / Installation escape；
- executable namespace case collision；
- descriptor env 覆盖 `LOOMREALM_*` / `NODE_OPTIONS` / `NODE_PATH`；
- Catalog 不读取大型资源主体；
- Repository 并发去重；
- `validate` 聚合错误；
- Descriptor 集合校验失败时 Game Package Loader 不产生 Process / Worker 副作用。
