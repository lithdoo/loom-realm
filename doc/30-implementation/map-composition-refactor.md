# Map Runtime Composition 解耦改造方案

> 层级：实施方案
> 状态：**Frozen / Implemented / Local Regression PASS / Formal Qualification Pending**
> 基线：`main@17de12435ad0b18c66fa771764ecb4225537aa64`
> 实施 subject：`488f8713a23158e736153677ec68e449879a8a1d`
> 范围：`game-libs/map`、对应 Map tests、M14 vertical qualification harness
> 目标：保留现有 `RPGMapBuilder / RPGMapHandler` 模块化接口，删除 `mapDefinition`、default export 与 Frame-keyed bridge，让 Handler 直接执行唯一的 package-internal Map runtime。
> 相关：[地图模块](../20-modules/loom-map/README.md)、[ADR 0032](../decisions/0032-game-library-example-boundary.md)、[M14 qualification](./m14-qualification.md)、[路线图](./roadmap.md)

本文保留冻结实施规格，并记录其实施结果。下文标注为“实施前基线”的内容描述 executable subject 落地前的状态，不代表当前代码；方案边界仍用于审计本次实现是否偏离冻结设计。

## 实施结果（2026-10-06）

冻结方案已在 executable subject `488f8713a23158e736153677ec68e449879a8a1d` 实施：`RPGMapHandler.run()` 直接调用 package-internal `runMapRuntime()`，Frame-keyed `WeakMap`、direct-definition dual-mode、`mapDefinition` named/default export 均已删除；Builder/Handler、`RuntimeBridge` 语义及 Essentials 业务 topology 保持不变。

实现审计还发现三个冻结清单未列出的 active consumer：`test/m14-boundary.test.mjs`、`test/terrain-behavior-live-product.test.mjs`、`scripts/m14-essentials-local.mjs`。它们只迁移到相同 Builder/Handler 启动路径，未修改业务断言或 fixture；这是删除 `mapDefinition` 后完成必要引用闭环，不是架构 scope expansion，也未引入新功能。

当前 subject 的本地结果：Map package 106/106 PASS，`npm run test:m14` PASS，M15 Desktop 15/15 PASS。M14 exact-local 因现有本地 source-view indirection / source-copy 非法 `.desc.meta` 在 source preflight 失败；本地 M15 Hostra 因冻结 Hostra 缺少 bundled `electron.exe`，10 项非窗口检查 PASS、6 项真实窗口检查 FAIL。Hosted PR run `37449945940` 的 M14 Node 20/24 与 M15 delta 均 PASS；正式资格状态仍以 M14/M15 ledger 的完整同-subject closure rule 为准。

---

## 1. 实施前基线

以下描述为 executable subject 实施前的冻结基线。

实施前 `@loomrealm-game/map` 同时公开两类执行入口：

```text
RPGMapBuilder / RPGMapHandler
mapDefinition（同时作为 default export）
```

实施前 Essentials 业务代码已经使用模块化入口：

```text
Game-owned defineSubsystem(...)
    -> RPGMapBuilder
    -> RPGMapHandler
```

而当时的 `RPGMapHandler.run()` 内部仍通过 Frame-keyed bridge 绕回 `mapDefinition`：

```text
RPGMapBuilder
    -> RPGMapHandler
    -> runtimeBridges.set(frame, handler)
    -> mapDefinition(scope).frame(frame)
    -> runtimeBridges.get(frame)
    -> Map runtime
```

`runtimeBridges: WeakMap<Frame, RuntimeBridge>` 的作用只是暂存 Handler 状态，再让 `mapDefinition.frame()` 取回；这里没有创建新的 Main Frame，也没有发生 `frame.call()`。

实施前还有两个直接依赖 `mapDefinition` 的重要测试入口：

```text
game-libs/map/test/runtime.test.mjs
test/m14-vertical.test.mjs
```

实施前的 `package.test.mjs` 还显式验证 named/default `mapDefinition` export。

冻结基线所在的 `main` 已实现 Realm State v1，并把 `SubsystemScope.state` 加入 author scope；当时的 M14 vertical harness 也已注入 Realm State client。Map 在该基线不消费 `scope.state`，因此该变化不改变本方案的 Map runtime 设计，只改变 M14 harness 的实施前基线。

---

## 2. 唯一目标结构

改造前：

```text
RPGMapBuilder
    -> RPGMapHandler
    -> WeakMap bridge
    -> mapDefinition
    -> Map runtime
```

改造后：

```text
RPGMapBuilder
    -> RPGMapHandler
    -> runMapRuntime(...)
```

必须同时删除：

```text
mapDefinition implementation
mapDefinition named export
mapDefinition default export
runtimeBridges: WeakMap<Frame, RuntimeBridge>
```

Map runtime 此后只有一种启动模型：

```text
caller-owned Frame
    -> RPGMapBuilder
    -> RPGMapHandler
    -> package-internal runtime
```

具体 Game 是否把 Map 放入独立 Subsystem，由 Concrete Game 自己通过 `defineSubsystem(...)` 组合。

---

## 3. 架构边界

依赖方向保持：

```text
examples/*
    ↓
game-libs/map
    ↓
public @loomrealm/subsystem author API
    ↓
packages/*
```

Map 可以继续消费公开的：

```text
SubsystemScope
Frame
ContentClient
InputListener
RenderDomain
Viewport
AbortSignal
```

本次不要求 Map 使用新增的 `SubsystemScope.state`，也不修改 Realm State 行为。

Concrete Game 继续拥有：

```text
Subsystem key
Frame params
Game-specific input mapping
Game Entry topology
```

本次不修改：

```text
Main / Frame authority
Subsystem public ABI
Renderer
Content
Realm State
Game Package
Platform / Hostra / PWA
```

---

## 4. Public API 冻结

### 4.1 保留

```text
RPGMapBuilder
RPGMapHandler
RPGMapError
MapEntry
MapSnapshot
MapEnteredEvent
MapEnteringContext
NPCPlacement
Pattern
RPGMapErrorCode
Direction
```

现有 Handler 行为保持：

```text
onMapEntering()
onMapEntered()
run()
enterMap()
setNPC()
getSnapshot()

run() one-shot
重复 run() 拒绝
Frame abort 终止运行
busy / stale / error 语义保持
snapshot detached/read-only 语义保持
terminal cleanup settle once
```

### 4.2 删除

```text
mapDefinition
mapDefinition as default
```

这是明确的 Map package public API breaking change。实施时 package 仍为 alpha；实现提交和 qualification 必须如实记录，不得写成完全兼容变更。

本次不新增任何替代 public execution API。

---

## 5. 冻结内部实现

### 5.1 只增加一个内部执行函数

在现有 `game-libs/map/src/runtime.ts` 中把 `mapDefinition.frame()` 的真实 Map execution body 提取成一个 package-internal 函数，概念形态：

```ts
async function runMapRuntime(
  scope: SubsystemScope,
  frame: Frame,
  api: RuntimeBridge,
): Promise<FrameOutcome> {
  // current Map runtime body
}
```

函数名不是 public contract；实现关系必须是：

```text
RPGMapHandler.run()
    -> runMapRuntime(...)
```

### 5.2 本轮保留 `RuntimeBridge` 现有语义

本轮明确保留实施前已有的 internal `RuntimeBridge` 协作面及 `RPGMapHandlerImpl implements RuntimeBridge` 关系，只改变传递方式：

```text
before
Handler -> WeakMap<Frame, RuntimeBridge> -> mapDefinition

after
Handler -> runMapRuntime(scope, frame, this)
```

本轮不重命名、不内联、不重新设计 `RuntimeBridge`。后续若要清理，必须作为独立普通重构处理。

### 5.3 删除 dual-mode runtime

实施前 runtime 同时支持：

```text
Builder/Handler path
mapDefinition direct path
```

因此存在：

```text
InitialInput
initialInput(frame.params)
api nullable branch
api ? ... : ...
if (api) ...
无 api 时的 NPC / snapshot fallback
```

删除 `mapDefinition` 后，这些 direct-definition 分支必须一并删除。Runtime 只接受 Handler 已规范化的：

```text
initial entry
characterName
callbacks / commands / snapshot bridge
```

同时删除已无用途的：

```text
defineSubsystem import
SubsystemDefinitionFactory import
```

不得用另一个 registry、ambient context 或 service locator 替代 WeakMap。

---

## 6. 代码结构约束

本轮保持当前目录结构：

```text
game-libs/map/src/
    index.ts
    runtime.ts
    semantics.ts
    layout.ts
```

明确不新增：

```text
MapSession class
MapManager
MapController
MapRuntimeHost
Port / Adapter hierarchy
runtime/ 子目录
新的 package subpath
新的 public factory/helper
```

本轮只要求：

```text
一个 public execution model
一个 internal runtime execution path
一个 Map mutable authority
```

---

## 7. 冻结实施文件范围

### 7.1 必改产品代码

原则上只改：

```text
game-libs/map/src/runtime.ts
game-libs/map/src/index.ts
```

### 7.2 必改测试 / qualification harness

```text
game-libs/map/test/runtime.test.mjs
game-libs/map/test/package.test.mjs
test/m14-vertical.test.mjs
```

`game-libs/map/test/public-api.test.mjs` 只有发现真实覆盖缺口时才补充；不得为了重写测试结构而无关改动。

### 7.3 原则上保持不变

```text
examples/essentials-v21.1/game.json
examples/essentials-v21.1/subsystems/map.mjs
game-libs/map/package.json
packages/* framework public ABI
```

如果实现必须修改这些文件，视为冻结假设失效，应先记录原因，不应自行扩大 scope。

---

## 8. 测试迁移规则

### 8.1 `runtime.test.mjs`

实施前大量行为测试通过：

```ts
const definition = mapDefinition(scope);
const pending = definition.frame(frame);
```

启动。

改为通过 Builder / Handler 启动：

```ts
const handler = new RPGMapBuilder(scope, frame).build({
  player: { characterName: "m14_player" },
});
handler.onMapEntering((context) => context.setNPC([]));
const pending = handler.run({ mapId: 1, x: 10, y: 8 });
```

现有 movement、camera、transfer、terrain、render、failure、cleanup 断言尽可能原样保留。不得因为删除 `mapDefinition` 而删除大块行为覆盖。

只验证已删除 direct-definition `frame.params` parser 的测试可以删除；其余业务行为测试必须迁移。

### 8.2 `package.test.mjs`

删除对 named/default `mapDefinition` 存在的断言，改为验证新的 root surface：

```text
RPGMapBuilder exists
RPGMapError exists
不要求 default Subsystem export
browser artifact 约束继续通过
```

不得简单删除整个 package test。

### 8.3 `test/m14-vertical.test.mjs`

实施前基线中的 `test/m14-vertical.test.mjs` 仍直接：

```text
import mapDefinition from "@loomrealm-game/map"
runSubsystem({ definition: mapDefinition, ... })
```

该引用必须迁移，否则删除 `mapDefinition` 后 `npm run test:m14` 会直接失败。

本轮采用 **test-local thin Subsystem Definition**，用公开 author API 包装 Builder / Handler，并保持现有 vertical 的无 NPC 可观察行为：

```ts
const definition = defineSubsystem((scope) => ({
  frame(frame) {
    const input = frame.params;
    const map = new RPGMapBuilder(scope, frame).build({
      player: { characterName: input.characterName },
    });
    map.onMapEntering((context) => context.setNPC([]));
    return map.run({ mapId: input.mapId, x: input.x, y: input.y });
  },
}));
```

不要改用 Essentials 的 `subsystems/map.mjs` 来顺便引入 guide NPC，因为那会改变实施前 M14 vertical 的业务可观察结果，扩大本次重构语义范围。

Realm State v1 合入后该 harness 已负责提供 `state` capability；本次保持其现有注入不变。

---

## 9. Essentials compatibility

实施前 Essentials 已经是：

```text
Game-owned map Subsystem
    -> RPGMapBuilder
    -> RPGMapHandler
```

因此本轮不修改其业务代码和 Game Entry topology。

它的职责是作为现有真实 consumer，证明删除 `mapDefinition` 后产品组合仍工作。

---

## 10. 强制验证

实现至少执行：

```text
npm test -w @loomrealm-game/map
npm run test:m14
```

并在最终实现 SHA 上检查：

```text
全仓 active source 不再引用 mapDefinition
Map package 无 default Subsystem export
runtime tests 行为覆盖未因迁移大幅减少
M14 vertical 通过 Builder/Handler 组合继续运行
Essentials topology / 业务调用保持不变
```

如适用，继续执行当前 Browser/Desktop Map 产品链回归。

---

## 11. Qualification boundary

本次 Map executable change 会产生新的 qualification subject，历史 PASS 不自动继承。

实现 agent 必须对最终 SHA 如实记录：

```text
PASS
FAIL
SKIP
PENDING
```

但 implementation closure **不要求为了本工作强行把 M14/M15 Formal Closed**。

如果当前 ledger 存在与本次 Map composition 无关的既有 blocker：

```text
不得弱化断言
不得静默修复 scope 外 qualification input
不得把缺失证据写成 PASS
```

只记录真实结果和 blocker；scope 外问题单独处理。

---

## 12. 明确不做

不修改：

```text
terrain / passability semantics
walk / jump timing
Bridge / Ledge behavior
Transfer semantics
NPC semantics
Content schema
Render schema
Viewport behavior
Realm State semantics
Main / Frame authority
```

不因为最新 `main` 新增 Realm State v1 而给 Map 增加 Realm State dependency 或业务状态迁移。

---

## 13. 完成判据

全部满足才算实施完成：

1. `RPGMapHandler.run()` 直接调用唯一 package-internal Map runtime；
2. `runtimeBridges: WeakMap<Frame, RuntimeBridge>` 及同用途 registry 删除；
3. `mapDefinition` implementation、named export、default export 删除；
4. `initialInput(frame.params)` 及其它 direct-definition dual-mode 分支删除；
5. `RuntimeBridge` 本轮保持现有语义，不新增替代架构层；
6. `RPGMapBuilder / RPGMapHandler` 及现有控制接口保持可用；
7. `runtime.test.mjs` 关键行为覆盖迁移到 Builder / Handler 启动；
8. `package.test.mjs` 更新为新的 package export contract；
9. `test/m14-vertical.test.mjs` 不再依赖 `mapDefinition`，且现有业务可观察行为保持；
10. Essentials Game Entry topology 和 `subsystems/map.mjs` 业务调用不变；
11. `npm test -w @loomrealm-game/map` 通过；
12. `npm run test:m14` 按最终 SHA 得到可复核结果；
13. qualification ledger 如实记录最终 subject，不借本工作修复 scope 外 blocker。

最终原则：

> **删除没有真实消费者价值的第二套 Map execution entry，让既有 Builder / Handler 直接承载唯一 Map runtime；除此之外不创造新的架构。**
