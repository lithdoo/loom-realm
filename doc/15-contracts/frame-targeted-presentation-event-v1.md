# Frame-targeted Presentation Event v1

> 状态：Proposed pre-release capacity-cap correction / implementation and qualification pending
> Profile：[Renderer Data Profile v3](./renderer-data-profile-v3.md)
> Public API：[Web Presentation API v3](./web-presentation-api-v3.md)
> Decision：[ADR 0039](../decisions/0039-render-update-v1-resource-budget-correction.md)
> 最近复核：2026-10-30

## 1. Interest

~~~ts
interface PresentationInterestV1 {
  readonly type: "presentation.interest";
  readonly frames: readonly {
    readonly frameId: string;
    readonly channels: readonly string[];
  }[];
}
~~~

Interest 是 current carrier 上的 full replacement configuration，不是 Frame authority。frames 按 frameId 排序，channels 按 Unicode scalar lexical order 排序并去重；不允许空 channel entry。

frameId 与 channel 必须是非空 Unicode scalar strings；channel 禁止 C0/DEL。协议不定义 Frame count、每 Frame channel count、total pair count 或 channel UTF-8 byte length 上限。开发者可以在自己的 opt-in validation 中施加业务限制；默认 Profile 不得因这些数量或长度超过历史数字而拒绝。

fresh carrier 的 remote Interest 为空；Subsystem 必须自动发布 full desired registry。多个 listener 对同一 Frame/channel 取 union；Frame close 和 Runtime terminal 撤销相应 desired Interest。

## 2. Event wire

~~~ts
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
~~~

消息运行在 destination Subsystem 的 Data Connection 上；sourceSubsystemKey 可以与该 Data binding owner 不同。所有 provenance 和 destination 字段由 Renderer 可信绑定。

sourceSubsystemKey、domainId、targetKey、frameId、activationId、channel 与 name 按各自 identity/text semantics 校验为非空 Unicode scalar strings；channel 仍禁止 C0/DEL。它们不定义 UTF-8 byte length 上限。

data 保持 plain JSON object 和既定 Wire JSON representation；不定义业务嵌套 depth、object member count、array element count 或 UTF-8 byte 上限。不得以历史 64 depth / 16,384 members / 262,144 bytes 拒绝 otherwise valid data。Data message envelope 不额外降低该表示范围。

## 3. Sender gate

发送前必须同时成立：source Session/generation/Data peer/RenderNode 仍 current；target Data peer 仍 current；current Top Active Frame 仍等于接受时的 (subsystemKey, frameId, activationId)；exact Channel Interest 仍存在。

任何事实失效都丢弃未开始 Event，不重定向、不重放、不主动 acquire Data。已经进入物理 send 的 Event 不回滚，由 receiver gate 最终裁决。此处的丢弃由 authority / activation / interest applicability 决定，不是容量压力策略。

## 4. Receiver gate 与 listener

listener 必须绑定 Runtime 拥有的真实 Frame object。每个 handler 真正开始前重新检查 exact frameId、activationId、deliveryOpen、listener open 与 local Interest。第一个同步 handler 若触发 frame.call()，同消息的后续 handler 必须因 gate 关闭而不执行。

同步 throw 和 Promise rejection 在 registration 边界隔离。已开始的 async handler 跨 await 后由业务自行处理取消/currentness。

Event 全部 transient。Framework 保证旧 Activation 的 State/Event message 不继承、不重放，也不提供 input.reset 或 retained State；Framework 不观察或改写消费方业务对象中保存的 held/down 状态。新 Activation 必须由消费方主动清空这类本地状态，从 neutral/empty state 开始。

## 5. Capacity-cap correction / compatibility

本次首次发布前 correction 删除旧实现中的以下人为容量限制：

- Interest 最多 128 Frames；
- 每 Frame 最多 64 Channels；
- 最多 4096 Frame/channel pairs；
- channel 最多 256 UTF-8 bytes；
- presentation event name / identity string 的 128 / 256 UTF-8 byte caps；
- Event data 最多 64 层、16,384 members、262,144 UTF-8 bytes。

不以 local resource budget、ResourceBudgetPolicy、bounded queue 或其他配置项替代。平台或 carrier 实际无法接收、解析或处理时，传播可观察到的真实 local/transport failure；不可捕获的进程级 OOM 不承诺能够恢复。

移除这些限制会改变旧实现的 accept/reject 行为。保持 Frame-targeted Presentation Event v1 identity 的前提是 release owner 确认首次正式发布前不存在 deployed old-cap peers、independent implementations、rolling upgrade / rollback cohorts 或 persisted compatibility obligations。若任何一项存在，必须停止 same-identity correction，另行提交 version / migration ADR。

若兼容核查通过，可以在首次正式发布前由 ADR0039 明确修订同一 identity。实现和 qualification 完成前，本修订仍是 proposed，不代表已激活或已实现。