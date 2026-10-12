# Schema Form 游戏库

`@loomrealm-game/schema-form` 提供 caller 当前 Subsystem/Frame 内的一次性 declarative form interaction。它负责 schema/initial value validation、current form state、Presentation projection 与 submit/cancel settlement；提交结果之后的 gameplay side effect 仍由 caller 拥有。

## 使用

```ts
const result = await openSchemaForm(scope, frame, {
  schema: {
    version: 1,
    title: "角色名称",
    fields: [
      {
        key: "name",
        kind: "string",
        label: "Name",
        required: true,
      },
    ],
  },
  cancelable: true,
});

if (result.type === "submitted") {
  use(result.value);
}
```

同一 `Frame` 同时最多一个 active form。User cancel resolve `{ type: "cancelled" }`；Frame abort reject `AbortError`。Schema Form 不注册独立 Subsystem，也不通过 `frame.call()` 调用自己。

## 边界

```text
caller
→ 为什么打开表单
→ schema / initial value
→ submitted result 的 gameplay 含义与 side effects

Schema Form
→ current canonical form value
→ validation errors
→ RenderDomain / InputListener interaction lifetime

Business WebComponent
→ concrete DOM/widget/focus/visual-local behavior
```

v1 支持 `string`、`number`、`boolean`、`select` fields，并通过 Web Presentation custom event 接收 `change`、`submit`、`cancel` interaction。

## 文档入口

- [Schema Form v1 Design](./DESIGN.md) — public model、lifecycle、validation、Presentation interaction 与 compatibility boundary。
- [Web Presentation API v1](../../doc/15-contracts/web-presentation-api-v1.md) — generic WC projection / custom event contract。
- [Render Update v1](../../doc/15-contracts/render-update-v1.md) — retained Render state contract。

进行中的工作使用 GitHub Issue/PR；已完成 implementation plan 由 Git 历史保存。