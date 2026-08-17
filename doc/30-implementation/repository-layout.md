# 仓库与目录方案

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Experimental  
> 主要定义：monorepo 的物理目录、workspace 分类、依赖方向与测试布局  
> 依赖：[独立分包与发布架构](./package-architecture.md)、[模块设计目录](../20-modules/README.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-17

公开 package 的职责与发布边界以 [独立分包与发布架构](./package-architecture.md) 为权威来源。本文只回答：**代码在仓库里如何组织，以及不同 workspace 之间如何依赖。**

```text
Protocol boundary != npm package boundary != runtime process boundary != platform boundary
```

---

## 1. 推荐顶层结构

```text
packages/
├── wire/
├── runtime-control/
├── renderer-control/
├── data/
├── content/
├── game-package/
│
├── main/
├── subsystem/
├── renderer/
├── content-service/
│
├── launcher-node/
├── transport-websocket/
├── transport-messageport/
├── content-fs/
├── content-http/
├── content-service-worker/
│
├── map/
└── map-essentials/

apps/
├── desktop/
├── pwa/
└── cli/

tests/
├── fixtures/
├── subsystems/
├── integration/
└── e2e/

scripts/
doc/
```

这是一张**目标边界图**，不是要求一次性建立全部空目录。第一阶段按 vertical slice 实际需要逐步创建。

---

## 2. `packages/`：可独立消费的能力

`packages/` 默认用于满足至少一个条件的 workspace：

```text
可独立发布
可独立被其他 workspace 消费
有稳定 public API
有独立 test/conformance surface
```

包按三类组织，但物理上不强制增加额外层级目录：

```text
contract/capability
    wire / runtime-control / renderer-control / data / content / game-package

runtime/role
    main / subsystem / renderer / content-service

technical adapter
    launcher-node / transport-* / content-*
```

业务 Subsystem/兼容层如 `map` 也可以是独立 package，但 Core 不得依赖它们。

---

## 3. `apps/`：Composition Root

Desktop/PWA 默认不作为大而全公共 library package。

```text
apps/desktop
    选择 Node launcher / WebSocket / HTTP / filesystem 等实现
    构造 Main / Renderer / Content Service
    注入配置与 bootstrap material
    负责产品 startup/shutdown

apps/pwa
    选择 Worker / MessagePort / Service Worker / OPFS 等实现
    构造 Main / Renderer
    注入浏览器环境能力
    负责产品 startup/shutdown
```

App 可以包含很薄的平台 glue，但不得重新实现 protocol/domain semantics。

如果未来某段平台 glue 被多个产品真正复用，再根据 [分包判断标准](./package-architecture.md#2-拆包判断标准) 抽成独立 adapter package，而不是预先建立 `host-desktop` / `host-pwa` 万能包。

---

## 4. `tests/`：不发布的系统验证

仓库级测试不作为 npm package 发布。

建议：

```text
tests/fixtures
    package/game/content samples
    transport-independent traces

tests/subsystems
    test Runtime implementations
    crash/divergence/late-response scenarios

tests/integration
    Main ⇄ Subsystem
    Main ⇄ Renderer
    Renderer ⇄ Subsystem

tests/e2e
    Desktop vertical slice
    PWA vertical slice
```

协议自身可复用的 conformance fixture/helper 跟随最接近的 capability package，通过 `*/testing` subpath 暴露。

---

## 5. 推荐依赖方向

```text
wire
  ↑
contract/capability
  ↑
runtime/role
  ↑
technical adapter
  ↑
apps / product composition
```

典型：

```text
main
    → runtime-control
    → renderer-control
    → game-package

subsystem
    → runtime-control
    → data
    → content

renderer
    → renderer-control
    → data
    → content

map
    → subsystem

launcher-node / transport-* / content-*
    → 最小必要 lower-level interface

apps/*
    → 选择并组合上述 packages
```

禁止形成：

```text
contract → role implementation
main → desktop/pwa app
subsystem → desktop/pwa adapter
renderer-control → renderer
runtime-control → main
Core → map
```

---

## 6. Runtime Control 的包内边界

以下协议不再一文档一包：

```text
Subsystem Control v1
Frame / Call v1
Runtime Control Application Profile v1
```

统一由：

```text
@loomrealm/runtime-control
```

实现，但使用内部目录/subpath 保持语义隔离：

```text
src/control/
src/frame/
src/profile/
src/testing/
```

共享 package 不代表共享 protocol version、authority 或 lifecycle。

---

## 7. Renderer ⇄ Subsystem Data 的包内边界

以下能力统一位于：

```text
@loomrealm/data
```

```text
src/connection/
src/input/
src/render/
src/testing/
```

必须继续保持：

```text
Data Connection != User Input != Render Update
```

包合并只用于减少发布碎片和重复基础代码，不允许把 sequencing/recovery/lifecycle 合成一个协议。

---

## 8. Game Package

不再建立：

```text
game-package-contract-v1
game-package implementation
```

两套 package。

统一为：

```text
@loomrealm/game-package
```

内部同时提供 schema/types/parser/validator/tooling-safe helpers。npm semver 与 Game Package protocol version 独立。

---

## 9. Platform Adapter

平台差异按技术能力落到 adapter：

```text
Desktop
    launcher-node
    transport-websocket
    content-fs
    content-http

PWA
    transport-messageport
    content-service-worker
```

这些包不得承担 Main authority，也不得把 transport bootstrap material塞回 Subsystem `ready`、Renderer Authority Snapshot 或业务 payload。

---

## 10. Package 内建议结构

公开 TypeScript package 默认：

```text
packages/<name>/
├── package.json
├── tsconfig.json
├── README.md
├── src/
├── test/
└── dist/          // build output，不提交或按仓库策略处理
```

如存在 conformance：

```text
src/testing/
test/conformance/
```

通过 `exports` 显式限制 public surface，禁止消费者依赖内部相对路径。

---

## 11. 构建与发布

推荐 monorepo root 提供：

```text
依赖图构建
changed-package test
pack dry-run
consumer smoke test
independent publish eligibility
```

Package build 必须按照 workspace dependency graph，而不是用手写固定顺序维持隐含耦合。

协议 version 独立于 package semver；只有 package 明确通过其支持版本的 conformance fixture 后，才声明 protocol/profile conformant。

---

## 12. 第一阶段创建顺序

不需要先创建全部 package。优先按 vertical slice：

```text
wire
→ game-package
→ runtime-control
→ main + subsystem
→ launcher-node + transport-websocket
→ renderer-control + data + renderer
→ content + content-service + content-fs/http
→ map
→ desktop app

随后补：
transport-messageport + content-service-worker + pwa app
```

在实现中发现真正共享的 capability 后再抽包；不为预测性的复用创建空 adapter。

---

## 13. 关键规则

1. package 按能力/消费者拆，不按协议文件数量拆；
2. Desktop/PWA 是 composition root，不是默认公共万能包；
3. 技术差异落在 `launcher-* / transport-* / content-*` adapter；
4. Main/Subsystem/Renderer 是角色包，不依赖平台 App；
5. `wire` 保持无业务 authority；
6. `map` 等业务 Subsystem 只能向 Core 依赖，Core 不反向依赖；
7. npm package semver 与 protocol version 分离；
8. workspace 合包不得改变正式契约的 domain boundary；
9. 测试用 Runtime/E2E 默认不发布；
10. 新增包前先证明独立消费者、独立职责和独立发布价值。
