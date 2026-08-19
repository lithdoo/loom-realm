# 仓库与目录方案

> 层级：实施计划  
> 状态：Draft / Tracking  
> 稳定程度：Experimental  
> 主要定义：monorepo 物理目录、workspace 分类、Platform Composition Root、依赖方向与测试布局  
> 依赖：[平台组合系统](../10-architecture/platform-composition-system.md)、[独立分包与发布架构](./package-architecture.md)、[模块设计目录](../20-modules/README.md)、[正式契约目录](../15-contracts/README.md)  
> 最近复核：2026-08-19

公开 package 的职责与发布边界以 [独立分包与发布架构](./package-architecture.md) 为权威来源。本文只回答：**代码在仓库里如何组织。**

```text
Protocol boundary
!= npm package boundary
!= runtime process boundary
!= platform boundary
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
├── platform/
└── e2e/

scripts/
doc/
```

这是目标边界图，不要求一次性创建全部空目录。

---

## 2. `packages/`：可独立消费能力

`packages/` 默认用于至少满足一项：

```text
可独立发布
可被多个 workspace 消费
有稳定 public API
有独立 test/conformance surface
```

逻辑分类：

```text
contract/capability
    wire / runtime-control / renderer-control / data / content / game-package

runtime/role
    main / subsystem / renderer / content-service

technical adapter
    launcher-node / transport-* / content-*

business
    map / compatibility packages
```

物理上不强制再增加分类目录。

---

## 3. Role Package 的 Platform Port Surface

Main/Subsystem/Renderer 保持 platform-neutral，但需要消费 system Platform 的 role-local ports。

建议按 package 自身职责放 integration surface，例如：

```text
packages/main/src/platform/
packages/subsystem/src/platform/
packages/renderer/src/platform/
```

或通过 explicit subpath export：

```text
@loomrealm/main/platform
@loomrealm/subsystem/platform
@loomrealm/renderer/platform
```

只有真实外部 adapter/composition 需要的 types 才公开；author-facing main entry 不应 re-export `MessageCarrier`、bootstrap mechanics 等底层细节。

System-level `DataConnectionBroker` 等跨角色 coordination 不应被错误放进某个单一 role 的 author surface。

---

## 4. `apps/`：System Platform Composition Roots

Desktop/PWA 是系统级 Platform realizations，而不是“大而全公共 library”。

### `apps/desktop`

实现 Hostra Desktop Platform Composition：

```text
Runtime Hosting       Node child process
Runtime Control       localhost WebSocket
Renderer Hosting      Hostra/Electron BrowserWindow
Renderer Control      localhost WebSocket
Data Broker           authenticated localhost carrier
Content               filesystem + localhost HTTP
```

代码职责：

```text
select packages/adapters
construct Main-facing/Renderer-facing/Subsystem-facing ports
inject config/bootstrap material
coordinate Data Connection endpoints
start/stop product resources
```

### `apps/pwa`

实现 PWA Platform Composition：

```text
Runtime Hosting       Dedicated Worker
Runtime Control       MessagePort
Renderer Hosting      browser Window
Renderer Control      MessagePort
Data Broker           MessageChannel / Port transfer
Content               Fetch + Service Worker / OPFS
```

App glue 不得重新实现 Frame/Input/Render protocol semantics。

---

## 5. Optional Platform Helper

不预创建：

```text
packages/platform-hostra/
packages/platform-pwa/
```

如果以后同一 platform glue 被多个独立 product/app 消费，再按 package architecture 标准抽取。

若抽取，apps 仍是最终 composition root：

```text
apps/desktop
    → optional platform-hostra helper
    → role/capability/adapters
```

而不是让 Main/Renderer/Subsystem 直接依赖 platform helper。

---

## 6. Technical Adapter Placement

```text
packages/launcher-node/
packages/transport-websocket/
packages/transport-messageport/
packages/content-fs/
packages/content-http/
packages/content-service-worker/
```

Adapter 实现单一技术能力，不拥有完整 Platform topology。

例如：

```text
transport-messageport
    provides carrier mechanics

apps/pwa Data broker glue
    creates/transfers matching MessageChannel endpoints
    binds current Session/Renderer/subsystem/generation
```

不要把 Data broker authority/coordination 全塞进 transport package。

---

## 7. Business Package Placement

```text
packages/map/
```

只依赖：

```text
@loomrealm/subsystem
```

不包含：

```text
Desktop entry
PWA Worker entry
WebSocket/MessagePort selection
Hostra bootstrap
```

若产品需要 map-specific entry wrapper，应放在 `apps/*` 或极薄 app integration code。

---

## 8. `tests/`：系统验证

仓库级测试不发布。

```text
tests/fixtures
    package/game/content samples
    transport-independent traces

tests/subsystems
    test business Runtime definitions
    crash/divergence/late-response scenarios

tests/integration
    Main ⇄ Subsystem
    Main ⇄ Renderer
    Renderer ⇄ Subsystem
    role-facing port fakes

tests/platform
    Hostra/Desktop adapter/broker integration
    PWA Worker/Port adapter/broker integration
    abstract-trace equivalence harness

tests/e2e
    Desktop vertical slice
    PWA vertical slice
```

可复用 protocol conformance fixture/helper 跟随最接近 capability package。

---

## 9. Dependency Direction

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

technical adapters
    → minimal required contract/interface

apps/*
    → roles + adapters + business packages
```

禁止：

```text
contract → role implementation
main → apps/desktop|pwa
subsystem → transport-websocket|messageport
renderer → Hostra/PWA composition
map → platform adapter
runtime-control → main
Core → map
```

---

## 10. Runtime Control 包内边界

```text
packages/runtime-control/
└── src/
    ├── control/
    ├── frame/
    ├── profile/
    └── testing/
```

共享 package 不代表共享 protocol version/authority/lifecycle。

---

## 11. Data 包内边界

```text
packages/data/
└── src/
    ├── connection/
    ├── input/
    ├── render/
    └── testing/
```

必须保持：

```text
Data Connection != User Input != Render Update
```

User Input implementation 使用 Frame Interest Registry；connection/render/input state 不因为同 package 而合并生命周期。

---

## 12. Package 内建议结构

公开 TypeScript package 默认：

```text
packages/<name>/
├── package.json
├── tsconfig.json
├── README.md
├── src/
├── test/
└── dist/
```

role package 如果有 integration ports：

```text
src/platform/
src/internal/
```

通过 `exports` 限制 public surface，禁止消费者依赖内部相对路径。

---

## 13. 第一阶段创建顺序

按 vertical slice 实际需要：

```text
wire
→ game-package
→ runtime-control
→ main + subsystem
→ launcher-node + transport-websocket
→ desktop role-facing ports/fakes
→ renderer-control + data + renderer
→ Desktop Data broker glue
→ content + content-service + content-fs/http
→ map
→ apps/desktop vertical slice

随后：
transport-messageport + content-service-worker
→ PWA role-facing port implementations
→ PWA Data broker glue
→ apps/pwa
→ cross-platform abstract-trace equivalence
```

不为预测性复用创建空 adapter/platform package。

---

## 14. 关键规则

1. package 按 capability/consumer 拆，不按协议文件数量或平台拆；
2. Platform Composition 是系统架构，`apps/desktop` / `apps/pwa` 是当前 realization roots；
3. role packages 通过 role-facing ports 保持 platform-neutral；
4. technical adapters 实现技术能力，不拥有完整 Platform authority/topology；
5. business package 只依赖 platform-neutral role SDK；
6. `wire` 保持无 domain authority；
7. npm semver 与 protocol version 分离；
8. workspace 合包不得改变正式 contract domain boundary；
9. 新 package 前先证明独立消费者/职责/发布价值；
10. Hostra/PWA physical layout不同但 application trace必须等价。
