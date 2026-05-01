# Bloxd-ProtoTree

> [!NOTE]
> **Project Status: Complete** — ProtoTree has reached its final form. The core mechanic is fully realized and no new primitives will be added. Everything that can be built, is built on top of what exists here.

## Why it was made

this project exists because i was exploring how prototype chains work in javascript
and how bare name lookup flows through `globalThis` and its prototype
i realised that if you could control that chain, you could define entirely custom scoping rules
rules that no language gives you natively — read only memory, type enforcement, permission gates, dynamic rollback
and so this was made, a tool to intercept all variable access on `globalThis`
and supply your own logic to control exactly how variables are found and written

---

## Main Premise: `Realm`

the core idea is simple — `Realm` hollows out `globalThis` and replaces its prototype with a Proxy
every bare name lookup, whether the property exists or not, flows through that proxy
and your `travel` object decides what happens

what sets this apart from other approaches:
most scope tools are flat — you pick a namespace explicitly (`BS["world"].myUtil`)
ProtoTree makes bare name lookup interceptable — you just write `myUtil()` and travel decides where to find it
and because travel is yours to define, the rules can be anything

### The Three Holy Grails of JS Meta-Programming

ProtoTree achieves full interception of all possible JS lookup paths:

| # | What | How |
|---|---|---|
| 1 | bare name lookup for properties that **don't exist** on globalThis | prototype chain proxy — missing properties fall through |
| 2 | bare name lookup for properties that **do exist** on globalThis | globalThis is hollowed out — all own properties moved to proxy layer |
| 3 | **recursive proxy wrapping** — every returned value is itself proxied | `Realm.wrap = true` wraps outputs in the same handler |

the only limits are fundamental JS syntax constraints — object literals, closures, lexical declarations. everything that touches globalThis through a bare name is interceptable.

---

### Proof

i can use logic to prove the following: **"everything which can possibly be proxied IS able to be proxied using this tool"**
```js
//PENDING...

- if it access `globalThis`
  - `globalThis` is hollowed out, has to access proxy
  - proxy can make a `returned proxy` version of a global
- if it doesnt access `globalThis`, or a `returned proxy`
  - then proxy doesnt get activated, since it lives on `globalThis`
```

---

## Global Tiers

ProtoTree exposes three tiers of access, each with different proxy behaviour:

| Name | What it is | Proxy behaviour |
|---|---|---|
| `globalThis` | the real global object | hollowed out — all lookups fall through to proxy |
| `global` | unproxied window into `globalThis` | reads and writes go directly to `globalThis`, travel never fires |
| `window` | `Object.create(null)` | completely separate from `globalThis`, lexically scoped, never proxied |

### `globalThis`

all unqualified variable access flows through `globalThis`
on startup ProtoTree hollows out all own properties and moves them to the proxy layer
so every bare name lookup — whether the name exists or not — hits the proxy

```js
Math    // exists — travel fires ✅
y       // missing — travel fires ✅
```

### `global`

`global` is a clean escape hatch — reads and writes go directly to `globalThis` without travel intercepting

```js
global.World  = { gravity: 9.8 }  // writes directly to globalThis
global.Code   = { gravity: 1.5 }  // same
global.myId                        // reads directly, travel never fires
```

use `global` inside travel handlers to safely read containers and context without recursing

```js
travel: {
  get(travel, key) {
    const myId = global.myId;         // safe — no recursion
    return myId == void 0
      ? global.World[key]             // safe — direct container access
      : global.Code[key];
  }
}
```

note: `target` is always the snapshot object — in most cases you won't need it and can use `global` directly instead, kept for Reflect completeness

### `window`

`window` is a plain `Object.create(null)` — completely separate from `globalThis`
because it is resolved lexically at parse time, nothing in ProtoTree can ever intercept it
it is never accessible as a bare name, only as `window.x`

```js
window.TypeMeta  = new Map()  // type registry for travel internals
window.visited   = new WeakSet()  // cycle detection state
window.SECRET    = Symbol()   // private symbols
```

the key difference from `global`:

```js
global.score = 0   // bare `score` now resolves to this — travel sees it
window.score = 0   // only accessible as `window.score` — travel never sees it
```

---

# Notes

## All User Features

- `new Realm(travel)` — takes a travel object and hooks into `globalThis`, only one Realm can exist at a time
- `global` — unproxied window into `globalThis`, safe to use inside travel
- `window` — fully private lexical object, completely invisible to the proxy
- `Realm.active` — boolean, controls if the proxy intercepts. defaults to `false` within trap, restore with `Realm.active = true`
- `Realm.wrap` — boolean, controls if returned values are recursively wrapped. defaults to `false` within trap
- `Realm.fallback` — boolean, controls if `null | undefined` output falls through to Reflect. defaults to `false` within trap

### `travel`

`travel` is an object of functions keyed by proxy trap name
each function is called when that trap fires on `globalThis`
unhandled traps fall through to `Reflect` automatically

```js
new Realm({
  get(travel, key) { ... },
  set(travel, key, value) { ... },
  // anything not defined → Reflect handles it as normal JS
})
```

### `args` per trap

each travel function receives the full proxy trap args directly

| Trap | `args` | Return value |
|---|---|---|
| `get` | `(target, key, receiver)` | **any value** → becomes the result of the lookup |
| `set` | `(target, key, value, receiver)` | **boolean** → `true` = success, `false` = fails in strict mode |
| `has` | `(target, key)` | **boolean** → result of `"key" in obj` |
| `deleteProperty` | `(target, key)` | **boolean** → `true` = deleted |
| `defineProperty` | `(target, key, descriptor)` | **boolean** → `true` = defined |
| `getOwnPropertyDescriptor` | `(target, key)` | **object / undefined** → descriptor |
| `ownKeys` | `(target)` | **array of keys** → controls `Object.keys`, spread, destructuring |
| `getPrototypeOf` | `(target)` | **object / null** → prototype |
| `setPrototypeOf` | `(target, proto)` | **boolean** → success/failure |
| `isExtensible` | `(target)` | **boolean** → controls `Object.isExtensible` |
| `preventExtensions` | `(target)` | **boolean** → `true` if now non-extensible |
| `apply` | `(target, thisArg, argsList)` | **any value** → return value of call |
| `construct` | `(target, argsList, newTarget)` | **object** → constructed instance |

### Return values

| Return | Effect |
|---|---|
| any value | used directly as the trap result |
| `null` or `undefined` + `Realm.fallback = true` | falls through to Reflect — default JS behaviour |
| `null` or `undefined` + `Realm.fallback = false` | returned as is |
| trap not defined in travel | always falls through to Reflect regardless of fallback |

### Boot Sequence

ProtoTree automatically handles Bloxd's internal boot sequence — the engine injects variables like `api`, `console`, `Date`, `myId`, `playerId`, `thisPos` into the scope before your code runs, then verifies they are present.

ProtoTree intercepts this transparently:
- `set` during boot → stored internally, returns `true` so Bloxd confirms the write
- `get` during boot → returns the exact stored value so Bloxd's verification passes

your travel handlers still fire during boot and can observe these operations, but cannot affect what Bloxd receives back — boot return values are decided by ProtoTree to keep the environment stable.

boot is detected automatically via timestamp — each new code execution gets a fresh timestamp, ProtoTree uses this to know when a new boot sequence is starting. boot ends after the final boot `get` of `Date`.

---

## Example User Programs

### Basic Scope Routing

```js
global.World = { gravity: 9.8, time: 0 };
global.Code  = { gravity: 1.5, score: 0 };

new Realm({
  get(travel, key) {
    const myId = global.myId;
    return myId == void 0
      ? global.World[key]   // world code — route to World
      : global.Code[key];   // code block — route to Code
  },
  set(travel, key, value) {
    const myId = global.myId;
    const target = myId == void 0 ? global.World : global.Code;
    if (key in target) { target[key] = value; return true; }
    throw new Error(`"${key}" not found`);
  }
});

gravity  // 1.5 if inside a code block, 9.8 if world code
```

---

### Read Only Scope

```js
new Realm({
  get(travel, key) { return global.Constants[key]; },
  set(travel, key) {
    throw new Error(`"${key}" is read only`);
  }
});
```

---

### Type Enforced Scope

```js
global.World = { gravity: 9.8, count: 0 };

new Realm({
  set(travel, key, value) {
    const c = global.World;
    if (!(key in c)) throw new Error(`"${key}" not declared`);
    if (typeof value !== typeof c[key])
      throw new TypeError(`"${key}" expected ${typeof c[key]}, got ${typeof value}`);
    c[key] = value;
    return true;
  }
});

gravity = "fast"  // TypeError: "gravity" expected number, got string
```

---

### Prod / Staging / Testing Rollback

```js
global.testing = { featureX: () => "experimental" };
global.staging  = { featureX: () => "stable" };
global.prod     = { featureX: () => "live" };

new Realm({
  get(travel, key) {
    if (key in global.testing) return global.testing[key];
    if (key in global.staging) return global.staging[key];
    return global.prod[key];
  }
});

featureX()  // "experimental"

// instant rollback — remove testing entries and staging takes over
delete global.testing.featureX;
featureX()  // "stable"
```

---

### Expiring Variables

```js
window.expiry = new Map();  // stored in window — travel never sees it

global.World = { sessionToken: null };

window.expiry.set('sessionToken', Date.now() + 5000);  // expires in 5s

new Realm({
  get(travel, key) {
    const exp = window.expiry.get(key);
    if (exp && Date.now() > exp) {
      delete global.World[key];
      window.expiry.delete(key);
      return undefined;
    }
    return global.World[key];
  }
});
```

---

### Cycle Detection

```js
window.visited = new WeakSet();

new Realm({
  get(travel, key) {
    if (window.visited.has(global.node)) return undefined;
    window.visited.add(global.node);
    // ... lookup logic
  }
});
```

### Recursive Proxy Wrapping

```js
new Realm({
  get(travel, key) {
    Realm.wrap = true          // every returned object/function is also proxied
    return global.World[key]   // Math, console, any object — all wrapped recursively
  }
})

Math         // proxied ✅
Math.random  // also proxied ✅
Math.random() // also proxied ✅
```

---

# Developer Notes

## All Developer Features

### Normal Execution Internals

- `Realm.TRAPS` — static array of all 13 proxy trap names, used to generate the handler map
- `Realm.ONE` — singleton guard, prevents more than one Realm from being constructed
- `Realm.UNHANDLED` — sentinel symbol returned when a trap is not defined in travel, always falls through to Reflect regardless of `Realm.fallback`
- `Realm.travel` — static reference to the active travel object
- `global` — built using a bypass proxy with an internal `_active` flag so reads/writes skip the main proxy entirely
- `_active` — engine internal recursion guard, closure variable, user never touches it
- `_wrap` — engine internal wrap lock, prevents double wrapping during proxy construction
- `Realm.active` — pauses interception entirely when `false`, reset to `true` after each trap
- `Realm.wrap` — opts in to recursive proxy wrapping per trap call, reset to `false` after each trap
- `Realm.fallback` — controls undefined/null fallthrough to Reflect, reset to `true` after each trap

---

### Boot Sequence Internals

- `_boot` — closure boolean, `true` while boot sequence is in progress
- `_date` — closure timestamp, compared against `Date.now()` to detect new executions
- `_store` — closure object, temporarily holds values Bloxd sets during boot so gets can replay them exactly
- boot ends when Bloxd GETs `Date` back — `_boot` flips to `false` and `_store` is cleared
- travel fires during boot but its return value is discarded — boot has its own fixed return logic
- `set` during boot always returns `true` regardless of travel
- `get` during boot always returns the stored value regardless of travel

**Bloxd Internal Boot Sequence**

| Operation | Keys | Presence | Description |
|---|---|---|---|
| `SET` ? | [`...allCallbacks`] | all or nothing | sets engine-side callbacks |
| `SET` | [`api`, `console`, `Date`] | always | sets necessary values |
| `SET` | [`myId`, `playerId`, `thisPos`] ? | each independently optional | sets code block specifics |
| `GET` | [`api`, `console`, `Date`] | always — `Date` signals boot end | checks necessary values |

---

## Example Developer Programs

### Observable Scope

```js
new Realm({
  get(travel, key) {
    console.log(`get: ${key}`);
    return global.World[key];
  },
  set(travel, key, value) {
    console.log(`set: ${key} =`, value);
    global.World[key] = value;
    return true;
  }
});
```

---

### Permission Gated Scope

```js
new Realm({
  get(travel, key) {
    if (!global.currentUser.can('read', key))
      throw new Error(`permission denied: ${key}`);
    return global.World[key];
  }
});
```

---

### Lazy Evaluated Variables

```js
global.World = {
  heavyValue: () => expensiveComputation()  // stored as thunk
};

new Realm({
  get(travel, key) {
    const v = global.World[key];
    return typeof v === 'function' ? v() : v;  // resolve thunk on access
  }
});
```

---

### Dynamic Scope Switching at Runtime

```js
new Realm({
  get(travel, key) {
    const scope = global.strictMode ? global.Strict : global.Loose;
    return scope[key];
  }
});

global.strictMode = false;
x  // from Loose

global.strictMode = true;
x  // from Strict — no code changes, just flipped a flag
```

### Preventing Recursion

```js
new Realm({
  get(travel, key, receiver) {
    // Realm.active defaults to false inside handler — no recursion
    globalThis[key] = "null"  // safe — own property now, travel won't fire again
    // set Realm.active = true to allow recursive proxy firing
  }
})
```

---

# Outro

## Known Limitations

ProtoTree cannot intercept:
- **Object/array literals** — `{}`, `[]` created inline never touch globalThis
- **Closures** — variables captured in closure scope bypass globalThis entirely
- **Lexical declarations** — `const`, `let`, `var` are scoped, not global lookups
- **Private class fields** — `#field` is engine level, completely opaque
- **Method calls on primitives** — `"hello".toUpperCase()` never routes through globalThis

Everything else that touches globalThis through a bare name is interceptable.

## Use Cases

- **Language simulation** — read only memory, type enforcement, expiring variables, lazy evaluation
- **Sandboxing** — isolate variables per user, permission gated scopes, context-aware resolution
- **Namespaces** — define how namespaces sit relative to each other and how they appear to bare name lookup
- **Prototyping** — `prod` overrides `staging` overrides `testing`, instant rollback by removing a layer
- **Organisation** — structure code behind scenes while keeping call sites looking like flat globals
- **Debugging** — full call graph tracing, time travel debugging, coverage tracking
- **Type checking** — runtime TypeScript-like type enforcement on every assignment

## Full Example: Everything Together

```js
global.World  = { gravity: 9.8, time: 0 };
global.Code   = { gravity: 1.5, score: 0 };
global.Shared = { log: console.log };

window.types = { gravity: 'number', time: 'number', score: 'number' };

new Realm({
  get(travel, key) {
    const myId = global.myId;
    if (key in global.Shared) return global.Shared[key];
    return myId == void 0 ? global.World[key] : global.Code[key];
  },
  set(travel, key, value) {
    const myId = global.myId;
    const target = myId == void 0 ? global.World : global.Code;
    if (!(key in target)) throw new Error(`"${key}" not declared`);
    const expected = window.types[key];
    if (expected && typeof value !== expected)
      throw new TypeError(`"${key}" expected ${expected}, got ${typeof value}`);
    target[key] = value;
    return true;
  }
});

gravity        // 1.5 inside code block, 9.8 in world code
log("hello")   // always from Shared
gravity = "x"  // TypeError — type enforced
score = 10     // fine — correct type, routes to Code
```
