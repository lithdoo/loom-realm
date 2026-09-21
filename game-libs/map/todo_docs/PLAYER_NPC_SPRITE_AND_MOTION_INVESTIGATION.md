# Player 运动与贴图机制，及 Essentials NPC／宝可梦素材兼容性调查

> 状态：只读事实调查 / 兼容性证据，**非重构、非正式 NPC Schema、非冻结协议**  
> 调查日期：2026-09-21  
> 工作分支：`docs/map-builder-handler-fsdb-design`  
> 基线 HEAD：`e3e4d932d4b2c66719aec592ea41fca956db2f84`（`docs(map): investigate real Essentials entity data`）  
> 配套文档：[`RPG_MAP_GENERIC_MODULE_DESIGN.md`](./RPG_MAP_GENERIC_MODULE_DESIGN.md)、[`ESSENTIALS_V21_1_ENTITY_DATA_INVESTIGATION.md`](./ESSENTIALS_V21_1_ENTITY_DATA_INVESTIGATION.md)（本文不修改其已确认边界）

本文回答的核心问题是：

> 能否从现有 Player 中抽取一套可供 Player 和 NPC 共用的角色素材与运动能力？哪些 Essentials NPC、宝可梦素材可以直接使用，哪些需要额外的素材描述或渲染适配？

**最新设计前提（来自任务说明，不是本文新结论）：NPC 数据结构由项目自主设计，不把 Essentials Event/Page 当作 NPC Schema。v21.1 在此用作素材来源和兼容性样本。**

---

## 1. 调查环境、版本与限制

### 1.1 工作环境

| 项 | 事实 |
| --- | --- |
| Git 分支 | `docs/map-builder-handler-fsdb-design`，跟踪 `origin/docs/map-builder-handler-fsdb-design` |
| 开始时 HEAD | `e3e4d932d4b2c66719aec592ea41fca956db2f84` |
| 开始时工作区 | 干净 |
| Node | v22.12.0 |
| 原版 `Game.exe` / RGSS | **未运行** |
| LoomRealm `play.bat` 产品窗口 | **本次未运行** |
| 范围 | 只新增本文件；未改 Runtime、Browser、importer、测试、FSDB 或已有两份讨论文档 |

临时只读脚本写在系统临时目录，**不入库**。

### 1.2 三类资料（必须分开）

本次**重新核对**了上一份实体调查中的官方 ZIP 与本地 FSDB，不只复述旧报告。

| 类别 | 本次资料 | 可否当作原版数据结论 |
| --- | --- | --- |
| **1. 真实原始数据** | gitignore 官方 ZIP：`tools/fixtures/essentials-v21.1/Pokemon Essentials v21.1 2023-07-30.zip`。体积 `61987094`，SHA-256 `da0a34ec81ed40a4346fe6101debd7d938cbeadd43ff0aad87c3e388392a1665`，与 `OFFICIAL_ARCHIVE_IDENTITY`（`tools/fixtures/essentials-v21.1/lib/acquisition/eevee-expo.mjs`）一致。 | 可以 |
| **2. 真实投影产物** | `examples/essentials-v21.1-local/[FSDB]Essentials v21.1`。`[struct]测试信息/来源.json`：`version: "21.1"`，`acquisition: "local-zip"`。`[resource]Graphics/Characters` 211 张 PNG；`[resource]Graphics/Pokemon` 4703 个文件。 | 可作为该 ZIP 的 importer 副本 |
| **3. 合成 Fixture** | `examples/essentials-v21.1/`：`m14_player` 128×128 纯色 4×4 表、`game.json` `{ mapId: 1, x: 10, y: 8, characterName: "m14_player" }`、`game-libs/map/test/runtime.test.mjs` 同名参数。 | **不可以**当作原版素材结论 |

### 1.3 证据级别

| 标记 | 含义 |
| --- | --- |
| **真实数据** | 从官方 ZIP 或与其对应的本地 FSDB 资源直接观察到的文件名、尺寸、事件字段 |
| **对照源码** | `Maruno17/pokemon-essentials` tag/commit `ea7b5d56d2436591160983c4e641a2ceee2d875a` 的只读脚本文本。**未执行** ZIP 内 Ruby / `Scripts.rxdata` / `Game.exe` |
| **importer 投影** | 仓库 importer 如何把原始文件写成 FSDB |
| **Runtime / Browser 消费** | 当前 `game-libs/map` 实际读取和绘制的字段 |
| **设计推论** | 基于以上提出的素材能力需求，不是已实现 API |
| **未验证** | 本次未观察，或仅有静态结构不足以断定运行时画面 |

`Scripts.rxdata` 是 Marshal 编码，本次 ASCII 子串扫描几乎全是 0 命中（含 `Graphics/Pokemon`），**不能**据此声称脚本里没有这些字符串。图形路径以对照源码 `009_Species_files.rb` 为准。

兼容性用语只使用：

- **已验证可直接兼容**：有完整格式 **且** 有实际消费者证据
- **静态格式看似兼容，尚未运行验证**
- **需要明确适配**
- **证据不足，无法判断**

未改代码，因此**没有**在当前产品中绘制过 NPC 或地图宝可梦。不得把“文件能被 4 整除”写成产品兼容测试通过。

### 1.4 使用的只读工具

- Runtime / Browser / 语义：`game-libs/map/src/runtime.ts`、`semantics.ts`、`layout.ts`、`browser/map.browser.js`
- 启动入口：`examples/essentials-v21.1-local/game.json`、`examples/essentials-v21.1/game.json`、`packages/game-launcher-hostra/src/launch-plan.ts`、`examples/*/subsystems/map.mjs`
- Content：`packages/subsystem/src/host/content-client.ts`、`packages/renderer/src/internal/resource-client.ts`、FSDB-HTTP FDB-006/007
- 事件解码：`decodeRxdataBytes` / `extractMapFacts`（`map-event-evidence.mjs`）
- PNG：IHDR + 对代表性 8 位 RGBA 图做透明像素包围盒（`doors7.png` 为 4 位索引色，本次未完全解码像素）

---

## 2. 当前 Player 完整数据流

### 2.1 两个可运行 Demo 的差异

| | 合成 Demo | 真实 Essentials Demo |
| --- | --- | --- |
| 目录 | `examples/essentials-v21.1/` | `examples/essentials-v21.1-local/` |
| 启动 | `play.bat` → Hostra → Desktop → `game.json` | 同左，要求本地已有真实 FSDB |
| `initial.subsystem` | `"map"` | `"map"` |
| `mapId, x, y` | `1, 10, 8` | `66, 8, 7`（项目试玩点，**不是** System/Home） |
| `characterName` | `"m14_player"`（脚本生成的 128×128 PNG） | `"trainer_POKEMONTRAINER_Red"`（官方 Characters 图） |
| Map 模块入口 | `subsystems/map.mjs` → `@loomrealm-game/map` 的 `mapDefinition` | 相同 |

Subsystem 创建链（**Runtime 消费**）：

```text
game.json
  → parseGameEntryV1
  → createPreparedHostraGame() 把 game.initial.input 写入 logicalBootstrap.initial.input
     （packages/game-launcher-hostra/src/launch-plan.ts 约 123–128 行）
  → 主进程启动 key="map" 的 Subsystem
  → defineSubsystem 工厂得到 scope（content / viewport / createInputListener / createRenderDomain）
     （packages/subsystem/src/host/run-subsystem.ts 约 263–270 行）
  → mapDefinition.frame(frame)
  → initialInput(frame.params) 读取四字段
```

`examples/*/subsystems/map.mjs` 只是 `export { default } from "@loomrealm-game/map"`，没有额外 Player 配置。

### 2.2 初始化：谁提供什么

`InitialInput`（`runtime.ts` 37、133–140 行）只接受：

`mapId`（正整数）、`x`/`y`（非负整数）、`characterName`（非空字符串）。多未知字段即抛错。

| 字段 | 来源 | FSDB？ | 默认 / 硬编码 |
| --- | --- | --- | --- |
| `mapId, x, y` | `game.json` `initial.input` | 否。只用来查 `struct.Map/{mapId}` 是否越界 | 越界 → `MAP_ACTIVATION_FAILED` |
| `characterName` | 同上 | 否。只用来拼资源键 | 空串非法 |
| 朝向 | **不是** input | 否 | 硬编码 `direction = 2`（下）。见 `runtime.ts` 364、876、889 行 |
| 行走图文件 | `scope.content.resource("resource.Graphics", "Characters/"+characterName)` | 是，**资源**不是 Record | 无 Player Record |
| 动画 pattern | Runtime 状态机 | 否 | 静止 `0`；行走起始 `1` 或 `3` |

**没有独立的 Player FSDB 定义。** `struct.PlayerMetadata` 虽已投影（上一份调查），Map Runtime **不读**。

三者不得混为一谈（与上一份调查一致，本次再核）：

| 来源 | 值 | 是否进入当前 Demo |
| --- | --- | --- |
| 原版 `System.@start_map_id/@start_x/@start_y` | 地图 1，(9,7) | 否 |
| `PlayerMetadata[1].WalkCharset` | `trainer_POKEMONTRAINER_Red` | **字符串碰巧相同**；Runtime 并未查询该表 |
| 本地 `game.json` | 地图 66，(8,7)，同名 charset | **是**，唯一启动来源 |

合成 Demo 的 `m14_player` 与 WalkCharset **无关**。

### 2.3 贴图如何变成 RenderDomain 资源

1. `loadMap` 读 `struct.Map` / `Tileset` / `MapTransfer` / `MapAction`，以及 Tilesets/Autotiles 资源（`runtime.ts` 331–357 行）。
2. 玩家图：`scope.content.resource("resource.Graphics", \`Characters/${input.characterName}\`)`（866–867 行）。
3. `ResourceRef = { namespace, key, contentVersion }`。`contentVersion` 来自 Content HTTP 头 `x-loom-content-version`（`content-client.ts` 50–53、117–121 行），格式 `sha256:…`。
4. FSDB 磁盘文件带扩展名，例如 `[resource]Graphics/Characters/trainer_POKEMONTRAINER_Red.png`；逻辑键去掉扩展名（FSDB-HTTP FDB-006/007：`关都地区/真新镇.png` → key `关都地区/真新镇`）。因此 `characterName` **不含** `.png`。
5. `createRenderDomain(renderState)` 投影唯一子节点 `key: "player"`、`tag: "lr-map-sprite"`（`runtime.ts` 118、304–308 行）。
6. Renderer `web-projector.ts` 约 261–262 行调用元素的 `receiveRenderData`。
7. Browser `ResourceHost._image`（`map.browser.js` 657–689 行）：用 PresentationResourceClient 按 **namespace+key+contentVersion** 再取字节；要求 `mime === "image/png"`；`createImageBitmap` 解码；按 identity 缓存；无主引用则释放。
8. 切帧与上屏见 §2.5。**Runtime 不打开 PNG、不校验宽高。** 4×4 检查只发生在 Browser。

缺失玩家图：`resource()` 失败 → `MAP_ACTIVATION_FAILED`。Browser 解码失败：重试 `[100,200,400]` ms 后 `dataset.mapVisualState = "failed"`。

### 2.4 运动：世界坐标 vs 视觉插值

**权威在 Runtime。** Browser 只对已提交的 `motion` 做时间插值，不决定能否走。

输入（仅键盘）：

- 通道：`keyboard.event` + `keyboard.state`（900 行）
- 方向映射：`semantics.ts` `directionForCode`，只认 `ArrowDown/Left/Right/Up` → RMXP 方向 2/4/6/8（179–184、372 行）
- **没有** WASD、没有跑步键、没有骑车/冲浪/钓鱼输入

按键按下把方向压入 `heldDirections`；无活动移动且不 `eventBusy` 时 `attempt(最后方向)`。

`attempt`（791–828 行）顺序：

1. 同格 `contacts` 传送 → `startTransfer`
2. `planMovement(map, tileset, x, y, direction, bridgeLevel)`（`semantics.ts` 753–791 行）
3. `blocked`：对目标格 `startHereOrFront`（桥/opaque）；出界则看 `edges`；否则 `publishBlocked`（只改朝向，不移动）
4. `walk` / `jump`：立刻把 **逻辑格子** 写成目标格，发布 `ActiveMove`，`setTimeout(finishStep, durationMs)`

| 计划 | 逻辑位移 | 持续时间 | 来源 |
| --- | --- | --- | --- |
| walk | 1 格 | `WALK_DURATION_MS = 250` | **对照源码** `Game_Character#move_speed=` 默认 3 → `move_time = 2.0/(2**3) = 0.25s`。当前项目常量，与默认原版步时一致 |
| jump（Ledge） | 跳过 1 格落到前方第 2 格 | `JUMP_DURATION_MS = 400` | **项目策略**（`semantics.ts` 101–102 行标注 `PROJECT-DECISION-PROVISIONAL`）。原版同速度 3 时 `jump_time * dist`，2 格约为 **500ms**，不一致 |
| jump 峰值 | `jumpPeakPx(2) = 2*32*3/8 = 24` | — | **对照源码** `Game_Character#jump`：`distance * TILE_HEIGHT * 3 / 8`。Browser `4*peak*t*(1-t)` 与原版抛物线等价 |

通行：`evaluatePassability` / `canMove` 用 Tileset `passages`、`priorities`、`terrain_tags` 与 `bridgeLevel ∈ {0,2}`。碰撞是 **1×1 逻辑格**，与 PNG 像素无关。

桥：踏入 `MapAction` bridge 后改 `bridgeLevel` 并重投影。opaqueRelated：失败退出，本套数据为 0 条，策略仍在。

切图：`beginTransfer` `domain.replace` 整棵树，`sceneEpoch+1`，朝向用规则的 `targetDirection` 或本次尝试方向，`bridgeLevel` 归 0。

窗口变化：`RESIZE_SETTLE_MS = 100`；移动中推迟到 `finishStep`。取消：`frame.signal` abort → `cancelled()`，清 timer、关 listener、关 domain。

镜头（**Runtime 消费**）：`computeCamera`（`semantics.ts` 397–404 行）把玩家格尽量放在逻辑视口中心；小地图夹到 0。移动时 `cameraMotion` 与玩家 `motion` 共用 `motionId`/`durationMs`。Browser `_tickAccepted` 对 camera 与 sprite 同步 lerp。

**世界位置**：timeout 结束前逻辑 `x,y` 已经是目标格。  
**视觉位置**：Browser 在 `durationMs` 内从 `fromScreenX/Y` 插到 `screenX/Y`。跳跃再减 arc。

动画帧（项目策略，不是 PNG 元数据）：

- 静止：`pattern = 0`
- 行走/跳跃：起始 `1` 或 `3` 交替；Browser 在进度 0.5 处 `(pattern+1)%4`
- 两步合起来经过 1,2,3,0，与原版“每格两帧、四帧一个循环”（`Game_Character#pattern_update_speed` 注释）结构相近
- **未实现** 原版 `step_anime`（原地踏步）独立通道

当前 **不支持**：跑步、骑车、冲浪、钓鱼、多角色跟随、事件自主巡逻。`boy_run` / `boy_bike` / `boy_surf` / `*_fish_offset` 只作为磁盘文件存在。

### 2.5 Player 贴图与绘制

链路：

```text
characterName
  → resource.Graphics / Characters/{name} + contentVersion
  → RenderDomain 节点 player.sprite
  → Browser createImageBitmap
  → frameWidth = image.width/4, frameHeight = image.height/4
     非整数 → TypeError "Character sheet must be 4 by 4"
     （map.browser.js 1125–1133、1486–1499 行）
  → sx = pattern * frameWidth
     sy = ((direction-2)/2) * frameHeight
     行顺序：dir2→行0，4→行1，6→行2，8→行3
  → 锚点：left = screenX + originX + (32-frameWidth)/2
           top  = screenY + originY + 32 - frameHeight
     （_paintSprite 1381–1395 行）
  → 深度：visualPixelY + 32 + (frameHeight>32 ? 31 : 0)
     characterStackValue = depth*2+1，插在同 depth 的 tile（*2）之上
```

与对照源码 `Sprite_Character#refresh_graphic / #update` 对齐：

- `@cw = bitmap.width/4; @ch = bitmap.height/4`
- `sx = pattern * @cw; sy = ((direction-2)/2) * @ch`
- `ox = @cw/2; oy = @ch`（文件名含 `offset` 时 `oy = @ch-16`）
- `screen_z`：高度大于 32 时加 `TILE_HEIGHT-1`（=31）

**图片变高只改变视觉尺寸、锚点和深度，不改变占格。** Runtime 始终按一格 `(x,y)` 做通行。

真实 Player 图 `trainer_POKEMONTRAINER_Red`：

- 路径类别：`Graphics/Characters/`
- 磁盘：`[resource]Graphics/Characters/trainer_POKEMONTRAINER_Red.png`
- 像素：128×192，8 位 RGBA
- 4×4 单帧 32×48；16 格均有不透明像素；整体不透明包围盒大约从 y=8 落到 y=191（头上留白、脚贴底）
- 行/列语义：**对照源码 + 当前 Browser 公式**；PNG 内没有方向标签。本次未做人工逐帧看图，方向是否真是下/左/右/上标为待视觉确认，但引擎与程序约定一致

合成 `m14_player`：128×128，单帧 32×32，16 格全满，由 `generate-fixtures.mjs` 按行填纯色。测试消费的是它，不是 Red。

固定 `player` 身份：

- Render 树只有一个 `lr-map-sprite` 子节点，key 恒为 `"player"`
- `_spriteChild()` 只 `find` 第一个 `LR-MAP-SPRITE`
- 定位写在 **一条** `::slotted(lr-map-sprite)` CSS 规则上（787–791、1396–1402 行）。多个 sprite 会共享同一 left/top
- `tokensEqual` 要求 view 与 **那一个** sprite 的 epoch/motionId/bridgeLevel 一致

因此：即使将来往 RenderDomain 塞第二个角色节点，**不改 Browser 也无法独立放置 NPC**。

### 2.6 当前 Player 最小依赖清单

**1. 静态素材数据**

- 一张 PNG，逻辑键 `resource.Graphics` / `Characters/{characterName}`
- 宽高都能被 4 整除（Browser 硬性）
- 约定：4 列 = pattern 0–3，4 行 = 方向 2/4/6/8
- 不要求 `$`/`!` 前缀（本套 211 张 Characters 均为 0）

**2. 实例初始化数据**（来自 Builder/启动参数，不是 FSDB Player Record）

- `mapId, x, y, characterName`
- 朝向当前不在 input 里

**3. Runtime 动态状态**

- 逻辑 `x,y`、`direction`、`bridgeLevel`
- `activeMove`（walk/jump、from、duration、startPattern、jump 的 peakPx）
- `heldDirections`、`sceneEpoch`/`visualEpoch`/`motionId`
- 唯一 `playerRef`

**4. 程序内置规则**

- 32px 格、250ms 走、400ms 跳、24px 跳弧（2 格）
- 镜头跟逻辑格
- 锚点：水平居中于格、脚对齐格底
- 高帧（>32）只影响绘制与 z，不影响碰撞
- 键盘方向与 RMXP 2/4/6/8
- 单 player 节点

---

## 3. 真实 NPC 素材样本与移动机制

扫描范围：本地真实 FSDB 全部 69 张 `Map*.rxdata`（503 事件 / 688 页）。事件 ID 仍是图内局部 ID；同名贴图跨图出现 **不是** 同一 NPC 定义。

### 3.1 素材样本

#### 样本 A — 与 Player 同规格的人形 NPC：`NPC 06`

| 项 | 值 |
| --- | --- |
| 事件 | 地图 2 事件 3 等；该图名在 3 张地图、4 个页出现。跨图最多的人形之一是 `NPC 01`（9 张地图、18 页） |
| 资源键 | `Characters/NPC 06`（文件名含空格） |
| PNG | 128×192，单帧 32×48，16 格均有像素 |
| 帧排列依据 | 对照源码整图 `/4`；与 Player 相同 |
| 当前 Player Browser | 数学上可切帧；锚点同样脚对齐 32 格 |
| 适配 | 不改 Browser 则无法作为第二 sprite 上屏。产品未画过该 NPC |

#### 样本 B — 不同帧高：`NPC 29`

| 项 | 值 |
| --- | --- |
| PNG | 192×192，单帧 48×48 |
| 含义 | 比 Player 更“胖高”。Browser 会把 48×48 居中在 32 格上并向上伸出 |
| 碰撞 | 仍是事件所在一格（除非事件名 `size(w,h)`） |
| 兼容 | **静态格式看似兼容，尚未运行验证**。视觉会明显大于一格 |

同类：`boy_bike` / `girl_bike` / `trainer_BIKER` 等 192×192。

#### 样本 C — 跨图复用贴图：`NPC 01`

9 张地图共用同一 PNG。每个事件仍有自己的 `@id/@x/@y/@list`。这只证明 **素材文件可复用**，不是 NPC 定义 ID。

#### 样本 D — 门图（易被误当成角色）：`doors7`

| 项 | 值 |
| --- | --- |
| 事件例 | 地图 66 事件 1（上一份调查） |
| PNG | 128×128，**4 位索引色**（`bitDepth=4, colorType=3`）。`doors5` 则为 8 位 RGBA |
| 单帧 | 32×32 |
| 原版用法 | command 209 **对本事件** 做 turn-left/right/up + wait，用“朝向行”播放开门，而不是角色走路 |
| 兼容 | 宽高可 4 整除；**语义不是四向行走**。索引色 PNG 预期可由 `createImageBitmap` 解码，本次未跑窗口 |

### 3.2 真正能够移动的 NPC（四种结论分开）

全库 `move_type` 直方图：**687 页 = 0（固定），1 页 = 3（自定义路线）。无 1（随机）/ 2（靠近玩家）。**

自主 `move_route` 中含位移命令（1–14）的页：**0**。

command 209（设置移动路线）：**416** 条。目标只有 `0`（本事件）24 条、`-1`（玩家）16 条。**没有** `target > 0`（指挥其他事件）。

含位移的 209 **全部 target=-1**：门/楼梯把 **玩家** 推进门里，不是 NPC 巡逻。

CommonEvents.rxdata 中 command 209：**0**。

#### 唯一 `move_type=3`：地图 69 事件 4 `Swimmer`

- 位置 (23,14)，贴图 `trainer_SWIMMER2_M`（128×192）
- 自定义路线：单条 MoveCommand **45 脚本** `move_random_range(2,2)`，`repeat=true`，`skippable=true`
- 对照源码 `Game_Character#move_type_custom` 对 `move_random_range` 会 `eval` 该脚本（本次 **未执行**）

| 命题 | 结论 |
| --- | --- |
| 素材具备行走动画帧 | **是**（128×192，16 格有像素） |
| 原始地图配置会使该事件移动 | **间接是**：不是格子位移列表，而是自定义脚本名 |
| 原版脚本可能使角色移动 | **对照源码支持** `move_random_*`；**未跑 Game.exe** |
| 当前 LoomRealm Runtime 已实现 | **否** |

**本套合法样本里，找不到“地图数据里写死上下左右巡逻”的 NPC。** 能站得住的移动证据是：(1) 游泳者随机范围脚本；(2) 大量 209 用于 **玩家** 进门。不能把 209 计数当成 NPC 会走。

`step_anime=true` 的 14 页全是地图 5 浆果树，属于原地动画，不是走格。

---

## 4. 宝可梦地图素材及引用

### 4.1 `Graphics/Pokemon` 不是行走图

对照源码 `Data/Scripts/010_Data/002_PBS data/009_Species_files.rb`（commit `ea7b5d56`）：

| 方法 | 目录 | 本地数量（真实 FSDB） | 典型尺寸 |
| --- | --- | --- | --- |
| `front_sprite_filename` | `Graphics/Pokemon/Front`（及 shiny） | 834 + 832 | 多为 160×160 |
| `back_sprite_filename` | `Back` / `Back shiny` | 834 + 832 | 160×160 |
| `icon_filename` | `Icons` | 714 | **全部** 128×64 |
| `footprint_filename` | `Footprints` | 649 | 32×32（计入 Pokemon 尺寸直方图） |
| `shadow_filename` | `Shadow` | 3 | — |
| `egg_sprite_filename` | `Eggs` | 5 | 含 160×160 |

`PokemonIconSprite`：`src_rect` 宽=高=图片高度 → 128×64 即 **横向 2 帧 64×64**，不是 4×4 角色表。

官方 ZIP / 本地 FSDB **没有** `Graphics/Pokemon/Followers`（ZIP 路径名含 Follow 的条目为 0）。

把 Front 160×160 丢进当前 Player 切帧：数学上 40×40 的 4×4，**语义是战斗立绘**。结论：**需要明确适配**（不应当行走图）。

### 4.2 真正有地图引用的宝可梦行走图在 `Graphics/Characters`

目录中有 `Pokemon 01.png` … `Pokemon 12.png`。全库事件里 **明确引用** 的只有：

| 地图 | 事件 | 名称 | 贴图 | 尺寸 / 4×4 单帧 | 备注 |
| --- | --- | --- | --- | --- | --- |
| 72 | 8 | Deoxys | `Pokemon 12` | 256×256 / 64×64；第 4 列透明 | 页 1 空图（击败/消失类页切换） |
| 73 | 8 | Mew | `Pokemon 09` | 128×128 / 32×32；仅左两列有像素 | `pattern=1`；后续页空图 |

`Pokemon 01–08、10、11` **有文件、无地图事件引用**（本套 69 张图）。不能因为文件在 Characters 就当成已投放的地图 NPC。

像素观察（8 位图透明包围盒，**不是**人工看图确认方向）：

- `Pokemon 01/02/03/05/06/07/10`：16 格都有像素，单帧 32×32 → **静态格式看似兼容**
- `Pokemon 04/08/12`：第 4 列空 → 切出 pattern 3 会是空白帧
- `Pokemon 09`（Mew，有地图引用）：只有 2 列有像素 → 更像 2 帧/向，硬切 4×4 会错
- `Pokemon 11`：192×192，16 格满，单帧 48×48
- `Pokemon 12`（Deoxys，有地图引用）：64×64 帧，大于一格

跟随宝可梦：对照源码有 `Game_Follower` / `Followers.add`，跟随者使用 **事件自己的 `character_name`**（Characters），**不是** `Graphics/Pokemon/Front`。本套地图事件 **没有** 把 `Pokemon 0N` 注册为 follower 的静态证据。官方包 **未发现** 可验证的跟随专用素材目录。

---

## 5. 图片尺寸与帧布局统计

`Graphics/Characters` **211** 张（ZIP 与 FSDB 计数一致）。**全部** 宽高可被 4 整除。`$`/`!` 前缀 **0**。文件名含 `offset`：**2**（`boy_fish_offset`、`girl_fish_offset`，384×320 → 单帧 96×80）。无 `boy.png`（有 `boy_run`/`boy_bike`/`boy_surf`）。

| 尺寸 | 张数 | 4×4 单帧 | 主要含义（观察） |
| --- | --- | --- | --- |
| 128×192 | 103 | 32×48 | 标准人形（Player、多数 NPC、训练家） |
| 128×256 | 68 | 32×64 | 几乎全是 `berrytree_*` |
| 128×128 | 21 | 32×32 | 物、部分 `Pokemon 0N`、部分门 |
| 192×192 | 7 | 48×48 | 自行车、个别 NPC/Pokemon |
| 256×256 | 4 | 64×64 | `base_surf/dive`、`e4wall`、`Pokemon 12` |
| 256×192 | 2 | 64×48 | `Healing balls 1/2` |
| 384×320 | 2 | 96×80 | 钓鱼 offset |
| 32×32 | 3 | 8×8 | 浆果状态小图 |
| 128×320 | 1 | 32×80 | `elevatorwall` |

“可被 4 整除”只说明 Browser **不会抛** `Character sheet must be 4 by 4`。不证明：

- 行=方向、列=走步
- 空列不是有意的 2/3 帧表
- 战斗图/图标/浆果树适用同一套行走规则

对照源码 **不再** 使用 RMXP 的“无 `$` 则一张图 8 个人物”。`Sprite_Character` 对任意 Characters 图整张 `/4`。本套无 `$` 与该实现一致。

`offset`：原版 `character_name[/offset/i]` 时 `oy = ch-16`。当前 Browser **没有** 该规则；用钓鱼图当 Player 会脚点偏低。**需要明确适配**（若要支持），或约定不把 offset 图当普通行走图。

---

## 6. 兼容性矩阵

| 样本类别 | 实际素材与尺寸 | 帧布局证据 | 当前 Player 绘制兼容性 | 需要适配的内容 | 证据级别 |
| --- | --- | --- | --- | --- | --- |
| 真实 Player | `trainer_POKEMONTRAINER_Red` 128×192；合成对照 `m14_player` 128×128 | 引擎与 Browser 均为整图 4×4；Red 16 格有像素；合成图由测试着色 | 产品路径会加载 Red；**本轮未开窗口**。合成图有 Runtime 测试，无 Browser 像素测试绑定 Red | 朝向不在 input；无 `$`/`offset` 处理 | Red：**静态格式看似兼容，尚未运行验证**。合成 4×4 规则：**已验证**（代码+fixture 测试，不是原版图） |
| 普通 NPC | `NPC 06`/`NPC 01` 128×192；`NPC 29` 192×192 | 同 4×4 公式 | 数学可切帧；**无第二 sprite** | 多实体、独立定位、碰撞是否仍 1×1 | **静态格式看似兼容，尚未运行验证** |
| 实际移动 NPC | 仅 Map69 E4 游泳者 128×192 + `move_random_range(2,2)` | 素材同人形；移动靠 Ruby | Runtime 不跑该脚本、不画该事件 | NPC 运动模型；不可执行原版脚本 | 素材静态看似兼容；**运动未实现** |
| 地图宝可梦 | 事件只用 `Pokemon 09`、`Pokemon 12`；另有未引用的 01–11 | 09 仅两列不透明；12 为 64×64 且缺第 4 列 | 硬切 4×4 会错切或空白帧 | 非 4 帧、非 32×48、页切换空图 | **需要明确适配**（09/12）；01 类 **静态看似兼容、无事件引用、未运行验证** |
| 特殊尺寸 / 非角色 | 门 128×128；浆果 128×256；图标 128×64；战斗 160×160；钓鱼 384×320 | 门用“转向”做动画；图标是 2×64 横条；战斗图非 charset | 多数能通过整除检查但语义错误 | 素材类型、横条切帧、offset 锚点 | **需要明确适配** 或不当作角色素材 |
| 跟随宝可梦专用图 | 官方包中 **未发现** Followers 目录 | — | — | 若业务需要跟随，素材不在 v21.1 Pokemon 目录里 | **未发现** |

---

## 7. 自定义 NPC 素材能力需求（不写 Schema）

只讨论角色素材与运动，不设计 npcId、对话、AI、任务或 Event/Page 状态机。

| 候选能力 | 当前 Player 有无 | 真实素材为何提出 | 若不添加 | 可否先用默认约定 |
| --- | --- | --- | --- | --- |
| 逻辑素材引用（namespace+key，不含扩展名） | 有：`Characters/{characterName}` | 全部 Characters / 地图宝可梦都靠文件名 | 无法加载 | **先保留这一条即可** |
| 帧布局与每帧尺寸 | 无字段；程序 `/4` | `NPC 29` 48×48、`Pokemon 12` 64×64、Mew 非满 4 列 | 非 4×4 语义图会被切错 | 若协议 **只许** 整图 4×4 PNG，可暂不写行列字段，但必须 **拒绝** 图标/战斗图 |
| 方向与动作帧映射 | 硬编码 RMXP 2/4/6/8 与行号 | 门图把行当开门动画；Mew 可能不是 4 向 | 门/特殊宝可梦方向错 | 角色行走图可默认 RMXP 行序；门/道具不要当 NPC 行走图 |
| 静止 / 行走动画配置 | 硬编码 pattern 0 与 1↔3 | 浆果 `step_anime`；原版每格两帧 | 原地动画、多帧走步无法表达 | 第一版 NPC 可复用 Player 两帧/步；`step_anime` 可后补 |
| 视觉锚点与逻辑占格 | 锚点硬编码；占格恒 1×1 | 高精灵、offset 钓鱼图、`size(w,h)` 事件 | 大图踩格错、offset 脚点错 | **占格与贴图必须分开**。默认 1×1 占格 + 脚对齐格底，可覆盖多数 32×48 NPC |
| 不同动作不同图 | 无；RunCharset 不切换 | `boy_run`/`boy_bike`/`boy_surf` 独立文件 | 不能跑/骑 | 第一版可不做；不要把多动作文件名写进必填字段 |
| 格式版本 / 素材类型 | 无 | Characters 行走图 vs Pokemon Front vs Icons | 误把 160×160 当 charset | **建议有一个粗类型或约定目录**，哪怕只是文档约定 `character-sheet-4x4` |

不要因为 Essentials 有 Event Page、`$` 前缀或 693 个 Item 就把它们塞进 NPC 素材协议。本套数据 **没有** `$` 前缀；Page 条件属于身份/状态，不在本次范围。

运动能力若要与 Player 共用：走 1 格、250ms、四向、可选跳弧。游泳者那种 `move_random_range` **不应**变成通用 NPC 协议里的可执行脚本。

---

## 8. 已验证事实、静态推论、未验证问题与复核索引

### 8.1 已验证事实

- 官方 ZIP 身份与本地 FSDB 仍在，Characters 211、Pokemon 4703。
- Player 四字段仅来自 `game.json`；朝向硬编码 2；无 Player Record。
- Browser 强制整图 4×4；锚点脚对齐 32 格；高帧 +31 深度；碰撞仍是一格。
- 当前 Render 树只有一个 `player` sprite；CSS 槽位不能独立放多个角色。
- 全库几乎无自主走格 NPC；唯一 move_type=3 是游泳者脚本；209 位移只作用于玩家。
- 地图上的宝可梦行走图是 `Characters/Pokemon 0N`，不是 `Graphics/Pokemon/Front`。
- 官方包无 Followers 图像目录。

### 8.2 静态推论（未跑窗口）

- 128×192 人形 NPC 可用与 Player 相同的切帧/锚点画出来。
- 与原版 `Sprite_Character` 共用 4×4 与深度规则，适合作为“角色表”默认约定。
- 多 NPC 必须改 Browser（独立节点位置），不能只加 FSDB 字段。

### 8.3 未验证

- Red / NPC / Mew / Deoxys 在产品窗口中的实际像素与方向是否正确。
- `move_random_range` 在原版里的具体步态。
- `Pokemon 09` 两列是否为左右镜像或仅左右向。
- 4 位索引 `doors7.png` 在 Chromium `createImageBitmap` 下的表现（预期可解码，未测）。
- 第二个非 Essentials 游戏是否仍接受 RMXP 方向行序。
- 跟随伙伴在本套示例流程中是否会被 `Followers.add` 创建（需跑游戏或读开场事件脚本，本次未做）。

### 8.4 复核索引

**代码**

| 路径 | 作用 |
| --- | --- |
| `game-libs/map/src/runtime.ts` | 启动、输入、移动、唯一 player 节点 |
| `game-libs/map/src/semantics.ts` | 250/400ms、镜头、planMovement、方向 |
| `game-libs/map/browser/map.browser.js` | 4×4 切帧、锚点、单槽 CSS、PNG 缓存 |
| `packages/game-launcher-hostra/src/launch-plan.ts` | `game.json` input → frame.params |
| `packages/fsdb-http/CONFORMANCE.md` FDB-006/007 | 资源键去扩展名 |
| 对照源码 `005_Sprites/003_Sprite_Character.rb` | 整图 /4、ox/oy、offset、screen_z |
| 对照源码 `004_Game classes/006_Game_Character.rb` | 步时、跳弧、pattern、move_type |
| 对照源码 `009_Species_files.rb` | Pokemon Front/Back/Icons 路径 |
| 对照源码 `010_Game_Follower.rb` | 跟随者仍用 Characters |

**真实样本标识**

| 标识 | 含义 |
| --- | --- |
| ZIP sha256 见 §1.2 | 官方 v21.1 |
| `trainer_POKEMONTRAINER_Red` | 真实 Demo Player 图 |
| `NPC 06` / `NPC 01` / `NPC 29` | 人形 NPC 素材 |
| Map 69 Event 4 | 唯一自定义移动页 |
| Map 72 Event 8 / Map 73 Event 8 | Deoxys / Mew |
| `Pokemon/Icons/*.png` 714×128×64 | 背包/UI 图标 |

**命令与结果（摘要）**

```text
对官方 ZIP 再算 size/sha256 → 与 OFFICIAL_ARCHIVE_IDENTITY 一致
列出本地 FSDB Graphics 与解码 69 张地图
→ Characters 211；尺寸直方图见 §5；move_type 687×0 + 1×3
→ command 209 = 416，位移目标仅玩家
→ Pokemon 目录无 Followers；事件仅引用 Pokemon 09 与 12
```

临时脚本与 JSON **未提交**。

---

## 9. 下一轮设计最需要解决的问题

1. **共用核心是否就是“4×4 角色表 + 1 格占格 + 脚对齐 + 四向走步”？** 静态证据支持以此为 Player/NPC 默认；例外必须显式标类型，而不是扩展成万能切帧器。
2. **Browser 何时允许多于一个 `lr-map-sprite`，以及定位是每节点 style 还是继续用槽位 CSS？** 不回答则 NPC FSDB 无法上屏。
3. **地图宝可梦是否纳入第一版 NPC 素材？** 若纳入，至少要处理 Mew 的非满 4 列和 Deoxys 的 64×64；若排除，协议写明只接受 32×48（或“宽高 /4 且 16 格都有像素”）的 Characters。
4. **NPC 要不要移动？** 本套数据几乎不靠格子路线巡逻。若第一版只站立对话，运动协议可先等于 0；不要为了一个 `move_random_range` 引入可执行脚本。
5. **启动朝向要不要进入 Builder 输入？** 现在硬编码下；NPC 实例几乎肯定需要朝向字段，Player 是否对齐是产品决定。

---

## 10. 对验收问题的直接回答

> 能否从现有 Player 中抽取一套可供 Player 和 NPC 共用的角色素材与运动能力？哪些 Essentials NPC、宝可梦素材可以直接使用，哪些需要额外的素材描述或渲染适配？

**可以抽取一套很窄的共用约定，但不能声称当前模块已经能画 NPC。**

共用约定（有代码与原版源码双重证据）：整张 PNG 4×4 切帧、RMXP 方向行、pattern 列、脚对齐 32 格、占格与贴图分离、走一步改逻辑格并由 Browser 插值。

| 素材 | 建议 |
| --- | --- |
| 多数 `NPC ##`、训练家、Red/Leaf 的 128×192 | 可当默认角色表；**产品未画 NPC** |
| `NPC 29` 等 48×48 帧 | 同一套切帧能吃，画面会溢出格；占格仍 1×1 |
| `Pokemon 09` / `12` | **不要**当未加描述的默认表 |
| `Graphics/Pokemon/Front|Back|Icons` | **不是**地图行走图 |
| 跟随专用包 | **本套未发现** |
| 门、浆果、钓鱼 offset | 不是通用 NPC 行走能力 |

未验证的部分保持开放：窗口里的真实像素、Mew 帧语义、游泳者脚本步态、多实体 Browser。
