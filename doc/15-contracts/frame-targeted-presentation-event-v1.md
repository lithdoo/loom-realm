# Frame-targeted Presentation Event v1

> 状态：Active / Normative / Frozen
> Profile：[Renderer Data Profile v3](./renderer-data-profile-v3.md)
> Public API：[Web Presentation API v3](./web-presentation-api-v3.md)
> 最近复核：2026-10-23

## 1. Interest

```ts
interface PresentationInterestV1 {
  readonly type: "presentation.interest";
  readonly frames: readonly {
    readonly frameId: string;
    readonly channels: readonly string[];
  }[];
}
```

Interest 是 current carrier 上的 full replacement configuration，不是 Frame authority。frames 按 frameId 排序，channels 按 Unicode scalar lexical order 排序并去重；不允许空 channel entry。上限为 128 Frames、每 Frame 64 Channels、总计 4096 pairs。Channel 为 1..256 UTF-8 bytes 的 Unicode scalar string，禁止 C0/DEL。

fresh carrier 的 remote Interest 为空；Subsystem 必须自动发布 full desired registry。多个 listener 对同一 Frame/channel 取 union；Frame close 和 Runtime terminal 撤销相应 desired Interest。

## 2. Event wire

```ts
interface PresentationEventV1 {
  readonly type: "presentation.event";
  readonly sourceSubsystemKey: string;
  readonly domainId: string;
  readonly targetKey: string;
  readonly frameId: string;
  readonly activationId: string;
  readonly channel: string;
  readonly name: string;
  readonly data: JsonObject;
}
```

消息运行在 destination Subsystem 的 Data Connection 上；`sourceSubsystemKey` 可以与该 Data binding owner 不同。所有 provenance 和 destination 字段由 Renderer 可信绑定。

`data` 保持 Web Presentation 的有界 JSON 规则：最多 64 层业务嵌套、16,384 个成员和 262,144 UTF-8 bytes。Data message envelope 不降低这个公开上限。

## 3. Sender gate

发送前必须同时成立：source Session/generation/Data peer/RenderNode 仍 current；target Data peer 仍 current；current Top Active Frame 仍等于接受时的 `(subsystemKey, frameId, activationId)`；exact Channel Interest 仍存在。

任何事实失效都丢弃未开始 Event，不重定向、不重放、不主动 acquire Data。已经进入物理 send 的 Event 不回滚，由 receiver gate 最终裁决。

## 4. Receiver gate 与 listener

listener 必须绑定 Runtime 拥有的真实 `Frame` object。每个 handler 真正开始前重新检查 exact frameId、activationId、`deliveryOpen`、listener open 与 local Interest。第一个同步 handler 若触发 `frame.call()`，同消息的后续 handler必须因 gate 关闭而不执行。

同步 throw 和 Promise rejection 在 registration 边界隔离。已开始的 async handler 跨 `await` 后由业务自行处理取消/currentness。

Event 全部 transient。Framework 保证旧 Activation 的 State/Event message 不继承、不重放，也不提供 `input.reset` 或 retained State；Framework 不观察或改写消费方业务对象中保存的 held/down 状态。新 Activation 必须由消费方主动清空这类本地状态，从 neutral/empty state 开始。
