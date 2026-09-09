# M14 / 04 — First Real Game Vertical

> 状态：Implementation Landing / M14 Pending

## Objective

证明完整 consumer chain，而不是再次证明单个 M10–M13 contract：

```text
concrete example Game Entry
→ @loomrealm-game/map
→ @loomrealm/subsystem author APIs
→ Frame / Input / Content / Render
→ M13 Web Presentation
→ map-owned Custom Elements
→ observable playable map slice
```

M14 不引入额外 map normalized schema。RMXP/Essentials 提供 map semantic authority；Runtime 只消费 prepared FSDB 中的 JSON records/resources，并通过 `ContentClient` 访问它们。

## Required trace

至少覆盖：

```text
examples/essentials-v21.1/game.json
→ parseGameEntryV1 / validateGameEntryV1
→ validated logical subsystem topology + initial target/input
→ test-owned physical binding to @loomrealm-game/map Definition
→ Main launch / initial Frame
→ prepared Content view
    importer/fixture Map/Tileset/... JSON records + raw resources
    + map browser JS/CSS
    + example WebPresentationConfig refs
→ ContentClient.record() reads Map/Tileset/MapInfo/MapMetadata JsonValue as needed
→ player spawn from validated initial business input
→ create InputListener + RenderDomain
→ map runtime ContentClient.resource() resolves at least one visible resource and obtains contentVersion
→ publish initial map/player Render state
→ Render data carries logical resource namespace/key/version only
→ M13 Projector creates map WC
→ WC uses PresentationResourceClient for real tileset/player bytes
→ directional input accepted through M10 path
→ map business state moves player
→ RenderDomain update
→ existing HTMLElement identity reused where required
→ visible map/player result changes
```

`RPG::Map` / `RPG::Tileset` 等名称用于说明这些 FSDB JSON records 应保持的业务语义，不是 vertical 中传给 map runtime 的 decoder object 类型。测试不得通过直接构造 `RmxpObject`、`RPG::*` decoder instance 或 `$id/$ref/$typed` wrapper 绕过 FSDB + ContentClient boundary。

第一版 `Map/{id}` 保持 `events` 嵌套；不为 M14 拆 `MapEvent` Group 或新增 `ContentClient.group()`。

如果所选真实 interaction 自然需要另一个 Subsystem，可增加一次 `frame.call/return`；不得为了覆盖率创建假的 reusable dialogue/battle library。

## Game Entry evidence

M14 必须证明 concrete example 真正参与，而不是测试代码直接构造 map Runtime。

```text
example game.json
→ existing Game Package parser/validator
→ logical keys + initial target/input
→ test-owned physical Definition binding
→ existing Main
```

M14 不要求 Hostra/PWA Launch Manifest；physical binding仍只是 qualification mechanics。

第一条 vertical 可使用最小 initial input：

```json
{
  "mapId": 1,
  "x": 10,
  "y": 8
}
```

因此 player spawn 来自 concrete game 的业务输入，而不是测试内隐藏常量；完整 `RPG::System` startup compatibility 不是 M14 first-slice prerequisite。

## Prepared Content assembly evidence

M14 必须只存在一个 qualification 使用的 prepared Content view：

```text
importer-produced FSDB or CI-safe semantic fixture
+
@loomrealm-game/map browser JS/CSS
+
example WebPresentationConfig logical refs
→ example/test preparation
→ one prepared Content view
```

这个 preparation step 只负责组装，不重新解释 RMXP/Essentials map semantics，不成为 Runtime dependency，也不形成 production `GamePackager` / `ContentBuilder` framework。

Essentials importer 不得开始理解 map browser JS/CSS；反过来 example preparation也不得重新解析 PBS/Marshal/RMXP source。

## Presentation startup evidence

Map browser presentation必须走真实 M13 startup path：

```text
@loomrealm-game/map browser JS/CSS
→ prepared Content
→ WebPresentationConfigV1
→ M13 bootstrap
→ customElements registration
→ Projector
```

Qualification 不得通过 test-local direct import、手工 `customElements.define()` 或 privileged URL shortcut 绕过 bootstrap。

## Qualification composition boundary

M14 使用 test-owned composition harness 串联现有 production roles：

```text
test-owned harness
→ existing Main / Subsystem / Data / Renderer / Content implementations
→ existing/synthetic RendererInputSource producer
→ real Chromium
```

Harness 只是 qualification mechanics，不是新的 architecture/product role。M14 不创建 production `MiniDesktopHost`、`MapHost`、`GameRuntimeHost` 或 `IntegrationPlatform`。

完整 Hostra Launcher、Electron BrowserWindow、physical keyboard/gamepad、reload/shutdown 仍属于 M15。

## Browser/resource evidence

M13 已关闭 generic browser semantics，M14 只证明真实 map consumer 可以自然使用它。仍应使用 real Chromium 观察实际 Custom Element/Canvas/DOM result，但不重复 M13 的全部 unknown-tag/reconnect conformance matrix。

至少一个真实可见资源，第一选择 tileset，必须完整走：

```text
FSDB semantic JSON record
→ logical resource namespace/key
→ map runtime ContentClient.resource(namespace, key)
→ contentVersion
→ Render data { namespace, key, contentVersion }
→ receiveRenderData
→ PresentationResourceClient
→ browser bytes
```

Runtime 从 `ContentClient.resource()` 得到的 bytes 若业务侧不需要，不长期保留，也不放进 Render state。

M14 接受 Runtime/Renderer 对同一 resource 可能各读一次；不为此新增 M12 resource metadata/HEAD author API。只有真实 workload 证明这造成 measurable problem，才允许用 consumer evidence讨论最小 reopen。

## Performance evidence

记录真实 map workload 下：

```text
Render update frequency
node count / changed-node shape
projection duration distribution
input-to-visible-update latency
```

只有测得同步 projection 产生真实 frame pressure，才允许最小 reopen M13 scheduling mechanics。M14 不预建 Scheduler/EventQueue。

## Failure boundary

Example/game-lib failure 不得通过 shortcut 修改 Main/Renderer authority。Content、Input、Render、Presentation 仍各自服从 M10–M13 frozen semantics。

Semantic projection 若遇到 M14-required 但无法无歧义转成 JsonValue 的 source fact，必须在 preparation 阶段 fail closed；不得让 generic importer wrapper穿透到 Runtime。

## Non-goals

```text
new universal map content model
Runtime consumption of importer/RMXP decoder objects
ContentClient.group() only for MapEvent decomposition
new resource metadata/HEAD author API
full RPG::System startup compatibility
Electron BrowserWindow full composition
physical keyboard/gamepad final Desktop path
Renderer reload/shutdown full trace
complete Essentials gameplay
PWA Runtime/equivalence
```

这些分别属于真实后续 consumer、M15–M17 或后续 game libraries。

## Closure

M14/04 通过时应能人工/自动回答：

> 一个真实 `game.json` concrete game 是否能让 reusable map library 通过 `ContentClient` 消费 prepared FSDB JSON records（其业务语义与 RMXP/Essentials map model 对齐），使用现有 Content resource/version capability，只通过 public LoomRealm contracts，在真实 M13 browser presentation 中得到可玩的地图切片？
