import type { JsonObject, JsonValue } from "@loomrealm/wire";
import {
  assertExactKeys,
  assertJsonArray,
  assertJsonObject,
  assertJsonValue,
  jsonDepth,
  parseJsonText,
  stringifyJson,
  utf8ByteLength,
} from "@loomrealm/wire";
import type {
  DataProtocolFamily,
  InputChannelV1,
  InputEventV1,
  InputInterestV1,
  InputResetV1,
  InputStateV1,
  RenderDomainsV1,
  RenderEventV1,
  RenderPatchV1,
  RenderSnapshotV1,
  RendererDataMessageV1,
} from "./model.js";

const MAX_MESSAGE_BYTES = 1_048_576;
const MAX_JSON_DEPTH = 64;
const MAX_PAYLOAD_BYTES = 262_144;
const MAX_PAYLOAD_DEPTH = 32;
const MAX_CONTAINER_MEMBERS = 16_384;

export class DataProtocolError extends Error {
  constructor(readonly protocol: DataProtocolFamily, message: string) {
    super(message);
  }
}

function fail(protocol: DataProtocolFamily, message: string): never {
  throw new DataProtocolError(protocol, message);
}
function stringValue(value: unknown, protocol: DataProtocolFamily, label: string): string {
  if (typeof value !== "string") fail(protocol, `${label} must be string`);
  return value;
}
function validUnicodeScalarString(value: string): boolean {
  for (let i = 0; i < value.length; i += 1) {
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const n = value.charCodeAt(i + 1);
      if (!(n >= 0xdc00 && n <= 0xdfff)) return false;
      i += 1;
    } else if (c >= 0xdc00 && c <= 0xdfff) return false;
  }
  return true;
}
function boundedString(value: unknown, protocol: DataProtocolFamily, label: string, min: number, max: number): string {
  const text = stringValue(value, protocol, label);
  if (!validUnicodeScalarString(text)) fail(protocol, `${label} has invalid Unicode scalar sequence`);
  const bytes = utf8ByteLength(text);
  if (bytes < min || bytes > max) fail(protocol, `${label} byte length out of range`);
  return text;
}
function positiveSafe(value: unknown, protocol: DataProtocolFamily, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) <= 0) fail(protocol, `${label} must be positive safe integer`);
  return value as number;
}
function int32(value: unknown, protocol: DataProtocolFamily, label: string): number {
  if (!Number.isInteger(value) || (value as number) < -2147483648 || (value as number) > 2147483647) fail(protocol, `${label} must be int32`);
  return value as number;
}
function exact(value: unknown, required: readonly string[], optional: readonly string[], protocol: DataProtocolFamily): JsonObject {
  try {
    assertJsonObject(value);
    assertExactKeys(value, required, optional);
    return value;
  } catch (cause) {
    fail(protocol, `invalid closed schema: ${String(cause)}`);
  }
}
function array(value: unknown, protocol: DataProtocolFamily, label: string): readonly JsonValue[] {
  try { assertJsonArray(value); return value; } catch { fail(protocol, `${label} must be array`); }
}
function object(value: unknown, protocol: DataProtocolFamily, label: string): JsonObject {
  try { assertJsonObject(value); return value; } catch { fail(protocol, `${label} must be object`); }
}
function assertBoundedJson(value: JsonValue, protocol: DataProtocolFamily, maxDepth = MAX_PAYLOAD_DEPTH): void {
  if (jsonDepth(value) > maxDepth) fail(protocol, "JSON depth limit exceeded");
  const stack: JsonValue[] = [value];
  while (stack.length) {
    const current = stack.pop();
    if (current === undefined || current === null || typeof current !== "object") continue;
    if (Array.isArray(current)) {
      if (current.length > MAX_CONTAINER_MEMBERS) fail(protocol, "array member limit exceeded");
      for (const child of current) stack.push(child);
    } else {
      const keys = Object.keys(current);
      if (keys.length > MAX_CONTAINER_MEMBERS) fail(protocol, "object member limit exceeded");
      for (const key of keys) stack.push((current as JsonObject)[key] as JsonValue);
    }
  }
}
function assertPayload(payload: unknown, protocol: DataProtocolFamily): JsonObject {
  const result = object(payload, protocol, "payload");
  assertBoundedJson(result, protocol);
  if (utf8ByteLength(stringifyJson(result)) > MAX_PAYLOAD_BYTES) fail(protocol, "payload byte limit exceeded");
  return result;
}

const STANDARD_CHANNELS = new Set([
  "keyboard.state","keyboard.event","pointer.state","pointer.event","gamepad.state","gamepad.event",
]);
const CUSTOM = /^x\.[a-z][a-z0-9-]{0,31}(?:\.[a-z][a-z0-9-]{0,31})*\.(?:state|event)$/;
function channel(value: unknown, expected: "state" | "event" | "any"): InputChannelV1 {
  const text = boundedString(value, "input", "channel", 1, 128);
  if (!/^[\x00-\x7f]+$/.test(text)) fail("input", "channel must be ASCII");
  if (!STANDARD_CHANNELS.has(text) && !CUSTOM.test(text)) fail("input", "invalid channel grammar");
  if (expected !== "any" && !text.endsWith(`.${expected}`)) fail("input", `channel suffix must be .${expected}`);
  return text as InputChannelV1;
}

const KEYBOARD_CODES = new Set<string>([
  ...Array.from({length:26},(_,i)=>`Key${String.fromCharCode(65+i)}`),
  ...Array.from({length:10},(_,i)=>`Digit${i}`),
  ...Array.from({length:24},(_,i)=>`F${i+1}`),
  ...Array.from({length:10},(_,i)=>`Numpad${i}`),
  "ArrowUp","ArrowDown","ArrowLeft","ArrowRight","Space","Enter","Escape","Tab","Backspace",
  "ShiftLeft","ShiftRight","ControlLeft","ControlRight","AltLeft","AltRight","MetaLeft","MetaRight","CapsLock",
  "Insert","Delete","Home","End","PageUp","PageDown","Minus","Equal","BracketLeft","BracketRight","Backslash",
  "Semicolon","Quote","Backquote","Comma","Period","Slash","NumpadAdd","NumpadSubtract","NumpadMultiply","NumpadDivide","NumpadDecimal","NumpadEnter",
]);
function keyboardPayload(payload: JsonObject, event: boolean): void {
  if (!event) {
    const p = exact(payload,["down"],[],"input"); const down = array(p.down,"input","down");
    if (down.length>128) fail("input","keyboard down limit");
    const seen = new Set<string>(); let prev = "";
    for (const raw of down) { const code=stringValue(raw,"input","code"); if(!KEYBOARD_CODES.has(code)||seen.has(code)|| (prev && prev >= code)) fail("input","invalid keyboard state"); seen.add(code); prev=code; }
  } else {
    const p=exact(payload,["action","code","repeat"],[],"input");
    if(p.action!=="down"&&p.action!=="up") fail("input","invalid keyboard action");
    if(typeof p.code!=="string"||!KEYBOARD_CODES.has(p.code)) fail("input","invalid keyboard code");
    if(typeof p.repeat!=="boolean" || (p.action==="up"&&p.repeat)) fail("input","invalid keyboard repeat");
  }
}
const POINTER_BUTTONS=["primary","auxiliary","secondary","back","forward"] as const;
function pointerSample(raw: unknown): void {
  const p=exact(raw,["pointerId","kind","x","y","buttons"],[],"input"); positiveSafe(p.pointerId,"input","pointerId");
  if(p.kind!=="mouse"&&p.kind!=="touch"&&p.kind!=="pen") fail("input","invalid pointer kind"); int32(p.x,"input","x"); int32(p.y,"input","y");
  const buttons=array(p.buttons,"input","buttons"); let last=-1; const seen=new Set<string>();
  for(const b of buttons){ if(typeof b!=="string") fail("input","invalid pointer button"); const idx=POINTER_BUTTONS.indexOf(b as never); if(idx<0||idx<=last||seen.has(b)) fail("input","invalid pointer button order"); seen.add(b); last=idx; }
}
function pointerPayload(payload: JsonObject,event:boolean): void {
  if(!event){const p=exact(payload,["pointers"],[],"input"); const list=array(p.pointers,"input","pointers"); if(list.length>32) fail("input","pointer count limit"); let prev=0; const ids=new Set<number>(); for(const item of list){pointerSample(item); const id=(item as JsonObject).pointerId as number; if(ids.has(id)||id<=prev) fail("input","pointer ids not ascending unique"); ids.add(id); prev=id;}}
  else {const p=exact(payload,["action","pointer","button"],[],"input"); if(p.action!=="down"&&p.action!=="up"&&p.action!=="cancel") fail("input","invalid pointer action"); pointerSample(p.pointer); if(p.action==="cancel"){if(p.button!==null) fail("input","cancel button must be null");} else if(typeof p.button!=="string"||!POINTER_BUTTONS.includes(p.button as never)) fail("input","invalid pointer button");}
}
const GP_BUTTONS=["south","east","west","north","leftBumper","rightBumper","leftTrigger","rightTrigger","select","start","leftStick","rightStick","dpadUp","dpadDown","dpadLeft","dpadRight","home"] as const;
function rangedInt(value: unknown,min:number,max:number,label:string){if(!Number.isInteger(value)||(value as number)<min||(value as number)>max) fail("input",`${label} out of range`);}
function gamepadSample(raw: unknown): void {
  const p=exact(raw,["gamepadId","axes","buttons"],[],"input"); positiveSafe(p.gamepadId,"input","gamepadId");
  const axes=exact(p.axes,["leftX","leftY","rightX","rightY"],[],"input"); for(const k of Object.keys(axes)) rangedInt(axes[k],-1_000_000,1_000_000,`axis ${k}`);
  const buttons=exact(p.buttons,GP_BUTTONS,[],"input"); for(const k of GP_BUTTONS) rangedInt(buttons[k],0,1_000_000,`button ${k}`);
}
function gamepadPayload(payload:JsonObject,event:boolean):void{
  if(!event){const p=exact(payload,["gamepads"],[],"input");const list=array(p.gamepads,"input","gamepads");if(list.length>16)fail("input","gamepad count limit");let prev=0;const ids=new Set<number>();for(const item of list){gamepadSample(item);const id=(item as JsonObject).gamepadId as number;if(ids.has(id)||id<=prev)fail("input","gamepad ids not ascending unique");ids.add(id);prev=id;}}
  else {const p=exact(payload,["action","gamepadId","button","value"],[],"input");if(p.action!=="down"&&p.action!=="up")fail("input","invalid gamepad action");positiveSafe(p.gamepadId,"input","gamepadId");if(typeof p.button!=="string"||!GP_BUTTONS.includes(p.button as never))fail("input","invalid gamepad button");rangedInt(p.value,0,1_000_000,"gamepad value");}
}
function standardPayload(ch:string,payload:JsonObject):void{if(ch==="keyboard.state")keyboardPayload(payload,false);else if(ch==="keyboard.event")keyboardPayload(payload,true);else if(ch==="pointer.state")pointerPayload(payload,false);else if(ch==="pointer.event")pointerPayload(payload,true);else if(ch==="gamepad.state")gamepadPayload(payload,false);else if(ch==="gamepad.event")gamepadPayload(payload,true);}

export function validateInputInterest(raw: unknown): InputInterestV1 {
  const p=exact(raw,["type","frames"],[],"input"); if(p.type!=="input.interest")fail("input","wrong type"); const frames=array(p.frames,"input","frames"); if(frames.length>128)fail("input","interest frame limit");
  const frameIds=new Set<string>(); let pairs=0;
  for(const item of frames){const f=exact(item,["frameId","channels"],[],"input");const id=boundedString(f.frameId,"input","frameId",1,128);if(frameIds.has(id))fail("input","duplicate frameId");frameIds.add(id);const channels=array(f.channels,"input","channels");if(channels.length<1||channels.length>64)fail("input","channels per frame limit");const seen=new Set<string>();for(const c of channels){const ch=channel(c,"any");if(seen.has(ch))fail("input","duplicate channel");seen.add(ch);pairs+=1;if(pairs>4096)fail("input","interest pair limit");}}
  return p as unknown as InputInterestV1;
}
export function validateInputState(raw: unknown): InputStateV1 {const p=exact(raw,["type","frameId","activationId","channel","payload"],[],"input");if(p.type!=="input.state")fail("input","wrong type");boundedString(p.frameId,"input","frameId",1,128);boundedString(p.activationId,"input","activationId",1,128);const ch=channel(p.channel,"state");const payload=assertPayload(p.payload,"input");standardPayload(ch,payload);return p as unknown as InputStateV1;}
export function validateInputEvent(raw: unknown): InputEventV1 {const p=exact(raw,["type","frameId","activationId","channel","payload"],[],"input");if(p.type!=="input.event")fail("input","wrong type");boundedString(p.frameId,"input","frameId",1,128);boundedString(p.activationId,"input","activationId",1,128);const ch=channel(p.channel,"event");const payload=assertPayload(p.payload,"input");standardPayload(ch,payload);return p as unknown as InputEventV1;}
export function validateInputReset(raw: unknown): InputResetV1 {const p=exact(raw,["type","frameId","activationId"],[],"input");if(p.type!=="input.reset")fail("input","wrong type");boundedString(p.frameId,"input","frameId",1,128);boundedString(p.activationId,"input","activationId",1,128);return p as unknown as InputResetV1;}

function renderId(value: unknown,label:string,max=128): string { return boundedString(value,"render",label,1,max); }
function attrs(raw:unknown):void{const a=object(raw,"render","attrs");const keys=Object.keys(a);if(keys.length>256)fail("render","attrs member limit");for(const k of keys){boundedString(k,"render","attrs key",1,128);const v=a[k];if(typeof v!=="string")fail("render","attrs value must string");boundedString(v,"render","attrs value",0,4096);}}
function renderData(raw:unknown):JsonObject{const d=object(raw,"render","data");assertBoundedJson(d,"render");if(utf8ByteLength(stringifyJson(d))>MAX_PAYLOAD_BYTES)fail("render","render data byte limit");return d;}
function renderNode(raw:unknown,seen:Set<string>,depth:number,counter:{n:number}):void{if(depth>30)fail("render","render tree depth limit");const n=exact(raw,["key","tag","attrs","data","children"],[],"render");const key=renderId(n.key,"node key");if(seen.has(key))fail("render","duplicate node key");seen.add(key);renderId(n.tag,"tag",256);attrs(n.attrs);renderData(n.data);const children=array(n.children,"render","children");counter.n+=1;if(counter.n>16384)fail("render","node count limit");for(const c of children)renderNode(c,seen,depth+1,counter);}
function renderRoots(raw:unknown):void{const roots=array(raw,"render","roots");const seen=new Set<string>();const counter={n:0};for(const r of roots)renderNode(r,seen,1,counter);}
export function validateRenderDomains(raw:unknown):RenderDomainsV1{const p=exact(raw,["type","domains"],[],"render");if(p.type!=="render.domains")fail("render","wrong type");const domains=array(p.domains,"render","domains");if(domains.length>256)fail("render","domain limit");const seen=new Set<string>();for(const d of domains){const id=renderId(d,"domainId");if(seen.has(id))fail("render","duplicate domainId");seen.add(id);}return p as unknown as RenderDomainsV1;}
export function validateRenderSnapshot(raw:unknown):RenderSnapshotV1{const p=exact(raw,["type","domainId","revision","zIndex","roots"],[],"render");if(p.type!=="render.snapshot")fail("render","wrong type");renderId(p.domainId,"domainId");positiveSafe(p.revision,"render","revision");int32(p.zIndex,"render","zIndex");renderRoots(p.roots);return p as unknown as RenderSnapshotV1;}
function nullableRenderId(v:unknown,label:string):void{if(v!==null)renderId(v,label);}
function stringDelta(raw:unknown,json:boolean):void{const d=exact(raw,[],["set","remove"],"render");if(d.set===undefined&&d.remove===undefined)fail("render","empty delta");let nonempty=false;if(d.set!==undefined){const s=object(d.set,"render","delta.set");const keys=Object.keys(s);if(keys.length){nonempty=true;}for(const k of keys){if(json){assertJsonValue(s[k]);}else if(typeof s[k]!=="string")fail("render","string delta value");}}if(d.remove!==undefined){const r=array(d.remove,"render","delta.remove");if(r.length)nonempty=true;const seen=new Set<string>();for(const x of r){if(typeof x!=="string"||seen.has(x))fail("render","invalid delta remove");seen.add(x);if(d.set!==undefined&&Object.prototype.hasOwnProperty.call(d.set,x))fail("render","delta set/remove overlap");}}if(!nonempty)fail("render","empty delta");}
function renderOp(raw:unknown):void{const base=object(raw,"render","op");const op=base.op;if(op==="insert"){const p=exact(base,["op","parentKey","beforeKey","node"],[],"render");nullableRenderId(p.parentKey,"parentKey");nullableRenderId(p.beforeKey,"beforeKey");renderNode(p.node,new Set<string>(),1,{n:0});}else if(op==="remove"){const p=exact(base,["op","key"],[],"render");renderId(p.key,"key");}else if(op==="move"){const p=exact(base,["op","key","parentKey","beforeKey"],[],"render");renderId(p.key,"key");nullableRenderId(p.parentKey,"parentKey");nullableRenderId(p.beforeKey,"beforeKey");}else if(op==="update"){const p=exact(base,["op","key"],["attrs","data"],"render");renderId(p.key,"key");if(p.attrs===undefined&&p.data===undefined)fail("render","empty update");if(p.attrs!==undefined)stringDelta(p.attrs,false);if(p.data!==undefined)stringDelta(p.data,true);}else fail("render","unknown patch op");}
export function validateRenderPatch(raw:unknown):RenderPatchV1{const p=exact(raw,["type","domainId","baseRevision","revision","ops"],["zIndex"],"render");if(p.type!=="render.patch")fail("render","wrong type");renderId(p.domainId,"domainId");const base=positiveSafe(p.baseRevision,"render","baseRevision");const rev=positiveSafe(p.revision,"render","revision");if(base===Number.MAX_SAFE_INTEGER||rev!==base+1)fail("render","invalid patch revision step");if(p.zIndex!==undefined)int32(p.zIndex,"render","zIndex");const ops=array(p.ops,"render","ops");if(ops.length>4096)fail("render","patch op limit");if(ops.length===0&&p.zIndex===undefined)fail("render","empty patch");for(const op of ops)renderOp(op);return p as unknown as RenderPatchV1;}
export function validateRenderEvent(raw:unknown):RenderEventV1{const p=exact(raw,["type","domainId","targetKey","name","data"],[],"render");if(p.type!=="render.event")fail("render","wrong type");renderId(p.domainId,"domainId");renderId(p.targetKey,"targetKey");boundedString(p.name,"render","event name",1,128);renderData(p.data);return p as unknown as RenderEventV1;}

function typeOfObject(raw: unknown): string {
  const o = object(raw,"profile","message");
  return stringValue(o.type,"profile","type");
}
function validateByType(raw: unknown): RendererDataMessageV1 {
  const type=typeOfObject(raw);
  if(type==="input.interest")return validateInputInterest(raw);
  if(type==="input.state")return validateInputState(raw);
  if(type==="input.event")return validateInputEvent(raw);
  if(type==="input.reset")return validateInputReset(raw);
  if(type==="render.domains")return validateRenderDomains(raw);
  if(type==="render.snapshot")return validateRenderSnapshot(raw);
  if(type==="render.patch")return validateRenderPatch(raw);
  if(type==="render.event")return validateRenderEvent(raw);
  fail(type.startsWith("input.")?"input":type.startsWith("render.")?"render":"profile","unknown data message type");
}

export type DataRole = "subsystem" | "renderer";
export function decodeForRole(raw:string, role:DataRole):RendererDataMessageV1{
  if(typeof raw!=="string")fail("profile","carrier application unit must be string");
  if(utf8ByteLength(raw)>MAX_MESSAGE_BYTES)fail("profile","message byte limit exceeded");
  let parsed:JsonValue; try{parsed=parseJsonText(raw);}catch(cause){fail("profile",`invalid JSON: ${String(cause)}`);}
  if(jsonDepth(parsed)>MAX_JSON_DEPTH)fail("profile","JSON depth limit exceeded");assertBoundedJson(parsed,"profile",MAX_JSON_DEPTH);
  const message=validateByType(parsed); const t=(message as {type:string}).type;
  const allowed=role==="subsystem" ? t==="input.state"||t==="input.event"||t==="input.reset" : t==="input.interest"||t.startsWith("render.");
  if(!allowed)fail(t.startsWith("input.")?"input":"render","message direction invalid for role");
  return message;
}
export function encodeForRole(message:RendererDataMessageV1, role:DataRole):string{
  const validated=validateByType(message); const t=(validated as {type:string}).type;
  const allowed=role==="subsystem" ? t==="input.interest"||t.startsWith("render.") : t==="input.state"||t==="input.event"||t==="input.reset";
  if(!allowed)fail(t.startsWith("input.")?"input":"render","outbound direction invalid for role");
  assertJsonValue(validated as unknown); const text=stringifyJson(validated as unknown as JsonValue); if(utf8ByteLength(text)>MAX_MESSAGE_BYTES)fail("profile","message byte limit exceeded"); return text;
}
