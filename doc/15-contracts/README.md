# LoomRealm 正式契约目录

> 层级：正式契约索引；状态：Active Design。Viewport Profile `/1` correction **Docs Freeze HOLD / not implemented**；其他已冻结契约不被本修订重开。最近复核：2026-09-18。

本文只导航 cross-role contract，不复制其字段/状态机或 milestone evidence。M14/M15 formal status 分别归 [m14 ledger](../30-implementation/m14-qualification.md)、[m15 ledger](../30-implementation/m15-qualification.md)。

## Current Contract Map

| Contract | 状态 |
|---|---|
| [Frame / Call v1](./frame-call-protocol-v1.md) | Frozen / unchanged |
| [Main ⇄ Renderer Control v1](./main-renderer-control-v1.md) | Frozen / unchanged |
| [Renderer Data Application Profile /1](./renderer-data-profile-v1.md) | **Four-child revised normative candidate / Docs Freeze HOLD；旧 executable 三-child** |
| [Viewport State v1](./viewport-state-v1.md) | **Candidate / NOT IMPLEMENTED** |
| [Renderer ⇄ Subsystem Data Connection v1](./renderer-subsystem-data-connection-v1.md) | Frozen / unchanged |
| [User Input v1](./user-input-v1.md) | Frozen / unchanged |
| [Render Update v1](./render-update-v1.md) | Frozen / unchanged |
| [Readonly Content API v1](./content-api-v1.md) | 既有状态不变 |
| [Web Presentation Config v1](./web-presentation-config-v1.md) | Frozen / unchanged |
| [Web Presentation API v1](./web-presentation-api-v1.md) | Frozen / unchanged |

**Viewport 冻结入口：** [ADR0036](../decisions/0036-preimplementation-viewport-profile-v1-correction.md) → [Profile](./renderer-data-profile-v1.md) + [Viewport child](./viewport-state-v1.md) → [Profile revision3 conformance](./renderer-data-profile-conformance-v1.md) + [Viewport conformance](./viewport-state-conformance-v1.md) → [唯一审批/执行 ledger](../30-implementation/viewport-core-freeze-ledger.md)。旧三-child [Profile 全文](./renderer-data-profile-v1-previewport-baseline.md) / [revision2 全文](./renderer-data-profile-conformance-v1-previewport-baseline.md) 仅用于不变义务继承；不能拿历史 PASS 证明新版本。冻结不等于实现或资格。

## Unchanged M13 owner summary

Main / Renderer Control owns current Session+DataAuthority；Renderer Store owns Render replica；Web Projector 只投影 current、eligible Store；业务 WC owns its Shadow DOM/Canvas。Presentation reevaluation 仍仅由成功 Control topology change 或 current Render Store commit 触发。Viewport observation 不增 M13 reevaluation、Host mutation 或 Frame authority。正式依据分别见 [Web Presentation API](./web-presentation-api-v1.md) 与 [Config](./web-presentation-config-v1.md)。

M15 Hostra shell/Electron/HOSTRA_SUBCMD、actual Window source、map content-box/letterbox 属后续物理产品工作，不能在通用 Core child 硬编码 DOM。本文不改变其 frozen composition。

## Qualification ownership

M10/M12/M13 historical closure 由各自 ledger 维护；M11、M14、M15 当前 subject 的 requalification 状态由各自 ledger 维护，不从这里推导新 PASS。Viewport 本轮独立 [freeze ledger](../30-implementation/viewport-core-freeze-ledger.md) 负责 Docs Freeze 与架构资格，绝不声明 Desktop/Map 产品闭环。

Freeze governance：[document-governance](../00-overview/document-governance.md)；修订冻结协议必须显式 ADR、保全原文、同步 formal conformance 和 navigation、批准准确 docs SHA。