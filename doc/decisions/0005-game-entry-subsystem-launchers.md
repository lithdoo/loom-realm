# ADR 0005：Game Entry 声明 Subsystem Launcher

> 状态：Accepted  
> 日期：2026-08-02  
> 影响范围：游戏包、LoomRealm Main、Runtime Bootstrap、桌面 Subsystem Process、PWA System Worker

## 背景

旧设计由运行平台提供 System Registry，游戏入口只声明初始 `systemId + params`，并明确禁止游戏包携带可执行 Subsystem。

该模型无法完整描述一个游戏运行时到底依赖哪些 Subsystem、每个 Subsystem 如何启动、启动时需要哪些环境变量，也使 Main 无法从 Game Entry 单独重建当前会话的完整进程拓扑。

同时，Main ⇄ Subsystem Control WebSocket 的 Bootstrap 方向没有冻结：Main 可以反向连接子进程，也可以先开放统一 Control Endpoint 让子进程主动连接。

## 考虑过的方案

### 平台固定 System Registry

优点：运行平台控制所有可执行实现，安全边界简单。

代价：游戏包不能自描述运行拓扑；不同游戏需要的 Subsystem 组合必须提前安装或硬编码在平台中；启动参数和实现入口缺少统一来源。

### 子系统自行开放控制端口，Main 反向连接

优点：每个子系统可以独立选择自己的监听方式。

代价：Main 必须发现随机端口；Bootstrap 多一步 endpoint 回报；跨语言 Process Adapter 更复杂。

### Game Entry Descriptor + Main 启动 + Subsystem 主动连接 Main

优点：游戏入口完整描述运行拓扑；Main 统一控制 Launcher 与安全检查；子进程只需要获得一个 Main Control Endpoint；不同语言实现可以共享相同控制协议。

代价：Game Package Contract 需要新版本；Launcher 成为新的受控执行边界；不同平台必须明确支持哪些 Launcher Profile。

## 决定

采用：

```text
Game Entry
├── initial call
└── subsystem descriptors
    ├── id
    ├── name
    ├── launcher
    └── env
```

LoomRealm Main 在会话 Bootstrap 中读取全部 Descriptor，并启动全部声明 Subsystem。

桌面第一阶段 Launcher Profile 为明确声明的 JavaScript Entry。未来可以增加 Shell、Native Executable 或其他 Profile，但每个平台可以明确拒绝 unsupported Profile。

Main 启动 Subsystem Process 时通过保留环境注入至少以下概念信息：

```text
systemId
Main Control Endpoint
```

以及 Descriptor 自己声明的环境变量。游戏环境变量不能覆盖 LoomRealm 保留变量。

Main 先开放 Control WebSocket Server，Subsystem Process 启动后主动连接 Main：

```text
Subsystem Process
    ── connect ──▶ Main Control Endpoint
```

Control Connection 建立不等于 Subsystem ready。只有 Subsystem 完成自身初始化并发送与启动 Descriptor 相同 `systemId` 的 `ready` 后，Main 才将 Runtime Container 标记为 ready。

## 结果

- Game Entry 成为当前会话 Subsystem 拓扑的权威声明来源；
- Main 不需要为每个子进程发现独立 Control Endpoint；
- Runtime Container Registry 区分 `declared / starting / connected / ready`；
- Game Package Contract v1 的“游戏包不携带可执行 Subsystem”结论需要版本迁移；
- Content API 继续保持只读数据接口，Launcher 是 Main 的独立特权能力；
- PWA 只支持浏览器可实现的 Launcher Profile。

## 安全要求

- 只有 Game Entry 明确声明的 Subsystem 可以被 Launcher 启动；
- Launcher Entry 必须经过安装根目录边界校验；
- Descriptor env 不能覆盖 LoomRealm 保留身份 / Control Endpoint；
- `ready(systemId)` 必须与 Descriptor 一致；
- 允许受控 Launcher 不意味着 Renderer 或 Subsystem 获得任意文件执行权限。

## 重新评估条件

- 需要按需懒启动而不是启动时启动全部 Subsystem；
- 引入 Subsystem Package Manager / 签名系统；
- 引入远程 Subsystem；
- PWA 与桌面 Launcher 模型需要完全不同的 Descriptor；
- 一个 `systemId` 需要同时启动多个 Runtime Container 实例。
