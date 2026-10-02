# Phase 2 Implementation Contract: Schema Form

Status: **frozen / AI implementation-ready / no design discretion**

This document is the implementation contract for
`@loomrealm-game/schema-form` v1.

Phase 1 Web Presentation node custom events are already implemented in `main`.
Phase 2 implements Schema Form itself. It MUST NOT reopen Renderer/Main/Subsystem
architecture.

The normative public/observable semantics remain in `DESIGN.md`. This document
freezes implementation boundaries, order, package layout, cleanup, tests, and browser
integration.

## 1. Scope

Implement exactly:

```text
schema declarations and public types
SchemaFormError
schema / initialValue validation
trusted scripted validators
canonical form state
RenderData projection
openSchemaForm() one-shot session
RenderDomain + InputListener integration
Frame abort cleanup
change / submit / cancel handling
browser Custom Elements
modal behavior
Lit + Web Awesome integration
unit / integration / Chromium qualification
```

Do not implement:

```text
a schema-form subsystem
frame.call("schema-form")
another Frame
Renderer protocol changes
InputListener priority/capture/exclusive modes
modal stack manager
theme/provider/widget extension frameworks
JSON Schema
async validators
array/object/null canonical values
Phase 1 architecture changes
runtime browser module loader / dynamic import graph
```

## 2. Package layout

Use this minimal production/build layout:

```text
game-libs/schema-form/
├── src/
│   ├── index.ts
│   ├── model.ts
│   └── internal/
│       ├── validation.ts
│       └── session.ts
├── browser/
│   ├── schema-form.browser.ts
│   └── schema-form.browser.css
├── scripts/
│   └── build-browser.mjs
├── dist/
│   ├── index.js / index.d.ts
│   └── browser/
│       ├── schema-form.browser.js
│       └── schema-form.browser.css
├── test/
├── DESIGN.md
└── package.json
```

Private helper placement is not observable ABI. Keep single-use helpers in the
nearest existing file unless reuse requires extraction. Do not add
Manager/Service/Controller/Registry layers.

The only process-global mutable state required by the core module is:

```ts
const activeForms = new WeakMap<Frame, Session>();
```

plus the private monotonic form serial allocator.

Browser source helper modules are allowed only under `browser/`; regardless of
source split, the published browser runtime is exactly the two bundled files in
`dist/browser/`.

## 3. Package dependencies, build, and exports

The implementation commit updates `package.json` and lockfile together.

Core runtime dependencies:

```json
{
  "@loomrealm/data": "0.1.0-alpha.0",
  "@loomrealm/subsystem": "0.1.0-alpha.0"
}
```

Browser authoring/build dependencies are development dependencies because their code
and styles are bundled into the published browser artifacts:

```json
{
  "typescript": "5.9.2",
  "esbuild": "0.25.9",
  "lit": "3.3.3",
  "@awesome.me/webawesome": "3.14.0",
  "@loomrealm/renderer": "0.1.0-alpha.0"
}
```

Do not require Lit, Web Awesome, esbuild, or `node_modules` in the Renderer Window.

Browser source MUST import the formal context contract only as a TypeScript type:

```ts
import type {
  WebPresentationContext,
} from "@loomrealm/renderer/web-presentation";
```

The emitted browser bundle MUST contain no runtime import/reference to
`@loomrealm/renderer`.

The build is:

```text
tsc -p tsconfig.json
→ scripts/build-browser.mjs
→ esbuild bundle browser/schema-form.browser.ts
   platform=browser
   format=iife
   bundle=true
   splitting=false
→ dist/browser/schema-form.browser.js
→ bundle imported Web Awesome + Schema Form CSS
→ dist/browser/schema-form.browser.css
```

The browser CSS entry imports only:

```css
@import "@awesome.me/webawesome/dist/styles/themes/default.css";
@import "@awesome.me/webawesome/dist/styles/color/palettes/default.css";
```

plus Schema Form modal/layout/override styles.

Do NOT import the aggregate `webawesome.css` bundle. The root RenderNode's fixed
Web Awesome theme/palette/variant classes scope inherited design tokens to the Schema
Form subtree. The game/host does not separately load or configure Web Awesome.

Package exports become:

```json
{
  ".": {
    "types": "./dist/index.d.ts",
    "import": "./dist/index.js"
  },
  "./browser/schema-form.browser.js": "./dist/browser/schema-form.browser.js",
  "./browser/schema-form.browser.css": "./dist/browser/schema-form.browser.css"
}
```

The root entry point MUST NOT import browser source, Lit, Web Awesome, or DOM-only
runtime code.

The browser JS artifact is intentionally side-effectful because classic-script
evaluation registers Custom Elements. Package metadata is frozen to:

```json
"sideEffects": [
  "./dist/browser/schema-form.browser.js",
  "./dist/browser/schema-form.browser.css"
]
```

Do not omit this field, do not use package-wide `sideEffects: false`, and do not use
a different allow-list.

Do not publish a `@loomrealm-game/schema-form/browser` runtime API and do not expose
a registration function.

## 4. Public core surface

`src/index.ts` exports the public Schema Form model and:

```ts
export type SchemaFormValueV1 =
  | string
  | number
  | boolean;

export type SchemaFormDataV1 =
  Readonly<Record<string, SchemaFormValueV1>>;

export interface SchemaFormRequestV1 {
  readonly schema: SchemaFormV1;
  readonly initialValue?: SchemaFormDataV1;
  readonly cancelable?: boolean;
}

export type SchemaFormResultV1 =
  | {
      readonly type: "submitted";
      readonly value: SchemaFormDataV1;
    }
  | {
      readonly type: "cancelled";
    };

export type SchemaFormErrorCode =
  | "SCHEMA_FORM_INVALID_SCHEMA"
  | "SCHEMA_FORM_INVALID_INITIAL_VALUE"
  | "SCHEMA_FORM_ALREADY_OPEN"
  | "SCHEMA_FORM_VALIDATOR_FAILED"
  | "SCHEMA_FORM_INVALID_VALIDATOR_RESULT";

export class SchemaFormError extends Error {
  constructor(
    code: SchemaFormErrorCode,
    message: string = code,
    path?: string,
    options?: ErrorOptions,
  );

  readonly code: SchemaFormErrorCode;
  readonly path?: string;
}

export function openSchemaForm(
  scope: SubsystemScope,
  frame: Frame,
  request: SchemaFormRequestV1,
): Promise<SchemaFormResultV1>;
```

Also export the frozen RenderData and presentation-value types described by
`DESIGN.md`. They are useful to browser implementation/tests but contain no
presentation authority.

Do not expose Session, compiled validators, active-form state, root-key allocators, or
browser element classes from the root entry point.

## 5. Runtime boundary validation

Typed callers are not assumed to be runtime-correct.

Before schema preflight:

```text
invalid scope capability object
invalid Frame capability object
invalid request object
cancelable present but not boolean
→ returned Promise rejects TypeError
```

Do not map those outer API-shape failures to a `SchemaFormErrorCode`.

Implement `openSchemaForm()` as an async function (or an observably equivalent
always-Promise function). It MUST NOT synchronously throw for argument/preflight
validation. All failures are observed by awaiting/catching the returned Promise:

```text
outer API shape        → reject TypeError
schema/initial/active   → reject SchemaFormError
validator program       → reject SchemaFormError
Frame abort             → reject AbortError
internal opened failure → reject original/internal error after cleanup
```

`request.schema` shape/content failures map to
`SCHEMA_FORM_INVALID_SCHEMA`.

`request.initialValue` failures map to
`SCHEMA_FORM_INVALID_INITIAL_VALUE`.

Schema objects are closed declarations. Unknown members are invalid. The same rule
applies to field declarations and select option declarations.

All schema strings that can enter RenderData or semantic identity must contain valid
Unicode scalar sequences. `field.key` additionally obeys its frozen 1..128 UTF-8
byte bound.

## 6. Exact preflight order

The order is:

```text
1. validate outer API shape
2. validate SchemaFormV1 declaration
3. validate initialValue against validated schema
4. check activeForms.has(frame)
5. compile validateOnChange / validateOnSubmit
6. allocate form serial/root/field node keys
7. build initial canonical state and initial RenderDomainState
8. register active Session
9. create RenderDomain/InputListener/abort callback
10. interaction becomes live
```

Consequences:

- invalid schema/initialValue creates no Session registration or runtime resources;
- a second open for the same Frame fails with `SCHEMA_FORM_ALREADY_OPEN` before
  validator compilation or resources for the second form;
- validator compilation failure after the active check rejects with
  `SCHEMA_FORM_VALIDATOR_FAILED` and creates no RenderDomain/InputListener;
- once Session registration occurs, every subsequent failure uses the common
  settle-once cleanup and releases it.

If resource creation throws, cleanup removes any partially created resource and
active registration, then rejects with the original internal error.

## 7. Schema validation

Implement closed runtime validation for all v1 field kinds exactly as documented.

Hard Schema Form limits:

```text
fields.length                           <= 128
field.key UTF-8 bytes                   1..128
compact complete SchemaFormV1 JSON      <= 65,536 UTF-8 bytes
compact complete initialValue JSON      <= 65,536 UTF-8 bytes
compact validator error-map JSON        <= 65,536 UTF-8 bytes
Change/Submit component event data      <= 131,072 UTF-8 bytes
```

The schema/initial/error-map limits are Schema Form-owned bounds chosen to keep every
accepted projection well below the existing RenderData/message ceilings.

Rules include:

- `version === 1`;
- `fields.length` is 0..128 inclusive;
- select `options.length` may be zero and has no count limit beyond the complete
  65,536-byte schema budget;
- field keys unique;
- `required` boolean when present;
- string defaults/constraints exact;
- `minLength` / `maxLength` non-negative integers and ordered;
- string length validation uses ECMAScript `value.length` UTF-16 code units;
- finite number defaults/min/max;
- `min <= max`;
- `integer=true` requires integer default;
- boolean default boolean;
- select options use closed `{value,label}` objects;
- select option values unique;
- select default matches an option;
- no unknown field kind;
- no unknown declaration members.
- every schema string contains valid Unicode scalar sequences;
- `field.key` is the only schema string required to be non-empty;
- every other schema string, including title/description/label/placeholder/option
  label/option value/validator source, may be `""`;
- validator error-map values remain required non-empty strings.

A schema default must satisfy field kind/type constraints and all built-in
constraints except `required`. `required` is interaction-time validation only.

Every string in the validated schema that enters semantic identity, RenderData, or
validator source must contain valid Unicode scalar sequences.

After structural schema validation, compact-JSON UTF-8 encode the complete validated
`SchemaFormV1`. If it exceeds 65,536 bytes, reject
`SCHEMA_FORM_INVALID_SCHEMA`.

Construct errors only through the frozen public constructor:

```ts
new SchemaFormError(code, message, path, options?)
```

The implementation sets `error.name = "SchemaFormError"`.

Diagnostic paths are exact:

```text
SCHEMA_FORM_INVALID_SCHEMA
  concrete declaration/member failure
  → exact schema path
  whole schema shape/version/size failure
  → "schema"

SCHEMA_FORM_INVALID_INITIAL_VALUE
  concrete field/member failure
  → initialValue.<fieldKey>
  whole initialValue shape/size failure
  → "initialValue"

SCHEMA_FORM_ALREADY_OPEN
  → undefined

SCHEMA_FORM_VALIDATOR_FAILED
SCHEMA_FORM_INVALID_VALIDATOR_RESULT
  validateOnChange
  → "schema.validateOnChange"
  validateOnSubmit
  → "schema.validateOnSubmit"
```

Examples of exact declaration paths:

```text
schema.fields[2].key
schema.fields[4].min
schema.fields[1].options[3].value
```

Exact message text is not ABI.

## 8. initialValue validation

`initialValue` must be a plain object with enumerable data properties and no
unknown field keys.

Each present value must match the field kind:

```text
string  → string
number  → finite number
boolean → boolean
select  → string matching one option.value, including `""` when that exact option exists
```

It must satisfy all declared built-in constraints except `required`. Explicit
empty/unset values are allowed at preflight when they are otherwise type/constraint
valid; `required` is evaluated only on Change/Submit.

Absence is allowed; fallback precedence remains:

```text
initialValue[field.key]
→ field.default
→ kind empty value
```

Failures use:

```text
SCHEMA_FORM_INVALID_INITIAL_VALUE
path = initialValue.<fieldKey>
```

After structural/content validation, compact-JSON UTF-8 encode the complete supplied
`initialValue`. If it exceeds 65,536 bytes, reject
`SCHEMA_FORM_INVALID_INITIAL_VALUE`.

Do not mutate the caller's object.

## 9. Canonical initialization

For each field:

```text
string:
  initial/default/"" → always store string

number:
  initial/default    → store number
  otherwise          → omit key

boolean:
  initial/default/false → always store boolean

select:
  initial/default    → store string
  otherwise          → omit key
```

Canonical data never contains `null`, arrays, objects, or undefined members.

Use detached plain objects owned by the module. Public submitted results must not
expose a mutable reference to live Session state.

## 10. Trusted validator compilation

For each declared validator source:

```ts
const compiled =
  new Function(
    `"use strict"; return (${source});`,
  )();
```

Compilation or evaluation of the expression throwing, or the expression evaluating
to a non-function, maps to:

```text
SCHEMA_FORM_VALIDATOR_FAILED
```

Validators are synchronous.

A Promise/thenable or any other non-result return is not awaited. It is validated as
a result and maps to `SCHEMA_FORM_INVALID_VALIDATOR_RESULT`.

Compile validators after the one-active-form check and before Session resources.

## 11. Validator execution and result rules

Each execution receives a detached `SchemaFormDataV1` snapshot:

```ts
const validationData: SchemaFormDataV1 =
  Object.freeze({ ...canonicalData });
```

The validator argument type is exactly `SchemaFormDataV1`, not
`Readonly<Record<string, unknown>>`. All canonical values are primitives, so a
shallow frozen detached snapshot is sufficient to isolate module state.

Execution throw:

```text
SCHEMA_FORM_VALIDATOR_FAILED
```

Accepted result:

```text
null
undefined
plain empty object
plain object of known field key → non-empty string
```

Primitive, array, class instance, accessor/symbol/non-data member, unknown key, empty
error string, or non-string error value:

```text
SCHEMA_FORM_INVALID_VALIDATOR_RESULT
```

For a structurally valid non-null error map, compact-JSON UTF-8 encode the complete
map before accepting it. If it exceeds 65,536 bytes, reject
`SCHEMA_FORM_INVALID_VALIDATOR_RESULT`.

Normalize passing results to an empty internal error map.

## 12. Built-in validation

Built-in validation operates on canonical candidate data.

Error presence rules:

```text
required string and value === ""        → error
required number and key absent          → error
required select and key absent          → error
boolean required                         → never means "must be true"

string minLength/maxLength              → compare using ECMAScript value.length
number min/max/integer                   → error when violated
```

Presentation snapshots with an invalid select option or wrong primitive type are
malformed input and are ignored before built-in validation.

Exact built-in error message text is presentation text, not public ABI. Use stable,
short English messages in tests, but tests should primarily assert field/error
presence rather than message prose.

## 13. Combining built-in and scripted errors

Both validators run after built-in validation even when built-in errors already
exist, so cross-field errors for other fields can still be produced.

Merge order is frozen:

```text
built-in error wins for the same field
scripted error fills only fields that do not already have a built-in error
```

This prevents a scripted validator from hiding a declaration-level field constraint.

`validateOnChange` and `validateOnSubmit` remain independent. Submit never
implicitly invokes the change validator.

## 14. Internal node identity

Allocate one monotonically increasing safe-integer serial per successful Session
allocation.

For serial `N`:

```text
root      sf:N
field i   sf:N:f:i
```

The serial is process-local and never wraps/reuses. Exhaustion is an internal module
failure.

Never derive a RenderNode key from `field.key`.

The semantic field key exists only in field RenderData and canonical/presentation
data.

## 15. RenderData projection

Root:

```ts
interface SchemaFormRenderDataV1 {
  readonly title?: string;
  readonly description?: string;
  readonly cancelable: boolean;
}
```

Field values:

```text
string   value: string      // always member
number   value?: number     // absent when unset
boolean  value: boolean     // always member
select   value?: string     // absent when unset
```

Each field additionally projects label, description, required, current error, and its
kind-specific presentation hints/constraints.

Initial RenderDomain state:

```text
zIndex = 2_147_483_647
roots = one lr-schema-form
root attrs.class =
  "wa-theme-default wa-palette-default wa-brand-blue wa-neutral-gray " +
  "wa-success-green wa-warning-yellow wa-danger-red"
children = one lr-schema-form-field per schema field, in schema order
```

The root theme classes are private browser-presentation wiring. They are not schema
ABI. They scope Web Awesome design tokens to this form subtree without mutating
document-global classes.

Use `RenderDomain.update()` for ordinary value/error refreshes.

For number/select transition from concrete value to unset:

```ts
data: {
  remove: ["value"],
  // plus set/remove for error as needed
}
```

Never encode `undefined`.

If a RenderDomain operation throws due to an internal projection/program failure,
settle the opened interaction through common cleanup and reject that error. Do not
invent another public SchemaFormError code.

## 16. Session creation and resources

A live Session owns exactly:

```text
Frame reference
rootKey
schema metadata
compiled validators
canonical state
current field error map
request.cancelable
RenderDomain
InputListener
Frame abort callback
settlement state
```

Create one InputListener:

```ts
scope.createInputListener({
  frame,
  channels: [
    WEB_PRESENTATION_EVENT_CHANNEL_V1,
  ],
});
```

Listen only on that channel.

Create one RenderDomain.

No other input channel is needed.

## 17. settle-once cleanup

Every terminal opened-form path calls one private settle operation.

Order:

```text
mark settled / stop accepting events
→ unsubscribe listener handler if separately retained
→ close InputListener
→ close RenderDomain
→ remove Frame abort listener
→ activeForms.delete(frame) only if it still points to this Session
→ resolve or reject outer Promise exactly once
```

Cleanup operations are best-effort. One cleanup exception must not prevent remaining
cleanup or cause double settlement.

After `settled=true`, all queued/duplicate input callbacks return immediately.

## 18. Frame abort

Register one abort listener after Session registration and resource creation is
prepared.

If `frame.signal.aborted` is already true before the interaction becomes live,
perform cleanup and reject immediately.

Abort behavior:

```text
Frame abort
→ cleanup
→ reject AbortError
```

Use `DOMException("...", "AbortError")` when available, otherwise an `Error` whose
observable `name` is exactly `"AbortError"`.

Never resolve `{type:"cancelled"}` for Frame abort.

## 19. Presentation event boundary

Accept an input event only when:

```text
not settled
AND payload.targetKey === rootKey
```

`domainId` is ignored for form correlation.

Unknown root target:

```text
ignore
```

Known root + event names:

```text
change
submit
cancel
```

Unknown event name:

```text
ignore
```

Malformed payload:

```text
ignore with zero state/error mutation
```

For current-root Change/Submit, before snapshot parsing, compact-JSON UTF-8 encode the
complete component-supplied event data object. If it exceeds 131,072 bytes, treat the
event as malformed and ignore it with zero state/error mutation. This subsystem-side
check is authoritative even though the browser bundle performs the same bound check
before `emitCustomEvent()`.

Do not throw from the InputListener callback for malformed presentation input.

Program failures such as validator failure are caught inside the callback and settle
the form Promise; do not rely on InputListener handler exceptions propagating to the
caller.

## 20. Presentation snapshot parsing

For Change/Submit, `data` must have exactly one member:

```text
values
```

`values` must be a plain object with exactly the schema field-key set.

Per field:

```text
string  → string only; null invalid
number  → finite number | null
boolean → boolean only; null invalid
select  → string matching declared option (including "") | null
```

Unknown/missing keys, extra data members, arrays/class instances/accessors/symbol
members, non-finite numbers, invalid option strings, or wrong primitive type make the
entire event malformed.

No partial application.

Conversion to canonical candidate:

```text
string/boolean → always include
number null     → omit
number concrete → include
select null     → omit
select concrete → include
```

Submit constructs this candidate independently from the Session's previous Change
state.

## 21. Change handling

For valid current Change snapshot:

```text
parse complete snapshot
→ replace authoritative canonical state with candidate
→ built-in validation
→ execute validateOnChange if present
→ merge errors with built-in precedence
→ replace current error map
→ RenderDomain.update affected values/errors
```

A normal validation error is nonterminal.

If validator compile/execution/result handling somehow fails while open:

```text
cleanup
→ reject SchemaFormError
```

Change does not roll back candidate canonical values because validation failed.

## 22. Submit handling

For valid current Submit snapshot:

```text
parse complete snapshot independently
→ built-in validation
→ execute validateOnSubmit if present
→ merge errors
```

If errors exist:

```text
candidate becomes authoritative canonical state
current error map replaced
RenderData refreshed
form remains open
```

If no errors:

```text
create detached frozen submitted SchemaFormDataV1 snapshot
→ cleanup
→ resolve { type:"submitted", value }
```

Do not run `validateOnChange` as part of Submit.

## 23. Cancel handling

Cancel payload data must be an empty plain object.

For a current root:

```text
cancelable === true
→ cleanup
→ resolve {type:"cancelled"}

cancelable !== true
→ ignore
```

Do not treat backdrop clicks as Cancel.

## 24. Browser bundle entry and registration

There is no runtime registration API.

`browser/schema-form.browser.ts` is the build-time entry point. It statically imports
Lit and only the required Web Awesome component modules, defines the two Schema Form
Custom Element classes, then registers exactly:

```text
lr-schema-form
lr-schema-form-field
```

at classic bundle evaluation time.

Before defining either LoomRealm-owned tag:

```text
customElements.get("lr-schema-form") === undefined
customElements.get("lr-schema-form-field") === undefined
```

must both hold. Otherwise throw `TypeError` and define neither Schema Form tag.

The bundled Web Awesome modules perform their own Window-global `wa-*` registrations
during classic-script evaluation. Schema Form v1 deliberately treats those bundled
Web Awesome registrations as exclusively owned by this presentation artifact for the
Renderer Window lifetime.

There is no reuse/version negotiation with another Web Awesome bundle. A collision
on any bundled/transitive `wa-*` tag is an ordinary Web Presentation bootstrap
script-evaluation failure. Presentation does not start in that Window. Partial vendor
registrations left by a failed bootstrap are irrelevant because that Renderer Window
does not enter presentation.

The finished `dist/browser/schema-form.browser.js` is loaded as an ordinary ordered
classic script by Web Presentation Config v1 before projection starts. There is no
runtime `import()`, registration Promise, retry state, module resolver, or dynamic
component loader.

## 25. Browser bundling and Web Awesome imports

The build-time source statically imports exactly the directly used Web Awesome
components:

```ts
import "@awesome.me/webawesome/dist/components/input/input.js";
import "@awesome.me/webawesome/dist/components/textarea/textarea.js";
import "@awesome.me/webawesome/dist/components/checkbox/checkbox.js";
import "@awesome.me/webawesome/dist/components/select/select.js";
import "@awesome.me/webawesome/dist/components/option/option.js";
import "@awesome.me/webawesome/dist/components/button/button.js";
import "@awesome.me/webawesome/dist/components/dialog/dialog.js";
```

Transitive Web Awesome dependencies required by the pinned components are bundled
normally by esbuild.

The CSS entry imports:

```css
@import "@awesome.me/webawesome/dist/styles/themes/default.css";
@import "@awesome.me/webawesome/dist/styles/color/palettes/default.css";
```

plus Schema Form-owned styles. Do not import
`@awesome.me/webawesome/dist/styles/webawesome.css`.

esbuild MUST bundle the component implementations into one classic IIFE JS artifact
and emit one CSS artifact containing only the selected Web Awesome theme/palette plus
Schema Form styles.

Final-artifact checks MUST prove:

```text
schema-form.browser.js has no dynamic import()
no unresolved bare @awesome.me/* or lit import specifiers
no ESM import/export syntax required at runtime
no dependency on node_modules at presentation runtime
schema-form.browser.css contains default theme + default palette + Schema Form styles
schema-form.browser.css does not include aggregate Web Awesome native/utility bundle
```

Do not use the Web Awesome autoloader.

Do not use `wa-number-input` in v1.

## 26. lr-schema-form-field

The field element:

- validates every `receiveRenderData(data)` snapshot before applying it;
- keeps one stable editing control while `kind` remains unchanged;
- does not rebuild the control on every RenderData update;
- owns local focus/selection/IME/numeric lexical draft;
- reports edits to its current direct parent `lr-schema-form` through a local
  method/callback, not Renderer custom events;
- implements `readFormValue()`.

Every `receiveRenderData()` application is atomic. Invalid data synchronously throws
`TypeError` before any control/DOM/editor-state mutation.

Do not forward Schema Form `required`, `minLength`, `maxLength`, `min`,
`max`, or `integer` into Web Awesome/native constraint-validation properties.
The field wrapper renders its own required marker and module-produced error. It may
apply label/description/placeholder presentation values, but native validity is never
Schema Form authority.

User-originated edit triggers are exact and there is no debounce/coalescing layer:

```text
string / wa-input       → listen "input"
multiline / wa-textarea → listen "input"
number / wa-input       → listen "input"
boolean / wa-checkbox   → listen "change"
select / wa-select      → listen "change"
```

Each accepted user event calls the parent exactly once. Programmatic property updates
during `receiveRenderData()` MUST NOT call the parent or create Change feedback.

String:

```text
single-line → wa-input
multiline   → wa-textarea
read value  → string
```

Boolean:

```text
wa-checkbox
read unchecked → false
```

Select:

```text
wa-select with-clear
unset browser value = ""
semantic options use private DOM tokens:
  option index 0 → "o:0"
  option index 1 → "o:1"
  ...
RenderData semantic value → token
user token → declared semantic option.value
read unset → null
read selected → declared semantic option string, including ""
```

Never place semantic `option.value` directly in `wa-option.value`. This keeps
Schema Form semantic `""` distinct from Web Awesome's empty/unset control value.

Number:

```text
wa-input
inputmode="decimal"
local draft string
read value by frozen JSON-number lexical rule
invalid/incomplete → null
```

## 27. Numeric lexical rule and reconciliation

A complete canonicalizable draft matches:

```text
-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?
```

Then:

```text
Number(draft) finite → number
otherwise            → null
```

No trim.

Examples:

```text
""       → null
"-"      → null
"+"      → null
"1."     → null
"-1."    → null
"01"     → null
"1"      → 1
"-1"     → -1
"1.0"    → 1
"1e3"    → 1000
"1e"     → null
"1,5"    → null
```

The number field keeps:

```ts
private draft: string;
private dirty: boolean;
private authoritativeValue: number | undefined;
```

State transitions are frozen:

```text
first successful RenderData:
  authoritativeValue = incoming value
  draft = incoming value === undefined ? "" : String(incoming value)
  dirty = false

local input:
  draft = exact editor text
  dirty = true

later RenderData while dirty=false:
  authoritativeValue = incoming value
  draft = incoming value === undefined ? "" : String(incoming value)

later RenderData while dirty=true:
  authoritativeValue = incoming value
  preserve draft exactly
  update errors/label/constraints/etc.
```

Once dirty, the field remains dirty for that element lifetime. Only a fresh field
element/form resets it.

Do not compare incoming authoritative value to decide whether a dirty draft should be
rewritten. In particular, all of these must survive their own Change/validation
round-trip unchanged:

```text
"-"
"1."
"1.0"
"1e"
```

This is safe in v1 because there is no external programmatic field-value mutation API
for an already-open form. Canonical changes during the interaction originate from
the same browser presentation snapshots.

## 28. lr-schema-form root

The root element:

- stores the injected `WebPresentationContext`;
- validates root RenderData;
- renders one always-open `wa-dialog` with `without-header`;
- renders its own Schema Form header/body/footer shell inside that dialog;
- owns Submit/Cancel/Escape/header-close semantics;
- collects all direct current field elements into a complete snapshot;
- is the only Schema Form node calling `context.emitCustomEvent()`;
- accepts a field notification only when that field is still its direct child.

The `wa-dialog` accessible label is `RenderData.title` or presentation fallback
`"Form"`. Do not enable `light-dismiss`.

Every `wa-hide` is canceled synchronously with `preventDefault()`.

```text
cancelable=true:
  wa-hide request (including Escape)
  → preventDefault()
  → local cancel()
  → emit semantic "cancel"

cancelable=false:
  wa-hide request
  → preventDefault()
  → emit nothing
```

Header Close and footer Cancel are rendered only when cancelable and call the same
local `cancel()`; they never directly set `wa-dialog.open=false`.

Outward names:

```text
change
submit
cancel
```

`fieldChanged()` is synchronous:

```text
collect current complete field snapshot
→ compact JSON size check
→ <= 131072 bytes: emit exactly one "change"
→ > 131072 bytes: emit nothing and show/retain local size error
```

There is no timer, debounce, microtask coalescing, or deduplication stage in v1.

No field-level Renderer custom event exists.

## 29. 128 KiB presentation-local event limit

Before Change or Submit calls `emitCustomEvent()`, build:

```ts
const data = {
  values: this.collectValues(),
};
```

Measure the UTF-8 byte length of compact JSON for this data object.

Accept only:

```text
<= 131,072 bytes
```

Change oversize:

```text
retain browser editor state
do not emit
show/retain root-local size error
```

Submit oversize:

```text
do not emit
show root-local "Form data is too large" message
keep form active
```

When a later collected snapshot fits the bound, clear the local size error.

This size error is browser presentation-local. It is not sent as a field validator
result.

Cancel always uses an empty data object and is unaffected by snapshot size.

## 30. Modal behavior

Schema Form delegates browser modality to the pinned Web Awesome `wa-dialog`.
Do not implement a second focus trap or backdrop.

Requirements:

```text
wa-dialog remains open until RenderDomain removal
without-header=true
Schema Form shell width 600px, max-width 80vw
shell max-height 80vh
only shell body scrolls
header/footer fixed in shell grid
accessible label = title ?? "Form"
light-dismiss disabled
wa-hide always preventDefault()
previous focus restoration is owned by wa-dialog/browser behavior
```

Pointer/keyboard events handled inside the Schema Form presentation are still stopped
before Window-level physical input handling. No InputListener/InputTarget authority
changes are introduced.

Backdrop interaction never emits cancel because `light-dismiss` is not enabled.

## 31. Browser RenderData validation failure

A malformed RenderData snapshot passed to either Schema Form element is a browser
presentation programmer/integration error.

Behavior:

```text
receiveRenderData(invalid)
→ synchronous TypeError
→ previous successfully applied DOM/editor state remains authoritative locally
```

Do not partially apply malformed data.

This is distinct from malformed Web Presentation input reaching the subsystem, which
is silently ignored.

## 32. Testing: core model/preflight

Add tests for at least:

```text
every valid field kind
closed schema objects
unknown members
duplicate field keys
0-field schema valid
128-field limit
empty select options valid
all schema strings except field.key may be ""
128-byte key boundary + invalid Unicode
SchemaFormError.name/constructor/path mapping
65,536-byte complete schema boundary + over-limit rejection
65,536-byte complete initialValue boundary + over-limit rejection
all min/max ordering
finite-number enforcement
integer rules
string min/maxLength uses UTF-16 value.length
required does not reject explicit empty/unset default or initialValue at preflight
required still fails the same value during Change/Submit validation
select option uniqueness/membership
select option value "" is explicit and valid when declared
select null alone represents unset
default constraint violations excluding required
unknown initial keys
wrong initial types
initial constraint violations excluding required
false / 0 / "" preserved
fallback precedence
```

Verify invalid schema/initial calls create no RenderDomain/InputListener.

## 33. Testing: validators

Cover:

```text
compile syntax throw
expression evaluates non-function
execution throw
null / undefined / {} pass
valid error map
65,536-byte validator error-map boundary
over-limit validator error map → SCHEMA_FORM_INVALID_VALIDATOR_RESULT
primitive/array/class/accessor/symbol invalid result
unknown field error
empty/non-string error value
Promise result invalid
validator receives detached frozen canonical snapshot
built-in error precedence
scripted errors still fill other fields
change validator independent from submit validator
```

## 34. Testing: Session lifecycle

Cover:

```text
outer API/preflight failures reject Promise and never throw synchronously
one active form per same Frame
different Frames can open independently
active registration released after submit
released after cancel
released after Frame abort
released after validator/program failure
resource creation failure cleans partial resources
duplicate events after settlement ignored
Frame abort → AbortError
user cancel → cancelled result
abort never converted to cancel
```

## 35. Testing: presentation snapshots

Cover:

```text
exact field-key set required
number/select null omission in canonical candidate
string/boolean null rejected as malformed
select "" accepted only when declared as an option
unknown/extra/missing fields ignored with zero mutation
nonfinite number ignored
invalid select option ignored
wrong root target ignored
unknown event name ignored
current-root Change/Submit at 131,072-byte boundary accepted
current-root Change/Submit over 131,072 bytes ignored with zero mutation
cancel denied when cancelable=false
Submit candidate independent of prior Change
Change validation error keeps changed value
Submit errors keep form open
successful Submit detached result
```

## 36. Testing: Render projection

Cover:

```text
root key sf:N
field keys sf:N:f:i
128-byte semantic field key never enters node identity
schema field order == child order
string/boolean RenderData value always present
number/select unset value member absent
concrete→unset produces value removal
errors set/remove correctly
fixed zIndex
root correlation only by rootKey
```

## 37. Testing: browser elements

Use a DOM-capable test environment and real Chromium qualification for behavior that
depends on focus/custom-elements/Web Awesome.

Cover:

```text
classic bundle evaluation registers both Schema Form tags
foreign Schema Form tag collision throws TypeError before defining either tag
bundle contains required Web Awesome element registrations including wa-dialog
preexisting bundled wa-* collision causes bootstrap failure
bundle CSS contains default theme + default palette + Schema Form styles
bundle CSS excludes aggregate webawesome.css/native-utility layer
no runtime dynamic import/module loader/bare npm specifier
root/field RenderData runtime validation
stable control identity across refreshes
field→root local communication only
root is sole emitCustomEvent caller
exact complete snapshot collection
omitted/undefined presentation context data not used accidentally
string empty ""
boolean unchecked false
select unset null
select with-clear returns to unset
select internal option-token mapping
select explicit semantic "" option distinct from unset
exact control input/change event mapping
one user control event → one parent fieldChanged → one Change
receiveRenderData programmatic updates emit no Change
number lexical cases
pristine number follows authoritative RenderData
dirty "-", "1.", "1.0", "1e" survive canonical RenderData round trips exactly
dirty number draft survives authoritative number→unset and unset→number transitions
fresh element resets dirty state from authoritative value
```

## 38. Testing: modal + event size

Chromium qualification covers:

```text
wa-dialog supplies modal semantics/focus behavior
accessible label title/fallback
cancelable controls
wa-hide is always prevented
Escape emits cancel only when allowed
backdrop does not cancel because light-dismiss is disabled
pointer/keyboard propagation blocked before Window input source
Change/Submit emit complete snapshots
browser >128 KiB data never reaches emitCustomEvent
size error clears after snapshot becomes small
subsystem independently rejects forged/oversize current-root event data
```

## 39. Integration qualification

Add exactly:

```text
test/schema-form-v1/qualification.test.mjs
```

The qualification MUST use the real repository stack end to end:

```text
real openSchemaForm(scope, frame, request)
→ real Subsystem runtime author APIs
→ real RenderDomain/Data path
→ real Renderer presentation seam/WebProjector
→ real bundled schema-form.browser.css + schema-form.browser.js
→ real Chromium
→ real WebPresentationContext.emitCustomEvent
→ real x.loomrealm.web-presentation.event User Input path
→ real InputListener
→ canonical Change
→ RenderData reconciliation
→ real Submit
→ openSchemaForm resolves submitted data
```

The same file MUST separately qualify user Cancel and Frame abort.

No fake/reverse test transport, direct Session invocation, manually injected
InputListener payload shortcut, or DOM-only submit shortcut is allowed in this
qualification.

The implementation also adds these exact root scripts:

```json
"test:schema-form:qualification:run":
  "node --test test/schema-form-v1/qualification.test.mjs",

"test:schema-form:qualification":
  "npm run build -w @loomrealm/foundation -w @loomrealm/wire -w @loomrealm/platform-ports -w @loomrealm/runtime-control -w @loomrealm/renderer-control -w @loomrealm/data -w @loomrealm/subsystem -w @loomrealm/renderer -w @loomrealm-game/schema-form && npm run test:schema-form:qualification:run"
```

## 40. Implementation order

Implement in this order:

```text
1. package core deps + browser build devDeps + exports/lockfile
2. public model + SchemaFormError
3. validation budgets + initial canonicalization
4. trusted validator compilation/result handling/error-map budget
5. RenderData projection helpers + internal node allocator
6. Session/openSchemaForm lifecycle
7. InputListener event parsing + authoritative 128 KiB recheck
8. browser Lit/Web Awesome source
9. lr-schema-form-field
10. lr-schema-form modal root
11. esbuild classic JS/CSS bundle
12. unit/integration tests
13. Chromium qualification using bundled Web Presentation resources
14. bundle/package artifact checks
15. full workspace regression relevant to changed dependencies
```

Do not implement browser components before core snapshot/event contracts are covered
by unit tests.

## 41. Required build/test closure

At minimum execute from the final implementation HEAD:

```text
npm install / lockfile update using workspace-standard npm
npm run build -w @loomrealm-game/schema-form
npm test -w @loomrealm-game/schema-form
verify schema-form.browser.js/.css are self-contained Web Presentation artifacts
npm test -w @loomrealm/data
npm test -w @loomrealm/subsystem
npm test -w @loomrealm/renderer
npm run test:m10:qualification
npm run test:m13:qualification
npm run test:schema-form:qualification
npm pack -w @loomrealm-game/schema-form --dry-run
```

Run broader workspace regression if package-lock changes affect workspace resolution.

## 42. Acceptance checklist

Phase 2 is complete only if:

```text
[ ] root module is platform-neutral at runtime
[ ] browser delivery is one classic self-contained JS bundle + one CSS bundle
[ ] @loomrealm/renderer is type-only devDependency for WebPresentationContext
[ ] no frame.call/schema-form subsystem exists
[ ] one active form per Frame enforced
[ ] openSchemaForm() never synchronously throws argument/preflight failures
[ ] all openSchemaForm() failures are observed as Promise rejection
[ ] all preflight error codes match DESIGN
[ ] SchemaFormError constructor/name/path mapping exactly matches DESIGN
[ ] fields 0..128 and empty select options are accepted
[ ] all schema strings except field.key may be empty
[ ] Frame abort rejects AbortError
[ ] settle-once cleanup covers every terminal path
[ ] canonical data contains only string/number/boolean
[ ] string "" and boolean false are concrete values
[ ] number/select absence is omission
[ ] schema <= 65536 bytes and initialValue <= 65536 bytes preflight budgets enforced
[ ] validator error map <= 65536 bytes enforced
[ ] required is interaction-only, not preflight rejection
[ ] string min/max length uses ECMAScript value.length
[ ] select "" is explicit option value; null alone means unset
[ ] wa-select uses private option tokens and with-clear so semantic "" != unset
[ ] trusted validators receive detached frozen SchemaFormDataV1
[ ] trusted validators are isolated and synchronous
[ ] internal RenderNode identity never derives from field.key
[ ] string/boolean RenderData value is always concrete
[ ] number/select RenderData removes value when unset
[ ] only root emits Renderer custom events
[ ] full Change/Submit snapshots are exact-key
[ ] control edit event mapping is exact and Change is never debounced/coalesced
[ ] malformed presentation input is fail-closed
[ ] Submit is independent of previous Change delivery
[ ] browser event data <= 131072 bytes before emit
[ ] subsystem independently rechecks <= 131072 bytes before parsing
[ ] dirty number draft is never overwritten by later RenderData in same element lifetime
[ ] wa-dialog owns modal/focus/backdrop mechanics; Schema Form owns semantic cancel
[ ] modal DOM blocking does not change LoomRealm input authority
[ ] browser bundle contains no runtime ESM/dynamic-import/bare-specifier dependency
[ ] CSS bundle owns only required Web Awesome theme/palette + Schema Form styles
[ ] bundled Web Awesome tag namespace ownership/collision behavior is qualified
[ ] Chromium qualification proves real bundled browser path
[ ] test/schema-form-v1/qualification.test.mjs uses only the real end-to-end path
[ ] no new Renderer/Main/Subsystem architecture change was required
```

## 43. Completion invariant

Phase 2 is complete when:

> `openSchemaForm()` can open exactly one Frame-owned modal form, project
> authoritative canonical state through ordinary RenderDomain data, accept complete
> semantic edit snapshots only through the existing node-bound Web Presentation User
> Input path, validate and reconcile deterministically, and settle exactly once as
> submit/cancel/AbortError without creating another subsystem or authority model.

At that point Schema Form v1 is implementation-complete.
