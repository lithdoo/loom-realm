# `@loomrealm/desktop` Physical Platform Composition

> 状态：M9 Data + M12 Content **Implemented / Qualified**（2026-09-08）；M15 Full Desktop E2E **Implemented / Locally Qualified**（2026-09-11）。正式关闭仍由 `doc/30-implementation/m15-qualification.md` 拥有，并等待 M14 正式关闭以及托管 Node 24 M15 证据。

This private workspace owns the M9 session-scoped Desktop `DataConnectionBroker`, two-sided loopback Data WebSocket relay, finite buffering policy and current Node-side deterministic Renderer `RendererDataBinding` realization.

It also owns the M12 prepared-installation Content view and loopback readonly Content Service：deterministic public manifest bytes, immutable FSDB logical index, exact-byte SHA-256 versions, scoped/expiring bearer grants, bounded request admission, and lifecycle closure. `prepareDesktopContentView(prepared)` consumes the genuine Hostra-prepared truth through its trusted integration subpath, derives the unique in-installation `[FSDB]*` root, and never re-reads `game.json` or accepts independently supplied roots. The public prepared-view handle exposes no filesystem path, FSDB handle, or Content Index.

M15 now freezes the remaining real product composition：

```text
checked-in Hostra-ready game
→ Main + real Node Runner
→ Desktop Data/Content
→ secure Electron BrowserWindow
→ one-shot isolated-preload handoff
→ Main-World trusted Renderer
→ MessagePort Renderer Control
→ browser-native Data WebSocket
→ real DOM Keyboard/Pointer/Gamepad source
→ existing M13 presentation
→ same M14 business game
```

BrowserWindow keeps `nodeIntegration=false`, `contextIsolation=true`, `sandbox=true`, `webSecurity=true`. The preload does not expose a generic Electron API. The existing M9 Broker remains Data candidate/currentness owner；M15 only replaces the deterministic Node Renderer-side delivery with the BrowserWindow physical adapter.

Frozen implementation order：

```text
M15_01_DESKTOP_PRODUCT_COMPOSITION.md
→ M15_02_BROWSERWINDOW_RENDERER_COMPOSITION.md
→ M15_03_DESKTOP_INPUT_AND_LIFECYCLE.md
→ M15_04_DESKTOP_FULL_E2E_VERTICAL.md
→ M15_05_QUALIFICATION_CLOSURE.md
```

Implementation may now proceed directly from those landing docs. Reopen is justified only by a real correctness/security/platform contradiction, not by implementation convenience.

Current existing gates：

```powershell
npm test -w @loomrealm/desktop
npm run test:m9
npm run test:m12
```

M15 implementation provides the frozen repository gate `npm run test:m15` defined by M15/05.

Exact Pokémon Essentials v21.1 source qualification is intentionally local because the third-party corpus is not checked into this repository:

```powershell
npm run test:m15:essentials-local -- <path-to-Essentials-v21.1.zip-or-directory>
```

This gate imports the supplied source through the production v21.1 importer, launches the same Electron/Hostra product against the imported FSDB, rejects an all-black map canvas, proves the real player sprite and a trusted ArrowRight direction-frame change, and writes `artifacts/m15-essentials-v21.1-electron.png`.
