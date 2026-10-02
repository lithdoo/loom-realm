# Phase 2 Implementation Contract: Schema Form

Status: **frozen / implementation-ready / no design discretion**

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

Private helpers MAY remain in the nearest file when extraction would create a
single-use abstraction. Do not add Manager/Service/Controller/Registry layers.

The only process-global mutable state required by the core module is:

```ts
const activeForms = new WeakMap<Frame, Session>();
```

plus the private monotonic form serial allocator.

Browser source may use ordinary local modules if needed for readability, but the
published browser runtime is exactly the two bundled files in `dist/browser/`.

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
  "@awesome.me/webawesome": "3.14.0"
}
```

Do not require Lit, Web Awesome, esbuild, or `node_modules` in the Renderer Window.

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

The browser style entry includes:

```ts
import "@awesome.me/webawesome/dist/styles/webawesome.css";
```

plus Schema Form modal/layout/override styles. The final CSS is owned by the Schema
Form browser artifact; the game/host does not separately load a Web Awesome theme.

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
evaluation registers Custom Elements. Package metadata MUST either omit a package-wide
`sideEffects: false` declaration or use a sideEffects allow-list that preserves:

```text
./dist/browser/schema-form.browser.js
./dist/browser/schema-form.browser.css
```

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
→ synchronous TypeError / rejected async function TypeError
```

Do not map those outer API-shape failures to a `SchemaFormErrorCode`.

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

A schema default must satisfy field kind/type constraints and all built-in
constraints except `required`. `required` is interaction-time validation only.

Every string in the validated schema that enters semantic identity, RenderData, or
validator source must contain valid Unicode scalar sequences.

After structural schema validation, compact-JSON UTF-8 encode the complete validated
`SchemaFormV1`. If it exceeds 65,536 bytes, reject
`SCHEMA_FORM_INVALID_SCHEMA`.

Throw:

```ts
new SchemaFormError(
  "SCHEMA_FORM_INVALID_SCHEMA",
  message,
  path,
)
```

using an internal constructor signature as convenient. Public callers depend only on
`code` and optional `path`.

Paths use the existing diagnostic form:

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

Each execution receives:

```ts
Object.freeze({ ...canonicalData })
```

All canonical values are primitives, so a shallow frozen detached snapshot is
sufficient to isolate module state.

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
children = one lr-schema-form-field per schema field, in schema order
```

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

Before defining either tag:

```text
customElements.get("lr-schema-form") === undefined
customElements.get("lr-schema-form-field") === undefined
```

must both hold. Otherwise throw `TypeError` and define neither Schema Form tag.

The finished `dist/browser/schema-form.browser.js` is loaded as an ordinary ordered
classic script by Web Presentation Config v1 before projection starts. There is no
runtime `import()`, registration Promise, retry state, module resolver, or dynamic
component loader.

## 25. Browser bundling and Web Awesome imports

The build-time source statically imports exactly the Web Awesome components used:

```ts
import "@awesome.me/webawesome/dist/components/input/input.js";
import "@awesome.me/webawesome/dist/components/textarea/textarea.js";
import "@awesome.me/webawesome/dist/components/checkbox/checkbox.js";
import "@awesome.me/webawesome/dist/components/select/select.js";
import "@awesome.me/webawesome/dist/components/option/option.js";
import "@awesome.me/webawesome/dist/components/button/button.js";
```

It also causes the browser CSS bundle to include:

```ts
import "@awesome.me/webawesome/dist/styles/webawesome.css";
```

or the mechanically equivalent esbuild CSS entry/import arrangement.

esbuild MUST bundle the component implementations into one classic IIFE JS artifact
and emit one CSS artifact containing Web Awesome styles plus Schema Form styles.

Final-artifact checks MUST prove:

```text
schema-form.browser.js has no dynamic import()
no unresolved bare @awesome.me/* or lit import specifiers
no ESM import/export syntax required at runtime
no dependency on node_modules at presentation runtime
schema-form.browser.css contains the required Web Awesome + Schema Form styles
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
wa-select + wa-option
unset → null
selected → declared option string
```

Number:

```text
wa-input
inputmode="decimal"
local draft string
read value by frozen JSON-number lexical rule
invalid/incomplete → null
```

## 27. Numeric lexical rule

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

Reconciliation uses `lastAuthoritativeValue`:

```text
incoming authoritative value unchanged
→ preserve active compatible draft

incoming authoritative value changed
→ undefined becomes ""
→ number becomes String(number)
→ replace draft
```

## 28. lr-schema-form root

The root element:

- stores the injected `WebPresentationContext`;
- validates root RenderData;
- renders a modal `<form novalidate>`;
- owns Submit/Cancel/Escape/header-close actions;
- collects all direct current field elements into a complete snapshot;
- is the only Schema Form node calling `context.emitCustomEvent()`;
- accepts a field notification only when that field is still its direct child.

Outward names:

```text
change
submit
cancel
```

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

Root modal requirements:

```text
full-screen backdrop
dialog width 600px, max-width 80vw
max-height 80vh
body scroll only
header/footer fixed in dialog layout
role="dialog"
aria-modal="true"
focus trapped inside
previous focus restored on disconnect/close where still focusable
```

Cancelable:

```text
true:
  header close
  footer Cancel
  Escape
  → cancel()

false:
  no close affordance
  no Cancel button
  Escape ignored
```

Backdrop never cancels.

Pointer/keyboard events handled inside the modal presentation are stopped before
Window-level physical input handling. No InputListener/InputTarget authority changes
are introduced.

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
128-field limit
128-byte key boundary + invalid Unicode
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
bundle contains required Web Awesome element registrations
bundle CSS includes Web Awesome + Schema Form styles
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
select explicit "" option
number lexical cases
authoritative number unchanged preserves draft
authoritative number changed replaces draft
```

## 38. Testing: modal + event size

Chromium qualification covers:

```text
role=dialog + aria-modal
focus enters/traps/restores
cancelable controls
Escape cancel only when allowed
backdrop does not cancel
pointer/keyboard propagation blocked before Window input source
Change/Submit emit complete snapshots
browser >128 KiB data never reaches emitCustomEvent
size error clears after snapshot becomes small
subsystem independently rejects forged/oversize current-root event data
```

## 39. Integration qualification

Create an end-to-end Schema Form qualification using real Subsystem author APIs plus
real Renderer/Web Presentation where practical:

```text
openSchemaForm(scope, frame, request)
→ RenderDomain projects lr-schema-form tree
→ Chromium edits controls
→ root emitCustomEvent
→ existing reserved User Input channel
→ InputListener
→ canonical Change
→ RenderData error/value reconciliation
→ Submit
→ openSchemaForm resolves submitted data
```

Also qualify user Cancel and Frame abort separately.

No test-only reverse transport is allowed in the end-to-end path.

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
Schema Form Chromium/integration qualification
npm pack -w @loomrealm-game/schema-form --dry-run
```

Run broader workspace regression if package-lock changes affect workspace resolution.

## 42. Acceptance checklist

Phase 2 is complete only if:

```text
[ ] root module is platform-neutral at runtime
[ ] browser delivery is one classic self-contained JS bundle + one CSS bundle
[ ] no frame.call/schema-form subsystem exists
[ ] one active form per Frame enforced
[ ] all preflight error codes match DESIGN
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
[ ] trusted validators are isolated and synchronous
[ ] internal RenderNode identity never derives from field.key
[ ] string/boolean RenderData value is always concrete
[ ] number/select RenderData removes value when unset
[ ] only root emits Renderer custom events
[ ] full Change/Submit snapshots are exact-key
[ ] malformed presentation input is fail-closed
[ ] Submit is independent of previous Change delivery
[ ] browser event data <= 131072 bytes before emit
[ ] subsystem independently rechecks <= 131072 bytes before parsing
[ ] number draft model preserves incomplete lexical edits
[ ] modal DOM blocking does not change LoomRealm input authority
[ ] browser bundle contains no runtime ESM/dynamic-import/bare-specifier dependency
[ ] CSS bundle owns required Web Awesome + Schema Form styles
[ ] Chromium qualification proves real bundled browser path
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
