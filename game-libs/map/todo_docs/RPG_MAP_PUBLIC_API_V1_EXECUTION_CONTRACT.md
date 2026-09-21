# RPGMap v1 对外接口与执行契约

> 状态：**设计已冻结为实施基线，尚未作为源码导出或通过测试**；2026-09-21 统一修订。本文件是公开 TypeScript 形态、生命周期、事务、错误及静态 NPC 命令的**唯一权威**。内容格式/Bridge/Ledge 细节见 [主方案](./RPG_MAP_GENERIC_MODULE_DESIGN.md)，交付门槛见 [实施计划](./RPG_MAP_ESSENTIALS_LOCAL_TEST_PACKAGE_MIGRATION_PLAN.md)。构造器实际 import 路径、错误类与诊断通道仍应在代码接线时对照当前 Subsystem ABI 实现，并以最终导出的声明和测试为准。

## 1. 公开类型（目标形态，不是当前已有导出）

```ts
import type { Frame, FrameOutcome, SubsystemScope } from "@loomrealm/subsystem";

type Direction = 2 | 4 | 6 | 8;
type Pattern = 0 | 1 | 2 | 3;
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
  pattern?: Pattern | null;
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
    pattern: Pattern; // always normalized; never null/undefined
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

// 接线示意：具体 Builder 构造和导出路径须与当前 Subsystem 实现核定。
const map = new RPGMapBuilder(scope as SubsystemScope, frame as Frame).build({
  player: { characterName: "trainer_POKEMONTRAINER_Red" }
});
map.onMapEntering(async (context) => {
  const placements = await gameNPCRepository.load(context.mapId, { signal: context.signal });
  context.setNPC(placements);
});
return map.run({ mapId: 66, x: 8, y: 7 });
```

`gameNPCRepository` 是游戏拥有的示意，不是地图库提供的 Group API；Player 暂由已有键盘 Input 驱动，不公开 `movePlayer`。Builder 只装配 Scope/Frame 和 Player 资源，既不安装 FSDB，也不读取游戏自有 NPC Group。`direction` 首次及切图的默认取值需与现有首次朝下和 Transfer 保留方向行为接线一致，并设用例；不能凭这段示意声称现有代码可编译。

## 2. 生命周期与完成语义

- **`run(initial)`**：同一 Handler 仅一次，绑定现有 `SubsystemDefinition.frame(frame)`；首次地图加载成功不会让 `run` resolve，只发 `mapEntered`。直到 Frame 真正终止才返回既有 `FrameOutcome`：signal 取消→`cancelled`，首次加载失败/自动 Transfer 严重失败/不可恢复提交异常→`failed`。不为地图自行建立第二套 Frame 管理器；没有显式正常退出场景时不虚构 `completed` 时机。运行结束关闭 Input、RenderDomain、定时器和订阅。
- **`enterMap(target)`**：只在 `run` 已启动、已有稳定场景时调用；目标完整提交后 resolve。非法输入、重复/忙碌、目标准备失败导致 Promise reject，不发 `mapEntered`，且**仅在提交尚未开始的失败情况下**保证旧地图和快照可用。自动 Transfer 共享准备/提交核心，失败仍映射 Frame 的传送失败结果，而非丢成一个无人接收的 Promise 拒绝。
- **`getSnapshot()`**：首次提交前、Frame 结束后（包括 fatal）为 `null`；准备下一场景期间仍读取旧的已提交快照。成功切图与成功整批 NPC 更新后返回新事实；预提交失败仍旧事实。数据来自同一个提交代次、不可变、不泄漏 Runtime 可变对象、Content 凭据或游戏玩法字段；运动中的 x/y/direction 必须在单次调用内一致。
- 注册 `onMapEntering` 建议在 `run` 前，v1 仅允许一个；注册则每次准备在正常返回前必须恰好调用一次同步的 `context.setNPC`（允许显式 `[]`），无钩子则默认 `[]`。重复/漏调用立即使本次准备失败。准备钩子异步读取业务数据可以 await，但不能在其中等待该次地图提交或调用 `handler.setNPC`。上下文在准备结束、失败或取消后失效；迟到 `setNPC` 抛错。
- `onMapEntered` 可多订阅，**提交成功后一次**发布。单个通知抛错不能追认进入失败、不能阻断其他监听者；须送到明确、可测试的诊断通道，不能静默吞错。退订时序和诊断路径由实现定型，验收必须覆盖。

## 3. 单一进入事务、并发和取消

```text
校验 MapEntry → 读取并验证 Map/Tileset/MapTransfer/behaviors
  → 分配本次进入 AbortSignal、context 与 sceneEpoch
  → 执行唯一的 onMapEntering 并取得整批 NPC（无钩子默认为 []）
  → 校验实例身份、坐标、Player 冲突、struct.NPC/name/sprite、资源及 4×4 图集
  → 构建新权威状态与完整 RenderDomain 投影
  → 仅一次场景提交 → 切换当前权威 → 发布一次 mapEntered
```

首次 `run`、主动 `enterMap`、内置 Contact/Step/Edge Transfer 复用此核心；仅失败传递渠道不同。准备中的读取、钩子、校验或投影构造失败不触碰旧状态。一次只允许一个进入操作，重复主动进入直接报 busy，不队列化、不隐式覆盖。已有异步 `setNPC` 遇切图时失效，过期结果不得在新地图安装；两次 `setNPC` 并发也报 busy。取消 Frame 即便业务 hook 不理会 signal，也必须能及时终止：用等待取消的屏障及时释放 Frame，同时为迟到 promise 安装拒绝观察器、销毁上下文及核验 epoch，不能留下未处理拒绝或过期提交。

**提交失败的唯一规则：**当前 `RenderDomain.replace()/update()` 类型没有回滚承诺。先完成数据、资源与投影预构造，再执行一次完整的 `replace` 或针对当前 NPC 的单一批量 `update/replace`，成功后才改当前权威、递增代次并通知；若调用抛错／返回不可靠状态且无法证明无副作用，则进入不可恢复 fatal：标记 Handler 失效，阻止输入、后续 `enterMap/setNPC`、所有迟到异步提交；拒绝当次主动命令，令 `run` 返回 `FrameOutcome.failed`（稳定提交失败分类），关闭 RenderDomain/Input/计时器、退订并清理，快照之后为 `null`。**不得**对该错误承诺旧场景保留、继续游戏或把已损坏投影用内存回写当作回滚。若以后底层提供有测试证明的原子回滚，再单独修改契约。初始创建/切图/运行期 NPC 提交同样处理，取消优先级按 Frame 规则处理。提交成功但 `mapEntered` 回调抛错，只报诊断，不走 fatal。

`context.setNPC` 本身只同步登记，不提交、不会阻塞；准备期调用 `handler.setNPC` 属非法阶段。若 Frame 已终止，所有外部命令以稳定终止错误拒绝；不得向已关闭 Domain 发命令。`FrameOutcome` 不修改现有结构，错误以稳定 `code` 分类（至少非法参数/阶段、重复 run、busy、内容和资源失败、过期场景、取消、提交失败），不得要求业务解析 message。具体 TS 错误类及导出文件是实现接线事项，不宣称已经存在。

## 4. 静态 NPC 输入、占格和移动/传送优先级

- `npcId`、`instanceId` 是非空有效身份；当前图内 instanceId 唯一；x/y 为地图内安全整数。`direction` 必填且只允许 `2|4|6|8`。`pattern` 缺失、`undefined` 或 `null` 一律规范化为 **0**，其余仅允许 0–3 的整数。4×4 图集的方向选行、pattern 选列；静止帧不等于 AI 动画。快照必带规范化 `pattern`。
- 每个 NPC 逻辑占据一个格，**阻挡 Player**。同一批 NPC 不得相互同格或与 Player 当前格/目标出生格重叠；不以 PNG 像素占地计算逻辑碰撞，也不新增 NPC 自行移动或按 Player 的地形通行验证 NPC 放置。目标出生格冲突属于准备失败；运行期设置冲突属于预提交失败，整批拒绝、原集合不变。`setNPC([])` 清空；其余每次替换整批，缺省 pattern 不继承上批值。Player 正走路/跳跃、切图准备中或已有 setNPC 未结束时报告 busy；不暗中排队。定义/资源失败在提交前整批拒绝；提交阶段异常按 §3 fatal，而非假装旧批次仍可用。
- **方向输入判定顺序：**① 若已在运动/切图/Frame 已终止则忽略运动输入；② 先检查当前格+方向对应的 `MapTransfer.contacts`（依现有前方在界内的触发条件），命中则启动 Transfer，**不尝试走入前方 NPC 格**；③ 否则按现有 `planMovement` 判定地形、桥层和合法 walk/jump/blocked；④ 成功计划仅检查最终目标格的 NPC 占据，命中则 blocked，保持 Player 原位，不触发该格的 Step Transfer、Bridge、NPC 脚本，也不将 NPC 阻挡改解释为触发前方 Bridge；jump 中途跨过的格不占用；⑤ 成功完成到达后先检查 `MapTransfer.steps`，若未转图再检查 Bridge；⑥ 越界输入按既有 `MapTransfer.edges` 触发，NPC 只在合法地图内占格，不参与 Edge 判定。
- **与传送格冲突的具体含义：**NPC 站在 Step Transfer 所在格 → Player 被挡，无法到达该格，因此不会触发 Step Transfer；当前格 Contact Transfer 命中 → 不需要进入前方格，即使前方有 NPC 仍执行 Contact Transfer；Edge 按原越界规则处理。Transfer 新图出生格如与业务装配 NPC 冲突，则进入失败，自动 Transfer 走 Frame 失败路径；主动 `enterMap` 在预提交阶段拒绝并保留旧场景。不得改变原有 Contact/Step/Edge 数据结构来消除这项区别。

## 5. 明确暂不开放及交付门槛

不公开 `movePlayer/moveNPC/addNPC/removeNPC/updateNPC/getNPCDefinition`、通用事件/Entity/对话/AI。名称可由业务自行查定义。方向默认及图像解码后失败的诊断、静态遮挡与 4×4 图片维度、碰撞与桥层投影一致性必须用真实代码和测试核定；读取资源成功不等于 Browser 已成功显示。

必测：无 hook 与空 hook、恰好一次登记、hook 不响应取消、迟到回调；Frame 取消及自动 Transfer 出错；主动进入成功、预提交失败旧场景仍可用、RenderDomain 提交异常 fatal；当前格 Contact+前方 NPC、Step 格 NPC、Edge、普通移动和 Ledge 终点 NPC；重复 ID、同格、出生点冲突、非法/默认 pattern、两实例同定义、失败整批不变、运动期 busy；快照首次前/切图中/成功/失败/终止后；通知监听器异常、Browser 可视性及同一 Runtime 兼容入口。具体证据记录在 [PR A–D](./RPG_MAP_ESSENTIALS_LOCAL_TEST_PACKAGE_MIGRATION_PLAN.md)。本文件完成的是**设计闭环，不是代码通过或产品闭环**。
