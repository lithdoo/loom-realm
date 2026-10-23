# Frame-targeted Presentation Events Qualification

> 状态：Implementation qualification
> Contract：[Web Presentation API v3](../15-contracts/web-presentation-api-v3.md)、[Renderer Data Profile v3](../15-contracts/renderer-data-profile-v3.md)、[Frame-targeted Presentation Event v1](../15-contracts/frame-targeted-presentation-event-v1.md)
> 实施主线：[Frame-targeted Web Presentation Events](./frame-targeted-presentation-events.md)
> 日期：2026-10-24

## 1. Qualified topology

```text
current Web Presentation RenderNode
  → Control v2 stack.at(-1) TopFrameLease(S,F,A)
  → exact presentation.interest[S][F][channel]
  → target Renderer Data /3 peer (single DataRuntime writer)
  → PresentationEventManager
  → exact live Frame/Activation listener
```

boolean `false/true` 继续走既有 Platform → Session Events publication。`"top-frame"` 在 Renderer 内分支，不修改 Session Events、Main Frame authority 或 Control v2 wire。

## 2. F01–F30 executable evidence

| ID | 自动化证据 |
| --- | --- |
| F01 | `packages/renderer/test/presentation-seam.test.mjs`：省略/false publication regression |
| F02 | 同上：`broadcast:true` Session-wide publication regression |
| F03 | 同上：no active top silent drop，Platform publication 计数保持 0 |
| F04 | 同上：owner 与 Battle target 不同，wire source provenance 保持 owner |
| F05 | `packages/renderer/test/presentation-frame-gate.test.mjs`：A1 有 1 in-flight + 256 pending 时切 B1，旧 pending 立即丢弃并为 B1 Event 释放容量 |
| F06 | `packages/subsystem/test/presentation-events.test.mjs`：in-flight stale Activation receiver drop |
| F07 | Renderer Gate + Subsystem manager：A1→B1→A2 不执行旧 Event |
| F08 | Subsystem manager + Runtime carrier vertical：同 Subsystem parent/child 只调用 exact Frame |
| F09 | manager `deliveryOpen=false` gate |
| F10 | manager closeFrame cleanup 与 Interest shrink |
| F11 | Interest 安装前 drop、安装后 Effective；Runtime fresh publish |
| F12 | Gate Interest shrink fences queued work，即使同 channel 在 in-flight 完成前恢复也不复活旧 Event |
| F13 | manager fresh peer 自动 full Interest republish |
| F14 | Gate target peer replacement 清旧 queue |
| F15 | 既有 Web Projector stale-currentness regression；source replacement 跨 target queue 主动清理；同一 current peer 内 source RenderNode 删除后，`offer()` 在容量检查前清除其 pending Event |
| F16 | Renderer seam invalid current `broadcast:"bad"` 同步 TypeError |
| F17 | Data presentation closed schema、wrong-direction protocol-fatal 与 Web Presentation 64 层 data 边界 |
| F18 | manager sync throw / Promise rejection local isolation |
| F19 | Renderer top-frame Platform publication 0；manager 与 `scope.events` 独立 |
| F20 | 独立 Presentation client 不接收 Session Events；boolean regression 保持原路由 |
| F21 | Renderer、Data、Subsystem 全包 `render.event` regression |
| F22 | Data `/2` binding 在 claim reader 前拒绝；历史 v2 contract 未改写 |
| F23 | `apps/desktop/test/m9-vertical.test.mjs` 覆盖 Data vertical；`test/m15-hostra-product.test.mjs` 从真实 Chromium World Custom Element 经 WebProjector、Desktop Broker/WebSocket、Hostra Runner 投递到 Battle exact Frame listener，并证明 World listener 不执行 |
| F24 | `apps/pwa/test/frame-targeted-presentation.test.mjs` 覆盖 MessagePort Data vertical；`apps/pwa/test/frame-targeted-presentation.e2e.test.mjs` 从真实 Chromium World Custom Element 经 WebProjector、Session/Runtime Worker 投递到 Battle exact Frame listener，并证明 World listener 不执行 |
| F25 | Main/Renderer Control/Data/Subsystem `/3` cohort tests与 `/2` mismatch fail-closed |
| F26 | Gate 300 Event burst：1 in-flight + 256 pending、FIFO、overflow drop、无 Data local-fatal |
| F27 | manager unbound/foreign/closed/rebind rejection；Runtime close/terminal cleanup |
| F28 | Gate source current predicate、target/source peer identity fencing，以及 1 in-flight + 256 个已删除 source A pending 时 source B 立即取得容量的回归 |
| F29 | 第一个 handler 关闭 delivery 后 sibling 不执行；异常隔离 |
| F30 | manager 测试证明旧 State/Event message 不重放；Framework 不改写业务 held/down，消费方必须在 Activation 变化时自行清空 |

## 3. Qualification commands

qualified implementation subject：`9eb06a57`

```text
npm run test:frame-targeted-presentation:qualification
npm run test:game-common-controls-input:qualification
npm run test:regression
npm run docs:check-links
npm run docs:build
```

实际结果：

| 命令 | 结果 |
| --- | --- |
| `npm run test:frame-targeted-presentation:qualification` | PASS：核心/集成 50/50、Desktop Hostra Chromium 1/1、PWA Chromium/Worker 1/1；两端浏览器测试均从真实 World Custom Element 入口闭环到 Battle exact Frame listener，并证明 World listener 不执行 |
| `npm run test:game-common-controls-input:qualification` | 当前 Windows `core.autocrlf=true` checkout 中，common-controls 6/6、Hub/Presentation/bridge 35/35、Map 106/106、Dialogue 30/30、Schema Form 22/22、Desktop 29/29、PWA unit 39/39 均 PASS；Chromium 15/17，两个既有 map/PokeMan case 因下述 CRLF fixture identity 问题失败。LF-only detached rerun确认这两个受影响 case 与新增 top-frame case 均 PASS；完整 clean-Linux 结果以本 PR hosted CI 为准。 |
| `npm run test:regression` | PASS；全 workspace regression 完成，Hostra 仅保留仓库既有的权限/平台 skip |
| `npm run docs:check-links` | PASS，782 个相对链接 / 167 个 Markdown 文件 |
| `npm run docs:build` | PASS，VitePress client/server build 与 page rendering 完成 |

Windows `core.autocrlf=true` 的普通 checkout 会把两个已提交 Presentation JS fixture 写成 CRLF，而 esbuild 产物为 LF；按精确 bytes 计算 Content Version 时，既有 PWA M17/PokeMan 测试会把它识别为第二份脚本并触发 Custom Element collision。未修改 fixture 或产品语义；本次 LF-only detached rerun中，两个受影响 case 均通过，证明失败来自 checkout bytes，而不是 Frame-targeted Event 实现。

## 4. Independent diff review

Bugbot 对完整 branch diff 给出 3 项 correctness finding，均在 qualified subject 中修复并补回归：

- Presentation Data wire 允许公开 API 的完整 64 层业务深度，不再落入 generic 32 层 payload default；
- Interest shrink 立即清除失去资格的 queued Event，之后重新添加 channel 也不会复活旧 Event；
- source peer replacement 会主动清除所有 cross-Subsystem target queue 中引用旧 source 的 pending Event，避免占满有效容量。

后续复核发现 Control Lease 切换只更新 snapshot、未立即清理旧 pending queue。subject `7d8d58d0` 将 Control/Interest 变化统一收敛到同一个 Effective predicate 做主动清理，并补充“1 in-flight + 256 pending 后切换 Activation”的容量回归；已进入物理 send 的 Event 仍按契约交给 receiver gate 最终裁决。

再次复核发现 source RenderNode 删除不会改变 Control、Interest 或 source Data peer，导致其失效 pending Event 可能在 in-flight send 完成前占用全部容量。subject `9eb06a57` 在 `offer()` 容量判断前使用同一 Effective predicate 裁剪队列，并补充“1 in-flight + source A 的 256 pending → A 删除、peer 保持 current → source B Event”回归。同时，Desktop/PWA 真实浏览器 fixture 升级为 World source、Battle top Frame，验证跨 Subsystem 只执行 Battle listener。

## 5. Compatibility conclusion

- current runtime cohort 是一次性 `/3` 升级，不支持 `/2`/`/3` 混搭；
- Control protocolVersion 保持 2；
- old `/2` 和 User Input v1 文件保持历史冻结；
- Session Events 源码、Hub、Carrier、Client、Desktop/PWA routing 与 Hostra provisioning无功能修改；
- Desktop/PWA Broker 只搬运 `/3` Data carrier，不解析 Frame 或 `presentation.event`。
