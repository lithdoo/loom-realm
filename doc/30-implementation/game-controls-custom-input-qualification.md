# Custom Controls Input Qualification

> 状态：Implementation qualification
> additive normative extension：[game-controls-input 组件内 CustomEvent 输入源](../../game-libs/game-common-controls/game-controls-input-custom-source.md)
> 基础规范：[统一操控输入 Web Component](../../game-libs/game-common-controls/game-controls-input.md)
> executable implementation subject：[`37940e76c811ddc7052e6592e9aa3d9419f1ed07`](https://github.com/lithdoo/loom-realm/commit/37940e76c811ddc7052e6592e9aa3d9419f1ed07)
> 日期：2026-10-31

`Frozen != Implemented != Qualified`。本文记录 executable subject `37940e76c811ddc7052e6592e9aa3d9419f1ed07` 的可执行证据；其后的 evidence/status 文档 commit 不改变该 subject。旧 `2333fea8` 只属于原 Controls v1 的历史 qualification，不是本次 Custom source 的 implementation subject。

## 1. Qualified topology

```text
Keyboard ─┐
Gamepad ──┼─> Controls Machine ─> controls.state/event ─> Top Active Frame ─> Subsystem
Custom ───┘
```

本扩展只增加 component-local Custom held snapshot、Controls Machine 内部 OR/edge 语义和 `<game-controls-input>` 上的 direct `loomrealm:debug-input` listener。它不增加 public Controls ABI、Presentation channel、Session Event、Framework service、Subsystem API、source identity、build profile 或第二份 browser bundle。Custom 从未使用时，任意既有 Keyboard/Gamepad 输入序列的 publication 保持不变。

## 2. 执行环境

- Windows NT `10.0.26300.0`，Asia/Hong_Kong（UTC+08:00）。
- Node.js `24.19.0`，npm `11.17.0`。
- Playwright Chromium `153.0.8010.12`，headless。
- 独立 Hostra checkout `../hostra`：`d863beab3c59c3bd4f271514a228fa8fee0bf5b6`，`hostra@1.0.1-beta.1`。
- Git `core.autocrlf=true`；qualification 时 built bundle 与两份安装资源的 SHA-256 均为 `dde63e566aa6c8122df38a415cc782f844cc17bda6e560e0e3e22fde620c44ec`。
- PowerShell execution policy 禁止加载 `npm.ps1`，因此实际命令使用等价的 Windows CLI launcher `npm.cmd`；未跳过或弱化任何门禁。

## 3. 实际命令与结果

```powershell
npm.cmd run build -w @loomrealm-game/common-controls
npm.cmd test -w @loomrealm-game/common-controls

npm.cmd run build:staging -w @loomrealm/pwa
npm.cmd run test:unit -w @loomrealm/pwa
node apps/pwa/scripts/run-e2e.mjs staging

$env:HOSTRA_SOURCE_DIR=(Resolve-Path -LiteralPath '..\hostra').Path
npm.cmd run test:game-controls-input:qualification
npm.cmd run test:game-common-controls-input:qualification

npm.cmd run docs:check-links
npm.cmd run docs:build
git diff --check
```

全部命令 exit 0。实际结果：

| 阶段 | 结果 |
| --- | --- |
| common-controls build | PASS |
| `@loomrealm-game/common-controls` | PASS，48/48；包含 Custom snapshot、OR、repeat、reconciliation、DOM validation、duplicate、blocked focus、disconnect、Select overlay 与既有 Keyboard/Gamepad/Pocket Block 回归 |
| PWA staging build | PASS |
| PWA unit | PASS，44/44；包含两份 installed bundle 与 built bundle SHA-256 identity |
| PokeMan staging E2E | PASS，1/1；Custom direction 驱动真实 Map movement；Professor Dialogue 的“你终于来了。”先自然 reveal 完成，Custom `south` 随后造成实际 conversation transition 到“准备好出发了吗？”，同时 still-mounted Map snapshot 完全不变；reload 后无需 Gamepad wake-up 再次完成 Custom Map action |
| precise Controls qualification | PASS；Controls repository qualification 9/9，frame-targeted 核心 51/51，Hostra vertical 1/1，PWA vertical 1/1 |
| product compatibility qualification | PASS；common-controls 48/48，Hub/Presentation 35/35，Map 115/115，Dialogue 32/32，Schema Form 22/22，Controls qualification 9/9，Desktop 30/30，PWA unit 44/44 + Chromium 17/17，frame-targeted 51/51 + Hostra 1/1 + PWA 1/1 |
| pre-evidence docs check | PASS，812 个相对链接 / 175 个 Markdown 文件；VitePress build PASS |
| `git diff --check` | PASS |

## 4. Custom/CDP 证据边界

Custom/CDP qualification 可以证明：

- 页面级 Custom Controls seam；
- Controls Machine；
- top-frame routing；
- Map/Dialogue vertical behavior。

其中 Dialogue 纵向证据明确证明：

```text
CustomEvent
→ active game-controls-input
→ Controls Machine
→ controls publication
→ Top Active Frame
→ Dialogue action
→ observable conversation transition
```

测试先等待“你终于来了。”自然 reveal 完成；发送 Custom `south` 后的成功条件不是 `_revealComplete`，而是不会自动发生的 conversation transition 到“准备好出发了吗？”。同一 action 前后的 still-mounted Map snapshot 完全一致，因此也证明该 Dialogue action 没有被 Map 同时消费。

不能证明：

- Android kernel input；
- Chrome physical Gamepad enumeration；
- 实体 Gamepad wake-up；
- 真实 AYANEO 按键硬件链路。

因此本证据不把浏览器页面内 CustomEvent 自动化表述为 Android physical Gamepad qualification。真实硬件 smoke 仍属于独立平台验证。

## 5. 最终文档复核

写入本 evidence、把扩展状态更新为 Implemented 并更新 landing 后，实际再次执行：

```powershell
npm.cmd run docs:check-links
npm.cmd run docs:build
git diff --check
```

结果为 PASS：`docs:check-links` 检查 176 个 Markdown 文件中的 814 个相对链接，VitePress build 完成，`git diff --check` 无错误。这次复核只修改 evidence/status 文档，不改变 executable implementation subject `37940e76c811ddc7052e6592e9aa3d9419f1ed07`。
