# Main ⇄ Renderer Control v2

> 状态：Active / Normative / Frozen
> Protocol version：`2`
> Data authority：[Renderer Data Profile v2](./renderer-data-profile-v2.md)
> 最近复核：2026-10-21

Renderer Control v2 发布 Main 拥有的 Session、Runtime、Frame stack 与 Data authority 快照。相对于冻结的 v1，唯一领域删除是 `snapshot.inputTarget`；Framework 不再拥有设备输入 target。

## 1. Hello

Renderer 发送一次 `renderer.hello`，`protocolVersions` 必须包含 `2`。Main 选择版本 2，返回：

```ts
interface RendererHelloResultV2 {
  readonly protocolVersion: 2;
  readonly snapshot: RendererAuthoritySnapshotV2;
}
```

不支持版本 2 时返回 `RENDERER_CONTROL_PROTOCOL_UNSUPPORTED`。实现不得把 v1 response 当作 v2 接受。

## 2. Snapshot

```ts
interface RendererAuthoritySnapshotV2 {
  readonly sessionId: string;
  readonly revision: number;
  readonly runtimes: readonly RendererRuntimeStateV2[];
  readonly stack: readonly RendererFrameStateV2[];
  readonly dataAuthorities: readonly RendererDataAuthorityV2[];
}
```

快照为 closed schema，不得出现 `inputTarget`。revision、Session identity、Frame stack relation、active frame activationId 和 Data authority currentness 规则延续 v1。

Main 仍必须验证 Frame ownership、栈顶、`active` lifecycle 与调用方 `activationId`。删除 InputTarget 不删除 Frame、Activation、Session、Runtime、`bootstrap.initial.input`、`frame.initialize({input})` 或 `frame.params`。

## 3. Publication

`renderer.state` 只发布 revision 严格递增的完整快照。Main 保持最多一个在途 publication，并只保留最新 pending snapshot；participant replacement、retire 与 stale terminal 继续 fail closed。

Data authority 的 current production profile 是 `loomrealm.renderer-data/2`。
