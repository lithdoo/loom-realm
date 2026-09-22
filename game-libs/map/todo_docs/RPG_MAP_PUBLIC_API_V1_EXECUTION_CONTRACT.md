# RPGMap v1 对外接口与执行契约

> **状态：v1 契约已实现；公开导出、Runtime、Browser 与测试已在交付分支验收。** 本文是公开 API、生命周期、事务、错误、NPC 与 Renderer/Browser 接线的唯一权威。[主方案](./RPG_MAP_GENERIC_MODULE_DESIGN.md) 管数据和地形；[实施计划](./RPG_MAP_ESSENTIALS_LOCAL_TEST_PACKAGE_MIGRATION_PLAN.md) 管文件、命令和证据。Agent 不得用旧源码覆盖目标，也不得静默变更外部 ABI。

## 1. 冻结的公开入口与类型

`@loomrealm-game/map` 包根命名导出 `RPGMapBuilder`、`RPGMapError` 与下列类型；默认导出和同名具名导出均保留 `mapDefinition` 兼容工厂，**共用同一个新版 Runtime**，不保留 MapAction 运行分支。以下是目标 `.d.ts` 风格声明；`declare class` 不要求原样复制进 `.ts`。

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
export declare class RPGMapError extends Error {
  readonly code: RPGMapErrorCode;
  constructor(code: RPGMapErrorCode, message?: string);
}
export declare class RPGMapBuilder {
  constructor(scope: SubsystemScope, frame: Frame);
  build(options: Readonly<{ player: Readonly<{ characterName: string }> }>): RPGMapHandler;
}
```

包根保留 `export { mapDefinition as default, mapDefinition }`；Builder 仅装配传入的 `SubsystemScope`/`Frame`，一次 `build()`，Handler 不跨 Frame 复用。`characterName` 必须非空；Player 经现有 Content `resource("resource.Graphics", "Characters/" + characterName)` 读取；不安装 FSDB、不引入 Player Record、NPC Group、第二个 Frame 或 Hostra ABI。游戏在 `SubsystemDefinition.frame(frame)` 内创建 Handler、登记钩子并 `return handler.run(initial)`；兼容工厂将旧 `frame.params` 拆成 player + MapEntry，新的 local 消费者同样适配现有宿主输入，不改 manifest。

**方向：**首次 `run` 缺省为 `2`；主动 `enterMap` 缺省保留调用时已提交 Player 方向；自动 Contact/Step/Edge Transfer 使用现有规则的 `targetDirection`（存在时）或输入 `attemptedDirection`。显式方向只能为四方向。Player 正 walk/jump 时主动 `enterMap` 返回 `MAP_BUSY`，不得中途取消已启动的 Step/Bridge；自动 Step Transfer 于运动结束后判断。

## 2. 生命周期、钩子、诊断与快照

- `run(initial)` 只能调用一次；首次进入成功只通知 `mapEntered`，直到整个 Frame 结束才 resolve 为既有 `FrameOutcome`。首次准备失败 `failed(MAP_ACTIVATION_FAILED)`，自动传送失败 `failed(MAP_TRANSFER_FAILED)`，不可恢复提交失败 `failed(MAP_COMMIT_FAILED)`，Frame signal 取消为 `cancelled`。不创造正常退出入口；结束时关闭 Input/RenderDomain、定时器、订阅。
- `enterMap(target)` 只在 `run` 已启动、Player 静止、已有稳定场景时调用；完整提交后 resolve。非法输入/阶段/忙碌/准备失败 reject；**仅提交开始前失败保证旧场景仍可用**。自动 Transfer 使用相同准备和提交核心，错误映射 Frame outcome。
- `onMapEntering` 只在 `run` 前注册，至多一个，可启动前退订重登；无钩子默认 `[]`。有钩子时每次正常返回前必须恰好同步调用一次 `context.setNPC`（可为 `[]`）；漏调、重调或过期调用报错。可 await 自有数据，不得在钩子内调用 `handler.setNPC` 或等待自身提交。
- `onMapEntered` 只在 `run` 前注册、可多订阅及退订，成功提交后逐个通知一次。单个监听器抛错不回滚、不阻断其余监听者、不使成功 `enterMap` reject；唯一最小诊断为 `console.error("[RPGMap] MAP_ENTERED_LISTENER_FAILED", { mapId, message })`，测试要观察到。禁止输出 Content 凭据、资源字节、NPC 业务行和整个 Error 对象；不增加公共日志 API。
- `getSnapshot()` 首次提交前、Frame 终止后（含 fatal）为 `null`；新图准备期间仍返回旧已提交事实；移动、切图、整批 NPC 替换成功后一次读取的数据来自同一代次。返回深层不可变副本，`pattern` 永远规范化为 0–3；内部 RenderNode key 不进入业务快照。

## 3. 单一进入事务、取消、错误及提交边界

```text
校验 MapEntry → 读取 Map/Tileset/MapTransfer/behaviors → 创建 context/signal/sceneEpoch
→ 等待唯一 onMapEntering（无钩子=[]）→ 校验 NPC 身份/占格/定义/PNG
→ 分配内部渲染身份并预构造完整场景及投影 → 提交前容量检查
→ 唯一 Domain 提交 → 更新权威与快照 → 发布一次 mapEntered
```

同一时刻只允许一次进入；重复主动进入直接 `MAP_BUSY` 不排队；并发 `setNPC` 同理。切图使旧异步 `setNPC` 以 `MAP_STALE_SCENE` 失效。Frame 取消和进入失效共同控制准备信号；业务钩子无视取消时仍由取消屏障及时释放 Frame，对迟到 Promise 安装拒绝观察器并使 context/epoch 失效，绝不提交旧结果。终止后的外部命令 `MAP_INVALID_STATE`，取消中的命令可为 `MAP_CANCELLED`；`context.setNPC` 同步抛出稳定 `RPGMapError`。

外部命令只依赖 `RPGMapError.code`：非法字段/越界 `MAP_INVALID_ARGUMENT`，阶段/终止 `MAP_INVALID_STATE`，重复 run `MAP_ALREADY_RUN`，忙碌 `MAP_BUSY`，Content/定义/资源读取失败 `MAP_CONTENT_FAILED`，NPC 身份/图集/占格/由 NPC 引起的预提交容量超限 `MAP_NPC_INVALID`，旧代次 `MAP_STALE_SCENE`，取消 `MAP_CANCELLED`，Domain 实际提交异常 `MAP_COMMIT_FAILED`。地图本身投影超预算属于目标准备内容失败 `MAP_CONTENT_FAILED`。Frame 仍使用既有 `FrameFailure` 形状：首次失败 `MAP_ACTIVATION_FAILED`、自动传送失败 `MAP_TRANSFER_FAILED`、提交损坏 `MAP_COMMIT_FAILED`。错误详情可诊断但不得泄露内容或凭据。

**同步 Domain 异常 fail-stop。** 所有异步读取、投影构造和可预见的容量检查先于 Domain 调用。现有 `createRenderDomain/replace/update` 没有公开的无副作用失败或回滚保证；首次、切图、NPC、移动、Bridge、resize、动画中任何实际 Domain 命令抛错且无已验证回滚时：标记 Handler fatal，禁止新输入、命令和迟到提交；当次主动 Promise reject，`run` 返回 `failed(MAP_COMMIT_FAILED)`，释放资源并使快照为 `null`。原 resize 吞异常重试必须改造。**预提交确定性校验失败不得先调用 Domain 试错**：保持旧场景/集合和快照。若 signal 同时取消，遵循既有 Frame 取消优先级。通知回调抛错只诊断、不 fatal。

`mapEntered` 只意味着 Runtime 权威和同步 Domain 命令已接受，不保证 Browser 图片解码、绘制或显示；Browser 故障独立 E2E 观察，不伪造 Domain 画面 ACK 或 `FrameOutcome.completed`。

## 4. 静态 NPC 与传送顺序

`NPCPlacement.instanceId/npcId` 为有效非空身份，图内 instanceId 唯一、x/y 为图内安全整数、direction 四选一；pattern 缺失/undefined/null 规范化为 0，显式必须是整数 0–3；整批替换不继承上批状态。`[struct]NPC` 只有 name/sprite；PNG MIME、格式及 4×4 尺寸在准备期校验，Browser 真实解码/显示另行验收。一项非法则整批预提交拒绝。每个 NPC 占 1×1 且挡 Player，NPC 不同格、不与 Player 当前格/出生点重叠；不要求 NPC 格符合 Player 地形通行条件。`setNPC([])` 清空；运动/切图/已有设置在途为 `MAP_BUSY`。

方向输入顺序：① Frame/运动/切图不稳定则忽略；② 命中当前格+方向 Contact Transfer（遵循原有前方在界内条件）则先传送，不检查前方 NPC；③ 否则 `planMovement` 计算 walk/jump/blocked；④ 仅合法最终目标检查 NPC，命中则 blocked，无该格 Step/Bridge；jump 跨越中间格不查；⑤ 成功到达后 Step Transfer 先于 Bridge；⑥ 越界 Edge 沿用既有规则，不把 NPC 阻挡变成 Edge。NPC 站 Step 格则不可触发 Step；目标出生点与 NPC 冲突使进入准备失败。NPC 不自行运动或触发地形/传送，不提供对话或 AI。

## 5. RenderDomain/Browser 多 Sprite 内部合同（不修改外部 Renderer ABI）

沿用现有 `RenderDomainState`、`lr-map-view`、`lr-map-sprite`。一个 View 根节点 `key:"viewport"`、恰好一个 Player 子节点 `key:"player"`，各 NPC 为同级 Sprite。**业务 `instanceId` 与 RenderNode.key 必须解耦**：内部在本 RenderDomain 生命周期内使用短小、确定性可生成且单调不复用的 `npc:<serial>` key。只有上一已提交场景中仍存活的同一地图同一 instanceId，整批 `setNPC` 保留其内部 key；移除即退休，随后重新添加同一个 instanceId 要分配新 serial；进入新地图为新实例分配新 key，即使业务字符串恰好相同。分配器贯穿 Domain 生命周期，不因切图或空集合重置。预提交暂分配的 serial 可以跳号，但未提交的键不得被错误地当作已退休旧键复用；一旦编号无法安全递增就在调用 Domain 前拒绝。Snapshot 和对外事件只使用原始 instanceId，**不暴露 serial 或节点 key**。

这项约束来自 `packages/subsystem/src/internal/render-manager.ts`：同一 Domain 中已移除的 key 进入 `consumedKeys`，`replace()` 禁止重新使用；`update()` 仅修改现有节点的 attrs/data，不支持增删。NPC 数量/身份改变或切图采用**一次完整 `replace`** 更新拓扑，保留键的固定拓扑运动/Bridge/resize 可使用 `update`；每次构建完整且唯一的节点集合，移除节点时释放不再被拥有的 Browser 图片资源。`viewport`/`player` 键始终保留，不得在同一 Domain 内删除再复用。

**提交前容量检查是准备事务的一部分，不能拿真实 `replace()` 当验证器。** 按现有 `RenderManager` 和 `@loomrealm/data` 限制验证完整候选：单 key UTF-8 最多 128 字节，整棵树最多 16,384 节点（含 View、Player，因此 NPC 数量理论上不超过 16,382，实际还受消息大小约束）、单节点 data 最多 262,144 字节，完整快照/消息最多 1,048,576 字节；还需遵守树深、成员数、`update` 操作数等既有约束。使用纯函数/独立候选投影做确定性预检查，并以现有 RenderManager 校验测试对齐字节编码及消息 envelope；按**所有限制中最小的实际上限**拒绝，不把 16,382 当保证可显示的固定 NPC 配额。NPC 集合引起超限时 `MAP_NPC_INVALID`，地图自身超限时 `MAP_CONTENT_FAILED`，均发生在 Domain 前且保持旧状态。已完成预检查但实际 Domain 仍抛错，不能假装安全，依 §3 fatal。禁止通过截断、丢弃 NPC/图块或拆成多次提交规避限制；不要为了提高容量改底层公共协议。

NPC Sprite 沿用现有 data 字段，`motion:null`、`motionId:null`、规范化 pattern，与 View 同 sceneEpoch/visualEpoch/bridgeLevel；位置由世界格及相机计算，运动相机时全部跟随。Player 沿用既有动画/motionId，同步配对时不把静态 NPC 的 null motionId 误认作相机运动冲突。Browser 将 `_spriteChild()` 单例及共享 CSS rule 改为多实例独立定位、缓存和资源所有权；静止 NPC pattern 可以非零，Player 静止依旧 0。新场景、Bridge、resize 和整批设置统一代次/集合，不能保留旧影或单独提前释放 Player；按 namespace/key/contentVersion 复用图片、离场/删除/失败释放无主资源。4×4 行列、脚底中心锚点和脚底深度与地形遮挡一致。Browser 解码失败须可观察，但不反向改写已成功的同步 `mapEntered`。

## 6. 交付门槛与不在范围

不公开 `movePlayer/moveNPC/addNPC/removeNPC/updateNPC/getNPCDefinition`，不引入通用事件/Entity/对话/AI。包根导出、方向/忙碌、错误码/诊断、单 Runtime、NPC key 生命周期、容量预检、Browser 多 Sprite 和 fatal 都是冻结的实施验收点。若发现确凿外部 ABI 冲突，先以源码证据修订本唯一权威及测试，不得由 Agent 静默另立公共 API。

必测：无 hook/恰一次/取消迟到、run 不提前结束、首次/主动/自动切图、预提交失败保旧、Domain 在创建/切图/NPC/运动/Bridge/resize 注入异常 fatal、通知诊断、快照/错误码；同一 instanceId 保持时 key 稳定，删除再添加/跨图时 key 不复用，预提交容量超限无 Domain 调用且旧集合仍有效，临界合法容量与真实 RenderManager 一致；NPC 显示帧、碰撞/传送顺序、Browser 0/1/N 实际可见/层深/资源清理和单 Player 回归。命令与证据见 [实施计划](./RPG_MAP_ESSENTIALS_LOCAL_TEST_PACKAGE_MIGRATION_PLAN.md)。**设计冻结不是源码和测试已通过。**
