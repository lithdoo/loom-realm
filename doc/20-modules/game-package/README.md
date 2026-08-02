# 游戏包与内容模块设计

> 层级：模块设计  
> 状态：Active Design  
> 稳定程度：Experimental  
> 主要定义：Manifest / Entry / Descriptor Loader、Catalog、Repository、资源和 Validator 的模块边界  
> 依赖：[存储与内容系统](../../10-architecture/storage-system.md)、[运行时启动与连接建立系统](../../10-architecture/runtime-bootstrap-system.md)  
> 最近复核：2026-08-02

## 1. 建议模块

```text
Game Package
├── Safe Package Root
├── Manifest Loader
├── Entry Loader
├── Subsystem Descriptor Loader / Validator
├── Catalog Builder
├── Repository Toolkit
├── Resource Metadata Service
└── Package Validator
```

Launcher 的进程 / Worker 创建属于 Main / Runtime Supervisor，不属于 Game Package Loader。

## 2. Safe Package Root

统一处理普通内容路径规范化、包内约束和链接逃逸检查。其他内容模块不得自行拼接未经验证的本机路径。

注意：`launcher.entry` 的最终路径基准与安全规则仍待 Game Package / Launcher Contract 冻结。现有 Safe Package Root 规则不能未经评审直接宣称为 Launcher Entry 的稳定协议保证。

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

Desktop MVP 至少识别：

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

- 校验 Descriptor 公共结构；
- 检测重复 `key`；
- 校验当前 Host Profile 支持的 Launcher Type；
- 校验 env 类型和保留字段冲突；
- 确保 initial target 引用已声明 Subsystem；
- 将规范化 Descriptor 集合交给 Main Descriptor Registry。

不负责：

- spawn Node.js Process；
- 生成 Bootstrap Token；
- 建立 Control Connection；
- 解释 `launcher.entry` 当前未冻结的最终路径语义。

## 6. Catalog Builder

扫描必要 Namespace 和轻量元数据，建立逻辑 ID 到安全内容位置的索引，不读取全部地图和图片主体。

Catalog 处理内容身份，不承担 Subsystem Launcher Registry。

## 7. Repository Toolkit

为具体 Subsystem 提供只读 Repository 基础能力：

- 异步读取；
- 解析和局部校验；
- 同 ID 并发去重；
- Container 级缓存；
- 不可变返回值；
- 关闭和取消。

具体业务 Repository 属于对应 Subsystem。

## 8. Resource Metadata Service

只处理逻辑资源元数据、MIME、Content Version 和 Package Index 关系。资源主体由 Content API 交付。

它不生成 Render State，也不绑定 Frame 生命周期。

## 9. Package Validator

`validate`：

```text
Manifest / Entry
→ Descriptor 公共结构
→ initial target references
→ Launcher Type support profile
→ env reserved-key conflicts
→ 内容强引用
→ Catalog / Package Index
```

Validator 聚合错误，不创建正式 Frame，也不运行正式会话。

`launcher.entry` 的物理解析与安全检查只有在该契约冻结后才能成为跨实现一致的 Validator 要求。

## 10. 核心不变量

- Game Entry 一次性暴露当前会话全部 Subsystem Descriptor；
- Desktop MVP Descriptor identity = `key`；
- Desktop MVP Launcher Type = `nodejs`；
- Game Package 模块只加载/校验 Descriptor，不启动进程；
- Launcher 是 Main 特权能力；
- 游戏包运行期间只读；
- Content API 与 Launcher 是不同能力边界；
- 公共 Loader 不解释业务 params；
- Catalog 不保存大型主体；
- Repository 不进入 Runtime Core；
- 物理路径不进入 Render State；
- 所有解析输入都有大小和深度限制。

## 11. 测试入口

- Manifest / Entry 成功与失败；
- duplicate Descriptor key；
- unsupported Launcher；
- initial target 指向未声明 Subsystem；
- descriptor env 覆盖保留字段；
- 内容路径穿越和符号链接；
- Catalog 不读取大型资源主体；
- Repository 并发去重；
- `validate` 聚合错误；
- Game Package Loader 不产生 Process / Worker 副作用。