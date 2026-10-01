# Schema Form Design

Status: draft

This document defines the v1 form declaration shape and public module boundary for
`@loomrealm-game/schema-form`.

Schema Form is a game-lib module that runs inside the caller's current subsystem
Frame. It is not an independently registered subsystem and is not invoked through
`frame.call()`.

This document focuses on the declarative form schema, the synchronous validation
contract, and the module-facing API. Renderer-specific implementation details remain
separate.

## Goals

The v1 schema should be:

- JSON-compatible.
- Small and explicit.
- Easy to validate deterministically.
- Presentation-neutral.
- Independent from JSON Schema.
- Free of layout, widget, provider, theme, and extension frameworks.

The schema describes fields and validation rules. Invocation-specific values are not
part of the schema.

## Module boundary

Schema Form is a reusable module owned by the currently executing subsystem.

The caller supplies its existing `SubsystemScope` and `Frame`. Schema Form uses
those capabilities directly for the duration of the form interaction.

Conceptually:

```text
current subsystem Frame
        │
        ├── game logic
        │
        ├── openSchemaForm(scope, frame, request)
        │       ├── render form
        │       ├── receive form input
        │       ├── maintain form data
        │       ├── validate
        │       └── submit / cancel
        │
        └── continue game logic with result
```

Schema Form does not create or register another subsystem Frame.

In particular, the module must not implement its public operation by calling:

```ts
frame.call("schema-form", ...)
```

There is no `schemaFormDefinition` in the v1 public API.

The module shares the caller's existing Frame lifetime, abort signal, input authority,
and render ownership context.

## Public API

The v1 module API is intentionally one-shot:

```ts
export type SchemaFormDataV1 =
  Readonly<Record<string, JsonValue>>;

export interface SchemaFormRequestV1 {
  readonly schema: SchemaFormV1;
  readonly initialValue?: SchemaFormDataV1;
}

export type SchemaFormResultV1 =
  | {
      readonly type: "submitted";
      readonly value: SchemaFormDataV1;
    }
  | {
      readonly type: "cancelled";
    };

export function openSchemaForm(
  scope: SubsystemScope,
  frame: Frame,
  request: SchemaFormRequestV1,
): Promise<SchemaFormResultV1>;
```

Typical usage:

```ts
const result = await openSchemaForm(scope, frame, {
  schema,
  initialValue,
});

if (result.type === "submitted") {
  // consume result.value
}
```

The public function is a convenience module API, not a service locator and not a
wrapper around `frame.call()`.

A Builder/Handler abstraction is intentionally not introduced in v1. The interaction
has a simple one-shot lifetime:

```text
open → edit → submit/cancel → return
```

If future requirements introduce a persistent control surface that survives beyond
one interaction, that API shape can be reconsidered separately.

## Top-level schema

```ts
export interface SchemaFormV1 {
  readonly version: 1;

  readonly title?: string;
  readonly description?: string;

  readonly fields: readonly SchemaFormFieldV1[];

  readonly validateOnChange?: string;
  readonly validateOnSubmit?: string;
}
```

`fields` is an ordered array. Array order is the default presentation order.

Each field has a stable `key`. Submitted values are mapped by that key.

## Field model

```ts
export type SchemaFormFieldV1 =
  | SchemaFormStringFieldV1
  | SchemaFormNumberFieldV1
  | SchemaFormBooleanFieldV1
  | SchemaFormSelectFieldV1;

interface SchemaFormFieldBaseV1 {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
  readonly required?: boolean;
}
```

The discriminant is named `kind` rather than `type` to make it explicit that this
is a Schema Form field model, not JSON Schema.

### String field

```ts
export interface SchemaFormStringFieldV1 extends SchemaFormFieldBaseV1 {
  readonly kind: "string";

  readonly default?: string;
  readonly placeholder?: string;
  readonly multiline?: boolean;

  readonly minLength?: number;
  readonly maxLength?: number;
}
```

`multiline` is a presentation-neutral editing hint. It does not imply any HTML or
DOM control.

### Number field

```ts
export interface SchemaFormNumberFieldV1 extends SchemaFormFieldBaseV1 {
  readonly kind: "number";

  readonly default?: number;

  readonly min?: number;
  readonly max?: number;
  readonly integer?: boolean;
}
```

`integer` is a constraint on a JSON number, not a separate value type.

Only finite JSON-compatible numbers are valid values.

### Boolean field

```ts
export interface SchemaFormBooleanFieldV1 extends SchemaFormFieldBaseV1 {
  readonly kind: "boolean";

  readonly default?: boolean;
}
```

`false` is an explicit value and must never be treated as absent.

### Select field

```ts
export interface SchemaFormSelectFieldV1 extends SchemaFormFieldBaseV1 {
  readonly kind: "select";

  readonly default?: string;
  readonly options: readonly SchemaFormSelectOptionV1[];
}

export interface SchemaFormSelectOptionV1 {
  readonly value: string;
  readonly label: string;
}
```

`option.value` is the semantic value returned by the form.
`option.label` is presentation-only text.

Select options have one canonical representation. String-array shorthand is not
supported in v1.

## Defaults and initial values

Defaults belong to the reusable schema.

Invocation-specific initial values belong to the request that opens the form and are
kept separate from the schema.

The value precedence is:

```text
initialValue[field.key]
    ↓
field.default
    ↓
absent
```

Therefore:

```text
initialValue > default > absent
```

No additional `initial`, `value`, or `defaultValue` aliases are defined in v1.

## Value semantics

Submitted form data is a plain object keyed by field key.

Example:

```json
{
  "name": "Alice",
  "level": 10,
  "enabled": false,
  "class": "mage"
}
```

Optional fields with no value are omitted.

The following values are explicit values, not absence:

```text
false
0
""
```

For required string fields, an empty string does not satisfy `required`.

For select fields, submitted values must exactly match one declared
`options[*].value`.

Schema Form does not perform implicit trimming, case folding, Unicode normalization,
locale number conversion, or other value normalization in v1.

## Trusted scripted validation

Schema Form supports two optional synchronous scripted validators:

```ts
readonly validateOnChange?: string;
readonly validateOnSubmit?: string;
```

Each string contains a complete JavaScript function expression.

Example:

```json
{
  "validateOnChange": "(data) => data.password && data.password.length < 8 ? { password: 'At least 8 characters' } : null",
  "validateOnSubmit": "(data) => data.password !== data.confirmPassword ? { confirmPassword: 'Passwords do not match' } : null"
}
```

Conceptually the source is compiled as:

```ts
const validator = new Function(
  `"use strict"; return (${source});`,
)();
```

A validator receives the current form data snapshot:

```ts
type SchemaFormValidationDataV1 =
  Readonly<Record<string, unknown>>;
```

Its logical result shape is:

```ts
type SchemaFormValidationErrorsV1 =
  Readonly<Record<string, string>>;

type SchemaFormValidatorResultV1 =
  | null
  | undefined
  | SchemaFormValidationErrorsV1;
```

### Passing result

The following results mean validation passed:

```ts
null
undefined
{}
```

Internally these may all be normalized to an empty error map.

### Failing result

A non-empty object means validation failed:

```ts
{
  password: "Password is too short",
  confirmPassword: "Passwords do not match"
}
```

Every object key must match an existing `fields[*].key`.

Every object value must be a non-empty string describing the validation failure for
that field.

The following results are invalid validator results:

```ts
"error"
false
[]
{ password: 123 }
{ unknownField: "Invalid" }
```

An invalid validator result is a validator failure, not a user validation failure.

## Change validation

`validateOnChange` runs after the authoritative form value has changed.

Its purpose is to recompute the current validation state.

A validation error must not reject or roll back the field change. The value change
remains accepted, and the returned errors are shown as the current validation state.

Conceptually:

```text
field change
    ↓
update canonical form data
    ↓
run built-in field validation
    ↓
run validateOnChange(data)
    ↓
update validation errors
    ↓
refresh presentation
```

## Submit validation

`validateOnSubmit` runs when submission is attempted.

Conceptually:

```text
submit attempt
    ↓
run complete built-in validation
    ↓
run validateOnSubmit(data)
    ↓
errors exist → remain active
no errors    → complete submission
```

In v1, `validateOnChange` and `validateOnSubmit` have independent execution
semantics. A submit does not implicitly re-run `validateOnChange`.

If the same cross-field rule must run at both times, the schema author must declare
it in both validators.

## Validator failure

If validator compilation or execution throws, or if a validator returns an invalid
result shape, that is a schema/program failure rather than a user-data validation
failure.

It must not be converted into an ordinary field error.

A stable module error code should be used, for example:

```text
SCHEMA_FORM_VALIDATOR_FAILED
SCHEMA_FORM_INVALID_VALIDATOR_RESULT
```

The exact failure-code contract is frozen with the module lifecycle/error contract,
not by this document.

## Validator data isolation

Validators receive a snapshot of current form values rather than direct mutable
access to Schema Form internal state.

The public contract treats the argument as read-only. Implementations should use a
defensive snapshot and may freeze that snapshot as an implementation detail.

Validator mutation must never become an implicit state update mechanism.

## Security and trust boundary

`validateOnChange` and `validateOnSubmit` contain executable JavaScript.

Therefore SchemaFormV1 is not safe as arbitrary untrusted configuration merely
because its transport representation is JSON-compatible.

These fields are trusted executable schema content.

Schema Form must not evaluate validator source originating from untrusted users or
untrusted remote content.

This trust property must remain explicit in any API or content pipeline that accepts
SchemaFormV1.

## Example

```json
{
  "version": 1,
  "title": "Create Account",
  "description": "Enter account details.",
  "fields": [
    {
      "key": "username",
      "kind": "string",
      "label": "Username",
      "required": true,
      "maxLength": 32
    },
    {
      "key": "password",
      "kind": "string",
      "label": "Password",
      "required": true
    },
    {
      "key": "confirmPassword",
      "kind": "string",
      "label": "Confirm Password",
      "required": true
    },
    {
      "key": "level",
      "kind": "number",
      "label": "Level",
      "default": 1,
      "integer": true,
      "min": 1,
      "max": 100
    },
    {
      "key": "enabled",
      "kind": "boolean",
      "label": "Enabled",
      "default": true
    },
    {
      "key": "class",
      "kind": "select",
      "label": "Class",
      "required": true,
      "options": [
        {
          "value": "warrior",
          "label": "Warrior"
        },
        {
          "value": "mage",
          "label": "Mage"
        }
      ]
    }
  ],
  "validateOnChange": "(data) => data.password && data.password.length < 8 ? { password: 'Password must contain at least 8 characters' } : null",
  "validateOnSubmit": "(data) => data.password !== data.confirmPassword ? { confirmPassword: 'Passwords do not match' } : null"
}
```


## Presentation and RenderData

Schema Form projects authoritative module state into ordinary LoomRealm RenderNodes.
The Web presentation must consume presentation snapshots; it must not reinterpret the
original SchemaForm declaration as an independent source of form state.

The intended flow is:

```text
SchemaFormV1
    ↓ interpret
Schema Form authoritative state
    ↓ project
RenderData
    ↓
Web Components
```

The presentation layer is not validation authority and does not own defaults,
initial-value precedence, canonical form values, or submission validity.

### Render tree

The v1 presentation uses one root element and one stable child RenderNode per field:

```text
lr-schema-form
├── lr-schema-form-field   field:name
├── lr-schema-form-field   field:age
├── lr-schema-form-field   field:enabled
└── lr-schema-form-field   field:class
```

Conceptually:

```ts
{
  key: "schema-form",
  tag: "lr-schema-form",
  attrs: {},
  data: formRenderData,
  children: fields.map((field) => ({
    key: `field:${field.key}`,
    tag: "lr-schema-form-field",
    attrs: {},
    data: fieldRenderData,
    children: [],
  })),
}
```

The field declaration key is semantic form identity. The RenderNode key derives
deterministically from it. Field order is represented by RenderNode child order.

A field kind is stable for the lifetime of an open form. The presentation must not
change the tag of a live RenderNode.

### Root RenderData

The root receives only state needed to present the form shell:

```ts
export interface SchemaFormRenderDataV1 {
  readonly title?: string;
  readonly description?: string;
  readonly submitting: boolean;
}
```

The root is responsible for the form shell, title, description, field slot, and
submit/cancel controls.

A submit control represents a submit attempt. Browser-native validity and button
state are not authoritative form validity.

### Field RenderData

Field RenderData is a presentation snapshot rather than the original field schema.

```ts
interface SchemaFormFieldRenderBaseV1 {
  readonly key: string;
  readonly label: string;
  readonly description?: string;
  readonly required: boolean;
  readonly error?: string;
}

export type SchemaFormFieldRenderDataV1 =
  | (SchemaFormFieldRenderBaseV1 & {
      readonly kind: "string";
      readonly value?: string;
      readonly placeholder?: string;
      readonly multiline: boolean;
      readonly minLength?: number;
      readonly maxLength?: number;
    })
  | (SchemaFormFieldRenderBaseV1 & {
      readonly kind: "number";
      readonly value?: number;
      readonly min?: number;
      readonly max?: number;
      readonly integer: boolean;
    })
  | (SchemaFormFieldRenderBaseV1 & {
      readonly kind: "boolean";
      readonly value?: boolean;
    })
  | (SchemaFormFieldRenderBaseV1 & {
      readonly kind: "select";
      readonly value?: string;
      readonly options: readonly {
        readonly value: string;
        readonly label: string;
      }[];
    });
```

Each field node is self-contained. For example, a field receives its own current
error string rather than the complete form error map.

The Web Component must not receive or execute:

- field defaults;
- invocation `initialValue`;
- `validateOnChange`;
- `validateOnSubmit`;
- validator source;
- validation authority state that it is expected to reinterpret.

Schema Form resolves those concerns before projection.

For example, if a number field has `default: 1`, the presentation receives
`value: 1`; it does not receive an absent value plus a default and decide which one
to display.

### Web Components

The v1 browser presentation uses two Custom Elements:

```text
lr-schema-form
lr-schema-form-field
```

`lr-schema-form` owns the visual form shell and submit/cancel controls.

`lr-schema-form-field` selects the appropriate native editing control from
`data.kind`:

```text
string + multiline=false → single-line text editor
string + multiline=true  → multiline text editor
number                    → numeric editor
boolean                   → boolean control
select                    → option selector
```

These mappings are browser-presentation implementation choices. They are not part of
the public SchemaForm schema ABI.

The components receive state through the existing Web presentation
`receiveRenderData(data)` convention. They should validate the incoming RenderData
shape before applying it.


### Browser component implementation strategy

The browser presentation should avoid reimplementing low-level form-control behavior
such as keyboard interaction, focus management, accessibility semantics, select
popups, checkbox behavior, and basic control styling.

The preferred v1 implementation stack is:

```text
LoomRealm Renderer contract
        │
        │ receiveRenderData(data)
        ▼
lr-schema-form / lr-schema-form-field
        │
        │ implemented with
        ▼
Lit
        │
        │ composes
        ▼
Web Awesome controls
```

Lit is used only as an implementation aid for the two LoomRealm-owned Custom
Elements. It provides stable reactive rendering and localized DOM updates while the
public Renderer contract remains the ordinary Custom Element
`receiveRenderData(data)` convention.

Web Awesome provides the underlying browser form controls.

The intended mapping is:

```text
Schema Form field                  Browser control
────────────────────────────────   ─────────────────────
string + multiline=false           wa-input
string + multiline=true            wa-textarea
number                              wa-number-input
boolean                             wa-checkbox
select                              wa-select + wa-option

form action                         wa-button
```

The LoomRealm-owned wrapper components remain:

```text
lr-schema-form
lr-schema-form-field
```

Third-party component names must not appear in `SchemaFormV1`,
`SchemaFormFieldRenderDataV1`, public module APIs, or authoritative form state.
They are browser-presentation implementation details only.

In particular, v1 must not introduce schema properties such as:

```ts
widget: "wa-input"
component: "wa-select"
```

The dependency direction must remain:

```text
Schema contract
    ↓
Schema Form authority
    ↓
RenderData contract
    ↓
LoomRealm Web Component wrapper
    ↓
Lit / Web Awesome
```

and never the reverse.

#### Root form behavior

`lr-schema-form` should render a semantic browser `<form>` shell, field slot, and
submit/cancel controls.

The browser form should not become validation authority. The preferred browser
presentation uses `novalidate` and treats Submit as a semantic submit attempt.

Built-in browser or third-party constraint-validation behavior may assist
presentation, but the Schema Form module remains the authority that decides whether
submission completes.

#### Field wrapper behavior

`lr-schema-form-field` should translate
`SchemaFormFieldRenderDataV1` into the corresponding third-party form control and
translate control interaction back into Schema Form presentation actions.

It remains responsible for Schema Form-specific presentation concerns such as:

- mapping `label`, `description`, `required`, and `error`;
- maintaining presentation-local edit state when required;
- preserving focus, selection, and IME composition;
- exposing the current error with appropriate accessible semantics;
- producing `change` / `clear` presentation actions;
- insulating the Schema Form contract from third-party component APIs.

The field wrapper should not own defaults, validation rules, canonical value
authority, or submission decisions.

#### Error presentation

The RenderData contract remains:

```ts
readonly error?: string;
```

The wrapper may map this onto whatever error, hint, invalid-state, ARIA, or supporting
text facilities the selected component library provides.

If the third-party component does not provide an appropriate error presentation, the
wrapper may render LoomRealm-owned error markup around it.

The Schema Form authority must not depend on a third-party validation API or
third-party error object shape.

#### Number-control qualification

The numeric control requires explicit qualification before its implementation choice
is frozen.

A browser numeric editor must preserve usable transient lexical states such as:

```text
-
1.
```

without prematurely forcing them into canonical JSON numbers or destroying the
user's local draft.

The preferred first candidate is `wa-number-input`.

Before freezing that choice, an implementation spike must verify its behavior for:

- incomplete numeric input;
- negative sign entry;
- decimal separator entry;
- focus and selection preservation across RenderData refreshes;
- `beforeinput`, `input`, and `change` behavior;
- external authoritative value replacement.

If its normalization behavior conflicts with Schema Form's canonical-value versus
presentation-draft model, the wrapper should instead use a text-capable control
(for example `wa-input` with an appropriate input mode) and own numeric lexical
draft handling itself.

#### Alternative component libraries

Other standards-based Web Component libraries may be evaluated, but they must remain
behind the same LoomRealm-owned wrapper boundary.

Spectrum Web Components is a possible alternative when adopting the Adobe Spectrum
design language is desirable.

Lion is a possible white-label foundation, but its own model-value, validation,
formatting, parsing, and form-registration abstractions overlap substantially with
Schema Form authority. For v1, that overlap makes it a less direct fit than a thinner
presentation library.

The preferred v1 direction is therefore:

```text
Lit + Web Awesome
```

subject to the number-control qualification above.


### Stable editing DOM

A Web Component must not rebuild its editing control on every
`receiveRenderData()` call.

Repeated replacement of an active input can destroy focus, selection, and IME
composition state. Components should create stable DOM and patch changed properties
and text instead.

Changing a field's `kind` while the form is open is not supported.

### Presentation-local drafts

The browser presentation may retain transient editing state that is not itself a
valid canonical JSON value.

This is especially important for number editing. Text such as:

```text
-
1.
```

can be a meaningful in-progress browser edit even though it is not a valid JSON
number.

Therefore:

```text
presentation-local lexical draft
              ≠
canonical Schema Form value
```

Transient DOM editing mechanics, including cursor position, selection, composition,
and incomplete numeric text, belong to Presentation.

Schema Form remains authority for canonical field values.

An incoming RenderData refresh must not unnecessarily destroy an equivalent active
local draft. An actual authoritative value change may replace the local draft.

### Presentation actions

The semantic actions required by the browser presentation are:

```ts
export type SchemaFormPresentationActionV1 =
  | {
      readonly type: "change";
      readonly key: string;
      readonly value: JsonValue;
    }
  | {
      readonly type: "clear";
      readonly key: string;
    }
  | {
      readonly type: "submit";
    }
  | {
      readonly type: "cancel";
    };
```

These actions describe presentation intent. They do not grant the Web Component
authority to mutate Schema Form state directly.

The intended authority path is:

```text
Web Component
    ↓
semantic presentation action
    ↓
trusted Renderer input adapter
    ↓
RendererInputSource / custom User Input channel
    ↓
existing User Input authority gate
    ↓
scope.createInputListener(...)
    ↓
Schema Form module
```

Direct callbacks from a Web Component into subsystem/module state, global mutable
managers, DOM references in the public SchemaForm API, and reverse use of the Render
Update protocol are not acceptable substitutes.

The repository currently has the Renderer-to-subsystem User Input path and custom
input channels, but the trusted Web Component-to-custom-`RendererInputSource`
adapter contract is not yet a frozen public presentation capability. That seam must
be designed/frozen separately before the interactive browser implementation depends
on it.

### RenderData example

Given canonical data:

```json
{
  "name": "Alice",
  "age": 15
}
```

and a current validation error for `age`, the projection may be:

```ts
{
  zIndex: 100,
  roots: [{
    key: "schema-form",
    tag: "lr-schema-form",
    attrs: {},
    data: {
      title: "Character",
      submitting: false,
    },
    children: [
      {
        key: "field:name",
        tag: "lr-schema-form-field",
        attrs: {},
        data: {
          key: "name",
          kind: "string",
          label: "Name",
          required: false,
          value: "Alice",
          multiline: false,
        },
        children: [],
      },
      {
        key: "field:age",
        tag: "lr-schema-form-field",
        attrs: {},
        data: {
          key: "age",
          kind: "number",
          label: "Age",
          required: false,
          value: 15,
          integer: true,
          error: "Must be at least 18",
        },
        children: [],
      },
    ],
  }],
}
```

The projection is a complete current presentation snapshot. Presentation errors or
Renderer teardown must not be interpreted as submit or cancel.


## Explicit v1 exclusions

This declaration model does not define:

- JSON Schema compatibility.
- `uiSchema`.
- Conditional visibility.
- Dynamic fields.
- Cross-field dependency declarations.
- Asynchronous validation.
- Remote options.
- Nested arbitrary objects.
- Recursive arrays.
- Widget registries.
- Theme or layout DSLs.
- Providers or plugins.
- Computed fields.
- General-purpose scripting beyond the two trusted synchronous validators.
- Arbitrary extension or metadata bags.

These features require separate design work rather than being implied by the v1
schema.
