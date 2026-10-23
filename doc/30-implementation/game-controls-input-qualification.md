# Unified Controls Input Qualification

> 状态：Implementation qualification
> 规范：`game-libs/game-common-controls/game-controls-input.md`（Active / Normative / Frozen / Implemented）
> 复用契约：[Web Presentation API v3](../15-contracts/web-presentation-api-v3.md)、[Renderer Data Profile v3](../15-contracts/renderer-data-profile-v3.md)、[Frame-targeted Presentation Event v1](../15-contracts/frame-targeted-presentation-event-v1.md)
> 相邻历史：[Game Common Controls Input v1 Qualification](./game-common-controls-input-v1-qualification.md)
> 日期：2026-10-24

`Frozen != Implemented != Qualified`。规范状态是 Implemented。本文只记录 subject `feb28074` 的可执行证据，不把规范改写成 Qualified，也不改写六个 raw device channel 的冻结契约。

## 1. Qualified topology

```text
Keyboard / standard Gamepad
  → <game-controls-input>
  → effective = keyboardDown || gamepadDown
  → emitCustomEvent broadcast:"top-frame"
  → current Top Active Frame + exact Activation
```

没有新增 `InputTarget`、`input.reset`、replay、retry 或 Framework input authority。`controls.state` / `controls.event` 不进入 `DEVICE_INPUT_CHANNELS`，也不进入 SessionEventHub。

## 2. Executable evidence

| 范围 | 证据 |
| --- | --- |
| Public ABI、2500ms fresh tracker、六频道不变 | `game-libs/game-common-controls/test/controls-machine.test.mjs`、`test/game-controls-input-v1/qualification.test.mjs` |
| 14 键映射、OR、baseline、disconnect、reconciliation、repeat | 同上，加上 `src/controls-machine.ts` |
| Custom Element、capture、Shadow DOM、Gamepad polling、top-frame publication | `game-libs/game-common-controls/test/controls-browser.test.mjs` |
| 三个 raw component 回归 | `game-libs/game-common-controls/test/browser.test.mjs` |
| Interest fail-closed 与旧 Activation 不接收新 Event | `test/game-controls-input-v1/qualification.test.mjs` 使用当前 `PresentationFrameGate` 与 `PresentationEventManager` |
| Frame-targeted 回归 | `npm run test:frame-targeted-presentation:qualification` |

## 3. Qualification commands

qualified implementation subject：`feb28074`

```text
HOSTRA_SOURCE_DIR=<hostra d863beab> npm run test:game-controls-input:qualification
```

该 script 执行 `build:game-common-controls-input`、common-controls 包测试、`test/game-controls-input-v1/qualification.test.mjs`、`test:frame-targeted-presentation:qualification`、`docs:check-links` 和 `docs:build`。

实际结果（2026-10-24，Windows，Node 24，frozen Hostra `d863beab` / `1.0.1-beta.1`）：

| 阶段 | 结果 |
| --- | --- |
| `@loomrealm-game/common-controls` | PASS，20/20 |
| `test/game-controls-input-v1/qualification.test.mjs` | PASS，7/7 |
| frame-targeted 核心/集成 | PASS，50/50 |
| Desktop Hostra Chromium top-frame | PASS，1/1 |
| PWA Chromium top-frame | PASS，1/1 |
| `docs:check-links` | PASS，782 个相对链接 / 167 个 Markdown 文件 |
| `docs:build` | PASS |

未设置 `HOSTRA_SOURCE_DIR` 时，本机 sibling Hostra `1.0.0` 不会把 `HOSTRA_RPC_PORT=0` 改写成实际端口，Desktop 阶段失败。CI Desktop job 使用同一 freeze pin。改用该 pin 后 Desktop 阶段为 1/1。失败点不在 controls 实现。

规范状态与本证据文件写入后再次执行 `docs:check-links` 与 `docs:build`：PASS，787 个相对链接 / 168 个 Markdown 文件，VitePress build 完成。这次复核只增加文档，不改变 `feb28074` 的可执行 subject。

示例安装里的 `device-input.browser.js` 快照已换成 subject 的 bundle，因此 essentials 与 PokeMan 会注册第四个 `game-controls-input`。Windows `core.autocrlf=true` 仍可能在下次 checkout 时把这两份文本快照写成 CRLF；本次 qualification 的 PWA top-frame 用例不读取这两份快照。
