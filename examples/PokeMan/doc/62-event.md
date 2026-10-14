# 事件

> 独立技术设计记录。不改写 `../DESIGN.md`。

## 结构

一条事件有事件 `id`，以及一个 `states` 对象。这个对象包含该事件的全部状态。

```text
Event
  id
  states:
    [stateId]: 该状态的额外数据
```

`states` 的 key 是状态 id。value 里放这个状态要带的数据，例如角色位置、静态对话。

角色位置使用 [人物](./61-character.md) 里的 `static` 或 `absent`。某个状态的 value 没有写某个角色的位置时，这个状态不为该角色提供位置。

当前处于哪个状态 id，记在 Realm State 里。取事件位置时，只看这个当前状态的 value。
