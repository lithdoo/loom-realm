# RPG Dialogue v0 Qualification

> 状态：**Implemented / Qualified**
> 日期：2026-10-13
> Executable subject：`9cf5f92d52e365ac868d2dbb0004d765e09140ba`
> Frozen contract deviations：**None**

本记录验证 `@loomrealm-game/rpg-dialogue` 对以下 Frozen authority 的实现：

- `game-libs/rpg-dialogue/RPG_DIALOGUE_V0_API.md`
- `game-libs/rpg-dialogue/RPG_DIALOGUE_V0_PRESENTATION.md`
- `doc/15-contracts/render-update-v1.md`
- `doc/15-contracts/web-presentation-api-v1.md`

Qualification subject 是上面的 executable commit。后续仅文档状态/证据提交不改变该 executable subject。

## Environment

```text
OS      Microsoft Windows NT 10.0.26300.0
Node    v24.19.0
npm     11.17.0
Browser installed Microsoft Edge through Playwright chromium launcher seam
```

## Commands and results

在 executable subject 上执行：

```text
npm run test:rpg-dialogue
PASS
  build:rpg-dialogue
  @loomrealm-game/rpg-dialogue package tests 30/30
  real Chromium closed-loop qualification 1/1

npm test -w @loomrealm/subsystem -w @loomrealm/renderer
PASS
  Subsystem 74/74
  Renderer 67/67

npm run test:m13:qualification
PASS
  Web Presentation real Chromium qualification 7/7

node --test test/ci-architecture.test.mjs
PASS 4/4

npm pack -w @loomrealm-game/rpg-dialogue --dry-run
PASS
  12 published files
  browser/rpg-dialogue.browser.js present
  browser/rpg-dialogue.browser.css present
```

未执行的测试未被记录为 PASS；本记录不把设计文档本身当作 executable evidence。

## Closed-loop evidence

`test/rpg-dialogue-v0/qualification.test.mjs` 使用生产 Runtime/Data/Renderer/Web Presentation 路径和默认 Browser artifact，在真实 Chromium 中证明：

```text
Renderer keyboard source
→ Renderer InputGate
→ User Input v1 carrier
→ Subsystem InputListener
→ RPGDialogue semantic action routing
→ RenderDomain.emit(render.event)
→ Renderer Store applicability/currentness gate
→ WebProjector
→ default lr-dialogue-conversation.receiveRenderEvent(...)
→ WC-local reveal / enabled-choice selection
→ WebPresentationContext.emitCustomEvent("submit", payload)
→ staged reverse InputGate path
→ RPGDialogue correlation/choice/mode validation
→ openConversation() Promise settlement
```

同一测试还证明：

- 第一次 `confirm` 只完成 reveal，不提交；
- `choice-next` 从 null 选择第一个 enabled choice，并跳过 disabled choice；
- Choice submit 返回 `{ type: "submitted", choiceId: "yes" }`；
- `appendHistory()` 后第二个 Conversation 仍复用同一 Dialogue session；
- History 打开先提交 `visible=true` retained state，再投递 `scroll-to-latest`；
- HISTORY + cancel 只关闭 History，不 settle 当前 Conversation；
- 第二个 text-only Conversation 随后继续并成功提交；
- 两个 reverse submit 都经过真实 WebProjector context 与 InputGate；
- session close 移除最终 Browser projection；
- default JS/CSS artifacts 从固定发布路径成功加载；
- supported fixture 没有 missing-tag structural failure。

## Public API and validation evidence

Implementation：

- `game-libs/rpg-dialogue/src/model.ts`
- `game-libs/rpg-dialogue/src/index.ts`
- `game-libs/rpg-dialogue/src/internal/validation.ts`

Tests：

- `game-libs/rpg-dialogue/test/validation.test.mjs`
- `game-libs/rpg-dialogue/test/package.test.mjs`

Evidence covers closed shapes、unknown members、missing required members、explicit optional `undefined`、boolean/int32 type checks、UTF-8 identity/display limits、duplicate identities、plain bounded JSON data、all-disabled Choice rejection、projection node/message preflight、sync constructor/History failure 与 async `openConversation()` rejection。

Transport byte accounting 使用 `@loomrealm/wire` 的 Wire-compatible `stringifyJson()` 与 `utf8ByteLength()`，并有 regression evidence 证明 inherited `Object.prototype.toJSON` 不会改变合法性或绕过 byte limits。

## Runtime, lifecycle, History and cleanup evidence

Implementation：

- `game-libs/rpg-dialogue/src/runtime.ts`

Tests：

- `game-libs/rpg-dialogue/test/runtime.test.mjs`
- `test/rpg-dialogue-v0/qualification.test.mjs`

Evidence covers READY → ACTIVE → READY、sequential Conversation、concurrent open rejection、persistent RenderDomain/InputListener、close READY/ACTIVE、repeated close、open/mutation/snapshot after CLOSED、Frame abort `AbortError`、settle-once、partial establishment cleanup、History set/append/duplicate/restore/detached snapshot/ACTIVE rejection，以及 retained projection after settlement。

Failure-path evidence additionally covers ACTIVE `RenderDomain.emit()` failure、HISTORY mode `RenderDomain.replace()` failure、settlement-time READY projection replacement failure：全部 fail closed、reject active Promise，并保证 listener/domain/unsubscribe terminal cleanup exactly once。CLOSED terminal cleanup 还释放不再需要的 retained request/history/key graph，不改变 Frozen CLOSED observable behavior。

## Render, identity, input and reverse-event evidence

Implementation：

- `game-libs/rpg-dialogue/src/runtime.ts`

Tests：

- `game-libs/rpg-dialogue/test/runtime.test.mjs`
- `test/rpg-dialogue-v0/qualification.test.mjs`

Evidence covers exact canonical tree、default/custom zIndex、caller data passthrough、unique conversationId、fresh Choice key per Conversation、continuous Character key、Character remove/re-add fresh key、History remove/re-add fresh key、stable control-hint keys/attrs、keyboard/gamepad mappings、CONVERSATION/HISTORY routing、cancel precedence、retained-before-event ordering，以及 stale/wrong/disabled/HISTORY submit rejection。

## Browser Presentation and packaging evidence

Implementation：

- `game-libs/rpg-dialogue/browser/rpg-dialogue.browser.ts`
- `game-libs/rpg-dialogue/browser/rpg-dialogue.browser.css`
- `game-libs/rpg-dialogue/scripts/build-browser.mjs`
- `game-libs/rpg-dialogue/package.json`

Tests：

- `game-libs/rpg-dialogue/test/browser.test.mjs`
- `game-libs/rpg-dialogue/test/package.test.mjs`
- `test/rpg-dialogue-v0/qualification.test.mjs`

Evidence covers all eleven canonical tag registrations、pre-registration collision failure、connected-before-attrs tolerance、conversation/character/choice `receiveRenderData`、conversation/history `receiveRenderEvent`、new-Conversation reset、enabled selection、reveal-first commit、submit payload shape、History events、pointer/touch non-business behavior、build artifacts、exports/files 与 dry-run packed contents。

Browser lifecycle regression additionally proves：同一个 live Conversation element detach/reconnect 后，未完成的 typewriter reveal 会继续；`conversation-id` 与已选择 choice 不被重置；detach 期间 reveal 停止；reconnect 不产生额外 business/reverse submit。

## Frozen contract matrix

- Public types/defaults/failure delivery：`src/model.ts`、`src/runtime.ts`、`test/validation.test.mjs`、`test/runtime.test.mjs`；qualified by `npm run test:rpg-dialogue`。
- Strict validation/atomic preflight：`src/internal/validation.ts`、`test/validation.test.mjs`；qualified by package tests 30/30，包括 Wire-compatible byte accounting 与 inherited `toJSON` regression。
- Persistent session lifecycle/cleanup：`src/runtime.ts`、`test/runtime.test.mjs`；qualified by package tests、Render failure fail-closed/cleanup-once regressions and closed-loop test。
- Canonical Render Tree/data ownership：`src/runtime.ts`、`test/runtime.test.mjs`；qualified by exact tree/data assertions and real WebProjector projection。
- Dynamic one-shot identities：`src/runtime.ts`、`test/runtime.test.mjs`；qualified by Choice/Character/History/control key lifecycle assertions。
- History retained authority：`src/runtime.ts`、`test/runtime.test.mjs`、closed-loop test；qualified by mutation/snapshot/modal ordering assertions。
- Input/Render Event routing：`src/runtime.ts`、`test/runtime.test.mjs`、closed-loop test；qualified through both isolated mapping assertions and the real carrier path。
- Reverse Custom Event validation：`src/runtime.ts`、`test/runtime.test.mjs`、closed-loop test；qualified for stale/malformed/wrong-mode/wrong-choice cases and valid InputGate settlement。
- Default Browser WC local state：`browser/rpg-dialogue.browser.ts`、`test/browser.test.mjs`、closed-loop test；qualified for reveal、selection、scroll/reset、detach/reconnect resume and submit behavior。
- Browser artifact publication：`package.json`、`scripts/build-browser.mjs`、`test/package.test.mjs`；qualified by build、fixture load and package dry-run。
- Framework authority preservation：no Render Update v1、Web Presentation API v1、Frame、Input protocol or Renderer authority contract source was modified；Subsystem/Renderer/Web Presentation regression suites passed.

## Deviations and remaining qualification items

```text
Frozen contract deviations: None
Uncompleted qualification items: None
```

Hosted PR CI is tracked by the repository workflow and is separate from this local executable qualification record. The hosted PR CI for executable subject `9cf5f92d52e365ac868d2dbb0004d765e09140ba` completed successfully, including the RPG Dialogue closed-loop qualification lane.
