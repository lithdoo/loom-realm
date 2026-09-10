# M14 Map Game qualification

## Status

**Implemented / Qualified / Closed** on 2026-09-10. The implementation revision
passes the canonical committed Node 20/24 workflow and the exact local v21.1
compatibility gate.

## Revision

- Implementation base: `f3b14408e75cc701dc593f34bb4dfa8b90431f07`
- Qualified implementation commit: `d415742f337ff8613c2e349cebb9a820dc0bda72`
- Local canonical runtime: Node `22.12.0`, npm `10.9.0`
- `npm run test:m14`: PASS
- Node 20.20.2 M14-specific suite: 18/18 PASS, including Chromium
- Node 24.20.0 M14-specific suite: 18/18 PASS, including Chromium
- Full Node 20/24 canonical CI: PASS in GitHub Actions run
  [`34446050878`](https://github.com/lithdoo/loom-realm/actions/runs/34446050878)

## Selective projection

- `Map001.rxdata` materializes ordinary JSON `Map/1` with only
  `tileset_id,width,height,data`.
- `Tilesets.rxdata[i]` materializes ordinary JSON `Tileset/{i}` with only
  `id,tileset_name,passages,priorities`.
- Table values preserve `x + y*xSize + z*xSize*ySize` ordering.
- Production FSDB validation passed for the exact local corpus.
- Exact v21.1 evidence revealed unreferenced non-null editor placeholders 24
  and 25 with empty `tileset_name`. The projection freeze was minimally
  reopened to omit only unreferenced empty-name placeholders; a referenced
  empty-name entry still fails closed.

## Canonical fixture result

- Initial player: world `(10,8)`, facing `2`, camera `(16,32)`, screen
  `(304,224)`.
- First ArrowRight: world `(11,8)`, facing `6`, camera `(48,32)`.
- Second ArrowRight: blocked by tile 385 reverse-entry passage bit; world and
  camera remain unchanged.
- The gameplay Frame remains pending until cancellation and retains one
  Frame-bound `keyboard.event` listener and one RenderDomain.
- Chromium proves 640x480 Canvas rendering, tile 384/385 source selection,
  4x4 player direction-row crop, DOM identity retention, full-state stale-pixel
  clearing, and delayed same-resource currentness.

## Exact Essentials v21.1 result

- Source fingerprint:
  `sha256:da0a34ec81ed40a4346fe6101debd7d938cbeadd43ff0aad87c3e388392a1665`
- Selection: map `1`, spawn `(10,8)`, character
  `trainer_POKEMONTRAINER_Red`.
- Projected tileset: `Poke Centre interior`.
- Import coverage: 7,677/7,677 physical objects classified; 110 Marshal roots
  decoded; 49 RMXP classes encountered; zero discarded Marshal nodes or RMXP
  ivars; production FSDB validation PASS.
- Real tileset and character resources resolved from the local prepared FSDB.
- ArrowRight result: position remained `(10,8)` according to persisted
  passability facts; authoritative facing became `6` before Render replacement.
- The same map Runtime and browser artifacts started; Chromium observed a
  640x480 viewport, real non-transparent regular-tile pixels, a real player
  sprite, and the required `lr-map-view > lr-map-sprite` light DOM.
- Third-party source bytes and generated local FSDB remain under ignored
  `.local/` paths and are not recorded here.

## Final result

Local implementation and exact-source qualification: PASS.

Formal milestone closure: **PASS / Closed**. All 20 workflows triggered for the
qualified implementation commit completed successfully, including the M14
Node 20/24 canonical gate and the complete M13 regression gate.
