# M14 Consumer Projection — RMXP/Essentials → Runtime FSDB JSON

> 状态：M14 Implementation Addendum / Preimplementation Frozen Candidate  
> 适用范围：`tools/fixtures/essentials-v21.1` 在 M14 新增的 consumer-facing semantic projection  
> 依赖：`DESIGN.md`、`IMPLEMENTATION.md`、M12 Content API、M14 Map Game Library  
> 日期：2026-09-09

本文补充现有 Essentials v21.1 importer 设计与 RC 事实，不推翻既有 qualification。

现有 importer RC 已证明：

```text
source acquisition
→ PBS / Marshal / RMXP decode
→ canonical / derived facts
→ current FSDB mapping
→ production openFsdb / integrity / Oracle qualification
```

M14 新增的工作只解决一个真实 consumer 缺口：

```text
lossless RMXP/internal representation
→ Runtime-safe JSON semantic records
→ M12 ContentClient
→ @loomrealm-game/map
```

它不是新的通用 map schema，也不是新的 importer architecture layer。

---

## 1. Authority Boundary

三层必须分开：

```text
RMXP / Essentials source semantics
    → 字段含义、关系、运行行为的 authority

Importer structural representation
    → Marshal graph / RmxpObject / RubyString / typed arrays / object identity

M14 consumer projection
    → 普通 JsonValue FSDB records
```

M14 Runtime MUST NOT 接收：

```text
RmxpObject
RubyString
RubySymbol wrapper
GenericRubyObject
GenericMarshalNode
rubyObjectId
$id / $ref / $typed
Buffer / Int16Array runtime object
```

这些 representation 可以继续存在于 importer 内部或 lossless structural evidence 中，但不是 map Runtime API。

---

## 2. First-slice FSDB Identities

M14 第一条 vertical 优先 materialize：

```text
Map/{mapId}
Tileset/{tilesetId}
MapInfo/{mapId}
MapMetadata/{mapId}        when needed
```

`mapId` / `tilesetId` 使用十进制 logical key spelling，例如 `1`、`42`；文件名零填充如 `Map001.rxdata` 不进入 Runtime logical identity。

M14 不为表型美观创建：

```text
MapBundle
MapEvent Group
MapLayer Group
universal map record
```

`RPG::Map.events` 在第一版继续嵌入 `Map/{mapId}` record，保持 RMXP 原有 ownership，也避免为 M14 引入 Subsystem `ContentClient.group()` 能力。

---

## 3. Mechanical JSON Projection Rules

Projection MUST 是机械的、可测试的，并尽量保留既有 RMXP spelling。这里的规则是 consumer boundary invariant，不允许 map Runtime 或 example 再做第二次 representation conversion。

### 3.1 Known RPG/RMXP object

对 `RmxpObject` 的 known fields：

```text
strip exactly one leading "@"
preserve remaining field spelling
recursively project field value
```

例如：

```text
@tileset_id   → tileset_id
@autoplay_bgm → autoplay_bgm
@move_type    → move_type
@character_name → character_name
```

不得仅为 JavaScript 风格把它们改成 camelCase，也不得重命名为 LoomRealm 自创 vocabulary。

以下 decoder metadata 不进入 consumer record：

```text
kind
className
rubyObjectId
```

### 3.2 Primitive values

Ruby/Marshal primitive 必须直接落成等价 JsonValue，不允许 wrapper：

```text
nil         → null
true/false  → JSON boolean
Integer     → JSON number, only when exactly representable as a JavaScript safe integer
Float       → finite JSON number
```

对 M14-required consumer fact：

```text
Integer outside Number.isSafeInteger range → fail closed
NaN / +Infinity / -Infinity                → fail closed
```

不得通过 decimal string、tagged number、`$typed` 或其他 M14-only wrapper 绕开 JsonValue boundary。未来若真实 consumer 需要超出该范围的数值语义，再基于 consumer evidence定义最小 semantic projection。

### 3.3 Ruby text/symbol

```text
RubyString with semantic text → JSON string
RubySymbol                    → symbol name JSON string
```

M14-required field 若只有 opaque/binary Ruby string 而没有已定义 semantic text projection，materialization MUST fail closed for that required consumer fact；不得把 bytes/base64 wrapper伪装成业务字符串。

Raw/lossless authority仍由 importer已有 structural/raw path保留。

### 3.4 Array

```text
Ruby Array wrapper
→ JSON array
→ recursively projected elements
```

### 3.5 Hash

M14-required RMXP map Hash 若 key 为 integer/string/symbol scalar，可 materialize 为 JSON object：

```text
integer key → decimal string key
string key  → same string
symbol key  → symbol name
```

`RPG::Map.events` 因此表示为按 event id 索引的 JSON object，例如：

```json
{
  "1": { "id": 1, "name": "...", "x": 10, "y": 12, "pages": [] }
}
```

若 M14-required Hash 使用 non-scalar key、Ruby default semantics 或无法无歧义投影的 key collision，MUST fail materialization，直到有真实 consumer 驱动的明确 semantic handler；不得泄漏 generic Hash wrapper给 Runtime。

### 3.6 RGSS Table

现有 decoder 已把 RGSS `Table` payload 按 serialized element order 解成：

```text
dimensions
xSize
ySize
zSize
values: Int16Array
```

M14 consumer JSON 固定为：

```json
{
  "dimensions": 3,
  "xSize": 40,
  "ySize": 30,
  "zSize": 3,
  "values": [0, 0, 384, 385]
}
```

Consumer representation MUST 保持 RGSS Table 的元素顺序。坐标到 `values` 的索引固定为：

```text
index(x, y, z) = x + y * xSize + z * xSize * ySize
```

因此 x 是最内层/最快变化维度，随后是 y，再随后是 z。对 1D/2D Table，未使用维度按 decoder/RGSS shape 取 size 1，consumer 不创建另一套 flattening convention。

Materialization MUST 验证：

```text
values.length === xSize * ySize * zSize
0 <= x < xSize
0 <= y < ySize
0 <= z < zSize
```

M14 qualification 至少用已知非零坐标样本证明 serialized order 与该 index rule 一致，避免只验证 `values` 是 number array 却把轴顺序实现错误。

`values` 中每个值是 JSON number，保留原 Int16 数值；不得输出 `$typed` 或 base64 wrapper，也不为此建立 Runtime `Table` framework/class。

### 3.7 Color / Tone

若 M14-required nested object包含现有 typed `Color` / `Tone`，直接使用 decoder 已定义的数值字段：

```text
Color → { red, green, blue, alpha }
Tone  → { red, green, blue, gray }
```

所有分量必须是 finite JSON number；非有限值对 required fact fail closed。不携带 `kind` / `rubyObjectId` / ivar transport metadata。

### 3.8 Nested known objects

`RPG::AudioFile`、`RPG::Event`、`RPG::Event::Page`、`Condition`、`Graphic`、`EventCommand`、`MoveRoute`、`MoveCommand` 等 M14 所需 known object递归使用同一规则。

例如 `EventCommand` consumer shape自然成为：

```json
{
  "code": 355,
  "indent": 0,
  "parameters": ["..."]
}
```

只 materialize 真实 M14 consumer 使用的 known semantics；不要为了“完整 RMXP TypeScript model”提前投影未使用的对象层级。

### 3.9 Extra/unknown facts

M14 consumer projection 是 derived consumer view，不替代 importer 的 lossless structural authority。

因此：

```text
unknown/extra source data
→ MUST remain preserved in existing raw/structural authority
→ MUST NOT be silently reinterpreted as known map semantics
```

若真实 M14 vertical 需要某个 extra ivar / GenericRubyObject 的业务含义，则先增加最小、明确、可测试的 semantic projection，再让 map Runtime消费；不得直接把 generic wrapper穿透到 Runtime。

---

## 4. Resource Identity Projection

Raw resource namespace/key继续使用现有 importer resource mapping，不建立 AssetManager 或第二套 asset identity。

M14 第一版至少使用：

```text
RPG::Tileset.tileset_name
→ namespace = Graphics
→ key = Tilesets/{tileset_name}

RPG::Tileset.autotile_names[n]
→ namespace = Graphics
→ key = Autotiles/{name}

RPG::Event::Page::Graphic.character_name
→ namespace = Graphics
→ key = Characters/{character_name}
```

空 resource name 表示无对应可见 resource，不发起读取。

logical key 不携带 filesystem path、URL、credential；extension resolution继续由 prepared Content/Package Index拥有。

---

## 5. Resource Version for M14

当前 Subsystem author API 已有：

```text
ContentClient.resource(namespace, key)
→ bytes + mime + contentVersion
```

M14 不新增 `resourceMetadata()` / HEAD author API。

第一版 map Runtime 对需要交给 browser presentation 的真实资源：

```text
logical namespace/key
→ ContentClient.resource(namespace, key)
→ verify resource exists / obtain contentVersion
→ discard/avoid retaining bytes when Runtime does not otherwise need them
→ Render data { namespace, key, contentVersion }
→ map WC
→ PresentationResourceClient
→ browser-owned bytes
```

这可能产生 Runtime 与 Renderer 各一次 resource read。M14 接受该成本；只有真实 workload 证明它造成 measurable problem，才以 consumer evidence讨论最小 reopen M12。

禁止仅为理论效率预建：

```text
Content resource metadata API
AssetManifest
ResourceRepository
shared decoded cache authority
```

---

## 6. M14 Prepared Content Assembly

Essentials importer只拥有：

```text
source corpus
→ semantic records/resources
→ importer-produced prepared FSDB/content material
```

它 MUST NOT 开始理解或打包 `@loomrealm-game/map` browser build。

M14 的 example/test preparation 独立负责把现成部分组装成一个 qualification 使用的 prepared Content view：

```text
importer-produced FSDB or CI-safe semantic fixture
+
@loomrealm-game/map browser JS/CSS build
+
example WebPresentationConfig logical refs
→ one test-local prepared Content view
```

这个 preparation 只做 composition/materialization，不：

```text
重新解释 RMXP semantics
创建第二个 map adapter
成为 Runtime dependency
成为 production Host
定义 UniversalGamePackager / ContentBuilder framework
```

具体脚本可以位于 `examples/essentials-v21.1` 或 qualification tooling，直到真实多个 consumers证明需要共享 package。

---

## 7. Game Entry Participation

M14 concrete example 不能只是 fixture directory。

Qualification MUST 实际读取并通过现有 `@loomrealm/game-package`：

```text
examples/essentials-v21.1/game.json
→ parseGameEntryV1 / validateGameEntryV1
→ validated logical subsystem topology + initial target/input
→ test-owned physical Definition binding
→ Main
```

M14 不要求 Hostra/PWA Launch Manifest；test harness只为 validated logical key绑定 `@loomrealm-game/map` Definition。

第一条 vertical MAY 使用最小 initial business input：

```json
{
  "mapId": 1,
  "x": 10,
  "y": 8
}
```

这样 M14 可验证真实 Game Entry → initial Frame/map startup，而不为了第一张地图强制实现完整 `RPG::System` startup compatibility。后续真实需求再扩展 initial input/Essentials startup behavior。

---

## 8. Qualification

M14 projection 至少证明：

```text
selected Map/Tileset semantic JSON contains no importer wrappers
known field spelling follows mechanical rules
nil/boolean/integer/float projection follows JsonValue rules and invalid required numbers fail closed
Table values are ordinary JSON numbers
Table values length and known-coordinate indexing follow the frozen RGSS order
Map events remain embedded and addressable by event id
CI-safe fixture and official/local corpus produce the same consumer semantics
map Runtime only sees ContentClient JsonValue/resources
resource version comes from existing ContentClient.resource()
```

官方/local corpus qualification继续不提交第三方 bytes；只记录 source identity/fingerprint、projection result和必要统计。

---

## 9. Existing RC Status

本 addendum 不把现有 importer 标记回未完成。

```text
Existing importer RC
    remains valid for its previously qualified acquisition/decoding/canonical/current-FSDB scope.

M14 consumer projection
    is new pending work required by the first Runtime map consumer.
```

因此实现/qualification记录必须明确区分：

```text
"importer RC already passed"
!=
"M14 Map/Tileset consumer projection already implemented"
```

在真实 `Map/{id}` / `Tileset/{id}` 等 consumer records materialize 并通过 M14 gate 以前，不得声称这部分已经由旧 RC 自动覆盖。
