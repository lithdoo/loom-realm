# Game Control Ports v1 Qualification

> 状态：Implementation qualification
> 规范：[Game Control Ports](../10-architecture/game-control-ports.md)（Implemented / Qualified / Frozen）
> Map contract：[RPGMap Control Port v1](../20-modules/loom-map/control-port-v1.md)
> Dialogue contract：[RPG Dialogue v1 API](../../game-libs/rpg-dialogue/RPG_DIALOGUE_V1_API.md)
> 产品组合：[Essentials controls composition](../../examples/essentials-v21.1/CONTROL_COMPOSITION.md)、[PokeMan controls composition](../../examples/PokeMan/doc/72-controls-composition.md)
> 日期：2026-10-24

`Frozen != Implemented != Qualified`。Runtime contract 的 Implemented / Qualified / Frozen 记在 `8346d15d`。`f051ae8e` 只修正 clean build 的模块加载时机，不改变这些 contract 的行为。历史 v0 Dialogue evidence 与 unified controls producer evidence 不覆盖这个 subject。

后续只改文档、且不改变 executable behavior 或 qualification input 的 commit，不是新的 executable subject。

## 1. Executable subject

```text
runtime / product / tests: 8346d15d033f93dfbb38d8d12812cdd29c90d691
clean build graph:         f051ae8eecb08a59ccf018f8afa000baeca32fe2
```

`8346d15d` 包含 consumer / tracker、Map move intent、Dialogue v1 controls、Essentials 与 PokeMan `base + map`、PWA 双 executable，以及对应测试和 root build scripts。它不包含本 evidence 文件。

`f051ae8e` 只把 `apps/pwa/scripts/build.mjs` 对 PokeMan fixture 的 import 改成 staging 路径上的动态 import。它不改变 Map、Dialogue、controls 或 product runtime。`8346d15d` 的默认 PWA build 在 clean dist 下会因为静态 import 提前加载 Map 而失败；clean `build:m17` 的 PASS 属于 `f051ae8e`。

Producer contract 的 qualified subject 仍是 `2333fea85e353dd9a0f247d41d8112dc3fa2e048`。本次没有修改 producer reducer 或 browser source。安装用 `device-input.browser.js` 的 git blob 与重建后的 `dist/browser/device-input.browser.js` 字节一致，SHA-256 为 `ce835a033743a9f66bbfc3f893b7103a3553072619381ed249f290eb4d1ca30b`。

## 2. Environment

| 项 | 值 |
| --- | --- |
| OS | Windows 10.0.26300 |
| Node | v24.22.1 |
| Hostra | `d863beab3c59c3bd4f271514a228fa8fee0bf5b6`（package `1.0.1-beta.1`），`HOSTRA_SOURCE_DIR` 指向该 pin |
| Browser | Playwright 1.63.0 Chromium；M15 使用 Hostra 自己的 Window |

官方 Essentials FSDB 不在本机。`terrain-behavior-live-product` 的 3 个 skip 是既有“local official FSDB is not present”，不是本 subject 的 PASS，也不是 FAIL。

## 3. Commands and results

Clean generated state：删除 `game-libs/game-common-controls/dist`、`game-libs/map/dist`、`game-libs/rpg-dialogue/dist`、`apps/pwa/dist` 后执行 canonical build。没有恢复 Map `prebuild`。

| 命令 | 结果 |
| --- | --- |
| clean dist 后 `npm run test:m14:pr` | PASS。boundary 4/4，projection 8/8，tile-presentation 6/6，map 109/109，Essentials 3/3，terrain live 3 skip，vertical 3/3，pack PASS。第一次 boundary 因本地脚本的 emit 格式断言失败，修正断言后整条 lane 通过 |
| `npm test -w @loomrealm-game/common-controls` | PASS，32/32 |
| `npm run test:rpg-dialogue` | PASS。package 30/30，v1 qualification 1/1 |
| `npm run test:game-control-ports:qualification` | PASS，3/3。真实键盘 Map closed loop、同一窗口内 Dialogue semantic port、overlay/child-frame fresh consumer |
| `HOSTRA_SOURCE_DIR=<pin> npm run test:m15:pr` | Desktop 14/14 PASS。Hostra 文件第一次 16/17：`runners.length` 仍期望单 subsystem。Essentials 现为 base + map，Main 为每个 subsystem 启动一个 Runner，断言改为 2 后该测试 PASS。640 PR median latency 在修改前已 PASS，未再跑完整 P95 |
| `npm run build:m17`（dist 已存在） | PASS |
| clean dist 后 `npm run build:m17` on `8346d15d` | FAIL。`apps/pwa` 默认 build 静态 import PokeMan fixture，fixture import Map，而 Map dist 尚未生成 |
| clean dist 后 `npm run build:m17` on `f051ae8e` | PASS。common-controls、subsystem、browser bundle、Map 与 `apps/pwa/dist/window.js` 都由该命令生成 |
| `npm run test:m17 -w @loomrealm/pwa` | unit 39/39 PASS。第一次 Chromium 2 个失败：Windows `autocrlf` 把 Presentation fixture 变成 CRLF，与 esbuild LF bundle 的 content version 不同，同一 document 第二次执行 controls script 时触发 `game-keyboard-input` collision。工作树恢复为 index 中的 LF 字节，并为这两类生成 bundle 设置 `eol=lf` 后，`node apps/pwa/scripts/run-e2e.mjs m17` PASS，17/17。其中 Essentials ArrowRight 与 PokeMan movement/collision/transfer/restart 通过 |
| clean dist 后 `HOSTRA_SOURCE_DIR=<pin> npm run test:game-controls-input:qualification` | PASS。common-controls 32/32，producer qualification 9/9，frame-targeted 50/50，Hostra top-frame 1/1，PWA top-frame 1/1，当时 docs links 798/170，docs build PASS |
| `npm test -w @loomrealm-example/pokeman` | PASS，17/17 |

`test:m15:hostra:full` 的 640/720/1080 P95 不在 `test:m15:pr` 内，本次没有执行。`scripts/m14-essentials-local.mjs` 需要本机官方 Essentials source，不属于 `test:m14:pr`，本次没有执行。

## 4. What the subject proves

```text
Physical Keyboard
  → product-private <game-controls-input>
  → broadcast:"top-frame"
  → @loomrealm-game/common-controls/subsystem
  → product composition
  → RPGMapControls / RPGDialogueControls
  → Map / Dialogue Runtime
```

- `@loomrealm-game/common-controls` root export 没有 consumer 或 directional tracker。`./subsystem` 是独立 subpath。
- common-controls 不依赖 Map 或 Dialogue。没有 `@loomrealm-game/control-bindings`。
- Map blocked movement 保留 intent，不因 timer、controls State refresh 或 same-value setter 自动 retry。
- Consumer callback 的同步 throw 与 Promise rejection 被局部隔离。
- 新 Activation 使用新的 consumer，不从旧 consumer 继承 intent。
- 一个 Window 只有一个 active `game-controls-input`。Base 不订阅 controls。
- PokeMan PWA bundle id 覆盖 base 与 map 两个 executable。
- Dialogue 的具体按键映射留在 qualification/product composition，没有提升成全局默认 contract。

## 5. Documentation check

文档状态和本 evidence 的 commit 不改变上述 executable subject。`docs:check-links` 与 `docs:build` 在写入本文件后重新执行；结果如下，链接数以该次输出为准。

| 命令 | 结果 |
| --- | --- |
| `npm run docs:check-links` | PASS，806 个相对链接 / 171 个 Markdown 文件 |
| `npm run docs:build` | PASS |
