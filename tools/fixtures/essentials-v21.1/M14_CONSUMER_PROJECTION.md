# M14 Consumer Projection — RMXP/Essentials → Runtime FSDB JSON

> 状态：Frozen for Implementation / M14 Pending  
> 适用范围：`tools/fixtures/essentials-v21.1` 新增的 consumer-facing semantic projection  
> 依赖：existing importer RC、M12 Content API、M14 Map Game Library  
> 日期：2026-09-09

## Objective

现有 importer 已关闭：

```text
source acquisition
→ PBS / Marshal / RMXP decode
→ canonical / derived facts
→ current generic FSDB mapping
→ production openFsdb / integrity qualification
```

M14 只补一个真实 consumer gap：

```text
lossless/importer RMXP representation
→ Runtime-safe RMXP-compatible JsonValue records
→ Map/{id} / Tileset/{id} / optional MapInfo/{id}
→ M12 ContentClient
→ @loomrealm-game/map
```

It is not a universal map schema and not a new importer architecture layer.

## 1. Authority boundary

Keep three layers distinct：

```text
RMXP / Essentials source semantics
    field meaning / source-container identity / behavior authority

Importer structural representation
    Marshal graph / RmxpObject / RubyString / typed arrays / object identity

M14 consumer projection
    ordinary JsonValue FSDB record values
```

Runtime MUST NOT receive：

```text
RmxpObject
RubyString wrapper
RubySymbol wrapper
GenericRubyObject / GenericMarshalNode
rubyObjectId
$id / $ref / $typed
Buffer / Int16Array runtime objects
```

The existing lossless/structural path remains authoritative for source fidelity; M14 consumer records are a derived view.

## 2. Required first-slice consumer identities

M14 playable first slice requires exactly：

```text
Map/{mapId}
Tileset/{tilesetId}
```

`MapInfo/{mapId}` MAY also be materialized and qualified. `MapMetadata/{mapId}` is not a first-slice requirement until a real selected M14 behavior consumes it.

Logical keys use unpadded decimal spelling：

```text
1
42
105
```

Physical filenames such as `Map001.rxdata` never become Runtime keys.

## 3. Source-container → record extraction

Recursive object projection alone is insufficient; M14 also freezes which source container owns record identity.

### 3.1 MapNNN.rxdata → Map/{N}

A source root whose canonical physical filename matches：

```text
Map<digits>.rxdata
```

and whose decoded root is known `RPG::Map` materializes exactly one record：

```text
Map/{decimal integer represented by <digits>}
```

Examples：

```text
Map001.rxdata → Map/1
Map042.rxdata → Map/42
```

Rules：

```text
N must be a positive safe integer
leading zeroes are removed only by decimal integer interpretation
root must be known RPG::Map
one physical map root produces one consumer Map record
```

Filename/root mismatch or an invalid id fails closed for M14 consumer materialization.

Do not add `id` to the `Map` JSON merely because identity came from its filename; RMXP `RPG::Map` does not own an `@id` field. Runtime identity is the Content key.

### 3.2 Tilesets.rxdata → Tileset/{i}

RMXP `Tilesets.rxdata` decodes as the source tileset collection/array. For every materialized non-null known `RPG::Tileset` entry at array index `i`：

```text
Tilesets.rxdata[i]
→ Tileset/{i}
```

For M14 consumer identity：

```text
i must be a positive safe integer
projected RPG::Tileset.id must exist
projected id must equal i
```

An index/id mismatch is not normalized or silently repaired; required materialization fails closed. This prevents two competing authorities for `Tileset/{id}`.

Null/empty collection slots are skipped and do not produce records.

### 3.3 MapInfos.rxdata → MapInfo/{k}

When M14 materializes `MapInfo` evidence, `MapInfos.rxdata` integer-key Hash ownership is preserved：

```text
MapInfos.rxdata[k] = RPG::MapInfo
→ MapInfo/{k}
```

`k` must be a positive safe integer and becomes the unpadded decimal Content key. `RPG::MapInfo` has no invented consumer `id` member.

MapInfo is not required by the first playable vertical; do not make `@loomrealm-game/map` load it only because this record can be materialized.

### 3.4 MapMetadata

M14 first slice does not freeze a `MapMetadata` source extraction rule because it does not consume MapMetadata. If a real exact-v21.1 selected vertical later requires it, add the smallest source-specific extraction rule here before Runtime use.

Do not create an empty/general metadata record family for symmetry.

## 4. Mechanical recursive JSON rules

Projection is mechanical and testable. Known source field spelling is preserved unless a rule below says otherwise.

### 4.1 Known RPG/RMXP object

For known `RmxpObject` fields：

```text
strip exactly one leading "@"
preserve remaining spelling
recursively project the field value
```

Examples：

```text
@tileset_id     → tileset_id
@autoplay_bgm   → autoplay_bgm
@move_type      → move_type
@character_name → character_name
```

Do not camelCase or create LoomRealm-specific names.

Decoder metadata never enters the consumer object：

```text
kind
className
rubyObjectId
```

### 4.2 Primitive values

```text
nil         → null
true/false  → JSON boolean
Integer     → JSON number only when Number.isSafeInteger-compatible
Float       → finite JSON number
```

For a required M14 fact：

```text
unsafe Integer        → fail closed
NaN / ±Infinity       → fail closed
```

Do not introduce decimal-string/tagged-number wrappers only to stay inside JsonValue.

### 4.3 Ruby text / symbol

```text
RubyString with defined semantic text
→ JSON string

RubySymbol
→ symbol-name JSON string
```

Opaque/binary RubyString required as a semantic text fact fails closed unless an existing source-specific text rule defines it. Do not expose bytes/base64 wrapper as fake business text.

### 4.4 Array

```text
Ruby Array
→ JSON array
→ recursively projected members
```

### 4.5 Hash

A required Hash may become a JSON object only when each key is an unambiguous scalar：

```text
Integer → decimal string
String  → same string
Symbol  → symbol-name string
```

If projection causes key collision, uses a non-scalar key, or depends on Ruby Hash default semantics required by the consumer, fail closed.

`RPG::Map.events` therefore remains embedded in `Map/{id}`：

```json
{
  "1": {
    "id": 1,
    "name": "...",
    "x": 10,
    "y": 12,
    "pages": []
  }
}
```

Do not split a `MapEvent` Group or request `ContentClient.group()`.

## 5. RGSS Table

Existing decoder facts are projected to exact JSON：

```ts
{
  dimensions: number,
  xSize: number,
  ySize: number,
  zSize: number,
  values: number[]
}
```

Serialized element ordering is preserved. Coordinate lookup is frozen：

```text
index(x,y,z) = x + y*xSize + z*xSize*ySize
```

Therefore x changes fastest, then y, then z.

For 1D/2D Tables, unused dimensions retain decoder/RGSS size `1`; do not establish a second flattening convention.

Materialization MUST validate：

```text
dimensions is the decoded RGSS dimension count
xSize/ySize/zSize are positive safe integers
values.length == xSize * ySize * zSize
all values are finite safe JSON numbers preserving decoded Int16 values
```

Consumer lookup code additionally requires requested coordinates in bounds：

```text
0 <= x < xSize
0 <= y < ySize
0 <= z < zSize
```

Qualification must use a known non-zero coordinate sample to prove axis ordering. A test that only checks `values` is an array does not close M14.

No Runtime `Table` framework/class is implied; ordinary helper functions are enough.

## 6. Color / Tone

If a required nested known object uses existing decoded RGSS values：

```text
Color → { red, green, blue, alpha }
Tone  → { red, green, blue, gray }
```

Every component must be finite. Transport metadata is removed.

## 7. Nested known RPG objects

When actually required, nested known objects such as：

```text
RPG::AudioFile
RPG::Event
RPG::Event::Page
RPG::Event::Page::Condition
RPG::Event::Page::Graphic
RPG::EventCommand
RPG::MoveRoute
RPG::MoveCommand
```

recursively use the same object rules.

Do not build a complete TypeScript/RMXP class hierarchy simply because the class registry knows these types. Materialize the known object graph present in required `Map`/`Tileset` facts without inventing a new model layer.

## 8. First-slice Map / Tileset facts

The M14 map library requires these persisted semantic members from the selected records：

```text
Map
    tileset_id
    width
    height
    data
    events may remain present but first movement slice does not require event collision

Tileset
    id
    tileset_name
    passages
    priorities
    autotile_names may remain present but M14 CI rendering does not require autotiles
```

These are not a new normalized schema. They are the subset of mechanically projected RMXP fields consumed by the first vertical.

Required invariants：

```text
Map.width/height positive safe integers
Map.tileset_id positive safe integer
Map.data is a valid 3D RGSS Table covering width × height × at least 3 layers used by the slice
Tileset.id matches its Content key
Tileset.passages/priorities are valid projected Tables indexable for all tile ids required by the selected slice
Tileset.tileset_name is non-empty when regular tiles are visible
```

Semantic passability behavior belongs to `M14_02_MAP_GAME_LIBRARY.md`, not this importer document.

## 9. Raw resource identity

Existing raw resource mapping remains authoritative. M14 consumes logical identities such as：

```text
RPG::Tileset.tileset_name
→ Graphics / Tilesets/{tileset_name}

RPG::Tileset.autotile_names[n]
→ Graphics / Autotiles/{name}

RPG::Event::Page::Graphic.character_name
or M14 initial characterName
→ Graphics / Characters/{character_name}
```

Projection does not create AssetManifest/AssetManager or resource metadata records.

## 10. Failure / unknown facts

The consumer projection does not replace lossless source authority.

For unknown/extra source values：

```text
not required by M14 consumer
→ retain through existing lossless/importer evidence; no need to force into consumer record

required by M14 consumer but not mechanically representable
→ fail closed
→ add the smallest explicit semantic projection here before Runtime use
```

Never push a generic importer wrapper into map Runtime as an escape hatch.

## 11. Implementation shape

Preferred implementation is a handful of importer-local functions, for example：

```text
projectJsonValue(...)
projectKnownRmxpObject(...)
projectTable(...)
extractMapRecord(...)
extractTilesetRecords(...)
extractMapInfoRecords(...) when used
```

Names are not public ABI. Do not create：

```text
ConsumerProjector<T>
ProjectionRegistry
SemanticMaterializer class hierarchy
ProjectionPipeline
ProjectionContext service
map-schema package
```

## 12. Qualification minimum

Before M14 closure prove：

```text
Map001.rxdata extraction → Map/1
Tilesets array extraction → stable Tileset keys + id/index mismatch failure
MapInfos hash extraction when MapInfo path is implemented
primitive safe/fail-closed rules
Hash key projection/collision failure
Table shape + non-zero coordinate index ordering
no decoder metadata/wrappers in consumer records
Map.events remains embedded
production FSDB can persist/read the records as JsonValue
@loomrealm-game/map obtains them only through ContentClient
```

Existing importer RC remains valid but does not, by itself, count as M14 consumer-projection closure.
