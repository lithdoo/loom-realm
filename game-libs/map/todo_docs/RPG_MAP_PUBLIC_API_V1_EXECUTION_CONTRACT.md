# RPGMap 对外接口 v1：生命周期与执行契约

> 状态：**已讨论并选择的接口执行设计，供后续实施与测试使用；非已发布 TypeScript API、非已实现功能。** 记录日期：2026-09-21。  
> 主方案：[RPG_MAP_GENERIC_MODULE_DESIGN.md](./RPG_MAP_GENERIC_MODULE_DESIGN.md) §3–6；本文细化其中 §4 的未冻结接口边界。当前产品以 [`src/index.ts`](../src/index.ts)、[`src/runtime.ts`](../src/runtime.ts) 为准。  
> 目标：不再拓宽通用架构，而是让 Builder、Handler、准备钩子、错误、取消与快照有可实现和可验证的行为。尚待源码接线审计和实际测试的部分明确标注。

## 1. 硬边界与现状

1. `RPGMapBuilder` / `RPGMapHandler` 只供**同一 Subsystem 内的业务方**使用，不是跨 Subsystem RPC。服从现有 [`SubsystemScope`、`Frame`、`FrameOutcome`](../../../packages/subsystem/src/model.ts)、公开 Content、Input 与 RenderDomain；不建第二套 Frame/场景生命周期。
2. 现有 Map 包的 [`src/index.ts`](../src/index.ts) 只导出 `mapDefinition`，当前 `runtime.ts#frame` 仍内聚地图加载、Input 和渲染。下面全部是**目标接口**，不是声称当前包已导出这些方法。旧 `mapDefinition` 应通过同一内部 Runtime 适配以保留既有消费者，不能长期维护两份行为逻辑。
3. 此契约沿用既定内容协议：Map 四字段 + 可选仅含 Bridge 的 `behaviors`；Ledge 由地形隐式识别；`struct.NPC/{npcId}` 仅含必填 `name`、`sprite`；NPC 放置来源归业务方，Map 不读取固定 `[group]MapNPC`。详见主方案 §3。
4. v1 的公开面不含直接修改 Tile、Bridge 层、Renderer/RenderDomain、任意脚本、NPC 逐步移动或泛用事件解释器；Player 暂由既有 Input 监听驱动，**不能将键盘控制表述为已有 `movePlayer()` Handler 命令**。

## 2. 目标公开接口形态

以下是实施基线的 TypeScript 草案。构造函数所在导出文件、错误类名称及 `run` 的 Frame 接线仍需结合源码完成最终声明；此代码**不代表当前可编译的包导出**。

```ts
import type { Frame, FrameOutcome, SubsystemScope } from "@loomrealm/subsystem";

type Direction = 2 | 4 | 6 | 8;

type MapEntry = Readonly<{
  mapId: number;
  x: number;
  y: number;
  direction?: Direction;
}>;

type NPCPlacement = Readonly<{
  instanceId: string;
  npcId: string;
  x: number;
  y: number;
  direction: Direction;
}>;

type MapEnteringContext = Readonly<{
  mapId: number;
  fromMapId: number | null;
  signal: AbortSignal;
  setNPC(npcs: readonly NPCPlacement[]): void;
}>;

type MapEnteredEvent = Readonly<{
  mapId: number;
  fromMapId: number | null;
  player: Readonly<{ x: number; y: number; direction: Direction }>;
}>;

type MapSnapshot = Readonly<{
  mapId: number;
  player: Readonly<{ x: number; y: number; direction: Direction }>;
  npcs: readonly Readonly<{
    instanceId: string;
    npcId: string;
    x: number;
    y: number;
    direction: Direction;
  }>[];
}>;

interface RPGMapHandler {
  onMapEntering(listener: (context: MapEnteringContext) => void | Promise<void>): () => void;
  onMapEntered(listener: (event: MapEnteredEvent) => void): () => void;
  run(initial: MapEntry): Promise<FrameOutcome>;
  enterMap(target: MapEntry): Promise<void>;
  setNPC(npcs: readonly NPCPlacement[]): Promise<void>;
  getSnapshot(): MapSnapshot | null;
}

// 形态示意：业务在 frame(frame) 内装配，旧 mapDefinition 作兼容适配。
const map = new RPGMapBuilder(scope as SubsystemScope, frame as Frame).build({
  player: { characterName: "trainer_POKEMONTRAINER_Red" }
});
map.onMapEntering(async (context) => {
  const placements = await gameOwnedNPCRepository.load(context.mapId, { signal: context.signal });
  context.setNPC(placements);
});
return map.run({ mapId: 7, x: 10, y: 8 });
```

`gameOwnedNPCRepository` 是游戏自行提供的示意，不是 RPGMap API。`NPCPlacement` 不携带 NPC `name`、贴图、游戏 Group 整行或玩法字段；定义通过 `npcId` 由 Map 读取。Builder 仅装配 Scope/Frame 和 Player 素材，不安装 FSDB、不要求固定 NPC 放置表。Player 首次方向默认、主动切图方向默认与既有传送保留方向的对应细节需在接线测试中确定，不在此声称已有实现。

## 3. 两种 Promise 的完成时刻与调用阶段

| 入口 | 合法阶段和完成时刻 | 失败、取消、拒绝规则 |
| --- | --- | --- |
| `run(initial)` | 一个 Handler **最多调用一次**；开始其所属 Frame 的整个地图运行，**只有 Frame 终止才返回** `FrameOutcome`。首次地图进入完成仅发 `mapEntered`，不能结束 `run()`。 | 首次加载失败转 `FrameOutcome.failed`；所属 Frame 取消转 `cancelled`，遵循现有 Frame 终止/清理路径。运行中的自动 MapTransfer 出错保留当前 Frame 失败路径，不伪装为主动调用的 Promise。 |
| `enterMap(target)` | 只在 `run` 已启动且具有已提交场景时由业务调用；目标地图、NPC 和投影**全部成功提交后** resolve。 | 参数不合法、已有进入操作或 Frame 已终止时拒绝；目标准备、资源或提交失败时拒绝，不发布 `mapEntered`，必须保留原场景。 |
| `context.setNPC(npcs)` | 只在其对应 `onMapEntering` 正执行时**同步**登记一次目标地图初始集合；不是 `handler.setNPC` 的别名，不等待地图提交。 | 旧上下文、重复登记、无效调用阶段立即抛错；不改当前已提交场景。具体数据完整性在统一准备阶段校验。 |
| `handler.setNPC(npcs)` | 只对已提交的当前地图生效；全部实例、NPC 定义、资源及场景代次通过后**整批提交才 resolve**。`[]` 表示清空。 | 任何一项非法、资源失败或场景过期都拒绝，原 NPC 集合不变；不得出现半批安装。 |
| `getSnapshot()` | 同步返回**最后一次成功提交的场景快照**，按返回时一致的事实构造不可变副本；地图准备期间仍是旧快照。 | 首次场景提交前及 Frame 结束后为 `null`；不暴露 Runtime 内部可变对象、图片字节或游戏玩法字段。 |

`run` 与 `enterMap` 不能使用同一个“进入成功即 Promise 完成”语义。重复调用 `run` 应给稳定错误；`FrameOutcome.failed` 与主动命令 Promise 拒绝应统一错误分类，但不得改变 [`FrameOutcome`](../../../packages/subsystem/src/model.ts) 的既有形态。`getSnapshot` 在运动中的精确观察点需测试保证单次返回自洽，不得拼装不同代次的数据。

## 4. 地图进入事务与并发

```text
旧场景有效（首次进入时为空）
  → 校验目标 Map / Tileset / Transfer / behaviors
  → 分配只属于本次进入的 context、AbortSignal、场景代次
  → 调用并 await 唯一的 onMapEntering(context)
  → context.setNPC([...]) 已同步登记恰好一次
  → 校验所有 NPCPlacement，读取/验证 struct.NPC 与 sprite 资源
  → 构造完整新场景状态和 RenderDomain 投影
  → 单一提交边界：新地图、Player、NPC 与投影一起切换
  → 提交成功后发布一次 mapEntered
```

- **失败不覆盖已提交状态：**在提交之前的校验、异步钩子、Content 读取或资源失败均不得局部替换地图/NPC，不得发成功事件。业务主动切图失败应保留旧地图和旧快照；首次进入失败则由 `run` 映射为 Frame 失败。
- **并发规则：**同一时刻只允许一个进入操作，第二个主动 `enterMap` 立即拒绝为 busy，不自动排队或暗中取消前一个。若已有运行期 `setNPC` 在读取资源，启动一次切图应使旧 NPC 操作代次失效，不能让其随后安装到新场景。两个运行期 `setNPC` 也不应彼此竞态覆盖；v1 建议在前一次操作未完成时拒绝第二次为 busy，不引入隐式队列。
- **取消与失效：**取消 Frame、进入失败、场景代次变更或准备钩子结束都使相应旧 context 失效；异步返回后再次核对 Frame signal 与代次。已失效 context 调用 `setNPC` 立即报错，不能把旧 NPC 注入新地图。Frame 结束必须关闭监听、RenderDomain、定时器/订阅并防止过期提交。
- **统一进入路径：**首次 `run`、主动 `enterMap` 与内置 `MapTransfer` 共用目标准备/校验/提交核心；只有错误报告渠道不同。自动 MapTransfer 的失败沿用当前 Frame 失败处理，不能静默当作主动切图失败后继续游戏。
- **渲染事务资格限制：**[`RenderDomain`](../../../packages/subsystem/src/render.ts) 暴露 `replace()`/`update()`，但接口签名本身不承诺抛错后的回滚。实现必须先完成内容/资源校验及投影构建，再调用单次 RenderDomain 提交；需用测试确认提交异常后的场景与 DOM/投影一致性，不能仅凭本设计声称跨层原子性已实现。

## 5. 钩子与事件

- **一个准备钩子。**v1 只允许一个 `onMapEntering` 注册者，建议只在 `run()` 前注册；重复注册立即拒绝，注册返回退订函数。没有钩子时 NPC 默认 `[]`；有钩子时每次正常完成前**恰好调用一次** `context.setNPC`（可显式提交 `[]`），未调用或多次调用均使本次进入准备失败。
- **准备是屏障。**Map 等待异步 `onMapEntering` 结束；`context.setNPC` 只登记而不 await 已提交场景，因此不得在钩子内部调用 `handler.setNPC` 或等待这次 `enterMap` 的提交造成循环依赖。钩子抛错或被取消时，停止准备并沿该入口的失败语义处理。
- **完成是事实。**`onMapEntered` 可以多订阅，**仅在成功提交之后**发布一次。监听器抛错不能撤销已经提交的地图，也不能将成功的 `enterMap` 追认失败；错误应送到明确诊断通道，诊断通道/异常隔离与退订触发顺序需实施时接线并测试，禁止静默吞错。

## 6. 参数、错误与快照的实施要求

- `MapEntry.mapId` 为合法地图 ID，`x/y` 为地图范围内的安全整数，`direction` 若提供只允许 `2|4|6|8`。`NPCPlacement.instanceId`、`npcId` 为有效非空身份字符串；`instanceId` 至少在当前地图内唯一；位置为地图范围内安全整数；方向必填且只允许四方向。必须校验 `struct.NPC` 的 `name` 与 `sprite`，素材不存在或非法不得用空 Sprite 代替。
- NPC 占格的**碰撞/重叠与能否阻挡 Player**尚未冻结；不能把地图内合法整数坐标直接宣称为物理上可放置。静态 NPC 交付至少先明确一条有限碰撞策略并有测试，运动及 NPC 是否触发 Bridge/Ledge/Transfer 另设契约。
- API 错误须有稳定 `code`，而非要求业务解析字符串。最少区分非法输入、错误调用阶段或重复运行、busy、内容/定义/资源失败、过期场景、取消、提交失败。具体错误类/枚举值、自动传送如何映射到 `FrameOutcome.failed` 需实施审计；`MAP_BUSY` 是候选命名，未宣称已在源码提供。
- `getSnapshot()` 是不可变副本：`mapId`、Player 位置/方向和各 NPC 的 `instanceId/npcId/x/y/direction` 均来自同一已提交场景。首次提交前和运行结束后返回 `null`；目标准备失败后仍返回旧场景；NPC 整批替换成功后反映新集合，失败后反映旧集合。不自动包含任务/对话/Group 行，也不把名称当唯一身份。

## 7. 不在本次冻结范围与实施验收

**暂不提供：**`addNPC`、`removeNPC`、`updateNPC`、`moveNPC`、`movePlayer`、`getNPCDefinition`、通用交互引擎。集合改变使用 `setNPC` 整批替换，不用于模拟 NPC 每一步运动；Player 通过原 Input 监听运动。NPC 移动指令、Player/NPC 双向碰撞、NPC/NPC 重叠、运动中替换、NPC 地形行为参与和更大范围的生命周期另行设计，不得隐含在现有接口中。业务如需 NPC 名称，可按自己的内容读取能力读取 `struct.NPC`；将来是否加只读定义查询按真实消费者需求决定。

实施验收至少包括：首次进入成功但 `run` 仍存续；Frame 取消得到 `cancelled` 并清理；主动切图成功后事件恰一次；主动切图加载/准备失败保留旧快照；同时切图被拒绝；无钩子、空集合、漏登记及重复登记；多订阅通知其中一个抛错不破坏提交；场景代次取消使旧 NPC 异步设置无效；整批 `setNPC` 成功、清空及任意一个定义/资源错误时完全不变；`getSnapshot` 首次前/准备中/成功后/失败后/终止后的一致性；旧 `mapDefinition` 与新路径不产生双 Runtime。完成这些后才能声称公开接口与静态 NPC 的相应能力**实际实现**，并按具体 commit 记录测试结果。

**结论边界：**本文件完成的是对外接口生命周期及执行边界的设计补全，**不是代码、`.info.meta`、Bridge 安全迁移、NPC 运动/碰撞或测试已经完成**；主方案相关 TODO 只有在对应代码及验证落地后才能打勾。