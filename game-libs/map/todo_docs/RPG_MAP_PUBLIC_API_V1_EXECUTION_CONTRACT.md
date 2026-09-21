# RPGMap v1 对外接口与执行契约

> **状态：v1 实施设计契约已冻结；源码、导出和测试尚未据此交付。** 本文是公开 API、生命周期、事务、错误、NPC 与渲染接线的唯一权威。[主方案](./RPG_MAP_GENERIC_MODULE_DESIGN.md) 负责数据与地形行为；[实施计划](./RPG_MAP_ESSENTIALS_LOCAL_TEST_PACKAGE_MIGRATION_PLAN.md) 负责任务、命令和证据。Agent 不得以现有旧实现代替本文目标。

## 1. 冻结的公开入口与类型

`@loomrealm-game/map` 包根以**命名导出**提供 `RPGMapBuilder`、`RPGMapError` 以及下列公开 TypeScript 类型；**默认导出继续是 `mapDefinition` 兼容工厂**，同时提供同名具名导出。两种工厂只复用同一个新版 Runtime，不保留旧 MapAction 运行分支；不修改 Subsystem/Hostra ABI，不引入第二个 Frame 管理器。以下是目标 `.d.ts` 风格的声明形态（`declare class` 是声明，不是要求把未实现方法原样贴入 `.ts`）：

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

包根保留 `export { mapDefinition as default, mapDefinition }`；`RPGMapBuilder` 是新的消费者入口。一个 Builder/Handler 只绑定构造时的单个 `Frame` 与 `scope`；`build()` 只允许一次，不能跨 Frame 复用。严格验证 `characterName` 非空，沿用公开 Content `resource("resource.Graphics", "Characters/" + characterName)`；不创建 Player Record、不安装 FSDB、不读取游戏自有 NPC Group。业务在 `SubsystemDefinition.frame(frame)` 内构建 Handler、注册钩子、`return handler.run(initial)`。兼容工厂在边界将宿主已有 `frame.params` 解析为 Builder player + MapEntry；新的 local 消费者自行解析相同 Hostra 输入，**不更改宿主 manifest 或 Frame ABI**。

**默认方向**：首次 `run` 的 MapEntry 缺省 direction 为 `2`；主动 `enterMap` 缺省保留调用时已提交 Player 的方向；自动 Contact/Step/Edge Transfer 按现有规则使用传送规则 `targetDirection`（存在时）或触发输入 `attemptedDirection`。显式 direction 仅 `2|4|6|8`。主动 `enterMap` 在 Player 正走路/跳跃时拒绝 `MAP_BUSY`，不在运动中途取消已发出的 Step/Bridge；自动 Step Transfer 本就在运动完成后判定。上述是目标行为，不代表当前代码已实现。

## 2. 生命周期、钩子、诊断与快照

- **`run(initial)`**：一个 Handler 最多调用一次；首次进入成功只发 `mapEntered`，`run` 直到整个 Frame 结束才返回既有 `FrameOutcome`。首次准备失败 `failed(MAP_ACTIVATION_FAILED)`，自动传送失败沿用 `MAP_TRANSFER_FAILED`，不可恢复提交异常 `failed(MAP_COMMIT_FAILED)`，Frame signal 取消为 `cancelled`。不虚构正常退出入口；结束关闭 Input、RenderDomain、定时器和订阅。
- **`enterMap(target)`**：仅 `run` 已启动且 Player 静止、存在稳定场景时可调用；完整提交后 resolve。非法输入、阶段、忙碌、目标准备失败 reject；**只有在提交开始前失败时**才保证旧场景和快照可用。自动 Transfer 共享主链但失败走 Frame outcome。
- **`onMapEntering`**：只允许 `run` 前注册，任一时刻最多一个，可退订后在启动前重登；没有钩子 NPC 默认为 `[]`。有钩子时每次在正常返回前恰好一次同步 `context.setNPC`（允许 `[]`），漏调/重复/过期调用报错。可 await 自有数据，不得在钩子中调用 `handler.setNPC` 或等待正在准备的地图提交。
- **`onMapEntered`**：仅 `run` 前注册、可多订阅及退订；成功提交后各仍存订阅者仅通知一次，每个单独 try/catch。一个回调抛错不撤销成功场景，不阻断其余回调，也不令成功的 `enterMap` reject。以 `console.error("[RPGMap] MAP_ENTERED_LISTENER_FAILED", { mapId, message })` 作为 v1 **确定的最小诊断通道**；测试截获并断言，禁止泄漏凭据、资源字节、NPC 业务行或整份 Error 对象，不新增公共日志 API。
- **`getSnapshot()`**：首次提交前、Frame 结束后（包括 fatal）为 `null`；下一场景准备期返回旧快照。移动、切图和整批 NPC 成功后反映同一事实代次；预提交失败保持旧值。返回深层不可变副本，NPC pattern 始终规范化为 0–3。

## 3. 单一进入事务、并发、错误和提交失败

```text
验证 MapEntry → 读取 Map/Tileset/MapTransfer/behaviors → 建立 context/signal/sceneEpoch
→ 等待唯一 onMapEntering（无钩子=[]）→ 校验全部 NPC 实例/占格/定义/PNG
→ 预构造完整场景事实与 RenderDomain 投影 → 一次 Domain 提交
→ 更新当前权威与快照 → 发布一次 mapEntered
```

同一时刻只允许一次进入，重复主动 `enterMap` 立即 `MAP_BUSY` 不排队；并发 `setNPC` 同理。切图使旧异步 `setNPC` 代次失效并以 `MAP_STALE_SCENE` reject。Frame 取消及进入失效共同控制进入信号；业务 hook 即便不理会 signal，取消屏障仍及时释放 Frame，为迟到 Promise 安装拒绝观察器并使 context/epoch 失效，无未处理拒绝或过期提交。Frame 结束后全部外部命令拒绝 `MAP_INVALID_STATE`，取消中的命令可以 `MAP_CANCELLED`；`context.setNPC` 同步抛对应 `RPGMapError`。

外部命令统一抛/拒绝 `RPGMapError`，业务只解析 `code`：非法值/越界 `MAP_INVALID_ARGUMENT`，错误阶段/已终止 `MAP_INVALID_STATE`，重复 run `MAP_ALREADY_RUN`，忙碌/运动期命令 `MAP_BUSY`，定义/Content/资源读取失败 `MAP_CONTENT_FAILED`，NPC 不合法/非法图集/占格冲突 `MAP_NPC_INVALID`，过期请求 `MAP_STALE_SCENE`，取消 `MAP_CANCELLED`，Domain 提交异常 `MAP_COMMIT_FAILED`。Frame outcome 仍使用既有 `FrameFailure` 形状：首次准备失败 `MAP_ACTIVATION_FAILED`、自动传送失败 `MAP_TRANSFER_FAILED`，不可恢复提交失败统一 `MAP_COMMIT_FAILED`；message 可以定位原因但不得泄漏敏感内容。错误类和代码是**冻结的目标实现**，不是现有包已提供的事实。

**同步 Domain 异常的唯一规则：fail-stop。** 在所有异步读取、资源及投影预构造完成后调用 RenderDomain；现有 `createRenderDomain/replace/update` 不承诺抛错后无副作用。首次建域、主动/自动切图、运行期 NPC、移动、Bridge、resize 的 Domain 命令若抛错且没有已测实证的回滚保证，立刻标记 Handler fatal，禁止新命令/输入/迟到提交，当次主动 Promise reject，让 `run` 返回 `failed(MAP_COMMIT_FAILED)`，关闭资源，快照随后为 `null`。**现有 resize 捕获 Domain 异常后重试的逻辑必须修改，不得吞掉不确定提交错误。** 纯粹发生在 Domain 调用*之前*的构造失败可以按准备失败处理；动画期间发生的不可靠 Domain 失败同样 fatal。取消信号同时到达时遵守 Frame 取消优先级；已成功提交后的通知异常只记录诊断，不走 fatal。

`mapEntered` 成功仅意味着 Runtime 权威和同步 RenderDomain 命令已接受，**绝不代表 Browser 已完成解码、绘制或显示**。Browser 失败是异步可视化 E2E 的独立验收，需要可观察状态/诊断；不得虚构 RenderDomain 的画面完成 ACK 或把失败伪装成 `FrameOutcome.completed`。

## 4. 静态 NPC 与传送顺序

`NPCPlacement.instanceId/npcId` 非空、同图 instanceId 唯一，x/y 为地图内安全整数，direction 必填为四方向。pattern 缺失/undefined/null 统一为 0，显式仅整数 0–3；整批替换不继承上批状态。`[struct]NPC` 严格只有 name/sprite；读取的 PNG 必须通过 MIME、基础图像格式和 4×4 尺寸验证，Browser 解码/可见性再独立验证；一项失败整批拒绝。每个 NPC 占 1×1，不能互相同格或与 Player 当前格/目标出生格重叠，不按 Player 地形通行性进一步限定 NPC 格。`setNPC([])` 清空；运动、切图或已有 NPC 设置在途时 `MAP_BUSY`。

方向输入顺序：① Frame/运动/切图不稳定则忽略运动输入；② 当前格+方向满足已有前方在界内条件的 Contact Transfer 先启动，不检查前方 NPC；③ 否则 `planMovement` 得出 walk/jump/blocked；④ 成功计划才检查最终落点 NPC，命中即 blocked、无目标 Step/Bridge/NPC 事件，跳跃中间格不检查；⑤ 成功到达后 Step Transfer 先于 Bridge；⑥ 越界 Edge 遵从旧规则，不把 NPC blocked 转成 Edge。NPC 占 Step 格就不能触发 Step；新图出生与 NPC 冲突为准备失败。NPC 不自主移动/触发地形和传送/提供 AI 或对话。

## 5. 内部投影与 Browser 多 Sprite 合同（不新增公共 Renderer API）

沿用 RenderDomainState、`lr-map-view` 和 `lr-map-sprite`。Viewport 根下恰好一个 Player 子节点 `key:"player"`，每个 NPC 是同级 `lr-map-sprite` 子节点，稳定 key 为 `"npc:" + encodeURIComponent(instanceId)`（身份仍取原始 instanceId，与 Player key 不冲突）。NPC 卸载必须删除 RenderNode 并释放不再拥有的资源。节点沿用现有 Sprite data 字段，不向公开 NPC/Map JSON 加呈现字段；NPC `motion:null`、`motionId:null`，带规范化 pattern、与 View 一致的 sceneEpoch/visualEpoch/bridgeLevel；其位置由 NPC 世界格+相机计算，镜头运动时 NPC 跟着画面位移。Player 仍用当前动画和 motionId 语义。**RenderDomain.update 只能更新现有节点的 data/attrs，不能添加/删除子节点；NPC 数量或身份改变时必须以一次完整 `replace` 变更拓扑，固定拓扑的运动/Bridge/resize 才可用 `update`。**

Browser 必须把现在 `_spriteChild()` 单例与共享 CSS 定位 rule 改为按节点维护多 Sprite 和各元素独立定位；静止 pattern 可为任意 0–3（Player 仍由 Runtime 保持静止 0）。不要把 NPC 的 `motion:null/motionId:null` 误当根 View `cameraMotion` 正在运行时的错误：静态 NPC 校验 sceneEpoch/visualEpoch/bridgeLevel，而 Player 使用现有 motionId 配对；相机移动时同时重绘所有 Sprite。进入新场景、Bridge、resize、`setNPC` 必须用完整集合/代次更新，不能保留旧 NPC 或让先到的 Player 单独释放新图；按 namespace/key/contentVersion 复用资源并计数，移除/切图/失败要清理无主图像。各 Sprite 使用同一 4×4 行/列、足部居中锚点及足部深度规则，与 Tile 正确遮挡；零 NPC/旧单 Player 行为必须回归。

节点 key 与多 Sprite 同步是 Map 包**内部**约定；可重构 DOM/RAF，但 Browser E2E 必须验证 0/1/N NPC、静止非零 pattern、同定义多实例、移动相机、Bridge 深度、异步资源失败诊断和删除无残影；`mapEntered` 不等待 Browser 完成绘制。

## 6. 非目标和交付门槛

不公开 `movePlayer/moveNPC/addNPC/removeNPC/updateNPC/getNPCDefinition`、通用 Event/Entity/对话/AI。包根导出、默认方向/忙碌规则、稳定错误/诊断、单 Runtime、Browser 多实例和 fatal 是本文件的冻结验收点；若实际 ABI 证据显示不可兼容，必须先修订本唯一权威并调整相应测试，不得由 Agent 静默另立 API。

必测：无 hook/恰一次/取消迟到、run 不提前结束、首次/主动/自动进入、预提交失败保旧、Domain 的创建/切图/NPC/运动/Bridge/resize 故障注入 fatal、通知诊断、错误码和快照；NPC 帧/资源/占格与并发；Contact/Step/Edge；Browser 真正可见、层深与资源清理、单 Player 回归。具体执行命令、环境和 PASS/FAIL/NOT RUN 以 [实施计划](./RPG_MAP_ESSENTIALS_LOCAL_TEST_PACKAGE_MIGRATION_PLAN.md) 为准。**设计冻结不等于实现或测试通过。**
