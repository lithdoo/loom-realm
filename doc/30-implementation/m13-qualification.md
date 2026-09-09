# M13 Web Presentation Qualification

> 状态：**Implemented / Qualified / Closed**  
> 日期：2026-09-09  
> 规范入口：`M13_01_WEB_PRESENTATION_BOOTSTRAP.md`–`M13_05_QUALIFICATION_CLOSURE.md`  
> 正式契约：`doc/15-contracts/web-presentation-config-v1.md`、`doc/15-contracts/web-presentation-api-v1.md`

M13 Web Presentation 已按冻结契约完整落地。唯一 closure 命令为：

```text
npm run test:m13
```

该命令严格包含 `test:m12`、Renderer package/internal tests、真实 Chromium qualification、M13 boundary checks 与 Renderer pack surface 检查。

同一完整门禁已在本地分别通过：

```text
Node 20.20.2  PASS  88.3s
Node 24.20.0  PASS  82.3s
```

## Implemented production chain

```text
WebPresentationConfigV1 closed validation
→ prepared M12 Content ref/version/MIME fixation
→ ordered stylesheet + classic script bootstrap
→ window.onload start barrier
→ current Renderer Control/Data-slot + committed Render Store
→ package-private reevaluation + per-subsystem eligibility
→ thin Web Projector
→ business-owned Custom Elements
```

实现全部位于既有 `@loomrealm/renderer` trusted/internal 边界，没有新增 public presentation package、Store、topology、registry、loader、AssetManager 或 layout framework。

## Bootstrap evidence

- Config 精确字段、版本、resource ref 与 per-list duplicate 均 fail closed；验证失败发生在 Content/browser side effect 前。
- Script MIME essence 只接受 `text/javascript`，style 只接受 `text/css`；参数可解析但不会扩大 essence allowlist。
- Prepared refs 固定 contentVersion、MIME 与 private browser source；business Config/WC 不获得 private binding。
- 真实 Chromium 证明 stylesheet/script 声明顺序、classic script evaluation、Custom Element 注册、load/evaluation failure 和 `window.onload` start barrier。
- Bootstrap failure 不启动 presentation，也不回滚 Renderer Store 或改变 Main/Subsystem authority。

## Authority/currentness evidence

- Control snapshot 仍是 Session/subsystem/generation 唯一 topology authority；M11 Store 仍是 per-subsystem Render replica authority。
- Seam 只在 fresh committed Control snapshot及成功 `render.domains/snapshot/patch` Store commit 后 reevaluate；failed mutation和 `render.event` 不触发。
- Eligibility 每次直接从 current Control、Data slot和 Store facts 推导；没有 retained Presentation currentness machine。
- 真实 Control/Data protocol → Store → Chromium Projector vertical 覆盖 A/B independent projection、same-generation carrier loss、partial/complete rebaseline和 committed authority removal。
- Control/Data transport loss不被解释为 authority removal；受影响 DOM 保持 frozen，健康 subsystem仍可更新。
- Real Chromium additionally proves normal `S → S'` replacement with identical textual subsystem/generation/domain/key retires the old HTMLElement and creates a distinct instance；terminal Control transport preserves the mounted HTMLElement、DOM 与 context/data/lifecycle counters exactly。

## Projector/API evidence

- Full identity 为 `(Session, subsystemKey, generation, domainId, key)`；跨 Domain/Subsystem同 key不碰撞。
- Move/reparent/reorder复用 HTMLElement；fresh Session/generation不复用旧实例；body顺序按 subsystemKey、zIndex、domainId、roots机械确定。
- Context在首次 managed insertion前最多 attempt一次；context/data receiver彼此独立。
- Data交付 full current value；object member order无语义、array order有语义、attrs/order-only commit不重发；throwing receiver对相同 value不重试。
- 所有新 tag在首次 DOM mutation前 preflight；unknown tag造成该次零 mutation并永久冻结该 Window，后续 authority/Store变化也不能恢复 mutation。
- Ordered bootstrap的 start callback直接启动真实 Projector；qualification观察到首次 managed DOM mutation只发生在 `window.onload` 已完成后。

## Resource/lifetime evidence

Business `PresentationResourceClient` 是 M12 Renderer-private ResourceClient 的窄 façade。真实 Chromium证明：

```text
namespace + key + expectedContentVersion
→ real Content HTTP bytes / MIME / actual version

version mismatch       → CONTENT_CONFLICT
caller cancellation    → CONTENT_CANCELLED
Window teardown        → in-flight CONTENT_CANCELLED
post-teardown read      → CONTENT_CANCELLED
```

每次返回独立 bytes；origin、installationId、token和private client不进入 business ABI。

Production presentation读取 Store 的 narrow `readPresentationFacts()`；`snapshotForQualification()`只供测试 introspection。Malformed signal-like input必须同时具备 `addEventListener/removeEventListener`，否则在调用private client前拒绝为 `CONTENT_INVALID`。

## Closure boundary

`.github/workflows/m13.yml`在 Node 20/24 安装真实 Chromium并执行同一个 `test:m13` gate。M13只关闭 logical Web Presentation 与 Chromium-observable semantics；Electron BrowserWindow full composition、Desktop reload/shutdown E2E、PWA runtime和真实 `loom.map` consumer仍分别属于 M15、M17、M16和M14。
