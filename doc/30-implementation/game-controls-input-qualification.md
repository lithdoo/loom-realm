# Unified Controls Input Qualification

> 状态：Implementation qualification
> 规范：`game-libs/game-common-controls/game-controls-input.md`（Active / Normative / Frozen / Implemented）
> 复用契约：[Web Presentation API v3](../15-contracts/web-presentation-api-v3.md)、[Renderer Data Profile v3](../15-contracts/renderer-data-profile-v3.md)、[Frame-targeted Presentation Event v1](../15-contracts/frame-targeted-presentation-event-v1.md)
> 相邻历史：[Game Common Controls Input v1 Qualification](./game-common-controls-input-v1-qualification.md)
> 日期：2026-10-24

`Frozen != Implemented != Qualified`。规范状态是 Implemented。本文只记录 subject `2333fea8` 的可执行证据，不把规范改写成 Qualified，也不改写六个 raw device channel 的冻结契约。

`feb28074` 不再是 qualified subject。那个 commit 的 reducer 在 Window 从不可用恢复、且 effective 仍为 `[]` 时不发布 `controls.state`。`2333fea8` 修正了这次 reconciliation。

## 1. Qualified topology

```text
Keyboard / standard Gamepad
  → browser/controls-source.ts
  → src/controls-machine.ts
  → <game-controls-input>
  → emitCustomEvent broadcast:"top-frame"
  → current Top Active Frame + exact Activation
```

`controls-machine.ts` 不从 `@loomrealm-game/common-controls` 根导出。没有新增 `InputTarget`、`input.reset`、replay、retry 或 Framework input authority。`controls.state` / `controls.event` 不进入 `DEVICE_INPUT_CHANNELS`，也不进入 SessionEventHub。

Window usable 与 unusable 互切时，reducer 发布当前 State，即使 `down` 没有变化。`[]` 恢复为 `[]` 仍然发布 `{ down: [] }`，并且不合成 Event，也不启动 1000ms refresh。Keyboard capture regain 仍不补 down；没有 effective 变化时不发 State。

## 2. Executable evidence

| 范围 | 证据 |
| --- | --- |
| Public ABI、2500ms fresh tracker、六频道不变、reducer 不从根导出 | `game-libs/game-common-controls/test/controls-machine.test.mjs`、`test/game-controls-input-v1/qualification.test.mjs` |
| 14 键映射、OR、baseline、disconnect、repeat、Window empty regain | 同上，直接执行 `createControlsMachine()` |
| Custom Element、capture、Shadow DOM、Gamepad polling、empty Window regain、top-frame publication | `game-libs/game-common-controls/test/controls-browser.test.mjs` |
| 三个 raw component 回归 | `game-libs/game-common-controls/test/browser.test.mjs` |
| Interest fail-closed、旧 Activation 拒绝、新 Activation 接受 State | `test/game-controls-input-v1/qualification.test.mjs` 使用当前 `PresentationFrameGate` 与 `PresentationEventManager` |
| 安装快照与 bundle 字节一致，并注册 `game-controls-input` | 同一 qualification 比较两份 Presentation fixture 与 `dist/browser/device-input.browser.js` 的 SHA-256 |
| Frame-targeted 回归 | `npm run test:frame-targeted-presentation:qualification` |
| 产品兼容 | `npm run test:game-common-controls-input:qualification` |
| Framework 包回归 | `npm run test:regression` |

## 3. Gate 分工

`test:game-controls-input:qualification` 是组件精确门禁：build、common-controls、`test/game-controls-input-v1/qualification.test.mjs`、frame-targeted、docs。

`test:game-common-controls-input:qualification` 是产品兼容门禁。它包含精确门禁里的仓库级 qualification 文件，并继续执行 `test:game-common-controls-input:qualification:run`、Desktop、PWA M17、frame-targeted 与文档门禁。它不嵌套调用精确门禁脚本。

`npm run test:regression` 不并进这两条脚本。

## 4. Qualification commands

qualified implementation subject：`2333fea85e353dd9a0f247d41d8112dc3fa2e048`

```text
HOSTRA_SOURCE_DIR=<hostra d863beab> npm run test:game-common-controls-input:qualification
HOSTRA_SOURCE_DIR=<hostra d863beab> npm run test:regression
```

实际结果（2026-10-24 12:09 Asia/Shanghai，Windows，Node 24.22.1，frozen Hostra `d863beab3c59c3bd4f271514a228fa8fee0bf5b6` / `1.0.1-beta.1`）：

| 阶段 | 结果 |
| --- | --- |
| `build:game-common-controls-input` | PASS |
| `@loomrealm-game/common-controls` | PASS，22/22 |
| Hub / Presentation / bridge 与 `test/game-common-controls-input-v1/qualification.test.mjs` | PASS，35/35 |
| `@loomrealm-game/map` | PASS，106/106 |
| `@loomrealm-game/rpg-dialogue` | PASS，30/30 |
| `@loomrealm-game/schema-form` | PASS，22/22 |
| `test/game-controls-input-v1/qualification.test.mjs` | PASS，9/9 |
| `@loomrealm/desktop` | PASS，29/29 |
| `npm run test:m17 -w @loomrealm/pwa` | PASS；unit 39/39，Chromium 17/17 |
| frame-targeted 核心/集成 | PASS，50/50 |
| Desktop Hostra Chromium top-frame | PASS，1/1 |
| PWA Chromium top-frame | PASS，1/1 |
| `docs:check-links` | PASS，787 个相对链接 / 168 个 Markdown 文件 |
| `docs:build` | PASS |
| `test:game-common-controls-input:qualification` | PASS |
| `npm run test:regression` | PASS，494 pass、0 fail、6 个既有平台 skip（symlink privilege 与 POSIX termination） |

修复前，reducer 测试里 `setWindowUsable(true, [])` 返回 `state: null`；浏览器测试在空 baseline 的 focus regain 上收不到 `controls.state`。修复后这两项都要求 `state: []` 且 `events: []`，并已通过。

本轮产品门禁设置了 `HOSTRA_SOURCE_DIR` 指向上述 pin。未改用本机 sibling Hostra `1.0.0` 复跑；该版本不会把 `HOSTRA_RPC_PORT=0` 改写成实际端口，CI Desktop job 使用同一 freeze pin。

Essentials 与 PokeMan 的 `device-input.browser.js.js` 已换成 subject bundle，SHA-256 为 `ce835a033743a9f66bbfc3f893b7103a3553072619381ed249f290eb4d1ca30b`，两份都注册 `game-controls-input`。PWA M17 Chromium 17/17 读取了 Essentials 这份安装快照。Windows `core.autocrlf=true` 仍可能在下次 checkout 时把这两份文本快照写成 CRLF；本次通过时工作区字节与 bundle 一致。

写入本证据和规范 subject 引用后再次执行 `docs:check-links` 与 `docs:build`：仍是 787 个相对链接 / 168 个 Markdown 文件，VitePress build 完成。这次复核不改变 `2333fea8` 的可执行实现。
