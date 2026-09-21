# RPGMap v1 对外接口与执行契约

> **状态：v1 实施用设计契约，公开形态与行为决策冻结；源码、导出和测试尚未据此交付。** 本文是公开 API、生命周期、事务、错误、NPC 与渲染接线的唯一权威。[主方案](./RPG_MAP_GENERIC_MODULE_DESIGN.md) 只规定数据与地形行为；[实施计划](./RPG_MAP_ESSENTIALS_LOCAL_TEST_PACKAGE_MIGRATION_PLAN.md) 只规定任务、命令和证据。Agent 不得以现有旧实现代替本文目标，也不得把示例当作已可编译的现状。

## 1. 冻结的公开入口与类型

`@loomrealm-game/map` 包根以**命名导出**提供 `RPGMapBuilder`、`RPGMapError` 以及下列公开 TypeScript 类型；**默认导出继续是旧名称 `mapDefinition` 对应的兼容工厂**，并同时允许命名导出 `mapDefinition`，但两种工厂只能复用同一个新版 Runtime，不得保留旧 MapAction 运行分支。无需修改 Subsystem/Hostra 的 ABI 或引入第二个 Frame 管理器。

```ts
import type { Frame, FrameOutcome, SubsystemScope } from "@loomrealm/subsystem";

export type Direction = 2 | 4 | 6 | 8;
export type Pattern = 0 | 1 | 2 | 3;
export type MapEntry = Readonly<{ mapId: number; x: number; y: number; direction?: Direction }>;
export type NPCPlacement = Readonly<{
  instanceId: string; npcId: string; x: number; y: number;
  direction: Direction; pattern?: Pattern | null;
}>;
export type MapEnteringContext = Readonly<{
  mapId: number; fromMapId: number | null; signal: AbortSignal;
  setNPC(npcs: readonly NPCPlacement[]): void;
}>;
export type MapEnteredEvent = Readonly<{
  mapId: number; fromMapId: number | null;
  player: Readonly<{ x: number; y: number; direction: Direction }>;
}>;
export type MapSnapshot = Readonly<{
  mapId: number;
  player: Readonly<{ x: number; y: number; direction: Direction }>;
  npcs: readonly Readonly<{
    instanceId: string; npcId: string; x: number; y: number;
    direction: Direction; pattern: Pattern;
  }>[];
}>;
export interface RPGMapHandler {
  onMapEntering(listener: (context: MapEnteringContext) => void | Promise<void>): () => void;
  onMapEntered(listener: (event: MapEnteredEvent) => void): () => void;
  run(initial: MapEntry): Promise<FrameOutcome>;
  enterMap(target: MapEntry): Promise<void>;
  setNPC(npcs: readonly NPCPlacement[]): Promise<void>;
  getSnapshot(): MapSnapshot | null;
}
export type RPGMapErrorCode =
  | "MAP_INVALID_ARGUMENT" | "MAP_INVALID_STATE" | "MAP_ALREADY_RUN" | "MAP_BUSY"
  | "MAP_CONTENT_FAILED" | "MAP_NPC_INVALID" | "MAP_STALE_SCENE"
  | "MAP_CANCELLED" | "MAP_COMMIT_FAILED";
export class RPGMapError extends Error {
  readonly code: RPGMapErrorCode;
  constructor(code: RPGMapErrorCode, message?: string);
}
export class RPGMapBuilder {
  constructor(scope: SubsystemScope, frame: Frame);
  build(options: Readonly<{ player: Readonly<{ characterName: string }> }>): RPGMapHandler;
}
```

包根保留 `export { mapDefinition as default, mapDefinition }`；`RPGMapBuilder` 以具名导出供真实消费者使用。一个 Builder/Handler 只绑定构造时的单个 `Frame` 与 `scope`；`build()` 只调用一次，不能跨 Frame 复用。必须严格验证 `characterName` 非空，沿用公开 Content `resource("resource.Graphics", "Characters/" + characterName)`；不创建 Player Record、不安装 FSDB、不读业务自有 NPC Group。业务在 `SubsystemDefinition.frame(frame)` 内构建 Handler、注册钩子，并 `return handler.run(initial)`。宿主传入的旧 `frame.params` 由兼容工厂在边界解析为 Builder options + MapEntry；新的本地测试消费者自行解析相同 Hostra 输入，**不改变宿主 manifest 或 Frame ABI**。

默认方向：首次 `run` 的 `MapEntry.direction` 缺省为 `2`（朝下）；业务显式 `enterMap` 缺省沿用调用时已提交 Player 的方向；自动 Contact/Step/Edge Transfer 按现有规则使用传送规则的 `targetDirection`（存在时）或触发输入的 `attemptedDirection`，不读取 MapEntry 默认值覆盖自动传送。显式方向值只能为 `2|4|6|8`。这些均是目标规则，不表示当前代码已实现。

## 2. 生命周期、钩子与快照

- `run(initial)`：一个 Handler 最多调用一次；首次进入成功只发 `mapEntered`，`run` **直到整个 Frame 结束才返回**原有 `FrameOutcome`。首次准备失败对应 `failed`（`MAP_ACTIVATION_FAILED`），自动传送失败沿用 `MAP_TRANSFER_FAILED`，不可恢复提交异常为 `MAP_COMMIT_FAILED`，Frame signal 取消为 `cancelled`。不虚构正常完成入口；结束要关闭 Input、RenderDomain、定时器及订阅。
- `enterMap(target)`：仅 `run` 已启动且有稳定已提交场景时可调用；完整提交后 resolve。参数/阶段/忙碌/准备失败 reject；**只有提交尚未开始时**才保证旧场景和快照仍可用。自动 Transfer 与它共享准备和提交核心，但错误走 Frame outcome。
- `onMapEntering`：仅 `run` 前可登记，任一时刻至多一个；可退订后在启动前重新登记。无钩子默认为 `[]`，有钩子则每次完成前必须恰好一次同步 `context.setNPC`（允许 `[]`），漏调、重复或已失效调用报错。上下文只属于本次准备；业务可 await 自己的数据，但不得在钩子中调用 `handler.setNPC` 或等待本次地图提交。
- `onMapEntered`：`run` 前注册多个、各自可退订；仅成功提交后每位仍订阅者收到一次；每个监听器单独 try/catch，抛错不撤销提交、不阻断其他订阅者、不使成功的 `enterMap` reject。以 `console.error("[RPGMap] MAP_ENTERED_LISTENER_FAILED", { mapId, message })` 作 v1 **确定的最小诊断通道**，必须测试可观察性；不得记录 Content token、资源字节、整份业务 NPC 行或任意 error 对象。无需新增公共订阅/日志 API。
- `getSnapshot()`：首次成功提交前和 Frame 结束（包括 fatal）后为 `null`；准备新场景期间仍返回旧场景，同一次读取的地图/Player/NPC 属同一事实代次。成功移动后位置、成功切图和成功整批 NPC 替换均可观察；准备失败保持旧值。提供不可变副本，`npcs[].pattern` 始终是规范化的 0–3。

## 3. 唯一进入事务、取消和稳定失败分类

```text
验证 MapEntry → 读取 Map/Tileset/MapTransfer/behaviors → 创建 context/signal/代次
→ await 唯一 onMapEntering（无钩子=[]）→ 验证整批 NPC 身份/占格/定义/素材
→ 构造完整场景事实与 RenderDomain 投影 → 一次提交
→ 切换当前权威与快照 → 发布一次 mapEntered
```

同一时刻仅一个进入；第二次主动 `enterMap` 立即 `MAP_BUSY`，不队列化。两次并发的运行期 `setNPC` 同理；切图开始即使旧 `setNPC` 失效并使其以 `MAP_STALE_SCENE` reject。`onMapEntering` 所属信号由 Frame 取消和本次进入失效共同控制；即使业务钩子不响应 signal，也用取消屏障使 Frame 可终止，对迟到 Promise 安装拒绝观察器，失效 context/epoch，绝不提交旧数据。Frame 终止后任何异步外部命令拒绝 `MAP_INVALID_STATE`，取消中的命令可拒绝 `MAP_CANCELLED`；`context.setNPC` 同步抛出对应 `RPGMapError`。

命令统一抛/拒绝 `RPGMapError`，业务只解析稳定 `code`，不解析 message：非法字段/越界 `MAP_INVALID_ARGUMENT`，调用阶段及终止 `MAP_INVALID_STATE`，重复 `run` `MAP_ALREADY_RUN`，进入/设置并发或运动期设置 `MAP_BUSY`，Content/资源/定义读取失败 `MAP_CONTENT_FAILED`，NPC 图集/ID/重叠/pattern/出生冲突 `MAP_NPC_INVALID`，异步结果代次过时 `MAP_STALE_SCENE`，取消 `MAP_CANCELLED`，渲染提交异常 `MAP_COMMIT_FAILED`。Frame 的 `failed` 维持既有 `FrameFailure` 形状，自动传送仍用 `MAP_TRANSFER_FAILED`，首次进入仍用 `MAP_ACTIVATION_FAILED`，提交失败统一 `MAP_COMMIT_FAILED`；详细原因可以放 message，但不得泄漏敏感数据。`MAP_BUSY`、这些类与代码都是**本次冻结的目标实现**，不是声称现有源码已有导出。

**提交异常必须 fail-stop。** 先完成所有异步 Content、校验和投影构造；`RenderDomain.replace()/update()` 是同步命令，现有接口不承诺抛错无副作用。首次创建、切图、运行期 NPC 替换、运动、Bridge 和 resize 的 Domain 命令若抛错且没有经过测试证明的原子回滚保证，统一标记 Handler fatal、禁止后续输入/命令和迟到提交、拒绝当次命令、让 `run` 返回 `failed(MAP_COMMIT_FAILED)`、关闭资源并使快照为 `null`。**现有 resize 捕获渲染异常后重试的路径必须纳入改造；不得吞掉不确定的提交错误。**纯粹在调用 Domain *之前* 的投影计算失败可按准备失败处理；若动画运行中失败且 Domain 状态无法证明一致，也需 fatal。若 Frame signal 同时取消，以现有 Frame 取消语义优先。提交完成但监听器抛错不属于 fatal。

`mapEntered` 的“成功”仅指 Runtime 权威及 RenderDomain 同步命令已接受，**不代表 Browser 已成功解码、实际绘制或显示**；这些是独立异步 E2E 验收，Browser 失败必须有可观察状态/诊断，不得伪装成 `FrameOutcome.completed` 或凭空设计 RenderDomain 的画面完成 ACK。

## 4. 静态 NPC、移动和传送

`NPCPlacement.instanceId/npcId` 非空，当前图 ID 唯一，x/y 为地图内安全整数，direction 必填为四方向。pattern 缺失/undefined/null 规范化为 0，显式仅整数 0–3，静止帧不自动启动动画；全批替换不继承上批旧帧。NPC 定义仍严格只有 `name` 与 `sprite`，资源必须符合统一 4×4 PNG，任何一个失败则整个集合不提交。每个 NPC 占 1×1，NPC 不能同格或与 Player 当前格/目标出生点重叠；无需按 Player 地形通行性限制静态 NPC 格。`handler.setNPC([])` 清空；Player 正在走路/跳跃、切图或已有 setNPC 在途时拒绝 `MAP_BUSY`。

移动判定：① Frame/运动/切图不稳定则不受理输入；② 当前格+方向的 Contact Transfer 若符合现有前方在界内条件，先启动传送，不检查前方 NPC；③ 否则 `planMovement` 规划 walk/jump/blocked；④ 规划成功才检查**最终落点** NPC，命中则 blocked 且不触发目标格 Step/Bridge/NPC 事件，跳跃中间格不检查占格；⑤ 到达成功先 Step Transfer 后 Bridge；⑥ 越界 Edge 沿现有规则，NPC 阻挡不转换成 Edge。NPC 占 Step 格就不能触发 Step；目标地图出生与 NPC 冲突为进入准备失败。静态 NPC 不移动、不触发地形/传送、不提供对话或 AI。

## 5. 内部投影与 Browser 的多 Sprite 接线合同（不增加公开 API）

沿用现有 `RenderDomainState` 与 `lr-map-view`/`lr-map-sprite` 元素，不更改跨 Subsystem Renderer 协议：Viewport 根节点下有**恰好一个 Player** 子节点 `key:"player"`，每个 NPC 是同级独立 `lr-map-sprite` 子节点，稳定 key 为 `"npc:" + encodeURIComponent(instanceId)`；用 NPC 原始 instanceId 管理运行时身份，键前缀与 Player 不碰撞；卸载实例必须从投影删除节点并释放资源。NPC 节点使用现有 Sprite data 字段，无需给公共 Map/NPC Schema 添加呈现字段：`motion:null`、`motionId:null`、规范化 `pattern`、与 View 一致的 sceneEpoch/visualEpoch/bridgeLevel；NPC 位置由其地图坐标与当前相机计算，镜头运动时 NPC 仍要跟随镜头绘制。Player 保持已有 motionId/动画语义。

Browser 必须将当前 `_spriteChild()` 单实例和共享 CSS rule 改成按子节点独立绑定/定位的多实例，允许**静止 Sprite 的 pattern 为任意 0–3**（Player 仍由 Runtime 默认静止帧 0），且不得把静态 NPC 的 `motion:null` 误判为根 View 相机动画的错误。场景切换、Bridge、resize、移动和 `setNPC` 必须按场景代次处理完整 Player+NPC 集合，不能因为只有 Player 数据到达就把旧 NPC 留在新场景；资源复用按逻辑 namespace/key/contentVersion 计数，删除/切图/失败时释放无主对象。每个角色按同一 4×4 行/列和足部锚点绘制，按足部深度与 Tile 正确遮挡，不共享一个元素的定位样式；旧单 Player 零 NPC 行为保持回归。

此处的节点 key 和 Browser 同步是**Map 包内部投影约定**，不是新增 `RenderDomain` API。具体 DOM/RAF 实现可重构，但必须用 Browser E2E 同时验证零、一、多个 NPC、静止非零 pattern、同定义多实例、移动相机、Bridge 深度、异步资源失败及移除后无残影；`mapEntered` 不负责等待 Browser 绘制。

## 6. 明确暂不开放与交付门槛

不公开 `movePlayer/moveNPC/addNPC/removeNPC/updateNPC/getNPCDefinition`、通用 Event/Entity/对话/AI。Builder/type/error 包根导出、单 Runtime 兼容、方向默认、错误/日志和 Browser 多实例为本文件冻结的验收点；任何有意更改公开形态须先修订本契约并说明原因，不能由 Agent 悄悄另立接口。

必测：无钩子/恰一次登记/取消迟到、run 不提前终止、首次及主动/自动进入、预提交失败保旧场景、Domain 提交/运动/Bridge/resize 注入异常 fatal、通知错误诊断、非法参数和稳定错误码、快照各阶段；NPC 帧/资源/身份/碰撞/清空与并发；Contact/Step/Edge 与 NPC 顺序；Browser 真正可见、深度、移除资源与旧单 Player 回归。命令、环境及 PASS/FAIL/NOT RUN 的闭环准入仅以 [实施计划](./RPG_MAP_ESSENTIALS_LOCAL_TEST_PACKAGE_MIGRATION_PLAN.md) 为准。**本文件是设计冻结，不代表任何代码或测试已通过。**
