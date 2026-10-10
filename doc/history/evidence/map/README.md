# Map / Essentials historical evidence

> Status: **Historical Evidence / Reference**. These reports preserve source identity and real-corpus investigation facts. They are not Current Map schema, public API, qualification status, or product-support claims.

Two 2026-09-21 investigations were retained because they contain provenance that is not safely reconstructable from Current source alone.

## Source identity recorded by the investigations

```text
Pokémon Essentials v21.1 official archive
size:   61987094 bytes
sha256: da0a34ec81ed40a4346fe6101debd7d938cbeadd43ff0aad87c3e388392a1665
source-code comparison:
Maruno17/pokemon-essentials
commit ea7b5d56d2436591160983c4e641a2ceee2d875a
```

The investigations explicitly distinguish:

- official/legal-local original archive facts;
- importer / prepared-FSDB projection facts;
- current-at-the-time Runtime/Browser consumption;
- synthetic fixtures;
- design inference;
- unverified behavior.

They did **not** execute original RGSS during those investigations and therefore did not claim frame-accurate original-runtime equivalence. Later Terrain original-runtime qualification is separately owned by the Terrain evidence/contract.

## Entity-data investigation

Raw archive: [`ESSENTIALS_V21_1_ENTITY_DATA_INVESTIGATION.md.txt`](./ESSENTIALS_V21_1_ENTITY_DATA_INVESTIGATION.md.txt)

Notable retained facts include the exact archive identity above, the local prepared-FSDB/source cross-check, 69 Map records in the observed v21.1 corpus, and the investigation's count of **503 map events / 688 event pages**. It also records what the importer retained/discarded and which conclusions were source facts versus proposed design direction.

## Player/NPC sprite and motion investigation

Raw archive: [`PLAYER_NPC_SPRITE_AND_MOTION_INVESTIGATION.md.txt`](./PLAYER_NPC_SPRITE_AND_MOTION_INVESTIGATION.md.txt)

This report rechecked the same official archive/local-FSDB identity and investigated Player/NPC/Pokémon graphics compatibility. It records corpus/resource facts and separates “format appears compatible” from actual product/runtime validation.

## Why the raw files use `.txt`

The original reports were written inside `game-libs/map/todo_docs/` and contain historical relative links to documents that have since been retired or moved. The reports are therefore preserved byte-for-byte as text archives. Keeping them out of the VitePress Markdown graph prevents stale historical links from becoming a second Current navigation tree while retaining the complete evidence for audit.

Current Map documentation is:

- [Map module](../../../20-modules/loom-map/README.md)
- [RPGMap API](../../../20-modules/loom-map/api.md)
- [Runtime / data / presentation](../../../20-modules/loom-map/runtime-and-presentation.md)
- [Terrain Behavior Contract v1](../../../../game-libs/map/TERRAIN_BEHAVIOR_CONTRACT_V1.md)
